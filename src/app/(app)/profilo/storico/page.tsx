'use client';
import { Lock } from 'lucide-react';
import { useApi } from '@/lib/api';
import { stateOf } from '@/lib/calendar';
import { t } from '@/i18n';
import { EventRow } from '@/components/events';
import { Badge, EmptyState, PageLoader, TopBar } from '@/components/ui';

export default function History() {
  const { data } = useApi<{ items: any[] }>('/calendar');
  if (!data) return <PageLoader />;
  const past = data.items.filter((e) => new Date(e.ends_at) < new Date() && e.my_attendance === 'going').sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at));
  const byYear = new Map<number, any[]>();
  for (const e of past) {
    const y = new Date(e.starts_at).getFullYear();
    byYear.set(y, [...(byYear.get(y) ?? []), e]);
  }
  return (
    <div className="pb-8">
      <TopBar back title={t.history.title} />
      <p className="mx-4 flex items-center gap-1.5 text-sm text-muted"><Lock className="h-4 w-4" /> {t.history.subtitle}</p>
      {!past.length && <EmptyState icon="📸" title={t.history.title}>{t.history.empty}</EmptyState>}
      {[...byYear.entries()].map(([y, items]) => (
        <section key={y} className="mt-4 px-4">
          <h2 className="mb-2 text-lg font-bold">{y}</h2>
          <div className="space-y-2">
            {items.map((e) => {
              const st = stateOf(e);
              return (
                <div key={e.id} className="rounded-2xl bg-surface shadow-[0_1px_0_var(--line)]">
                  <EventRow e={e} right={<Badge tone={st === 'attended' ? 'green' : st === 'to_confirm' ? 'amber' : 'default'}>{t.calendar.status[st]}</Badge>} />
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
