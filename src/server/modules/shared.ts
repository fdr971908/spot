import type { Tx } from '../db';
import { notFound } from '../errors';

/** Columns of an event card, joined with venue/business/category. Uses app.uid() for personal state. */
export const EVENT_CARD_COLUMNS = `
  e.id, e.title, e.cover_url, e.starts_at, e.ends_at, e.venue_name, e.address, e.city_id, ci.name as city_name,
  e.neighborhood, e.category_id, e.is_free, e.price_min, e.price_max, e.min_age, e.is_outdoor, e.venue_size,
  e.group_friendly, e.guest_list_enabled, e.table_requests_enabled, e.status, e.lat, e.lng, e.business_id,
  b.name as business_name, b.slug as business_slug, b.logo_url as business_logo,
  (b.verification_status = 'verified') as business_verified,
  coalesce((select array_agg(g.genre_id order by g.genre_id) from event_music_genres g where g.event_id = e.id), '{}') as genres,
  exists (select 1 from event_saves s where s.event_id = e.id and s.user_id = app.uid()) as is_saved,
  (select a.status from event_attendance a where a.event_id = e.id and a.user_id = app.uid()) as my_attendance`;

export const EVENT_CARD_FROM = `
  from events e
  join business_profiles b on b.id = e.business_id
  join cities ci on ci.id = e.city_id`;

export interface EventCard {
  id: string;
  title: string;
  cover_url: string | null;
  starts_at: string;
  ends_at: string;
  venue_name: string;
  address: string;
  city_id: string;
  city_name: string;
  neighborhood: string | null;
  category_id: string;
  is_free: boolean;
  price_min: number | null;
  price_max: number | null;
  min_age: number | null;
  is_outdoor: boolean;
  venue_size: 'small' | 'medium' | 'large';
  group_friendly: boolean;
  guest_list_enabled: boolean;
  table_requests_enabled: boolean;
  status: string;
  lat: number | null;
  lng: number | null;
  business_id: string;
  business_name: string;
  business_slug: string;
  business_logo: string | null;
  business_verified: boolean;
  genres: string[];
  is_saved: boolean;
  my_attendance: 'going' | 'cancelled' | null;
}

export async function eventCardsByIds(tx: Tx, ids: string[]): Promise<EventCard[]> {
  if (!ids.length) return [];
  const rows = await tx.q<EventCard>(`select ${EVENT_CARD_COLUMNS} ${EVENT_CARD_FROM} where e.id = any($1::uuid[])`, [ids]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as EventCard[];
}

/**
 * Attendee count shown publicly. The total includes private intentions, so it
 * is only revealed once it is large enough not to single anyone out;
 * otherwise only consenting (visible) attendees are counted.
 */
export const PUBLIC_COUNT_THRESHOLD = 5;
export function publicAttendeeCount(goingTotal: number, visibleTotal: number) {
  return goingTotal >= PUBLIC_COUNT_THRESHOLD ? goingTotal : visibleTotal;
}

export async function requireEvent(tx: Tx, id: string) {
  const e = await tx.one<{ id: string; business_id: string; status: string; title: string; starts_at: string; ends_at: string; min_age: number | null }>(
    'select id, business_id, status, title, starts_at, ends_at, min_age from events where id = $1',
    [id],
  );
  if (!e) throw notFound('event_not_found');
  return e;
}

/** Profile cards (RLS-safe view) keyed by user id. */
export async function profileCards(tx: Tx, ids: (string | null)[]) {
  const uniq = [...new Set(ids.filter(Boolean))] as string[];
  if (!uniq.length) return new Map<string, ProfileCard>();
  const rows = await tx.q<ProfileCard>('select user_id, username, display_name, avatar_url, is_private from profile_cards where user_id = any($1::uuid[])', [uniq]);
  return new Map(rows.map((r) => [r.user_id, r]));
}

export interface ProfileCard {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_private: boolean;
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}
