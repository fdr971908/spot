import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHTS, dateRelevance, rankFeed, scoreEvent, type Candidate, type Prefs, type Signals } from '@/server/recommend';
import { publicAttendeeCount } from '@/server/modules/shared';
import { sectionOf, stateOf } from '@/lib/calendar';

const now = new Date('2026-10-23T12:00:00Z');
const prefs: Prefs = { genres: ['techno'], categories: ['nightclub'], group_size: '3-5', venue_size: 'any', setting: 'any', price_max: 30, max_distance_km: 25, preferred_days: [6] };
const signals = (): Signals => ({ followed: new Set(), savedCategories: new Map(), attendedCategories: new Map(), feedback: new Map(), fewerCategories: new Map() });
const ev = (o: Partial<Candidate>): Candidate => ({
  id: Math.random().toString(36), business_id: 'b1', category_id: 'brunch', genres: [], starts_at: '2026-10-25T10:00:00Z', is_outdoor: false,
  venue_size: 'medium', group_friendly: true, table_requests_enabled: false, is_free: false, price_min: 20, distance_km: 3, ...o,
});

describe('recommendation engine', () => {
  it('ranks matching genre + category above unrelated events', () => {
    const match = scoreEvent(ev({ genres: ['techno'], category_id: 'nightclub' }), prefs, signals(), DEFAULT_WEIGHTS, now);
    const other = scoreEvent(ev({ genres: ['pop'] }), prefs, signals(), DEFAULT_WEIGHTS, now);
    expect(match.score).toBeGreaterThan(other.score);
    expect(match.reasons.map((r) => r.kind)).toEqual(expect.arrayContaining(['genre', 'category']));
  });

  it('boosts followed businesses and penalises over-budget events', () => {
    const s = signals();
    s.followed.add('b2');
    const base = scoreEvent(ev({ business_id: 'b1' }), prefs, s, DEFAULT_WEIGHTS, now).score;
    expect(scoreEvent(ev({ business_id: 'b2' }), prefs, s, DEFAULT_WEIGHTS, now).score).toBeCloseTo(base + DEFAULT_WEIGHTS.followed, 3);
    expect(scoreEvent(ev({ price_min: 80 }), prefs, s, DEFAULT_WEIGHTS, now).score).toBeLessThan(base);
  });

  it('decays date relevance and ignores past events', () => {
    expect(dateRelevance(new Date('2026-10-23T18:00:00Z'), now)).toBe(1);
    expect(dateRelevance(new Date('2026-11-10T18:00:00Z'), now)).toBeLessThan(0.6);
    expect(dateRelevance(new Date('2026-10-20T18:00:00Z'), now)).toBe(0);
  });

  it('drops not_interested / fewer_like_this events and penalises that category', () => {
    const s = signals();
    const a = ev({ id: 'a', category_id: 'nightclub', genres: ['techno'] });
    const b = ev({ id: 'b', category_id: 'nightclub', genres: ['techno'] });
    s.feedback.set('a', 'not_interested');
    s.feedback.set('b', 'fewer_like_this');
    s.fewerCategories.set('nightclub', 1);
    const c = ev({ id: 'c', category_id: 'nightclub', genres: ['techno'] });
    const ranked = rankFeed([a, b, c], prefs, s, DEFAULT_WEIGHTS, now, 'seed');
    expect(ranked.map((r) => r.item.id)).toEqual(['c']);
    expect(ranked[0].score).toBeLessThan(scoreEvent(c, prefs, signals(), DEFAULT_WEIGHTS, now).score);
  });

  it('mixes in exploratory events (~1 in 7) deterministically', () => {
    const matched = Array.from({ length: 12 }, (_, i) => ev({ id: `m${i}`, genres: ['techno'], category_id: 'nightclub' }));
    const explore = Array.from({ length: 4 }, (_, i) => ev({ id: `x${i}`, genres: ['pop'], category_id: 'concert' }));
    const r1 = rankFeed([...matched, ...explore], prefs, signals(), DEFAULT_WEIGHTS, now, 'u:day');
    const r2 = rankFeed([...matched, ...explore], prefs, signals(), DEFAULT_WEIGHTS, now, 'u:day');
    expect(r1.map((r) => r.item.id)).toEqual(r2.map((r) => r.item.id));
    expect(r1[6].explore).toBe(true);
    expect(r1.slice(0, 6).every((r) => !r.explore)).toBe(true);
  });
});

describe('privacy-safe attendee count', () => {
  it('only reveals the total once it cannot single anyone out', () => {
    expect(publicAttendeeCount(3, 1)).toBe(1);
    expect(publicAttendeeCount(5, 1)).toBe(5);
  });
});

describe('calendar sections', () => {
  const base = { id: '1', status: 'published', is_saved: false, my_attendance: null, my_confirmation: null, my_visibility: null } as any;
  const future = { starts_at: '2099-01-01T20:00:00Z', ends_at: '2099-01-02T02:00:00Z' };
  const past = { starts_at: '2000-01-01T20:00:00Z', ends_at: '2000-01-02T02:00:00Z' };
  it('separates saved, planned, past, cancelled', () => {
    expect(sectionOf({ ...base, ...future, is_saved: true })).toBe('saved');
    expect(sectionOf({ ...base, ...future, is_saved: true, my_attendance: 'going' })).toBe('upcoming');
    expect(sectionOf({ ...base, ...future, my_attendance: 'cancelled' })).toBe('cancelled');
    expect(sectionOf({ ...base, ...future, status: 'cancelled', my_attendance: 'going' })).toBe('cancelled');
    expect(stateOf({ ...base, ...past, my_attendance: 'going' })).toBe('to_confirm');
    expect(stateOf({ ...base, ...past, my_attendance: 'going', my_confirmation: 'attended' })).toBe('attended');
  });
});
