import { z } from 'zod';
import { del, get, patch, post, parse, type Route } from '../router';
import { ApiError, forbidden, notFound } from '../errors';
import type { Tx } from '../db';
import type { SessionUser } from '../auth';
import { haversineKm, rankFeed, weightsFromRows, type Signals } from '../recommend';
import { loadPreferences } from './me';
import { EVENT_CARD_COLUMNS, EVENT_CARD_FROM, eventCardsByIds, publicAttendeeCount, requireEvent, type EventCard } from './shared';
import { ageFrom } from './auth';

const DEFAULT_ORIGIN = { lat: 45.4642, lng: 9.19 }; // Milano

async function origin(tx: Tx, userId: string, query: URLSearchParams) {
  const lat = Number(query.get('lat'));
  const lng = Number(query.get('lng'));
  if (query.get('lat') && Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  const c = await tx.one<{ lat: number; lng: number }>(
    'select c.lat, c.lng from personal_profiles p join cities c on c.id = p.city_id where p.user_id = $1',
    [userId],
  );
  return c ?? DEFAULT_ORIGIN;
}

function userAge(user: SessionUser) {
  return user.birthdate ? ageFrom(user.birthdate) : 0;
}

async function trackImpressions(tx: Tx, ids: string[], userId: string) {
  if (ids.length) await tx.q("insert into event_analytics (event_id, kind, user_id) select unnest($1::uuid[]), 'impression', $2", [ids, userId]);
}

async function loadSignals(tx: Tx, userId: string): Promise<Signals> {
  const follows = await tx.q<{ business_id: string }>('select business_id from user_follows where user_id = $1', [userId]);
  const saved = await tx.q<{ category_id: string; n: number }>(
    'select e.category_id, count(*)::int as n from event_saves s join events e on e.id = s.event_id where s.user_id = $1 group by 1',
    [userId],
  );
  const attended = await tx.q<{ category_id: string; n: number }>(
    `select e.category_id, count(*)::int as n from event_attendance a join attendance_confirmations ac on ac.attendance_id = a.id
     join events e on e.id = a.event_id where a.user_id = $1 and ac.response = 'attended' group by 1`,
    [userId],
  );
  const fb = await tx.q<{ event_id: string; kind: any; category_id: string }>(
    'select f.event_id, f.kind, e.category_id from event_feedback f join events e on e.id = f.event_id where f.user_id = $1',
    [userId],
  );
  const fewer = new Map<string, number>();
  for (const f of fb) if (f.kind === 'fewer_like_this') fewer.set(f.category_id, (fewer.get(f.category_id) ?? 0) + 1);
  return {
    followed: new Set(follows.map((f) => f.business_id)),
    savedCategories: new Map(saved.map((r) => [r.category_id, r.n])),
    attendedCategories: new Map(attended.map((r) => [r.category_id, r.n])),
    feedback: new Map(fb.map((f) => [f.event_id, f.kind])),
    fewerCategories: fewer,
  };
}

function withDistance(cards: EventCard[], o: { lat: number; lng: number }) {
  return cards.map((c) => ({ ...c, distance_km: c.lat != null && c.lng != null ? Math.round(haversineKm(o, { lat: c.lat, lng: c.lng }) * 10) / 10 : null }));
}

const searchSchema = z.object({
  q: z.string().trim().max(80).optional(),
  city: z.string().max(40).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  genres: z.string().max(300).optional(),
  categories: z.string().max(300).optional(),
  price_max: z.coerce.number().min(0).max(1000).optional(),
  free: z.enum(['1']).optional(),
  setting: z.enum(['indoor', 'outdoor']).optional(),
  group: z.enum(['1']).optional(),
  tables: z.enum(['1']).optional(),
  guest_list: z.enum(['1']).optional(),
  age: z.enum(['all', '18']).optional(),
  km: z.coerce.number().min(1).max(500).optional(),
  sort: z.enum(['date', 'distance']).default('date'),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  offset: z.coerce.number().int().min(0).max(5000).default(0),
});

export const eventRoutes: Route[] = [
  get('/meta', 'public', async ({ tx }) => ({
    cities: await tx.q('select id, name, lat, lng from cities order by name'),
    genres: await tx.q('select id, label from music_genres order by sort'),
    categories: await tx.q('select id, label, emoji from event_categories order by sort'),
  })),

  get('/feed', 'personal', async ({ tx, user, query }) => {
    const tab = query.get('tab') === 'following' ? 'following' : 'for-you';
    const category = query.get('category');
    const o = await origin(tx, user.id, query);
    const age = userAge(user);
    const params: unknown[] = [age];
    let where = `e.status = 'published' and e.ends_at > now() and coalesce(e.min_age, 0) <= $1`;
    if (category) {
      params.push(category);
      where += ` and e.category_id = $${params.length}`;
    }
    if (tab === 'following') {
      params.push(user.id);
      where += ` and e.business_id in (select business_id from user_follows where user_id = $${params.length})`;
      const rows = await tx.q<EventCard>(`select ${EVENT_CARD_COLUMNS} ${EVENT_CARD_FROM} where ${where} order by e.starts_at limit 60`, params);
      await trackImpressions(tx, rows.slice(0, 20).map((r) => r.id), user.id);
      return { items: withDistance(rows, o).map((item) => ({ ...item, reasons: [{ kind: 'followed' }] })) };
    }
    const rows = await tx.q<EventCard>(
      `select ${EVENT_CARD_COLUMNS} ${EVENT_CARD_FROM} where ${where} and e.starts_at < now() + interval '60 days' order by e.starts_at limit 400`,
      params,
    );
    const prefs = await loadPreferences(tx, user.id);
    const signals = await loadSignals(tx, user.id);
    const weights = weightsFromRows(await tx.q('select key, value from recommendation_weights'));
    const cands = withDistance(rows, o);
    const seed = `${user.id}:${new Date().toISOString().slice(0, 10)}`;
    const ranked = rankFeed(cands, prefs as any, signals, weights, new Date(), seed).slice(0, 40);
    await trackImpressions(tx, ranked.slice(0, 20).map((r) => r.item.id), user.id);
    return { items: ranked.map((r) => ({ ...r.item, score: r.score, reasons: r.reasons, explore: !!r.explore })) };
  }),

  get('/events', 'user', async ({ tx, user, query }) => {
    const f = parse(searchSchema, Object.fromEntries(query));
    const o = await origin(tx, user.id, query);
    const p: unknown[] = [];
    const $ = (v: unknown) => {
      p.push(v);
      return `$${p.length}`;
    };
    const w: string[] = [`e.status = 'published'`, `e.ends_at > now()`];
    if (f.q) {
      const like = $(`%${f.q.replace(/[%_\\]/g, (m) => '\\' + m)}%`);
      w.push(`(e.title ilike ${like} or e.venue_name ilike ${like} or b.name ilike ${like} or ci.name ilike ${like}
        or e.neighborhood ilike ${like} or e.lineup ilike ${like}
        or exists (select 1 from event_categories c where c.id = e.category_id and c.label ilike ${like})
        or exists (select 1 from event_music_genres g join music_genres mg on mg.id = g.genre_id where g.event_id = e.id and mg.label ilike ${like}))`);
    }
    if (f.city) w.push(`e.city_id = ${$(f.city)}`);
    if (f.from) w.push(`e.ends_at >= ${$(f.from)}`);
    if (f.to) w.push(`e.starts_at <= ${$(f.to)}`);
    if (f.genres) w.push(`exists (select 1 from event_music_genres g where g.event_id = e.id and g.genre_id = any(${$(f.genres.split(','))}::text[]))`);
    if (f.categories) w.push(`e.category_id = any(${$(f.categories.split(','))}::text[])`);
    if (f.free) w.push('e.is_free');
    if (f.price_max !== undefined) w.push(`(e.is_free or e.price_min <= ${$(f.price_max)})`);
    if (f.setting) w.push(f.setting === 'outdoor' ? 'e.is_outdoor' : 'not e.is_outdoor');
    if (f.group) w.push('e.group_friendly');
    if (f.tables) w.push('e.table_requests_enabled');
    if (f.guest_list) w.push('e.guest_list_enabled');
    if (f.age === 'all') w.push('coalesce(e.min_age, 0) = 0');
    if (f.age === '18') w.push('coalesce(e.min_age, 0) <= 18');
    const dist = f.km || f.sort === 'distance' ? `app.distance_km(${$(o.lat)}::float8, ${$(o.lng)}::float8, e.lat, e.lng)` : '';
    if (f.km) w.push(`e.lat is not null and ${dist} <= ${$(f.km)}::float8`);
    const order = f.sort === 'distance' ? `${dist} nulls last, e.starts_at` : 'e.starts_at';
    const rows = await tx.q<EventCard & { total: number }>(
      `select ${EVENT_CARD_COLUMNS}, count(*) over ()::int as total ${EVENT_CARD_FROM}
       where ${w.join(' and ')} order by ${order} limit ${$(f.limit)}::int offset ${$(f.offset)}::int`,
      p,
    );
    let businesses: unknown[] = [];
    if (f.q && f.offset === 0) {
      businesses = await tx.q(
        `select b.id, b.slug, b.name, b.logo_url, b.category, ci.name as city_name, b.verification_status = 'verified' as verified,
                exists (select 1 from user_follows f where f.business_id = b.id and f.user_id = app.uid()) as is_following
         from business_profiles b left join cities ci on ci.id = b.city_id
         where b.name ilike $1 or b.neighborhood ilike $1 or ci.name ilike $1 order by b.follower_count desc limit 6`,
        [`%${f.q}%`],
      );
    }
    await trackImpressions(tx, rows.slice(0, 20).map((r) => r.id), user.id);
    return { total: rows[0]?.total ?? 0, items: withDistance(rows, o), businesses };
  }),

  get('/events/:id', 'user', async ({ tx, user, params }) => {
    const [card] = await eventCardsByIds(tx, [params.id]);
    if (!card) throw notFound('event_not_found');
    const extra = await tx.one(
      `select e.description, e.rules, e.lineup, e.ticket_url, e.capacity, e.series_id, e.cancelled_at,
              b.description as business_description, b.category as business_category, b.follower_count, b.is_demo,
              exists (select 1 from user_follows f where f.business_id = b.id and f.user_id = app.uid()) as is_following
       from events e join business_profiles b on b.id = e.business_id where e.id = $1`,
      [params.id],
    );
    const counts = await tx.one<{ going_total: number; visible_total: number }>('select * from app.event_attendance_counts($1)', [params.id]);
    const attendees = await tx.q('select user_id, username, display_name, avatar_url, is_private from app.event_public_attendees($1) limit 8', [params.id]);
    const mine = await tx.one(
      `select a.status, a.visibility, ac.response as confirmation from event_attendance a
       left join attendance_confirmations ac on ac.attendance_id = a.id where a.event_id = $1 and a.user_id = $2`,
      [params.id, user.id],
    );
    const guestList = await tx.one("select id, status, group_id, created_at from guest_list_requests where event_id = $1 and requester_id = $2 order by created_at desc limit 1", [params.id, user.id]);
    const table = await tx.one('select id, status, party_size, created_at from table_requests where event_id = $1 and user_id = $2 order by created_at desc limit 1', [params.id, user.id]);
    const feedback = await tx.one<{ kind: string }>('select kind from event_feedback where event_id = $1 and user_id = $2', [params.id, user.id]);
    const otherDates = extra?.series_id
      ? await tx.q("select id, starts_at from events where series_id = $1 and id <> $2 and status = 'published' and starts_at > now() order by starts_at limit 6", [extra.series_id, params.id])
      : [];
    const isStaff = (await tx.one<{ ok: boolean }>('select app.is_staff($1) as ok', [card.business_id]))?.ok ?? false;
    if (user.account_type === 'personal') await tx.q("insert into event_analytics (event_id, kind, user_id) values ($1, 'view', $2)", [params.id, user.id]);
    const age = userAge(user);
    return {
      ...card,
      ...extra,
      attendee_count: publicAttendeeCount(counts!.going_total, counts!.visible_total),
      visible_attendee_count: counts!.visible_total,
      attendees: user.is_adult ? attendees : [],
      attendees_restricted: !user.is_adult,
      my: { attendance: mine, guest_list: guestList, table, feedback: feedback?.kind ?? null },
      age_ok: !card.min_age || age >= card.min_age,
      is_past: new Date(card.ends_at) < new Date(),
      other_dates: otherDates,
      is_staff: isStaff,
    };
  }),

  post('/events/:id/save', 'personal', async ({ tx, user, params }) => {
    await requireEvent(tx, params.id);
    await tx.q('insert into event_saves (user_id, event_id) values ($1, $2) on conflict do nothing', [user.id, params.id]);
    return { saved: true };
  }),
  del('/events/:id/save', 'personal', async ({ tx, user, params }) => {
    await tx.q('delete from event_saves where user_id = $1 and event_id = $2', [user.id, params.id]);
    return { saved: false };
  }),

  post('/events/:id/attend', 'personal', async ({ tx, user, params, body }) => {
    const v = parse(z.object({ visibility: z.enum(['public', 'private']).default('private'), source: z.enum(['event', 'group_rsvp']).default('event') }), body);
    const ev = await requireEvent(tx, params.id);
    if (ev.min_age && userAge(user) < ev.min_age) throw forbidden('age_restricted');
    if (v.visibility === 'public' && !user.is_adult) throw forbidden('minors_private_only');
    const a = await tx.one(
      `insert into event_attendance (user_id, event_id, status, visibility, source) values ($1, $2, 'going', $3, $4)
       on conflict (user_id, event_id) do update set status = 'going', visibility = excluded.visibility
       returning status, visibility`,
      [user.id, params.id, v.visibility, v.source],
    );
    return { attendance: a };
  }),
  patch('/events/:id/attend', 'personal', async ({ tx, user, params, body }) => {
    const v = parse(z.object({ visibility: z.enum(['public', 'private']) }), body);
    if (v.visibility === 'public' && !user.is_adult) throw forbidden('minors_private_only');
    const a = await tx.one('update event_attendance set visibility = $3 where user_id = $1 and event_id = $2 returning status, visibility', [user.id, params.id, v.visibility]);
    if (!a) throw notFound('attendance_not_found');
    return { attendance: a };
  }),
  del('/events/:id/attend', 'personal', async ({ tx, user, params }) => {
    const a = await tx.one("update event_attendance set status = 'cancelled' where user_id = $1 and event_id = $2 returning status, visibility", [user.id, params.id]);
    if (!a) throw notFound('attendance_not_found');
    return { attendance: a };
  }),

  post('/events/:id/confirm', 'personal', async ({ tx, user, params, body }) => {
    const v = parse(z.object({ response: z.enum(['attended', 'not_attended', 'skipped']) }), body);
    const a = await tx.one<{ id: string }>("select id from event_attendance where user_id = $1 and event_id = $2 and status = 'going'", [user.id, params.id]);
    if (!a) throw notFound('attendance_not_found');
    await tx.q(
      `insert into attendance_confirmations (attendance_id, response) values ($1, $2)
       on conflict (attendance_id) do update set response = excluded.response, responded_at = now()`,
      [a.id, v.response],
    );
    await tx.q("update notifications set read_at = coalesce(read_at, now()) where user_id = $1 and type = 'attendance_prompt' and ref_id = $2", [user.id, params.id]);
    return { confirmation: v.response };
  }),

  post('/events/:id/feedback', 'personal', async ({ tx, user, params, body }) => {
    const v = parse(z.object({ kind: z.enum(['interested', 'not_interested', 'fewer_like_this']) }), body);
    await requireEvent(tx, params.id);
    await tx.q(
      'insert into event_feedback (user_id, event_id, kind) values ($1, $2, $3) on conflict (user_id, event_id) do update set kind = excluded.kind, created_at = now()',
      [user.id, params.id, v.kind],
    );
    return { feedback: v.kind };
  }),
  del('/events/:id/feedback', 'personal', async ({ tx, user, params }) => {
    await tx.q('delete from event_feedback where user_id = $1 and event_id = $2', [user.id, params.id]);
    return { feedback: null };
  }),

  get('/events/:id/attendees', 'user', async ({ tx, user, params }) => {
    const ev = await requireEvent(tx, params.id);
    const counts = await tx.one<{ going_total: number; visible_total: number }>('select * from app.event_attendance_counts($1)', [params.id]);
    if (!user.is_adult) return { event: ev, restricted: true, attendees: [], attendee_count: counts!.visible_total };
    const attendees = await tx.q('select * from app.event_public_attendees($1)', [params.id]);
    return { event: ev, restricted: false, attendees, attendee_count: publicAttendeeCount(counts!.going_total, counts!.visible_total) };
  }),

  post('/events/:id/track', 'user', async ({ tx, user, params, body }) => {
    const v = parse(z.object({ kind: z.enum(['share', 'ticket_click', 'contact']) }), body);
    await tx.q('insert into event_analytics (event_id, kind, user_id) values ($1, $2, $3)', [params.id, v.kind, user.id]);
    return { ok: true };
  }),

  get('/calendar', 'personal', async ({ tx, user }) => {
    const rows = await tx.q(
      `select ${EVENT_CARD_COLUMNS},
              a.visibility as my_visibility, ac.response as my_confirmation,
              (select count(*) from group_events ge join group_members gm on gm.group_id = ge.group_id
                 where ge.event_id = e.id and gm.user_id = app.uid() and gm.status = 'active')::int as group_shares
       ${EVENT_CARD_FROM}
       left join event_attendance a on a.event_id = e.id and a.user_id = $1
       left join attendance_confirmations ac on ac.attendance_id = a.id
       where e.id in (select event_id from event_saves where user_id = $1 union select event_id from event_attendance where user_id = $1)
       order by e.starts_at`,
      [user.id],
    );
    return { items: rows };
  }),

  get('/me/recap', 'personal', async ({ tx, query }) => {
    const year = Number(query.get('year') ?? new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new ApiError(400, 'invalid_year');
    const r = await tx.one<{ stats: unknown }>('select app.compute_recap($1) as stats', [year]);
    return r!.stats;
  }),
];
