export type CalSection = 'saved' | 'upcoming' | 'past' | 'cancelled';

export interface CalItem {
  id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  is_saved: boolean;
  my_attendance: 'going' | 'cancelled' | null;
  my_confirmation: 'attended' | 'not_attended' | 'skipped' | null;
  my_visibility: 'public' | 'private' | null;
}

/** Single source of truth for which calendar section an item belongs to. */
export function sectionOf(e: CalItem, now = Date.now()): CalSection {
  const ended = new Date(e.ends_at).getTime() < now;
  if (e.status === 'cancelled') return 'cancelled';
  if (ended) return 'past';
  if (e.my_attendance === 'going') return 'upcoming';
  if (e.is_saved) return 'saved';
  return 'cancelled'; // attendance cancelled and not saved
}

/** User-facing state label key (see it.calendar.status). */
export function stateOf(e: CalItem, now = Date.now()) {
  const s = sectionOf(e, now);
  if (s === 'cancelled') return e.status === 'cancelled' ? 'event_cancelled' : 'cancelled';
  if (s === 'past') {
    if (e.my_attendance !== 'going') return 'saved';
    if (e.my_confirmation === 'attended') return 'attended';
    if (e.my_confirmation === 'not_attended') return 'not_attended';
    return 'to_confirm';
  }
  return s === 'upcoming' ? 'going' : 'saved';
}
