import { t, fmt } from '@/i18n';

const TZ = 'Europe/Rome';
const LOCALE = 'it-IT';

const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });

export function formatTime(d: string | Date) {
  return new Date(d).toLocaleTimeString(LOCALE, { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

export function formatDay(d: string | Date) {
  const date = new Date(d);
  const today = dayKey(new Date());
  const tomorrow = dayKey(new Date(Date.now() + 86400_000));
  const k = dayKey(date);
  if (k === today) return t.common.today;
  if (k === tomorrow) return t.common.tomorrow;
  return date.toLocaleDateString(LOCALE, { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatDateLong(d: string | Date) {
  return new Date(d).toLocaleDateString(LOCALE, { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function dateBadge(d: string | Date) {
  const date = new Date(d);
  return {
    dow: date.toLocaleDateString(LOCALE, { timeZone: TZ, weekday: 'short' }).replace('.', '').toUpperCase(),
    day: date.toLocaleDateString(LOCALE, { timeZone: TZ, day: 'numeric' }),
    month: date.toLocaleDateString(LOCALE, { timeZone: TZ, month: 'short' }).replace('.', '').toUpperCase(),
  };
}

export function formatPrice(e: { is_free: boolean; price_min: number | null; price_max: number | null }) {
  if (e.is_free) return t.common.free;
  if (e.price_min == null) return '';
  const min = `€${Number(e.price_min).toLocaleString(LOCALE, { maximumFractionDigits: 2 })}`;
  if (e.price_max && e.price_max > e.price_min) return `${min}–${Number(e.price_max).toLocaleString(LOCALE)}`;
  return min;
}

export function timeAgo(d: string | Date) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'ora';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (dayKey(new Date(d)) === dayKey(new Date())) return formatTime(d);
  if (s < 86400 * 2) return 'Ieri';
  if (s < 86400 * 7) return new Date(d).toLocaleDateString(LOCALE, { timeZone: TZ, weekday: 'short' });
  return new Date(d).toLocaleDateString(LOCALE, { timeZone: TZ, day: 'numeric', month: 'short' });
}

export function compact(n: number) {
  return n >= 1000 ? `${(n / 1000).toLocaleString(LOCALE, { maximumFractionDigits: 1 })}K` : String(n);
}

export function romeDayKey(d: string | Date) {
  return dayKey(new Date(d));
}

/** ISO range helpers for Explore "Quando" chips (Europe/Rome days). */
export function rangeFor(kind: string): { from?: string; to?: string } {
  const now = new Date();
  const startOfDay = (offset: number) => {
    const k = dayKey(new Date(now.getTime() + offset * 86400_000));
    // midnight in Rome, expressed via an ISO string with offset computed by Intl
    const probe = new Date(`${k}T12:00:00Z`);
    const offsetMin = -Number(probe.toLocaleString('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' }).match(/GMT([+-]\d+)/)?.[1] ?? 1) * 60;
    return new Date(new Date(`${k}T00:00:00Z`).getTime() + offsetMin * 60_000);
  };
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(now.toLocaleString('en-US', { timeZone: TZ, weekday: 'short' }));
  switch (kind) {
    case 'today':
      return { from: now.toISOString(), to: startOfDay(1).toISOString() };
    case 'tomorrow':
      return { from: startOfDay(1).toISOString(), to: startOfDay(2).toISOString() };
    case 'weekend': {
      const toFri = (5 - dow + 7) % 7;
      const start = dow === 6 || dow === 0 ? now : startOfDay(toFri);
      const toMon = ((1 - dow + 7) % 7) || 7;
      return { from: start.toISOString(), to: startOfDay(toMon).toISOString() };
    }
    case 'week':
      return { from: now.toISOString(), to: startOfDay(8).toISOString() };
    default:
      return {};
  }
}

export function reasonLabel(r: { kind: string; id?: string; km?: number }) {
  const tpl = t.home.reasons[r.kind] ?? '';
  const x = r.kind === 'genre' ? t.genres[r.id!] : r.kind === 'category' ? t.categories[r.id!] : r.kind === 'nearby' ? String(r.km) : '';
  return fmt(tpl, { x });
}
