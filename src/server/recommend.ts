/**
 * spot. MVP recommendation engine — a transparent weighted score.
 * Pure functions (no DB) so ranking is unit-testable and explainable.
 * Weights live in the `recommendation_weights` table and override DEFAULT_WEIGHTS.
 */

export interface Weights {
  music: number;
  activity: number;
  distance: number;
  date: number;
  weekday: number;
  followed: number;
  saved_affinity: number;
  attended_affinity: number;
  group: number;
  setting: number;
  venue_size: number;
  price_penalty: number;
  interested: number;
  fewer_penalty: number;
  explore_ratio: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  music: 3,
  activity: 3,
  distance: 2,
  date: 1.5,
  weekday: 0.5,
  followed: 2.5,
  saved_affinity: 1,
  attended_affinity: 1.5,
  group: 1,
  setting: 0.75,
  venue_size: 0.5,
  price_penalty: 2,
  interested: 2,
  fewer_penalty: 1.5,
  explore_ratio: 0.15,
};

export interface Prefs {
  genres: string[];
  categories: string[];
  group_size: string | null;
  venue_size: 'small' | 'large' | 'any';
  setting: 'indoor' | 'outdoor' | 'any';
  price_max: number | null;
  max_distance_km: number;
  preferred_days: number[]; // 0 = Sunday … 6 = Saturday
}

export interface Signals {
  followed: Set<string>; // business ids
  savedCategories: Map<string, number>;
  attendedCategories: Map<string, number>; // only user-confirmed attendance
  feedback: Map<string, 'interested' | 'not_interested' | 'fewer_like_this'>;
  fewerCategories: Map<string, number>;
}

export interface Candidate {
  id: string;
  business_id: string;
  category_id: string;
  genres: string[];
  starts_at: string | Date;
  is_outdoor: boolean;
  venue_size: 'small' | 'medium' | 'large';
  group_friendly: boolean;
  table_requests_enabled: boolean;
  is_free: boolean;
  price_min: number | null;
  distance_km: number | null;
}

export type Reason =
  | { kind: 'genre'; id: string }
  | { kind: 'category'; id: string }
  | { kind: 'followed' }
  | { kind: 'nearby'; km: number }
  | { kind: 'soon' }
  | { kind: 'group' }
  | { kind: 'similar' }
  | { kind: 'explore' };

export interface Scored<T> {
  item: T;
  score: number;
  reasons: Reason[];
  explore?: boolean;
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function dateRelevance(startsAt: Date, now: Date) {
  const d = (startsAt.getTime() - now.getTime()) / 86400_000;
  if (d < 0) return 0;
  if (d <= 0.5) return 1;
  if (d <= 7) return 1 - (d / 7) * 0.4;
  if (d <= 30) return 0.6 * (1 - (d - 7) / 23);
  return 0;
}

function groupFit(c: Candidate, groupSize: string | null) {
  if (!groupSize) return 0;
  if (groupSize === '6-10' || groupSize === '10+') return c.group_friendly ? (c.table_requests_enabled ? 1 : 0.6) : 0;
  if (groupSize === '3-5') return c.group_friendly ? 1 : 0.3;
  return 0.5;
}

export function scoreEvent(c: Candidate, prefs: Prefs, s: Signals, w: Weights, now: Date): { score: number; reasons: Reason[]; matched: boolean } {
  const reasons: Reason[] = [];
  let score = 0;

  const genreHits = c.genres.filter((g) => prefs.genres.includes(g));
  if (c.genres.length && genreHits.length) {
    score += w.music * (genreHits.length / c.genres.length);
    reasons.push({ kind: 'genre', id: genreHits[0] });
  }
  const catHit = prefs.categories.includes(c.category_id);
  if (catHit) {
    score += w.activity;
    reasons.push({ kind: 'category', id: c.category_id });
  }

  if (c.distance_km !== null) {
    const max = prefs.max_distance_km || 25;
    if (c.distance_km <= max) {
      score += w.distance * (1 - c.distance_km / max);
      if (c.distance_km <= Math.min(5, max)) reasons.push({ kind: 'nearby', km: Math.round(c.distance_km * 10) / 10 });
    } else {
      score -= w.distance * Math.min(2, c.distance_km / max - 1);
    }
  }

  const starts = new Date(c.starts_at);
  const dr = dateRelevance(starts, now);
  score += w.date * dr;
  if (dr >= 0.9) reasons.push({ kind: 'soon' });
  if (prefs.preferred_days.includes(starts.getDay())) score += w.weekday;

  if (s.followed.has(c.business_id)) {
    score += w.followed;
    reasons.push({ kind: 'followed' });
  }

  const saved = s.savedCategories.get(c.category_id) ?? 0;
  const attended = s.attendedCategories.get(c.category_id) ?? 0;
  if (saved) score += w.saved_affinity * Math.min(1, saved / 3);
  if (attended) score += w.attended_affinity * Math.min(1, attended / 3);
  if ((saved || attended) && !catHit) reasons.push({ kind: 'similar' });

  const gf = groupFit(c, prefs.group_size);
  score += w.group * gf;
  if (gf >= 1) reasons.push({ kind: 'group' });

  if (prefs.setting !== 'any') score += w.setting * ((prefs.setting === 'outdoor') === c.is_outdoor ? 1 : -0.5);
  if (prefs.venue_size !== 'any') score += w.venue_size * (c.venue_size === prefs.venue_size ? 1 : c.venue_size === 'medium' ? 0.3 : -0.3);

  if (prefs.price_max !== null && !c.is_free && c.price_min !== null && c.price_min > prefs.price_max) {
    score -= w.price_penalty * Math.min(1, (c.price_min - prefs.price_max) / Math.max(prefs.price_max, 10));
  }

  const fb = s.feedback.get(c.id);
  if (fb === 'interested') score += w.interested;
  const fewer = s.fewerCategories.get(c.category_id) ?? 0;
  if (fewer) score -= w.fewer_penalty * Math.min(3, fewer);

  return { score: Math.round(score * 1000) / 1000, reasons, matched: genreHits.length > 0 || catHit || s.followed.has(c.business_id) };
}

/** Small deterministic PRNG so the exploration mix is stable within a day. */
export function seededRandom(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * Ranks candidates. Events with `not_interested` / `fewer_like_this` feedback
 * are dropped. About `explore_ratio` of slots go to events outside the user's
 * stated tastes to avoid filter bubbles.
 */
export function rankFeed<T extends Candidate>(cands: T[], prefs: Prefs, s: Signals, w: Weights, now: Date, seed: string): Scored<T>[] {
  const scored = cands
    .filter((c) => {
      const fb = s.feedback.get(c.id);
      return fb !== 'not_interested' && fb !== 'fewer_like_this';
    })
    .map((c) => ({ c, ...scoreEvent(c, prefs, s, w, now) }));

  const main = scored.filter((x) => x.matched).sort((a, b) => b.score - a.score);
  const pool = scored.filter((x) => !x.matched && x.score > -w.fewer_penalty);
  const rand = seededRandom(seed);
  // shuffle exploration pool deterministically, prefer sooner events
  pool.sort((a, b) => b.score + rand() * 2 - (a.score + rand() * 2));

  const out: Scored<T>[] = [];
  const every = w.explore_ratio > 0 ? Math.max(2, Math.round(1 / w.explore_ratio)) : Infinity;
  let mi = 0;
  let pi = 0;
  while (mi < main.length || pi < pool.length) {
    const position = out.length + 1;
    const wantExplore = position % every === 0 || mi >= main.length;
    if (wantExplore && pi < pool.length) {
      const x = pool[pi++];
      out.push({ item: x.c, score: x.score, reasons: [{ kind: 'explore' }], explore: true });
    } else if (mi < main.length) {
      const x = main[mi++];
      out.push({ item: x.c, score: x.score, reasons: x.reasons.slice(0, 3) });
    } else break;
  }
  return out;
}

export function weightsFromRows(rows: { key: string; value: number }[]): Weights {
  const w = { ...DEFAULT_WEIGHTS };
  for (const r of rows) if (r.key in w) (w as any)[r.key] = Number(r.value);
  return w;
}
