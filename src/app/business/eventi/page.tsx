'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useApi } from '@/lib/api';
import { formatDay, formatTime } from '@/lib/format';
import { t } from '@/i18n';
import { PageHead, useBiz } from '@/components/business-shell';
import { Badge, Button, Card, Chip, EmptyState, PageLoader } from '@/components/ui';

const TONE: Record<string, any> = { draft: 'amber', published: 'green', cancelled: 'red', completed: 'default' };

export default function Events() {
  const biz = useBiz();
  const { data } = useApi<any[]>(`/biz/${biz.id}/events`);
  const [filter, setFilter] = useState<string>('all');
  if (!data) return <PageLoader />;
  const rows = data.filter((e) => filter === 'all' || e.status === filter);
  return (
    <>
      <PageHead title={t.business.events} action={<Link href="/business/eventi/nuovo"><Button icon={<Plus className="h-4 w-4" />}>{t.business.newEvent}</Button></Link>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {['all', 'published', 'draft', 'completed', 'cancelled'].map((s) => (
          <Chip key={s} active={filter === s} onClick={() => setFilter(s)}>{s === 'all' ? t.business.allEvents : t.business.status[s]} · {s === 'all' ? data.length : data.filter((e) => e.status === s).length}</Chip>
        ))}
      </div>
      {!rows.length ? <EmptyState icon="🗓️" title={t.business.events} /> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase text-muted">
              <tr>{['Evento', 'Stato', t.business.metrics.views, t.business.metrics.saves, t.business.metrics.going, t.business.metrics.attended, t.business.guestLists, t.business.tables].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.event_id} className="border-t border-line hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/business/eventi/${e.event_id}`} className="flex items-center gap-3">
                      <img src={e.cover_url} alt="" className="h-10 w-10 rounded-xl object-cover" />
                      <span><span className="block font-semibold">{e.title}</span><span className="text-xs capitalize text-muted">{formatDay(e.starts_at)} · {formatTime(e.starts_at)}</span></span>
                    </Link>
                  </td>
                  <td className="px-4 py-3"><Badge tone={TONE[e.status]}>{t.business.status[e.status]}</Badge></td>
                  <td className="px-4 py-3">{e.views}</td>
                  <td className="px-4 py-3">{e.saves}</td>
                  <td className="px-4 py-3">{e.going}</td>
                  <td className="px-4 py-3">{e.declared_attended}</td>
                  <td className="px-4 py-3">{e.gl_requests}{e.gl_pending ? <span className="text-xs text-[#9a6200]"> ({e.gl_pending})</span> : null}</td>
                  <td className="px-4 py-3">{e.tables_requests}{e.tables_pending ? <span className="text-xs text-[#9a6200]"> ({e.tables_pending})</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <p className="mt-3 text-xs text-muted">{t.business.declaredNote}</p>
    </>
  );
}
