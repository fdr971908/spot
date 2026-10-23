import { z } from 'zod';
import { del, get, patch, post, parse, type Route } from '../router';
import { ApiError, forbidden, notFound } from '../errors';
import type { Tx } from '../db';
import { EVENT_CARD_COLUMNS, EVENT_CARD_FROM, requireEvent } from './shared';

async function businessBySlug(tx: Tx, slug: string) {
  const b = await tx.one(
    `select b.*, ci.name as city_name, (b.verification_status = 'verified') as verified,
            exists (select 1 from user_follows f where f.business_id = b.id and f.user_id = app.uid()) as is_following,
            (select notify_promotions from user_follows f where f.business_id = b.id and f.user_id = app.uid()) as notify_promotions
     from business_profiles b left join cities ci on ci.id = b.city_id where b.slug = $1`,
    [slug],
  );
  if (!b) throw notFound('business_not_found');
  return b;
}

const gl = z.object({
  note: z.string().trim().max(500).optional(),
  group_id: z.string().uuid().optional(),
  guest_ids: z.array(z.string().uuid()).max(30).default([]),
});

const tableSchema = z.object({
  party_size: z.number().int().min(1).max(50),
  contact_name: z.string().trim().min(2).max(80),
  contact_phone: z.string().trim().regex(/^[+0-9 ]{6,20}$/),
  notes: z.string().trim().max(500).optional(),
});

export const socialRoutes: Route[] = [
  // ── Businesses (public side) ──
  get('/businesses/:slug', 'user', async ({ tx, params }) => {
    const b = await businessBySlug(tx, params.slug);
    const upcoming = await tx.q(
      `select ${EVENT_CARD_COLUMNS} ${EVENT_CARD_FROM} where e.business_id = $1 and e.status = 'published' and e.ends_at > now() order by e.starts_at limit 30`,
      [b.id],
    );
    const past = await tx.q(
      `select ${EVENT_CARD_COLUMNS} ${EVENT_CARD_FROM} where e.business_id = $1 and e.status in ('published', 'completed') and e.ends_at <= now() order by e.starts_at desc limit 12`,
      [b.id],
    );
    return { business: b, upcoming, past };
  }),

  post('/businesses/:slug/follow', 'personal', async ({ tx, user, params }) => {
    const b = await businessBySlug(tx, params.slug);
    await tx.q('insert into user_follows (user_id, business_id) values ($1, $2) on conflict do nothing', [user.id, b.id]);
    return { following: true };
  }),
  del('/businesses/:slug/follow', 'personal', async ({ tx, user, params }) => {
    const b = await businessBySlug(tx, params.slug);
    await tx.q('delete from user_follows where user_id = $1 and business_id = $2', [user.id, b.id]);
    return { following: false };
  }),
  patch('/businesses/:slug/follow', 'personal', async ({ tx, user, params, body }) => {
    const v = parse(z.object({ notify_promotions: z.boolean() }), body);
    const b = await businessBySlug(tx, params.slug);
    const r = await tx.one('update user_follows set notify_promotions = $3 where user_id = $1 and business_id = $2 returning notify_promotions', [user.id, b.id, v.notify_promotions]);
    if (!r) throw notFound('not_following');
    const np = await tx.one<{ promotional: boolean }>('select promotional from notification_preferences where user_id = $1', [user.id]);
    return { notify_promotions: r.notify_promotions, promotional_enabled: !!np?.promotional };
  }),

  post('/businesses/:slug/contact', 'personal', async ({ tx, user, params, body }) => {
    const v = parse(z.object({ event_id: z.string().uuid().optional() }), body);
    const b = await businessBySlug(tx, params.slug);
    const r = await tx.one<{ id: string }>('select app.start_business_conversation($1) as id', [b.id]);
    if (v.event_id) {
      const ev = await requireEvent(tx, v.event_id);
      if (ev.business_id !== b.id) throw forbidden();
      const last = await tx.one<{ event_id: string | null }>('select event_id from messages where conversation_id = $1 order by created_at desc limit 1', [r!.id]);
      if (last?.event_id !== v.event_id) {
        await tx.q("insert into messages (conversation_id, sender_id, kind, event_id) values ($1, $2, 'event', $3)", [r!.id, user.id, v.event_id]);
        await tx.q("insert into event_analytics (event_id, kind, user_id) values ($1, 'contact', $2)", [v.event_id, user.id]);
      }
    }
    return { conversation_id: r!.id };
  }),

  // ── People ──
  get('/users/search', 'personal', async ({ tx, user, query }) => {
    const q = (query.get('q') ?? '').trim().toLowerCase().replace(/^@/, '');
    if (q.length < 2) return [];
    return tx.q(
      `select user_id, username, display_name, avatar_url, is_private from profile_cards
       where user_id <> $2 and (username ilike $1 or display_name ilike $1) order by username limit 12`,
      [`%${q.replace(/[%_\\]/g, '')}%`, user.id],
    );
  }),

  get('/users/:username', 'user', async ({ tx, user, params }) => {
    const p = await tx.one('select * from profile_cards where username = $1', [params.username.toLowerCase()]);
    if (!p) throw notFound('user_not_found');
    const social = await tx.q('select platform, handle from visible_social_links where user_id = $1', [p.user_id]);
    const canDm = (await tx.one<{ ok: boolean }>('select app.can_dm($1) as ok', [p.user_id]))?.ok ?? false;
    const shared = await tx.q(
      `select g.id, g.name, g.emoji from groups g
       join group_members a on a.group_id = g.id and a.user_id = $1 and a.status = 'active'
       join group_members b on b.group_id = g.id and b.user_id = $2 and b.status = 'active'`,
      [user.id, p.user_id],
    );
    const blocked = !!(await tx.one('select 1 from user_blocks where blocker_id = $1 and blocked_id = $2', [user.id, p.user_id]));
    // Attendance history is never part of a profile, public or private.
    return { profile: p, social: p.is_visible ? social : [], can_message: canDm, shared_groups: shared, is_me: p.user_id === user.id, blocked };
  }),

  post('/users/:username/block', 'personal', async ({ tx, user, params }) => {
    const target = await tx.one<{ user_id: string }>('select user_id from profile_cards where username = $1', [params.username.toLowerCase()]);
    if (!target || target.user_id === user.id) throw notFound('user_not_found');
    await tx.q('insert into user_blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing', [user.id, target.user_id]);
    return { blocked: true };
  }),

  post('/reports', 'user', async ({ tx, user, body }) => {
    const v = parse(
      z.object({
        target_user_id: z.string().uuid().optional(),
        message_id: z.string().uuid().optional(),
        event_id: z.string().uuid().optional(),
        reason: z.enum(['spam', 'harassment', 'impersonation', 'inappropriate', 'underage', 'other']),
        details: z.string().trim().max(1000).optional(),
        block: z.boolean().default(false),
      }),
      body,
    );
    if (!v.target_user_id && !v.message_id && !v.event_id) throw new ApiError(400, 'target_required');
    if (v.message_id && !(await tx.one('select 1 from messages where id = $1', [v.message_id]))) throw notFound();
    await tx.q('insert into user_reports (reporter_id, target_user_id, message_id, event_id, reason, details) values ($1, $2, $3, $4, $5, $6)', [
      user.id,
      v.target_user_id ?? null,
      v.message_id ?? null,
      v.event_id ?? null,
      v.reason,
      v.details ?? null,
    ]);
    if (v.block && v.target_user_id && v.target_user_id !== user.id)
      await tx.q('insert into user_blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing', [user.id, v.target_user_id]);
    return { ok: true };
  }),

  // ── Notifications ──
  get('/notifications', 'user', async ({ tx, user }) => {
    const items = await tx.q('select id, category, type, title, body, link, read_at, created_at from notifications where user_id = $1 order by created_at desc limit 60', [user.id]);
    const unread = await tx.one<{ n: number }>('select count(*)::int as n from notifications where user_id = $1 and read_at is null', [user.id]);
    return { items, unread: unread!.n };
  }),
  get('/notifications/unread', 'user', async ({ tx, user }) => {
    const n = await tx.one<{ n: number }>('select count(*)::int as n from notifications where user_id = $1 and read_at is null', [user.id]);
    const chats = await tx.one<{ n: number }>(
      `select count(*)::int as n from conversation_members m where m.user_id = $1 and exists (
         select 1 from messages x where x.conversation_id = m.conversation_id and x.created_at > m.last_read_at and x.sender_id is distinct from $1)`,
      [user.id],
    );
    const invites = await tx.one<{ n: number }>("select count(*)::int as n from group_members where user_id = $1 and status = 'invited'", [user.id]);
    return { notifications: n!.n, chats: chats!.n + invites!.n };
  }),
  post('/notifications/read', 'user', async ({ tx, user, body }) => {
    const v = parse(z.object({ ids: z.array(z.string().uuid()).max(100).optional() }), body);
    if (v.ids?.length) await tx.q('update notifications set read_at = now() where user_id = $1 and id = any($2::uuid[]) and read_at is null', [user.id, v.ids]);
    else await tx.q('update notifications set read_at = now() where user_id = $1 and read_at is null', [user.id]);
    return { ok: true };
  }),

  // ── Guest lists & tables (user side) ──
  post('/events/:id/guest-list', 'personal', async ({ tx, user, params, body }) => {
    const v = parse(gl, body);
    const ev = await tx.one<{ guest_list_enabled: boolean }>('select guest_list_enabled from events where id = $1', [params.id]);
    if (!ev) throw notFound('event_not_found');
    if (!ev.guest_list_enabled) throw new ApiError(409, 'guest_list_disabled');
    if (v.group_id) {
      const st = await tx.one<{ s: string }>('select app.group_status($1) as s', [v.group_id]);
      if (st?.s !== 'active') throw forbidden('not_group_member');
    }
    const r = await tx.one<{ id: string }>(
      'insert into guest_list_requests (event_id, requester_id, group_id, note) values ($1, $2, $3, $4) returning id',
      [params.id, user.id, v.group_id ?? null, v.note ?? null],
    );
    const me = await tx.one<{ display_name: string }>('select display_name from personal_profiles where user_id = $1', [user.id]);
    await tx.q("insert into guest_list_entries (request_id, user_id, display_name, consent) values ($1, $2, $3, 'accepted')", [r!.id, user.id, me!.display_name]);
    let invited = 0;
    if (v.group_id && v.guest_ids.length) invited = (await tx.one<{ n: number }>('select app.add_guest_list_guests($1, $2::uuid[]) as n', [r!.id, v.guest_ids]))!.n;
    return { request_id: r!.id, pending_consents: invited };
  }),

  del('/events/:id/guest-list', 'personal', async ({ tx, user, params }) => {
    await tx.q("update guest_list_requests set status = 'cancelled' where event_id = $1 and requester_id = $2 and status in ('pending', 'confirmed')", [params.id, user.id]);
    return { ok: true };
  }),

  post('/events/:id/table', 'personal', async ({ tx, user, params, body }) => {
    const v = parse(tableSchema, body);
    const ev = await tx.one<{ table_requests_enabled: boolean }>('select table_requests_enabled from events where id = $1', [params.id]);
    if (!ev) throw notFound('event_not_found');
    if (!ev.table_requests_enabled) throw new ApiError(409, 'tables_disabled');
    const open = await tx.one("select 1 from table_requests where event_id = $1 and user_id = $2 and status in ('pending', 'confirmed')", [params.id, user.id]);
    if (open) throw new ApiError(409, 'request_exists');
    const r = await tx.one(
      'insert into table_requests (event_id, user_id, party_size, contact_name, contact_phone, notes) values ($1, $2, $3, $4, $5, $6) returning id, status',
      [params.id, user.id, v.party_size, v.contact_name, v.contact_phone, v.notes ?? null],
    );
    return r;
  }),

  post('/tables/:id/cancel', 'personal', async ({ tx, user, params }) => {
    const r = await tx.one("update table_requests set status = 'cancelled' where id = $1 and user_id = $2 and status in ('pending', 'confirmed') returning id", [params.id, user.id]);
    if (!r) throw notFound();
    return { ok: true };
  }),

  get('/me/requests', 'personal', async ({ tx, user }) => {
    const guestLists = await tx.q(
      `select r.id, r.status, r.note, r.business_note, r.created_at, r.group_id, e.id as event_id, e.title, e.starts_at, e.cover_url, e.venue_name,
              (select coalesce(json_agg(json_build_object('id', x.id, 'display_name', x.display_name, 'consent', x.consent, 'is_me', x.user_id = $1) order by x.created_at), '[]')
                 from guest_list_entries x where x.request_id = r.id) as entries
       from guest_list_requests r join events e on e.id = r.event_id where r.requester_id = $1 order by e.starts_at desc`,
      [user.id],
    );
    const tables = await tx.q(
      `select t.id, t.status, t.party_size, t.notes, t.business_note, t.created_at, e.id as event_id, e.title, e.starts_at, e.cover_url, e.venue_name
       from table_requests t join events e on e.id = t.event_id where t.user_id = $1 order by e.starts_at desc`,
      [user.id],
    );
    const consents = await tx.q(
      `select x.id, x.consent, r.id as request_id, e.id as event_id, e.title, e.starts_at, e.venue_name, r.requester_id
       from guest_list_entries x join guest_list_requests r on r.id = x.request_id join events e on e.id = r.event_id
       where x.user_id = $1 and r.requester_id <> $1 and r.status in ('pending', 'confirmed') order by e.starts_at`,
      [user.id],
    );
    const names = await tx.q<{ user_id: string; display_name: string }>('select user_id, display_name from profile_cards where user_id = any($1::uuid[])', [
      consents.map((c) => c.requester_id),
    ]);
    const byId = new Map(names.map((n) => [n.user_id, n.display_name]));
    return { guest_lists: guestLists, tables, consents: consents.map((c) => ({ ...c, requester_name: byId.get(c.requester_id) ?? '—' })) };
  }),

  post('/guest-list/entries/:id', 'personal', async ({ tx, user, params, body }) => {
    const v = parse(z.object({ consent: z.enum(['accepted', 'declined']) }), body);
    const r = await tx.one('update guest_list_entries set consent = $3 where id = $1 and user_id = $2 returning id, consent', [params.id, user.id, v.consent]);
    if (!r) throw notFound();
    return r;
  }),
];
