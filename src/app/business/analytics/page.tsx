'use client';
import { useState } from 'react';
import { useApi } from '@/lib/api';
import { t } from '@/i18n';
import { Kpi, PageHead, SparkArea, useBiz } from '@/components/business-shell';
import { Card, Chip, PageLoader } from '@/components/ui';

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–');

export default function Analytics() {
  const biz = useBiz();
  const [days, setDays] = useState(30);
  const { data } = useApi<any>(`/biz/${biz.id}/analytics?days=${days}`);
  if (!data) return <PageLoader />;
  const sum = (k: string) => data.events.reduce((a: number, e: any) => a + e[k], 0);
  const funnel = [
    [t.business.metrics.impressions, sum('impressions')],
    [t.business.metrics.views, sum('views')],
    [t.business.metrics.saves, sum('saves')],
    [t.business.metrics.going, sum('going')],
    [t.business.metrics.attended, sum('declared_attended')],
  ] as [string, number][];
  const max = Math.max(1, ...funnel.map((f) => f[1]));
  return (
    <>
      <PageHead title={t.business.analytics} action={<div className="flex gap-2">{[7, 30, 90].map((d) => <Chip key={d} active={days === d} onClick={() => setDays(d)}>{d} gg</Chip>)}</div>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="mb-3 font-bold">{t.business.funnel}</p>
          <div className="space-y-2.5">
            {funnel.map(([l, v], i) => (
              <div key={l}>
                <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{l}</span><span className="font-bold">{v.toLocaleString('it-IT')} {i > 0 && <span className="text-xs font-normal text-muted">({pct(v, funnel[i - 1][1])})</span>}</span></div>
                <div className="h-3 overflow-hidden rounded-full bg-surface-2"><div className="bg-brand h-full rounded-full" style={{ width: `${(v / max) * 100}%` }} /></div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">{t.business.declaredNote}</p>
        </Card>
        <Card>
          <p className="font-bold">{t.business.growth}</p>
          <SparkArea values={data.series.map((s: any) => s.followers_total)} labels={data.series.map((s: any) => s.day.slice(5))} color="#FF6FB1" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Kpi label={t.business.glConversion} value={pct(sum('gl_confirmed'), sum('gl_requests'))} sub={`${sum('gl_confirmed')}/${sum('gl_requests')}`} />
            <Kpi label={t.business.tableConversion} value={pct(sum('tables_confirmed'), sum('tables_requests'))} sub={`${sum('tables_confirmed')}/${sum('tables_requests')}`} />
          </div>
        </Card>
        <Card>
          <p className="font-bold">{t.business.metrics.views} / {t.business.metrics.saves}</p>
          <SparkArea values={data.series.map((s: any) => s.views)} labels={data.series.map((s: any) => s.day.slice(5))} />
          <SparkArea values={data.series.map((s: any) => s.saves)} color="#FF9B87" height={80} />
        </Card>
        <Card>
          <p className="font-bold">{t.business.followersByCity}</p>
          <div className="mt-3 space-y-2">
            {data.followers_by_city.map((c: any) => (
              <div key={c.city} className="flex items-center gap-3 text-sm"><span className="w-20">{c.city}</span><div className="h-2.5 flex-1 rounded-full bg-surface-2"><div className="bg-brand h-full rounded-full" style={{ width: `${(c.n / Math.max(...data.followers_by_city.map((x: any) => x.n))) * 100}%` }} /></div><span className="w-8 text-right font-semibold">{c.n}</span></div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">{t.business.citiesNote}</p>
        </Card>
      </div>
      <Card className="mt-4 overflow-x-auto">
        <p className="mb-3 font-bold">{t.business.perEvent}</p>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs uppercase text-muted"><tr>{['Evento', t.business.metrics.impressions, t.business.metrics.views, t.business.metrics.saves, t.business.metrics.going, t.business.metrics.attended, 'View→Partecipa'].map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}</tr></thead>
          <tbody>{data.events.filter((e: any) => e.status !== 'draft').map((e: any) => (
            <tr key={e.event_id} className="border-t border-line"><td className="py-2 pr-3 font-medium">{e.title}</td><td>{e.impressions}</td><td>{e.views}</td><td>{e.saves}</td><td>{e.going}</td><td>{e.declared_attended}</td><td>{pct(e.going, e.views)}</td></tr>
          ))}</tbody>
        </table>
      </Card>
      <Card className="mt-4">
        <p className="mb-3 font-bold">{t.business.campaignPerf}</p>
        {!data.campaigns.length && <p className="text-sm text-muted">—</p>}
        {data.campaigns.map((c: any) => (
          <div key={c.id} className="flex items-center justify-between border-t border-line py-2 text-sm first:border-0"><span className="font-medium">{c.title}</span><span className="text-muted">{c.recipients_count} inviati · {c.opened} aperture ({pct(c.opened, c.recipients_count)})</span></div>
        ))}
      </Card>
    </>
  );
}
