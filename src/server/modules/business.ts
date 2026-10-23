import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { del, get, patch, post, parse, type Route } from '../router';
import { ApiError, forbidden, notFound } from '../errors';
import type { Tx } from '../db';
import { profileCards, slugify } from './shared';

async function requireStaff(tx: Tx, bid: string, roles: string[] = ['owner', 'manager', 'staff']) {
  const r = await tx.one<{ role: string | null }>('select app.staff_role($1) as role', [bid]);
  if (!r?.role || !roles.includes(r.role)) throw forbidden('not_staff');
  return r.role;
}

const url = z.string().trim().url().max(500).refine((u) => /^https?:\/\//.test(u), 'http_only');
const imageUrl = z.string().max(300).regex(/^\/(api\/files|demo)\//);

const eventSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(4000).nullish(),
    cover_url: imageUrl.nullish(),
    starts_at: z.string().datetime({ offset: true }),
    ends_at: z.string().datetime({ offset: true }),
    venue_name: z.string().trim().min(2).max(120).optional(),
    address: z.string().trim().min(3).max(200).optional(),
    city_id: z.string().max(40).optional(),
    neighborhood: z.string().trim().max(80).nullish(),
    lat: z.number().min(-90).max(90).nullish(),
    lng: z.number().min(-180).max(180).nullish(),
    category_id: z.string().max(30),
    genres: z.array(z.string().max(30)).max(6).default([]),
    is_outdoor: z.boolean().default(false),
    venue_size: z.enum(['small', 'medium', 'large']).default('medium'),
    is_free: z.boolean().default(false),
    price_min: z.number().min(0).max(10000).nullish(),
    price_max: z.number().min(0).max(10000).nullish(),
    min_age: z.number().int().min(0).max(25).nullish(),
    rules: z.string().trim().max(2000).nullish(),
    lineup: z.string().trim().max(500).nullish(),
    ticket_url: url.nullish().or(z.literal('').transform(() => null)),
    capacity: z.number().int().min(1).max(200000).nullish(),
    group_friendly: z.boolean().default(true),
    guest_list_enabled: z.boolean().default(false),
    table_requests_enabled: z.boolean().default(false),
    publish: z.boolean().optional(),
  })
  .refine((e) => new Date(e.ends_at) > new Date(e.starts_at), { message: 'ends_before_start', path: ['ends_at'] })
  .refine((e) => e.is_free || e.price_min != null, { message: 'price_required', path: ['price_min'] });

const EVENT_FIELDS = [
  'title', 'description', 'cover_url', 'starts_at', 'ends_at', 'venue_name', 'address', 'city_id', 'neighborhood', 'lat', 'lng',
  'category_id', 'is_outdoor', 'venue_size', 'is_free', 'price_min', 'price_max', 'min_age', 'rules', 'lineup', 'ticket_url',
  'capacity', 'group_friendly', 'guest_list_enabled', 'table_requests_enabled',
] as const;

async function setGenres(tx: Tx, eventId: string, genres: string[]) {
  await tx.q('delete from event_music_genres where event_id = $1', [eventId]);
  if (genres.length)
    await tx.q('insert into event_music_genres (event_id, genre_id) select $1, g from unnest($2::text[]) g where g in (select id from music_genres)', [eventId, genres]);
}

async function bizEvent(tx: Tx, bid: string, id: string) {
  const e = await tx.one('select * from events where id = $1 and business_id = $2', [id, bid]);
  if (!e) throw notFound('event_not_found');
  return e;
}

const fmt = (d: string | Date) =>
  new Date(d).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export const businessRoutes: Route[] = [
  get('/biz', 'business', async ({ tx, user }) =>
    tx.q(
      `select b.id, b.slug, b.name, b.logo_url, b.verification_status, b.is_demo, s.role
       from business_staff s join business_profiles b on b.id = s.business_id where s.user_id = $1 order by s.created_at`,
      [user.id],
    ),
  ),

  post('/biz', 'business', async ({ tx, body }) => {
    const v = parse(
      z.object({
        name: z.string().trim().min(2).max(80),
        category: z.enum(['club', 'bar', 'restaurant', 'beach_club', 'venue', 'organizer', 'promoter', 'festival']),
        city_id: z.string().max(40),
        address: z.string().trim().min(3).max(200),
        description: z.string().trim().max(2000).optional(),
      }),
      body,
    );
    let slug = slugify(v.name) || 'locale';
    if (slug.length < 3) slug = `${slug}-spot`;
    if (await tx.one('select 1 from business_profiles where slug = $1', [slug])) slug = `${slug.slice(0, 33)}-${randomUUID().slice(0, 6)}`;
    const r = await tx.one<{ id: string }>('select app.create_business($1, $2, $3, $4, $5, $6) as id', [slug, v.name, v.category, v.city_id, v.address, v.description ?? null]);
    return { id: r!.id, slug };
  }),

  get('/biz/:bid', 'business', async ({ tx, params }) => {
    const role = await requireStaff(tx, params.bid);
    const b = await tx.one('select b.*, ci.name as city_name from business_profiles b left join cities ci on ci.id = b.city_id where b.id = $1', [params.bid]);
    return { business: b, role };
  }),

  patch('/biz/:bid', 'business', async ({ tx, params, body }) => {
    await requireStaff(tx, params.bid, ['owner', 'manager']);
    const v = parse(
      z.object({
        name: z.string().trim().min(2).max(80).optional(),
        category: z.enum(['club', 'bar', 'restaurant', 'beach_club', 'venue', 'organizer', 'promoter', 'festival']).optional(),
        logo_url: imageUrl.nullish(),
        cover_url: imageUrl.nullish(),
        description: z.string().trim().max(2000).nullish(),
        address: z.string().trim().max(200).nullish(),
        city_id: z.string().max(40).nullish(),
        neighborhood: z.string().trim().max(80).nullish(),
        lat: z.number().min(-90).max(90).nullish(),
        lng: z.number().min(-180).max(180).nullish(),
        opening_hours: z.record(z.string().max(12), z.string().max(40)).optional(),
        website: url.nullish().or(z.literal('').transform(() => null)),
        instagram: z.string().trim().max(40).nullish(),
        phone: z.string().trim().max(30).nullish(),
        contact_email: z.string().trim().email().max(120).nullish().or(z.literal('').transform(() => null)),
      }),
      body,
    );
    const entries = Object.entries(v);
    if (entries.length) {
      const sets = entries.map(([k], i) => `${k} = $${i + 2}`);
      await tx.q(`update business_profiles set ${sets.join(', ')} where id = $1`, [params.bid, ...entries.map(([, x]) => x)]);
    }
    return { ok: true };
  }),

  get('/biz/:bid/overview', 'business', async ({ tx, params }) => {
    await requireStaff(tx, params.bid);
    const since = new Date(Date.now() - 30 * 86400_000);
    const stats = await tx.q('select * from app.biz_event_stats($1, $2)', [params.bid, since]);
    const msg = await tx.one('select * from app.biz_message_stats($1, $2)', [params.bid, since]);
    const series = await tx.q('select * from app.biz_timeseries($1, 30)', [params.bid]);
    const b = await tx.one<{ follower_count: number; is_demo: boolean; verification_status: string }>('select follower_count, is_demo, verification_status from business_profiles where id = $1', [params.bid]);
    const sum = (k: string) => stats.reduce((a, r) => a + (r[k] ?? 0), 0);
    const now = Date.now();
    return {
      is_demo: b!.is_demo,
      verification_status: b!.verification_status,
      totals: {
        followers: b!.follower_count,
        new_followers_30d: series.reduce((a, r) => a + r.follows, 0),
        published_upcoming: stats.filter((s) => s.status === 'published' && new Date(s.starts_at).getTime() > now).length,
        drafts: stats.filter((s) => s.status === 'draft').length,
        views_30d: sum('views'),
        impressions_30d: sum('impressions'),
        saves: sum('saves'),
        going: sum('going'),
        gl_pending: sum('gl_pending'),
        gl_requests: sum('gl_requests'),
        tables_pending: sum('tables_pending'),
        tables_requests: sum('tables_requests'),
      },
      messages: msg,
      series,
      upcoming: stats.filter((s) => new Date(s.starts_at).getTime() > now - 6 * 3600_000 && s.status !== 'cancelled').reverse().slice(0, 6),
    };
  }),

  get('/biz/:bid/events', 'business', async ({ tx, params }) => {
    await requireStaff(tx, params.bid);
    return tx.q('select * from app.biz_event_stats($1, $2)', [params.bid, new Date(Date.now() - 90 * 86400_000)]);
  }),

  post('/biz/:bid/events', 'business', async ({ tx, user, params, body }) => {
    await requireStaff(tx, params.bid);
    const v = parse(eventSchema, body);
    const b = await tx.one('select name, address, city_id, neighborhood, lat, lng from business_profiles where id = $1', [params.bid]);
    const data: Record<string, unknown> = {
      ...v,
      venue_name: v.venue_name ?? b!.name,
      address: v.address ?? b!.address,
      city_id: v.city_id ?? b!.city_id,
      neighborhood: v.neighborhood ?? b!.neighborhood,
      lat: v.lat ?? b!.lat,
      lng: v.lng ?? b!.lng,
    };
    if (!data.address || !data.city_id) throw new ApiError(400, 'venue_required');
    const cols = EVENT_FIELDS.filter((k) => data[k] !== undefined);
    const e = await tx.one<{ id: string }>(
      `insert into events (business_id, created_by, status, published_at, ${cols.join(', ')})
       values ($1, $2, $3, $4, ${cols.map((_, i) => `$${i + 5}`).join(', ')}) returning id`,
      [params.bid, user.id, v.publish ? 'published' : 'draft', v.publish ? new Date() : null, ...cols.map((k) => data[k] ?? null)],
    );
    await setGenres(tx, e!.id, v.genres);
    return { id: e!.id };
  }),

  get('/biz/:bid/events/:id', 'business', async ({ tx, params }) => {
    await requireStaff(tx, params.bid);
    const e = await bizEvent(tx, params.bid, params.id);
    const genres = (await tx.q<{ genre_id: string }>('select genre_id from event_music_genres where event_id = $1', [params.id])).map((g) => g.genre_id);
    const stats = (await tx.q('select * from app.biz_event_stats($1, $2) where event_id = $3', [params.bid, new Date(0), params.id]))[0];
    const series = e.series_id ? await tx.q('select id, starts_at, status from events where series_id = $1 order by starts_at', [e.series_id]) : [];
    return { event: { ...e, genres }, stats, series };
  }),

  patch('/biz/:bid/events/:id', 'business', async ({ tx, params, body }) => {
    await requireStaff(tx, params.bid);
    const before = await bizEvent(tx, params.bid, params.id);
    if (before.status === 'cancelled' || before.status === 'completed') throw new ApiError(409, 'event_locked');
    const v = parse(eventSchema, body);
    const cols = EVENT_FIELDS.filter((k) => (v as any)[k] !== undefined);
    await tx.q(`update events set ${cols.map((k, i) => `${k} = $${i + 2}`).join(', ')} where id = $1`, [params.id, ...cols.map((k) => (v as any)[k] ?? null)]);
    await setGenres(tx, params.id, v.genres);
    if (before.status === 'published' && new Date(before.starts_at).getTime() !== new Date(v.starts_at).getTime()) {
      await tx.q("select app.notify_event_audience($1, 'event_updated', $2, $3)", [params.id, `Cambio orario: ${v.title}`, `Nuovo orario: ${fmt(v.starts_at)}`]);
    }
    return { ok: true };
  }),

  post('/biz/:bid/events/:id/publish', 'business', async ({ tx, params }) => {
    await requireStaff(tx, params.bid);
    const e = await bizEvent(tx, params.bid, params.id);
    if (e.status !== 'draft') throw new ApiError(409, 'not_draft');
    if (new Date(e.ends_at) < new Date()) throw new ApiError(409, 'event_in_past');
    await tx.q("update events set status = 'published', published_at = coalesce(published_at, now()) where id = $1", [params.id]);
    return { status: 'published' };
  }),

  post('/biz/:bid/events/:id/unpublish', 'business', async ({ tx, params }) => {
    await requireStaff(tx, params.bid);
    const e = await bizEvent(tx, params.bid, params.id);
    if (e.status !== 'published') throw new ApiError(409, 'not_published');
    const going = await tx.one<{ going_total: number }>('select going_total from app.event_attendance_counts($1)', [params.id]);
    if (going!.going_total > 0) throw new ApiError(409, 'has_attendees_cancel_instead');
    await tx.q("update events set status = 'draft' where id = $1", [params.id]);
    return { status: 'draft' };
  }),

  post('/biz/:bid/events/:id/cancel', 'business', async ({ tx, params, body }) => {
    await requireStaff(tx, params.bid, ['owner', 'manager']);
    const v = parse(z.object({ reason: z.string().trim().max(240).optional() }), body);
    const e = await bizEvent(tx, params.bid, params.id);
    if (e.status !== 'published') throw new ApiError(409, 'not_published');
    await tx.q("update events set status = 'cancelled', cancelled_at = now() where id = $1", [params.id]);
    const n = await tx.one<{ n: number }>("select app.notify_event_audience($1, 'event_cancelled', $2, $3) as n", [
      params.id,
      `Evento annullato: ${e.title}`,
      v.reason || `${fmt(e.starts_at)} · L'organizzatore ha annullato l'evento.`,
    ]);
    await tx.q("update guest_list_requests set status = 'declined', business_note = 'Evento annullato' where event_id = $1 and status in ('pending', 'confirmed')", [params.id]);
    await tx.q("update table_requests set status = 'declined', business_note = 'Evento annullato' where event_id = $1 and status in ('pending', 'confirmed')", [params.id]);
    return { status: 'cancelled', notified: n!.n };
  }),

  // Recurring events: copies become separate occurrences in the same series, so
  // each keeps its own attendance history.
  post('/biz/:bid/events/:id/duplicate', 'business', async ({ tx, user, params, body }) => {
    await requireStaff(tx, params.bid);
    const v = parse(z.object({ every_days: z.number().int().min(1).max(60).default(7), count: z.number().int().min(1).max(12).default(1), publish: z.boolean().default(false) }), body);
    const e = await bizEvent(tx, params.bid, params.id);
    const series = e.series_id ?? randomUUID();
    if (!e.series_id) await tx.q('update events set series_id = $2 where id = $1', [params.id, series]);
    const ids: string[] = [];
    for (let i = 1; i <= v.count; i++) {
      const r = await tx.one<{ id: string }>(
        `insert into events (business_id, series_id, created_by, status, published_at, ${EVENT_FIELDS.join(', ')})
         select business_id, $2, $3, $4, $5, ${EVENT_FIELDS.map((k) => (k === 'starts_at' || k === 'ends_at' ? `${k} + make_interval(days => $6)` : k)).join(', ')}
         from events where id = $1 returning id`,
        [params.id, series, user.id, v.publish ? 'published' : 'draft', v.publish ? new Date() : null, v.every_days * i],
      );
      await tx.q('insert into event_music_genres (event_id, genre_id) select $2, genre_id from event_music_genres where event_id = $1', [params.id, r!.id]);
      ids.push(r!.id);
    }
    return { ids, series_id: series };
  }),

  del('/biz/:bid/events/:id', 'business', async ({ tx, params }) => {
    await requireStaff(tx, params.bid);
    const r = await tx.one("delete from events where id = $1 and business_id = $2 and status = 'draft' returning id", [params.id, params.bid]);
    if (!r) throw new ApiError(409, 'only_drafts_deletable');
    return { ok: true };
  }),

  // ── Guest lists ──
  get('/biz/:bid/guest-lists', 'business', async ({ tx, params, query }) => {
    await requireStaff(tx, params.bid);
    const ev = query.get('event_id');
    const rows = await tx.q(
      `select r.id, r.status, r.note, r.business_note, r.created_at, r.requester_id, e.id as event_id, e.title, e.starts_at,
              (select coalesce(json_agg(json_build_object('display_name', x.display_name) order by x.created_at), '[]')
                 from guest_list_entries x where x.request_id = r.id) as entries,
              (select count(*) from guest_list_entries x where x.request_id = r.id)::int as entries_visible
       from guest_list_requests r join events e on e.id = r.event_id
       where e.business_id = $1 and ($2::uuid is null or e.id = $2) and r.status <> 'cancelled'
       order by e.starts_at, r.created_at`,
      [params.bid, ev],
    );
    const cards = await profileCards(tx, rows.map((r) => r.requester_id));
    return rows.map(({ requester_id, ...r }) => ({ ...r, requester: cards.get(requester_id) ?? null }));
  }),

  patch('/biz/:bid/guest-lists/:id', 'business', async ({ tx, params, body }) => {
    await requireStaff(tx, params.bid);
    const v = parse(z.object({ status: z.enum(['confirmed', 'declined', 'pending']), business_note: z.string().trim().max(500).nullish() }), body);
    const r = await tx.one<{ requester_id: string; title: string; event_id: string }>(
      `update guest_list_requests r set status = $2, business_note = coalesce($3, r.business_note) from events e
       where r.id = $1 and e.id = r.event_id and e.business_id = $4 returning r.requester_id, e.title, e.id as event_id`,
      [params.id, v.status, v.business_note ?? null, params.bid],
    );
    if (!r) throw notFound();
    if (v.status !== 'pending')
      await tx.q("select app.notify($1, 'guest_list_update', $2, $3, $4, $5)", [
        r.requester_id,
        v.status === 'confirmed' ? `Sei in lista per ${r.title} ✨` : `Lista non disponibile per ${r.title}`,
        v.business_note ?? (v.status === 'confirmed' ? 'Mostra il tuo nome all’ingresso.' : 'Il locale non ha potuto confermare la tua richiesta.'),
        `/eventi/${r.event_id}`,
        params.id,
      ]);
    return { ok: true };
  }),

  // ── Tables ──
  get('/biz/:bid/tables', 'business', async ({ tx, params, query }) => {
    await requireStaff(tx, params.bid);
    const rows = await tx.q(
      `select t.id, t.status, t.party_size, t.contact_name, t.contact_phone, t.notes, t.business_note, t.created_at, t.user_id,
              e.id as event_id, e.title, e.starts_at
       from table_requests t join events e on e.id = t.event_id
       where e.business_id = $1 and ($2::uuid is null or e.id = $2) and t.status <> 'cancelled' order by e.starts_at, t.created_at`,
      [params.bid, query.get('event_id')],
    );
    const cards = await profileCards(tx, rows.map((r) => r.user_id));
    return rows.map(({ user_id, ...r }) => ({ ...r, requester: cards.get(user_id) ?? null }));
  }),

  patch('/biz/:bid/tables/:id', 'business', async ({ tx, params, body }) => {
    await requireStaff(tx, params.bid);
    const v = parse(z.object({ status: z.enum(['confirmed', 'declined', 'pending']), business_note: z.string().trim().max(500).nullish() }), body);
    const r = await tx.one<{ user_id: string; title: string; event_id: string }>(
      `update table_requests t set status = $2, business_note = coalesce($3, t.business_note) from events e
       where t.id = $1 and e.id = t.event_id and e.business_id = $4 returning t.user_id, e.title, e.id as event_id`,
      [params.id, v.status, v.business_note ?? null, params.bid],
    );
    if (!r) throw notFound();
    if (v.status !== 'pending')
      await tx.q("select app.notify($1, 'table_update', $2, $3, $4, $5)", [
        r.user_id,
        v.status === 'confirmed' ? `Tavolo confermato · ${r.title}` : `Tavolo non disponibile · ${r.title}`,
        v.business_note ?? null,
        `/eventi/${r.event_id}`,
        params.id,
      ]);
    return { ok: true };
  }),

  // ── Messages ──
  get('/biz/:bid/conversations', 'business', async ({ tx, params }) => {
    await requireStaff(tx, params.bid);
    const rows = await tx.q(
      `select c.id, c.last_message_at, (select user_id from conversation_members m where m.conversation_id = c.id limit 1) as user_id,
              lm.body as last_body, lm.kind as last_kind, lm.as_business as last_as_business,
              (select count(*) from messages x where x.conversation_id = c.id and not x.as_business and x.created_at > coalesce(r.last_read_at, '-infinity'))::int as unread
       from conversations c left join business_conversation_reads r on r.conversation_id = c.id
       left join lateral (select body, kind, as_business from messages x where x.conversation_id = c.id order by created_at desc limit 1) lm on true
       where c.business_id = $1 order by c.last_message_at desc limit 200`,
      [params.bid],
    );
    const cards = await profileCards(tx, rows.map((r) => r.user_id));
    return rows.map((r) => ({ ...r, user: cards.get(r.user_id) ?? null }));
  }),

  // ── Campaigns ──
  get('/biz/:bid/campaigns', 'business', async ({ tx, params }) => {
    await requireStaff(tx, params.bid);
    const rows = await tx.q(
      `select c.*, e.title as event_title from business_campaigns c left join events e on e.id = c.event_id
       where c.business_id = $1 order by c.created_at desc`,
      [params.bid],
    );
    const opens = new Map((await tx.q('select * from app.biz_campaign_stats($1)', [params.bid])).map((r) => [r.campaign_id, r.opened]));
    const sentWeek = rows.filter((r) => r.status === 'sent' && new Date(r.sent_at).getTime() > Date.now() - 7 * 86400_000).length;
    return { items: rows.map((r) => ({ ...r, opened: opens.get(r.id) ?? 0 })), weekly_limit: 3, sent_this_week: sentWeek };
  }),

  get('/biz/:bid/campaigns/audience', 'business', async ({ tx, params, query }) => {
    await requireStaff(tx, params.bid);
    const audience = query.get('audience') ?? 'followers';
    const r = await tx.one<{ n: number }>('select app.campaign_audience_size($1, $2, $3) as n', [params.bid, audience, query.get('event_id') || null]);
    const all = await tx.one<{ follower_count: number }>('select follower_count from business_profiles where id = $1', [params.bid]);
    return { eligible: r!.n, followers: all!.follower_count };
  }),

  post('/biz/:bid/campaigns', 'business', async ({ tx, user, params, body }) => {
    await requireStaff(tx, params.bid, ['owner', 'manager']);
    const v = parse(
      z.object({
        title: z.string().trim().min(3).max(60),
        message: z.string().trim().min(3).max(240),
        audience: z.enum(['followers', 'event_savers', 'event_attendees']),
        event_id: z.string().uuid().nullish(),
        scheduled_at: z.string().datetime({ offset: true }).nullish(),
        send_now: z.boolean().default(false),
      }),
      body,
    );
    if (v.audience !== 'followers' && !v.event_id) throw new ApiError(400, 'event_required');
    if (v.event_id) await bizEvent(tx, params.bid, v.event_id);
    if (v.scheduled_at && new Date(v.scheduled_at) < new Date()) throw new ApiError(400, 'schedule_in_past');
    const c = await tx.one<{ id: string }>(
      `insert into business_campaigns (business_id, title, message, audience, event_id, scheduled_at, status, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [params.bid, v.title, v.message, v.audience, v.event_id ?? null, v.scheduled_at ?? null, v.scheduled_at ? 'scheduled' : 'draft', user.id],
    );
    let result = null;
    if (v.send_now && !v.scheduled_at) result = (await tx.one<{ r: unknown }>('select app.send_campaign($1) as r', [c!.id]))!.r;
    return { id: c!.id, result };
  }),

  post('/biz/:bid/campaigns/:id/send', 'business', async ({ tx, params }) => {
    await requireStaff(tx, params.bid, ['owner', 'manager']);
    const r = await tx.one<{ r: unknown }>('select app.send_campaign($1) as r', [params.id]);
    return r!.r;
  }),

  post('/biz/:bid/campaigns/:id/cancel', 'business', async ({ tx, params }) => {
    await requireStaff(tx, params.bid, ['owner', 'manager']);
    const r = await tx.one("update business_campaigns set status = 'cancelled' where id = $1 and business_id = $2 and status in ('draft', 'scheduled') returning id", [params.id, params.bid]);
    if (!r) throw notFound();
    return { ok: true };
  }),

  // ── Analytics (aggregates only — never individual users) ──
  get('/biz/:bid/analytics', 'business', async ({ tx, params, query }) => {
    await requireStaff(tx, params.bid);
    const days = Math.min(90, Math.max(7, Number(query.get('days') ?? 30) || 30));
    const since = new Date(Date.now() - days * 86400_000);
    const series = await tx.q('select * from app.biz_timeseries($1, $2)', [params.bid, days]);
    const events = await tx.q('select * from app.biz_event_stats($1, $2)', [params.bid, since]);
    const campaigns = await tx.q(
      `select c.id, c.title, c.sent_at, c.recipients_count, c.skipped_count, s.opened
       from business_campaigns c join app.biz_campaign_stats($1) s on s.campaign_id = c.id where c.status = 'sent' order by c.sent_at desc limit 10`,
      [params.bid],
    );
    const cities = await tx.q('select * from app.biz_followers_by_city($1)', [params.bid]);
    const b = await tx.one<{ is_demo: boolean }>('select is_demo from business_profiles where id = $1', [params.bid]);
    return { days, is_demo: b!.is_demo, series, events, campaigns, followers_by_city: cities };
  }),

  // ── Staff ──
  get('/biz/:bid/staff', 'business', async ({ tx, params }) => tx.q('select * from app.biz_staff_list($1)', [params.bid])),
  post('/biz/:bid/staff', 'business', async ({ tx, params, body }) => {
    const v = parse(z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(['manager', 'staff']) }), body);
    await tx.q('select app.add_staff($1, $2, $3)', [params.bid, v.email, v.role]);
    return { ok: true };
  }),
  del('/biz/:bid/staff/:userId', 'business', async ({ tx, params }) => {
    await requireStaff(tx, params.bid, ['owner']);
    const r = await tx.one('delete from business_staff where business_id = $1 and user_id = $2 returning 1', [params.bid, params.userId]);
    if (!r) throw notFound();
    return { ok: true };
  }),
];
