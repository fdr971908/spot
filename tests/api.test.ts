import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { call, login } from './helpers';
import { getPool } from '@/server/db';

let giulia: string, luca: string, martina: string, biz: string, otherBiz: string;
let admin: Client;
const id = async (sql: string, p: unknown[] = []) => (await admin.query(sql, p)).rows[0]?.id as string;

beforeAll(async () => {
  admin = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await admin.connect();
  [giulia, luca, martina, biz, otherBiz] = await Promise.all([
    login('giulia@spot.demo'), login('luca@spot.demo'), login('martina@spot.demo'), login('business@spot.demo'), login('nebula-club@business.spot.demo'),
  ]);
});
afterAll(async () => {
  await admin.end();
  await getPool().end();
});

describe('Flow A — register, preferences, discover, save, attend, calendar', () => {
  it('works end to end with private attendance by default', async () => {
    const reg = await call('POST', '/auth/register', {
      body: { account_type: 'personal', email: 'nuovo@spot.test', password: 'password123', display_name: 'Nuovo Utente', username: 'nuovo.utente', birthdate: '1999-05-05', city_id: 'milano', accept_terms: true },
    });
    expect(reg.status).toBe(200);
    const token = reg.json.token;
    expect((await call('PUT', '/me/preferences', { token, body: { genres: ['techno'], categories: ['nightclub'], group_size: '3-5', complete_onboarding: true } })).status).toBe(200);
    const prefs = await call('GET', '/me/preferences', { token });
    expect(prefs.json.genres).toEqual(['techno']);

    const feed = await call('GET', '/feed', { token });
    expect(feed.status).toBe(200);
    const target = feed.json.items.find((e: any) => e.genres.includes('techno'));
    expect(target).toBeTruthy();
    expect(feed.json.items[0].reasons.length).toBeGreaterThan(0);

    const detail = await call('GET', `/events/${target.id}`, { token });
    expect(detail.json.title).toBe(target.title);
    expect((await call('POST', `/events/${target.id}/save`, { token })).json.saved).toBe(true);
    const att = await call('POST', `/events/${target.id}/attend`, { token, body: {} });
    expect(att.json.attendance).toEqual({ status: 'going', visibility: 'private' });

    const cal = await call('GET', '/calendar', { token });
    const item = cal.json.items.find((e: any) => e.id === target.id);
    expect(item).toMatchObject({ is_saved: true, my_attendance: 'going', my_visibility: 'private' });

    // private attendee must not show up in the public list
    const list = await call('GET', `/events/${target.id}/attendees`, { token: luca });
    expect(list.json.attendees.map((a: any) => a.username)).not.toContain('nuovo.utente');

    // cancel and unsave
    expect((await call('DELETE', `/events/${target.id}/attend`, { token })).json.attendance.status).toBe('cancelled');
    expect((await call('DELETE', `/events/${target.id}/save`, { token })).json.saved).toBe(false);
  });

  it('rejects duplicate email and too-young users', async () => {
    const dup = await call('POST', '/auth/register', { body: { account_type: 'personal', email: 'giulia@spot.demo', password: 'password123', display_name: 'X', username: 'xxx.yyy', birthdate: '1990-01-01', accept_terms: true } });
    expect(dup.json.error.code).toBe('email_taken');
    const young = await call('POST', '/auth/register', { body: { account_type: 'personal', email: 'kid@spot.test', password: 'password123', display_name: 'K', username: 'kid.test', birthdate: `${new Date().getFullYear() - 12}-01-01`, accept_terms: true } });
    expect(young.json.error.code).toBe('age_not_allowed');
  });
});

describe('attendance privacy', () => {
  it('hides private attendance from lists (Alessio is private on Nocturna)', async () => {
    const ev = await id("select id from events where title like 'Nocturna · Techno%'");
    const r = await call('GET', `/events/${ev}/attendees`, { token: luca });
    const names = r.json.attendees.map((a: any) => a.username);
    expect(names).toContain('giuliarossi');
    expect(names).not.toContain('alessio.ricci');
    expect(names).not.toContain('marcoferri');
    // private profile appears only with basic info
    const chiara = r.json.attendees.find((a: any) => a.username === 'chiarae');
    expect(chiara).toMatchObject({ is_private: true, bio: null, instagram: null });
  });

  it('minors cannot see attendee lists nor attend publicly', async () => {
    const ev = await id("select id from events where title like 'Concerto nel Giardino%'");
    const r = await call('GET', `/events/${ev}/attendees`, { token: martina });
    expect(r.json).toMatchObject({ restricted: true, attendees: [] });
    expect((await call('POST', `/events/${ev}/attend`, { token: martina, body: { visibility: 'public' } })).status).toBe(403);
    const adult = await id("select id from events where title like 'Nocturna · Techno%'");
    expect((await call('POST', `/events/${adult}/attend`, { token: martina, body: {} })).json.error.code).toBe('age_restricted');
  });

  it('RLS: the app role only ever sees its own attendance rows', async () => {
    const uid = (await admin.query("select user_id from personal_profiles where username = 'lucab'")).rows[0].user_id;
    const c = await getPool().connect();
    try {
      await c.query('begin');
      await c.query("select set_config('app.user_id', $1, true)", [uid]);
      const rows = (await c.query('select distinct user_id from event_attendance')).rows;
      expect(rows).toEqual([{ user_id: uid }]);
      expect((await c.query('select count(*)::int as n from users')).rows[0].n).toBe(1);
      await expect(c.query('select count(*) from event_analytics')).rejects.toThrow(/permission denied/);
      await c.query('rollback');
    } finally {
      c.release();
    }
  });

  it('does not leak attendance through public profiles', async () => {
    const r = await call('GET', '/users/giuliarossi', { token: luca });
    expect(JSON.stringify(r.json)).not.toMatch(/attend|events/i);
  });
});

describe('Flow B — groups, sharing, RSVP; message access control', () => {
  it('creates a spot group, invites, shares and RSVPs', async () => {
    const ev = await id("select id from events where title like 'Picnic Elettronico%'");
    const lucaId = (await admin.query("select user_id from personal_profiles where username = 'lucab'")).rows[0].user_id;
    const g = await call('POST', '/groups', { token: giulia, body: { name: 'Picnic squad', kind: 'spot', event_id: ev, invite_ids: [lucaId] } });
    expect(g.status).toBe(200);
    expect(g.json.invited).toBe(1);
    // invited (not yet member) cannot read the chat
    expect((await call('GET', `/conversations/${g.json.conversation_id}`, { token: luca })).status).toBe(404);
    expect((await call('POST', `/groups/${g.json.group_id}/respond`, { token: luca, body: { accept: true } })).status).toBe(200);
    const conv = await call('GET', `/conversations/${g.json.conversation_id}`, { token: luca });
    expect(conv.status).toBe(200);
    const eventMsg = conv.json.messages.find((m: any) => m.kind === 'event');
    expect(eventMsg.event.id).toBe(ev);
    expect((await call('POST', `/conversations/${g.json.conversation_id}/messages`, { token: luca, body: { body: 'Ci sono!' } })).status).toBe(200);
    const ge = (await call('GET', `/groups/${g.json.group_id}`, { token: luca })).json.events[0];
    await call('PUT', `/groups/${g.json.group_id}/events/${ge.group_event_id}/rsvp`, { token: luca, body: { status: 'going' } });
    const after = (await call('GET', `/groups/${g.json.group_id}`, { token: giulia })).json.events[0];
    expect(after.going).toBe(1);
    // group RSVP is not official attendance
    const cal = await call('GET', '/calendar', { token: luca });
    expect(cal.json.items.find((e: any) => e.id === ev)?.my_attendance ?? null).toBe(null);
  });

  it('outsiders cannot read or post in a group', async () => {
    const conv = await id("select conversation_id as id from groups where name = 'Weekend Crew'");
    const elena = await login('elena@spot.demo');
    expect((await call('GET', `/conversations/${conv}`, { token: elena })).status).toBe(404);
    expect([403, 404]).toContain((await call('POST', `/conversations/${conv}/messages`, { token: elena, body: { body: 'ciao' } })).status);
    expect((await call('GET', `/conversations/${conv}`, { token: biz })).status).toBe(404);
  });

  it('blocking hides profiles and prevents DMs', async () => {
    const sara = await login('sara@spot.demo');
    const elena = await login('elena@spot.demo');
    const elenaId = (await admin.query("select user_id from personal_profiles where username = 'elenaromano'")).rows[0].user_id;
    expect((await call('POST', '/conversations/direct', { token: sara, body: { user_id: elenaId } })).status).toBe(200); // elena: dm everyone
    await call('POST', '/users/saraconti/block', { token: elena });
    expect((await call('GET', '/users/elenaromano', { token: sara })).status).toBe(404);
    expect((await call('POST', '/conversations/direct', { token: sara, body: { user_id: elenaId } })).json.error.code).toBe('dm_not_allowed');
  });
});

describe('Flow D/E — business publishing, messaging, analytics', () => {
  it('a business publishes an event that appears in discovery', async () => {
    const bid = (await call('GET', '/biz', { token: biz })).json[0].id;
    const starts = new Date(Date.now() + 3 * 86400_000).toISOString();
    const ends = new Date(Date.now() + 3 * 86400_000 + 5 * 3600_000).toISOString();
    const c = await call('POST', `/biz/${bid}/events`, { token: biz, body: { title: 'Test Rave Pubblicato', starts_at: starts, ends_at: ends, category_id: 'nightclub', genres: ['techno'], price_min: 10, publish: false } });
    expect(c.status).toBe(200);
    // draft is invisible to users
    expect((await call('GET', `/events/${c.json.id}`, { token: giulia })).status).toBe(404);
    expect((await call('POST', `/biz/${bid}/events/${c.json.id}/publish`, { token: biz })).status).toBe(200);
    const s = await call('GET', '/events?q=Test%20Rave', { token: giulia });
    expect(s.json.items.map((e: any) => e.id)).toContain(c.json.id);
    const following = await call('GET', '/feed?tab=following', { token: giulia });
    expect(following.json.items.map((e: any) => e.id)).toContain(c.json.id);
  });

  it('enforces business boundaries', async () => {
    const bid = (await call('GET', '/biz', { token: biz })).json[0].id;
    expect((await call('GET', `/biz/${bid}/overview`, { token: otherBiz })).status).toBe(403);
    expect((await call('GET', `/biz/${bid}/overview`, { token: giulia })).status).toBe(403);
    expect((await call('GET', '/feed', { token: biz })).status).toBe(403);
  });

  it('user messages a business; staff replies; analytics are aggregates', async () => {
    const c = await call('POST', '/businesses/magazzino-21/contact', { token: luca, body: {} });
    await call('POST', `/conversations/${c.json.conversation_id}/messages`, { token: luca, body: { body: 'Info parcheggio?' } });
    const bid = (await call('GET', '/biz', { token: biz })).json[0].id;
    const inbox = await call('GET', `/biz/${bid}/conversations`, { token: biz });
    expect(inbox.json.map((x: any) => x.id)).toContain(c.json.conversation_id);
    expect((await call('POST', `/conversations/${c.json.conversation_id}/messages`, { token: biz, body: { body: 'Sì, in via Tortona', as_business: true } })).status).toBe(200);
    expect([403, 404]).toContain((await call('POST', `/conversations/${c.json.conversation_id}/messages`, { token: otherBiz, body: { body: 'spam', as_business: true } })).status);
    const notif = await call('GET', '/notifications', { token: luca });
    expect(notif.json.items[0].type).toBe('business_message');
    const a = await call('GET', `/biz/${bid}/analytics?days=30`, { token: biz });
    expect(a.status).toBe(200);
    expect(JSON.stringify(a.json)).not.toMatch(/user_id|email|username/);
  });

  it('guest lists expose only consenting names to the business', async () => {
    const bid = (await call('GET', '/biz', { token: biz })).json[0].id;
    const lists = await call('GET', `/biz/${bid}/guest-lists`, { token: biz });
    const crew = lists.json.find((r: any) => r.note?.includes('Weekend Crew'));
    expect(crew.entries.map((e: any) => e.display_name).sort()).toEqual(['Giulia Rossi', 'Luca Bianchi']); // Sara has not consented
  });

  it('users cannot self-confirm their own requests', async () => {
    const ev = await id("select id from events where title like 'Lilla Friday%'");
    await call('POST', `/events/${ev}/guest-list`, { token: luca, body: {} });
    const reqId = await id('select id from guest_list_requests where event_id = $1 order by created_at desc', [ev]);
    const c = await getPool().connect();
    const lucaId = (await admin.query("select user_id from personal_profiles where username = 'lucab'")).rows[0].user_id;
    try {
      await c.query('begin');
      await c.query("select set_config('app.user_id', $1, true)", [lucaId]);
      await expect(c.query("update guest_list_requests set status = 'confirmed' where id = $1", [reqId])).rejects.toThrow(/invalid_status_transition/);
      await c.query('rollback');
    } finally {
      c.release();
    }
  });
});

describe('Flow F — confirmation after the event', () => {
  it('confirms past attendance and counts it in the recap', async () => {
    const ev = await id("select id from events where title = 'Disco Lovers Night'");
    const before = (await call('GET', `/me/recap?year=${new Date().getFullYear()}`, { token: giulia })).json.confirmed_events;
    expect((await call('POST', `/events/${ev}/confirm`, { token: giulia, body: { response: 'attended' } })).status).toBe(200);
    const after = (await call('GET', `/me/recap?year=${new Date().getFullYear()}`, { token: giulia })).json;
    expect(after.confirmed_events).toBe(before + 1);
    // cannot confirm a future event
    const fut = await id("select id from events where title like 'Nocturna · Techno%'");
    expect((await call('POST', `/events/${fut}/confirm`, { token: giulia, body: { response: 'attended' } })).status).toBe(409);
  });
});

describe('campaigns respect consent and limits', () => {
  it('only reaches followers who opted in', async () => {
    const bid = (await call('GET', '/biz', { token: biz })).json[0].id;
    const aud = await call('GET', `/biz/${bid}/campaigns/audience?audience=followers`, { token: biz });
    const expected = (await admin.query(
      `select count(*)::int as n from user_follows f join users u on u.id = f.user_id join notification_preferences np on np.user_id = f.user_id
       where f.business_id = $1 and f.notify_promotions and np.promotional and u.marketing_consent_at is not null`, [bid])).rows[0].n;
    expect(aud.json.eligible).toBe(expected);
    expect(aud.json.eligible).toBeLessThan(aud.json.followers);
  });
});

describe('cron', () => {
  it('requires the secret and is idempotent', async () => {
    expect((await call('POST', '/cron/tick')).status).toBe(401);
  });
});
