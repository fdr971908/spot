'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { api, useApi } from '@/lib/api';
import { romeDayKey } from '@/lib/format';
import { sectionOf, stateOf, type CalSection } from '@/lib/calendar';
import { errorMessage, fmt, t } from '@/i18n';
import { useToast } from '@/components/providers';
import { EventRow } from '@/components/events';
import { Badge, Button, Chip, cx, EmptyState, ErrorState, IconButton, Segmented, Skeleton } from '@/components/ui';

const TONE: Record<string, any> = { going: 'purple', saved: 'default', attended: 'green', not_attended: 'default', to_confirm: 'amber', cancelled: 'red', event_cancelled: 'red' };

function CalendarInner() {
  const params = useSearchParams();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ items: any[] }>('/calendar');
  const [view, setView] = useState<'calendar' | 'list'>(params.get('view') ? 'list' : 'calendar');
  const [section, setSection] = useState<CalSection>((params.get('view') as CalSection) || 'upcoming');
  const today = new Date();
  const [month, setMonth] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [day, setDay] = useState<string | null>(null);

  const items = data?.items ?? [];
  const byDay = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const e of items) {
      if (sectionOf(e) === 'cancelled') continue;
      const k = romeDayKey(e.starts_at);
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return m;
  }, [items]);

  const confirm = async (id: string, response: string) => {
    try {
      await api.post(`/events/${id}/confirm`, { response });
      reload();
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
    }
  };

  const first = new Date(month.y, month.m, 1);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const daysIn = new Date(month.y, month.m + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + daysIn) / 7) * 7 }, (_, i) => {
    const d = i - offset + 1;
    return d >= 1 && d <= daysIn ? `${month.y}-${String(month.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
  });
  const shift = (n: number) => setMonth(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));
  const todayKey = romeDayKey(today);

  const Row = ({ e }: { e: any }) => {
    const st = stateOf(e);
    return (
      <div className="rounded-2xl bg-surface shadow-[0_1px_0_var(--line)]">
        <EventRow e={e} right={<Badge tone={TONE[st]}>{t.calendar.status[st]}</Badge>} sub={e.group_shares > 0 ? ` · ${fmt(t.calendar.sharedInGroups, { n: e.group_shares })}` : null} />
        {st === 'to_confirm' && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2.5">
            <span className="flex-1 text-sm font-semibold">{t.event.confirmTitle}</span>
            <Button size="sm" onClick={() => confirm(e.id, 'attended')}>{t.event.confirmYes}</Button>
            <Button size="sm" variant="ghost" onClick={() => confirm(e.id, 'not_attended')}>{t.common.no}</Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <header className="sticky top-0 z-30 flex items-center justify-between bg-bg/85 px-4 pb-2 pt-3 backdrop-blur-xl">
        <h1 className="text-2xl font-extrabold">{t.calendar.title}</h1>
        <Link href="/esplora" aria-label={t.nav.explore} className="bg-brand flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-[var(--shadow-pop)]">
          <Plus className="h-5 w-5" />
        </Link>
      </header>
      <div className="px-4">
        <Segmented value={view} onChange={setView} options={[{ value: 'calendar', label: t.calendar.calendarView }, { value: 'list', label: t.calendar.listView }]} />

        {loading && !data ? (
          <Skeleton className="mt-4 h-80 w-full" />
        ) : error ? (
          <ErrorState onRetry={reload} message={errorMessage(error.code)} />
        ) : view === 'calendar' ? (
          <>
            <div className="mt-4 rounded-3xl bg-surface p-4 shadow-[0_1px_0_var(--line)]">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-lg font-bold">
                  {t.months[month.m]} {month.y}
                </p>
                <div className="flex">
                  <IconButton label="Mese precedente" onClick={() => shift(-1)}><ChevronLeft className="h-5 w-5" /></IconButton>
                  <IconButton label="Mese successivo" onClick={() => shift(1)}><ChevronRight className="h-5 w-5" /></IconButton>
                </div>
              </div>
              <div className="grid grid-cols-7 text-center text-xs font-semibold text-muted">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <span key={d} className="py-1">{t.days[d][0]}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-1">
                {cells.map((k, i) => {
                  if (!k) return <span key={i} />;
                  const evs = byDay.get(k) ?? [];
                  const has = evs.length > 0;
                  const going = evs.some((e) => stateOf(e) === 'going' || stateOf(e) === 'attended');
                  return (
                    <button
                      key={k}
                      onClick={() => setDay(day === k ? null : k)}
                      className={cx(
                        'relative mx-auto flex h-10 w-10 flex-col items-center justify-center rounded-full text-sm font-semibold transition',
                        day === k ? 'bg-purple text-white' : has ? (going ? 'bg-pink/60 text-navy' : 'bg-primary-soft text-primary-ink') : 'hover:bg-surface-2',
                        k === todayKey && day !== k && 'ring-2 ring-purple',
                      )}
                      aria-label={`${k}${has ? ` · ${evs.length}` : ''}`}
                    >
                      {Number(k.slice(8))}
                      {has && <span className={cx('absolute bottom-1 h-1 w-1 rounded-full', day === k ? 'bg-white' : 'bg-purple')} />}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 space-y-2.5 pb-6">
              {day && (byDay.get(day) ?? []).length === 0 && <p className="py-6 text-center text-sm text-muted">{t.calendar.noEventsDay}</p>}
              {day && (byDay.get(day) ?? []).map((e) => <Row key={e.id} e={e} />)}
              {!day && (
                <>
                  <p className="text-sm font-bold">{t.calendar.sections.upcoming}</p>
                  {items
                    .filter((e) => ['upcoming', 'saved'].includes(sectionOf(e)))
                    .slice(0, 8)
                    .map((e) => <Row key={e.id} e={e} />)}
                </>
              )}
              {!items.length && <EmptyState icon="🗓️" title={t.calendar.title}>{t.calendar.empty}</EmptyState>}
            </div>
          </>
        ) : (
          <>
            <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
              {(['upcoming', 'saved', 'past', 'cancelled'] as const).map((s) => (
                <Chip key={s} active={section === s} onClick={() => setSection(s)}>
                  {t.calendar.sections[s]} · {items.filter((e) => sectionOf(e) === s).length}
                </Chip>
              ))}
            </div>
            <div className="mt-4 space-y-2.5 pb-6">
              {items
                .filter((e) => sectionOf(e) === section)
                .sort((a, b) => (section === 'past' ? -1 : 1) * (new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()))
                .map((e) => <Row key={e.id} e={e} />)}
              {!items.some((e) => sectionOf(e) === section) && <EmptyState icon="🗓️" title={t.calendar.sections[section]}>{t.calendar.emptySection}</EmptyState>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function CalendarPage() {
  return (
    <Suspense>
      <CalendarInner />
    </Suspense>
  );
}
