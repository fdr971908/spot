import { z } from 'zod';
import { del, get, patch, post, put, parse, type Route } from '../router';
import { ApiError, forbidden, notFound } from '../errors';
import type { Tx } from '../db';
import { eventCardsByIds, profileCards, requireEvent } from './shared';

const PAGE = 50;

async function rsvpSummaries(tx: Tx, groupId: string, eventIds: string[], userId: string) {
  if (!eventIds.length) return new Map<string, any>();
  const rows = await tx.q(
    `select ge.id, ge.event_id,
            count(r.*) filter (where r.status = 'going')::int as going,
            count(r.*) filter (where r.status = 'maybe')::int as maybe,
            count(r.*) filter (where r.status = 'not_going')::int as not_going,
            max(r.status) filter (where r.user_id = $3) as mine
     from group_events ge left join group_rsvps r on r.group_event_id = ge.id
     where ge.group_id = $1 and ge.event_id = any($2::uuid[]) group by ge.id, ge.event_id`,
    [groupId, eventIds, userId],
  );
  return new Map(rows.map((r) => [r.event_id, r]));
}

async function conversationView(tx: Tx, userId: string, convId: string, before?: string | null) {
  const c = await tx.one(
    `select c.id, c.type, c.business_id, c.created_at, g.id as group_id, g.name as group_name, g.emoji as group_emoji, g.kind as group_kind,
            g.archived_at, g.event_id as group_event_id, b.name as business_name, b.slug as business_slug, b.logo_url as business_logo,
            (b.verification_status = 'verified') as business_verified,
            app.is_staff(c.business_id) as as_staff,
            exists (select 1 from conversation_members m where m.conversation_id = c.id and m.user_id = $2) as is_member
     from conversations c left join groups g on g.conversation_id = c.id left join business_profiles b on b.id = c.business_id
     where c.id = $1`,
    [convId, userId],
  );
  if (!c) throw notFound('conversation_not_found');
  const members = await tx.q<{ user_id: string }>('select user_id, last_read_at from conversation_members where conversation_id = $1', [convId]);
  const msgs = await tx.q(
    `select id, sender_id, as_business, kind, case when deleted_at is null then body end as body, event_id, created_at, deleted_at is not null as deleted
     from messages where conversation_id = $1 and ($2::timestamptz is null or created_at < $2) order by created_at desc limit ${PAGE + 1}`,
    [convId, before ?? null],
  );
  const hasMore = msgs.length > PAGE;
  const page = msgs.slice(0, PAGE).reverse();
  const cards = await profileCards(tx, [...members.map((m) => m.user_id), ...page.map((m) => m.sender_id)]);
  const eventIds = [...new Set(page.filter((m) => m.event_id).map((m) => m.event_id as string))];
  const events = new Map((await eventCardsByIds(tx, eventIds)).map((e) => [e.id, e]));
  const rsvps = c.group_id ? await rsvpSummaries(tx, c.group_id, eventIds, userId) : new Map();
  const canSend = (await tx.one<{ ok: boolean }>('select app.can_send_message($1, $2) as ok', [convId, !c.is_member && c.as_staff]))!.ok;
  const other = c.type === 'direct' ? members.find((m) => m.user_id !== userId) : null;
  return {
    conversation: {
      ...c,
      other: other ? cards.get(other.user_id) ?? { user_id: other.user_id, display_name: 'Utente spot.', username: null, avatar_url: null } : null,
      can_send: canSend,
    },
    members: members.map((m) => cards.get(m.user_id) ?? { user_id: m.user_id, display_name: 'Utente spot.', username: null, avatar_url: null }),
    messages: page.map((m) => ({
      ...m,
      sender: m.as_business ? null : m.sender_id ? cards.get(m.sender_id) ?? null : null,
      event: m.event_id ? events.get(m.event_id) ?? null : null,
      rsvp: m.event_id ? rsvps.get(m.event_id) ?? null : null,
    })),
    has_more: hasMore,
  };
}

export async function listInbox(tx: Tx, userId: string) {
  const rows = await tx.q(
    `select c.id, c.type, c.business_id, c.last_message_at,
            (select count(*) from messages x where x.conversation_id = c.id and x.created_at > m.last_read_at and x.sender_id is distinct from $1)::int as unread,
            lm.kind as last_kind, case when lm.deleted then null else lm.body end as last_body, lm.sender_id as last_sender_id, lm.as_business as last_as_business, lm.event_title as last_event_title,
            g.id as group_id, g.name as group_name, g.emoji as group_emoji, g.kind as group_kind, g.archived_at,
            b.name as business_name, b.slug as business_slug, b.logo_url as business_logo, (b.verification_status = 'verified') as business_verified,
            (select user_id from conversation_members o where o.conversation_id = c.id and o.user_id <> $1 limit 1) as other_id
     from conversation_members m
     join conversations c on c.id = m.conversation_id
     left join groups g on g.conversation_id = c.id
     left join business_profiles b on b.id = c.business_id
     left join lateral (
       select x.kind, x.body, x.sender_id, x.as_business, x.deleted_at is not null as deleted, (select title from events e where e.id = x.event_id) as event_title
       from messages x where x.conversation_id = c.id order by x.created_at desc limit 1) lm on true
     where m.user_id = $1
     order by c.last_message_at desc limit 200`,
    [userId],
  );
  const cards = await profileCards(tx, [...rows.map((r) => r.other_id), ...rows.map((r) => r.last_sender_id)]);
  return rows.map((r) => ({
    ...r,
    other: r.type === 'direct' ? cards.get(r.other_id) ?? null : null,
    last_sender_name: r.last_as_business ? r.business_name : r.last_sender_id === userId ? null : cards.get(r.last_sender_id)?.display_name ?? null,
  }));
}

export const chatRoutes: Route[] = [
  get('/conversations', 'personal', async ({ tx, user }) => {
    const items = await listInbox(tx, user.id);
    const invites = await tx.q(
      `select g.id, g.name, g.emoji, g.kind, gm.invited_by, gm.created_at
       from group_members gm join groups g on g.id = gm.group_id where gm.user_id = $1 and gm.status = 'invited' order by gm.created_at desc`,
      [user.id],
    );
    const inviters = await profileCards(tx, invites.map((i) => i.invited_by));
    return { items, invites: invites.map((i) => ({ ...i, invited_by: inviters.get(i.invited_by) ?? null })) };
  }),

  post('/conversations/direct', 'personal', async ({ tx, body }) => {
    const v = parse(z.object({ user_id: z.string().uuid() }), body);
    const r = await tx.one<{ id: string }>('select app.start_direct($1) as id', [v.user_id]);
    return { conversation_id: r!.id };
  }),

  get('/conversations/:id', 'user', async ({ tx, user, params, query }) => conversationView(tx, user.id, params.id, query.get('before'))),

  post('/conversations/:id/messages', 'user', async ({ tx, user, params, body }) => {
    const v = parse(
      z
        .object({
          body: z.string().trim().min(1).max(2000).optional(),
          event_id: z.string().uuid().optional(),
          as_business: z.boolean().default(false),
        })
        .refine((x) => x.body || x.event_id, { message: 'empty' }),
      body,
    );
    const c = await tx.one<{ type: string; business_id: string | null; group_id: string | null }>(
      'select c.type, c.business_id, g.id as group_id from conversations c left join groups g on g.conversation_id = c.id where c.id = $1',
      [params.id],
    );
    if (!c) throw notFound('conversation_not_found');
    if (v.event_id) {
      const ev = await requireEvent(tx, v.event_id);
      if (ev.status === 'draft') throw notFound('event_not_found');
      if (c.group_id) await tx.q('insert into group_events (group_id, event_id, shared_by) values ($1, $2, $3) on conflict do nothing', [c.group_id, v.event_id, user.id]);
      await tx.q("insert into event_analytics (event_id, kind, user_id) values ($1, 'share', $2)", [v.event_id, user.id]);
    }
    const ok = (await tx.one<{ ok: boolean }>('select app.can_send_message($1, $2) as ok', [params.id, v.as_business]))!.ok;
    if (!ok) throw forbidden('cannot_send');
    const msg = await tx.one(
      `insert into messages (conversation_id, sender_id, as_business, kind, body, event_id) values ($1, $2, $3, $4, $5, $6)
       returning id, created_at`,
      [params.id, user.id, v.as_business, v.event_id ? 'event' : 'text', v.event_id ? v.body ?? null : v.body, v.event_id ?? null],
    );
    if (v.as_business && c.business_id) {
      const b = await tx.one<{ name: string }>('select name from business_profiles where id = $1', [c.business_id]);
      const members = await tx.q<{ user_id: string }>('select user_id from conversation_members where conversation_id = $1', [params.id]);
      for (const m of members)
        await tx.q("select app.notify($1, 'business_message', $2, $3, $4, $5)", [m.user_id, `${b!.name} ti ha risposto`, (v.body ?? '').slice(0, 120), `/chat/${params.id}`, params.id]);
    }
    return msg;
  }),

  post('/conversations/:id/read', 'user', async ({ tx, user, params }) => {
    const m = await tx.one('update conversation_members set last_read_at = now() where conversation_id = $1 and user_id = $2 returning 1', [params.id, user.id]);
    if (!m) {
      const staff = await tx.one<{ ok: boolean }>('select app.is_staff(business_id) as ok from conversations where id = $1', [params.id]);
      if (!staff?.ok) throw notFound();
      await tx.q(
        'insert into business_conversation_reads (conversation_id, last_read_at) values ($1, now()) on conflict (conversation_id) do update set last_read_at = now()',
        [params.id],
      );
    }
    return { ok: true };
  }),

  del('/messages/:id', 'user', async ({ tx, user, params }) => {
    const r = await tx.one('update messages set deleted_at = now() where id = $1 and sender_id = $2 and deleted_at is null returning id', [params.id, user.id]);
    if (!r) throw notFound();
    return { ok: true };
  }),

  // ── Groups ──
  get('/groups', 'personal', async ({ tx, user }) =>
    tx.q(
      `select g.id, g.name, g.emoji, g.kind, g.archived_at, g.conversation_id, gm.status, gm.role,
              (select count(*) from group_members x where x.group_id = g.id and x.status = 'active')::int as member_count
       from group_members gm join groups g on g.id = gm.group_id
       where gm.user_id = $1 and gm.status in ('active', 'invited') order by g.archived_at nulls first, g.created_at desc`,
      [user.id],
    ),
  ),

  post('/groups', 'personal', async ({ tx, body }) => {
    const v = parse(
      z.object({
        name: z.string().trim().min(2).max(60),
        kind: z.enum(['permanent', 'spot']),
        event_id: z.string().uuid().nullish(),
        emoji: z.string().max(8).nullish(),
        invite_ids: z.array(z.string().uuid()).max(50).default([]),
      }),
      body,
    );
    const g = await tx.one<{ id: string }>('select app.create_group($1, $2, $3, $4) as id', [v.name, v.kind, v.event_id ?? null, v.emoji ?? null]);
    let invited = 0;
    if (v.invite_ids.length) invited = (await tx.one<{ n: number }>('select app.invite_to_group($1, $2::uuid[]) as n', [g!.id, v.invite_ids]))!.n;
    const conv = await tx.one<{ conversation_id: string }>('select conversation_id from groups where id = $1', [g!.id]);
    return { group_id: g!.id, conversation_id: conv!.conversation_id, invited };
  }),

  get('/groups/:id', 'personal', async ({ tx, user, params }) => {
    const g = await tx.one('select g.*, app.group_status(g.id) as my_status, app.is_group_admin(g.id) as is_admin from groups g where g.id = $1', [params.id]);
    if (!g) throw notFound('group_not_found');
    const members = await tx.q('select user_id, role, status, created_at from group_members where group_id = $1 and status in (\'active\', \'invited\') order by role, created_at', [params.id]);
    const cards = await profileCards(tx, members.map((m) => m.user_id));
    let events: any[] = [];
    if (g.my_status === 'active') {
      const ge = await tx.q<{ id: string; event_id: string; shared_by: string }>('select id, event_id, shared_by, created_at from group_events where group_id = $1 order by created_at desc', [params.id]);
      const cardsE = new Map((await eventCardsByIds(tx, ge.map((x) => x.event_id))).map((e) => [e.id, e]));
      const rsvps = await tx.q<{ group_event_id: string; user_id: string; status: string }>(
        'select r.group_event_id, r.user_id, r.status from group_rsvps r join group_events ge on ge.id = r.group_event_id where ge.group_id = $1',
        [params.id],
      );
      events = ge
        .filter((x) => cardsE.has(x.event_id))
        .map((x) => {
          const rs = rsvps.filter((r) => r.group_event_id === x.id);
          return {
            group_event_id: x.id,
            event: cardsE.get(x.event_id),
            shared_by: cards.get(x.shared_by) ?? null,
            going: rs.filter((r) => r.status === 'going').length,
            maybe: rs.filter((r) => r.status === 'maybe').length,
            not_going: rs.filter((r) => r.status === 'not_going').length,
            mine: rs.find((r) => r.user_id === user.id)?.status ?? null,
            responses: rs.map((r) => ({ status: r.status, user: cards.get(r.user_id) ?? null })),
          };
        });
    }
    return {
      group: g,
      members: members.map((m) => ({ ...m, profile: cards.get(m.user_id) ?? null })).filter((m) => m.profile),
      events,
    };
  }),

  patch('/groups/:id', 'personal', async ({ tx, params, body }) => {
    const v = parse(z.object({ name: z.string().trim().min(2).max(60).optional(), emoji: z.string().max(8).nullish() }), body);
    const r = await tx.one('update groups set name = coalesce($2, name), emoji = coalesce($3, emoji) where id = $1 returning id', [params.id, v.name ?? null, v.emoji ?? null]);
    if (!r) throw forbidden();
    return { ok: true };
  }),

  post('/groups/:id/invite', 'personal', async ({ tx, params, body }) => {
    const v = parse(z.object({ user_ids: z.array(z.string().uuid()).min(1).max(50) }), body);
    const n = await tx.one<{ n: number }>('select app.invite_to_group($1, $2::uuid[]) as n', [params.id, v.user_ids]);
    return { invited: n!.n };
  }),
  post('/groups/:id/respond', 'personal', async ({ tx, params, body }) => {
    const v = parse(z.object({ accept: z.boolean() }), body);
    await tx.q('select app.respond_group_invite($1, $2)', [params.id, v.accept]);
    const g = await tx.one<{ conversation_id: string }>('select conversation_id from groups where id = $1', [params.id]);
    return { ok: true, conversation_id: v.accept ? g?.conversation_id : null };
  }),
  post('/groups/:id/leave', 'personal', async ({ tx, params }) => {
    await tx.q('select app.leave_group($1)', [params.id]);
    return { ok: true };
  }),
  post('/groups/:id/archive', 'personal', async ({ tx, params }) => {
    await tx.q('select app.archive_group($1)', [params.id]);
    return { ok: true };
  }),
  del('/groups/:id/members/:userId', 'personal', async ({ tx, params }) => {
    await tx.q('select app.remove_group_member($1, $2)', [params.id, params.userId]);
    return { ok: true };
  }),
  patch('/groups/:id/members/:userId', 'personal', async ({ tx, params, body }) => {
    const v = parse(z.object({ role: z.enum(['admin', 'member']) }), body);
    await tx.q('select app.set_group_role($1, $2, $3)', [params.id, params.userId, v.role]);
    return { ok: true };
  }),

  post('/groups/:id/events', 'personal', async ({ tx, user, params, body }) => {
    const v = parse(z.object({ event_id: z.string().uuid(), note: z.string().trim().max(500).optional() }), body);
    const g = await tx.one<{ conversation_id: string; archived_at: string | null }>('select conversation_id, archived_at from groups where id = $1', [params.id]);
    if (!g) throw notFound('group_not_found');
    if (g.archived_at) throw new ApiError(409, 'group_archived');
    const ev = await requireEvent(tx, v.event_id);
    if (ev.status === 'draft') throw notFound('event_not_found');
    await tx.q('insert into group_events (group_id, event_id, shared_by) values ($1, $2, $3) on conflict do nothing', [params.id, v.event_id, user.id]);
    await tx.q("insert into messages (conversation_id, sender_id, kind, event_id, body) values ($1, $2, 'event', $3, $4)", [g.conversation_id, user.id, v.event_id, v.note ?? null]);
    await tx.q("insert into event_analytics (event_id, kind, user_id) values ($1, 'share', $2)", [v.event_id, user.id]);
    return { conversation_id: g.conversation_id };
  }),

  put('/groups/:id/events/:geId/rsvp', 'personal', async ({ tx, user, params, body }) => {
    const v = parse(z.object({ status: z.enum(['going', 'maybe', 'not_going']).nullable() }), body);
    const ge = await tx.one('select id from group_events where id = $1 and group_id = $2', [params.geId, params.id]);
    if (!ge) throw notFound();
    if (v.status === null) await tx.q('delete from group_rsvps where group_event_id = $1 and user_id = $2', [params.geId, user.id]);
    else
      await tx.q(
        `insert into group_rsvps (group_event_id, user_id, status) values ($1, $2, $3)
         on conflict (group_event_id, user_id) do update set status = excluded.status, updated_at = now()`,
        [params.geId, user.id, v.status],
      );
    return { status: v.status };
  }),
];
