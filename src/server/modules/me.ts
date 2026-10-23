import { NextResponse } from 'next/server';
import { z } from 'zod';
import { del, get, patch, post, put, parse, type Route } from '../router';
import { ApiError, notFound } from '../errors';
import { CREDENTIALS_SQL, verifyPassword } from '../auth';
import type { Tx } from '../db';

const handle = z
  .string()
  .trim()
  .transform((s) => s.replace(/^@/, '').replace(/^https?:\/\/(www\.)?(instagram\.com|tiktok\.com)\/@?/i, '').replace(/\/.*$/, ''))
  .pipe(z.string().regex(/^[A-Za-z0-9_.]{1,30}$/));

export async function loadMe(tx: Tx, userId: string) {
  const user = await tx.one(
    `select id, email, account_type, birthdate, onboarding_completed_at, marketing_consent_at, created_at,
            app.is_adult(id) as is_adult from users where id = $1`,
    [userId],
  );
  if (!user) throw notFound();
  const profile = await tx.one(
    `select p.username, p.display_name, p.avatar_url, p.bio, p.city_id, c.name as city_name, p.is_private, p.dm_policy
     from personal_profiles p left join cities c on c.id = p.city_id where p.user_id = $1`,
    [userId],
  );
  const social = await tx.q('select platform, handle, is_visible from user_social_links where user_id = $1', [userId]);
  const businesses = await tx.q(
    `select b.id, b.slug, b.name, b.logo_url, b.verification_status, b.is_demo, s.role
     from business_staff s join business_profiles b on b.id = s.business_id where s.user_id = $1 order by b.name`,
    [userId],
  );
  const stats = profile
    ? await tx.one(
        `select
          (select count(*) from event_attendance a join attendance_confirmations ac on ac.attendance_id = a.id
             where a.user_id = $1 and ac.response = 'attended')::int as events_attended,
          (select count(distinct e.business_id) from event_attendance a join attendance_confirmations ac on ac.attendance_id = a.id
             join events e on e.id = a.event_id where a.user_id = $1 and ac.response = 'attended')::int as venues_visited,
          (select count(*) from group_members where user_id = $1 and status = 'active')::int as groups,
          (select count(*) from user_follows where user_id = $1)::int as following`,
        [userId],
      )
    : null;
  return { user, profile, social, businesses, stats };
}

export async function loadPreferences(tx: Tx, userId: string) {
  const p = await tx.one('select group_size, venue_size, setting, price_max, max_distance_km, preferred_days from user_preferences where user_id = $1', [userId]);
  const genres = (await tx.q<{ genre_id: string }>('select genre_id from user_preferred_genres where user_id = $1', [userId])).map((r) => r.genre_id);
  const categories = (await tx.q<{ category_id: string }>('select category_id from user_preferred_categories where user_id = $1', [userId])).map((r) => r.category_id);
  return { ...(p ?? { group_size: null, venue_size: 'any', setting: 'any', price_max: null, max_distance_km: 25, preferred_days: [] }), genres, categories };
}

const prefsSchema = z.object({
  genres: z.array(z.string().max(30)).max(20),
  categories: z.array(z.string().max(30)).max(20),
  group_size: z.enum(['alone', '2', '3-5', '6-10', '10+']).nullable(),
  venue_size: z.enum(['small', 'large', 'any']).default('any'),
  setting: z.enum(['indoor', 'outdoor', 'any']).default('any'),
  price_max: z.number().int().min(0).max(1000).nullable().default(null),
  max_distance_km: z.number().int().min(1).max(500).default(25),
  preferred_days: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  complete_onboarding: z.boolean().optional(),
});

const notifSchema = z.object({
  event_reminders: z.boolean(),
  reminder_hours: z.union([z.literal(2), z.literal(6), z.literal(24), z.literal(48)]),
  group_activity: z.boolean(),
  messages: z.boolean(),
  request_updates: z.boolean(),
  suggestions: z.boolean(),
  promotional: z.boolean(),
  max_promotional_per_week: z.number().int().min(0).max(10),
});

export const meRoutes: Route[] = [
  get('/me', 'user', async ({ tx, user }) => loadMe(tx, user.id)),

  patch('/me/profile', 'personal', async ({ tx, user, body }) => {
    const v = parse(
      z.object({
        display_name: z.string().trim().min(1).max(50).optional(),
        username: z.string().trim().toLowerCase().regex(/^[a-z0-9_.]{3,24}$/).optional(),
        bio: z.string().trim().max(280).nullable().optional(),
        city_id: z.string().max(40).nullable().optional(),
        avatar_url: z.string().max(300).regex(/^\/(api\/files|demo)\//).nullable().optional(),
      }),
      body,
    );
    if (v.username) {
      const ok = await tx.one<{ ok: boolean }>('select app.username_available($1) as ok', [v.username]);
      if (!ok?.ok) throw new ApiError(409, 'username_taken');
    }
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, val] of Object.entries(v)) {
      vals.push(val === '' ? null : val);
      sets.push(`${k} = $${vals.length}`);
    }
    if (sets.length) await tx.q(`update personal_profiles set ${sets.join(', ')} where user_id = $${vals.length + 1}`, [...vals, user.id]);
    return loadMe(tx, user.id);
  }),

  get('/me/preferences', 'personal', async ({ tx, user }) => loadPreferences(tx, user.id)),

  put('/me/preferences', 'personal', async ({ tx, user, body }) => {
    const v = parse(prefsSchema, body);
    await tx.q(
      `insert into user_preferences (user_id, group_size, venue_size, setting, price_max, max_distance_km, preferred_days)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (user_id) do update set group_size = excluded.group_size, venue_size = excluded.venue_size, setting = excluded.setting,
         price_max = excluded.price_max, max_distance_km = excluded.max_distance_km, preferred_days = excluded.preferred_days`,
      [user.id, v.group_size, v.venue_size, v.setting, v.price_max, v.max_distance_km, v.preferred_days],
    );
    await tx.q('delete from user_preferred_genres where user_id = $1', [user.id]);
    await tx.q('delete from user_preferred_categories where user_id = $1', [user.id]);
    if (v.genres.length)
      await tx.q('insert into user_preferred_genres (user_id, genre_id) select $1, g from unnest($2::text[]) g where g in (select id from music_genres)', [user.id, v.genres]);
    if (v.categories.length)
      await tx.q(
        'insert into user_preferred_categories (user_id, category_id) select $1, c from unnest($2::text[]) c where c in (select id from event_categories)',
        [user.id, v.categories],
      );
    if (v.complete_onboarding) await tx.q('update users set onboarding_completed_at = coalesce(onboarding_completed_at, now()) where id = $1', [user.id]);
    return loadPreferences(tx, user.id);
  }),

  put('/me/privacy', 'personal', async ({ tx, user, body }) => {
    const link = z.object({ handle, is_visible: z.boolean() }).nullable();
    const v = parse(
      z.object({
        is_private: z.boolean(),
        dm_policy: z.enum(['everyone', 'connections', 'nobody']),
        instagram: link.optional(),
        tiktok: link.optional(),
      }),
      body,
    );
    await tx.q('update personal_profiles set is_private = $1, dm_policy = $2 where user_id = $3', [v.is_private, v.dm_policy, user.id]);
    for (const platform of ['instagram', 'tiktok'] as const) {
      const l = v[platform];
      if (l === undefined) continue;
      if (l === null) await tx.q('delete from user_social_links where user_id = $1 and platform = $2', [user.id, platform]);
      else
        await tx.q(
          `insert into user_social_links (user_id, platform, handle, is_visible) values ($1, $2, $3, $4)
           on conflict (user_id, platform) do update set handle = excluded.handle, is_visible = excluded.is_visible`,
          [user.id, platform, l.handle, l.is_visible],
        );
    }
    return loadMe(tx, user.id);
  }),

  get('/me/notification-preferences', 'user', async ({ tx, user }) => {
    const np = await tx.one('select * from notification_preferences where user_id = $1', [user.id]);
    const u = await tx.one<{ marketing_consent_at: string | null }>('select marketing_consent_at from users where id = $1', [user.id]);
    return { ...np, marketing_consent: !!u?.marketing_consent_at };
  }),

  put('/me/notification-preferences', 'user', async ({ tx, user, body }) => {
    const v = parse(notifSchema, body);
    await tx.q(
      `insert into notification_preferences (user_id, event_reminders, reminder_hours, group_activity, messages, request_updates, suggestions, promotional, max_promotional_per_week, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       on conflict (user_id) do update set event_reminders = $2, reminder_hours = $3, group_activity = $4, messages = $5,
         request_updates = $6, suggestions = $7, promotional = $8, max_promotional_per_week = $9, updated_at = now()`,
      [user.id, v.event_reminders, v.reminder_hours, v.group_activity, v.messages, v.request_updates, v.suggestions, v.promotional, v.max_promotional_per_week],
    );
    // Marketing consent is explicit and timestamped; withdrawing it is always possible.
    await tx.q(
      'update users set marketing_consent_at = case when $2 then coalesce(marketing_consent_at, now()) else null end where id = $1',
      [user.id, v.promotional],
    );
    return { ok: true };
  }),

  get('/me/follows', 'personal', async ({ tx, user }) =>
    tx.q(
      `select b.id, b.slug, b.name, b.logo_url, b.category, b.verification_status = 'verified' as verified, f.notify_promotions, ci.name as city_name
       from user_follows f join business_profiles b on b.id = f.business_id left join cities ci on ci.id = b.city_id
       where f.user_id = $1 order by b.name`,
      [user.id],
    ),
  ),

  get('/me/blocks', 'personal', async ({ tx }) => tx.q('select * from app.my_blocks()')),

  // GDPR: full export of the data spot. holds about the user (RLS limits every query to own rows).
  get('/me/export', 'user', async ({ tx, user }) => {
    const tables: Record<string, string> = {
      account: 'select id, email, account_type, birthdate, locale, terms_accepted_at, privacy_accepted_at, marketing_consent_at, onboarding_completed_at, created_at from users where id = $1',
      profile: 'select * from personal_profiles where user_id = $1',
      social_links: 'select * from user_social_links where user_id = $1',
      preferences: 'select * from user_preferences where user_id = $1',
      preferred_genres: 'select genre_id from user_preferred_genres where user_id = $1',
      preferred_categories: 'select category_id from user_preferred_categories where user_id = $1',
      notification_preferences: 'select * from notification_preferences where user_id = $1',
      follows: 'select business_id, notify_promotions, created_at from user_follows where user_id = $1',
      saves: 'select event_id, created_at from event_saves where user_id = $1',
      attendance: 'select a.*, ac.response as confirmation, ac.responded_at from event_attendance a left join attendance_confirmations ac on ac.attendance_id = a.id where a.user_id = $1',
      feedback: 'select * from event_feedback where user_id = $1',
      messages_sent: 'select id, conversation_id, kind, body, event_id, created_at from messages where sender_id = $1',
      group_memberships: 'select group_id, role, status, created_at from group_members where user_id = $1',
      guest_list_requests: 'select * from guest_list_requests where requester_id = $1',
      table_requests: 'select * from table_requests where user_id = $1',
      notifications: 'select * from notifications where user_id = $1',
      blocks: 'select blocked_id, created_at from user_blocks where blocker_id = $1',
      reports: 'select * from user_reports where reporter_id = $1',
      recaps: 'select * from recap_statistics where user_id = $1',
    };
    const out: Record<string, unknown> = { exported_at: new Date().toISOString() };
    for (const [k, sql] of Object.entries(tables)) out[k] = await tx.q(sql, [user.id]);
    return new NextResponse(JSON.stringify(out, null, 2), {
      headers: { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="spot-export.json"' },
    });
  }),

  // Account deletion: cascades to all personal data; sent messages are kept as "deleted user".
  post('/me/delete', 'user', async ({ tx, user, body }) => {
    const v = parse(z.object({ password: z.string().min(1) }), body);
    const cred = await tx.one<{ password_hash: string }>(CREDENTIALS_SQL, [user.email]);
    if (!cred || !(await verifyPassword(v.password, cred.password_hash))) throw new ApiError(401, 'invalid_credentials');
    await tx.q('delete from users where id = $1', [user.id]);
    const res = NextResponse.json({ ok: true });
    res.cookies.delete('spot_session');
    return res;
  }),

  del('/me/blocks/:userId', 'personal', async ({ tx, user, params }) => {
    await tx.q('delete from user_blocks where blocker_id = $1 and blocked_id = $2', [user.id, params.userId]);
    return { ok: true };
  }),
];
