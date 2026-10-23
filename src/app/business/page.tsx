'use client';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useApi } from '@/lib/api';
import { formatDay, formatTime } from '@/lib/format';
import { t } from '@/i18n';
import { Kpi, PageHead, SparkArea, useBiz } from '@/components/business-shell';
import { Badge, Button, Card, PageLoader } from '@/components/ui';

export default function Overview() {
  const biz = useBiz();
  const { data } = useApi<any>(`/biz/${biz.id}/overview`);
  if (!data) return <PageLoader />;
  const k = data.totals;
  return (
    <>
      <PageHead title={`${t.business.nav.overview} · ${biz.name}`} action={<Link href="/business/eventi/nuovo"><Button icon={<Plus className="h-4 w-4" />}>{t.business.newEvent}</Button></Link>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi tone="brand" label={t.business.kpi.followers} value={k.followers} sub={`+${k.new_followers_30d} ${t.business.kpi.newFollowers}`} />
        <Kpi label={t.business.kpi.upcoming} value={k.published_upcoming} sub={`${k.drafts} ${t.business.status.draft.toLowerCase()}`} />
        <Kpi label={t.business.kpi.views} value={k.views_30d} sub={`${k.impressions_30d} impression`} />
        <Kpi label={t.business.kpi.saves} value={k.saves} />
        <Kpi label={t.business.kpi.going} value={k.going} sub={t.business.declaredNote} />
        <Kpi label={t.business.kpi.guestLists} value={k.gl_requests} sub={`${k.gl_pending} ${t.business.kpi.pending}`} />
        <Kpi label={t.business.kpi.tables} value={k.tables_requests} sub={`${k.tables_pending} ${t.business.kpi.pending}`} />
        <Kpi label={t.business.kpi.messages} value={data.messages.inbound + data.messages.outbound} sub={`${data.messages.unread} ${t.business.kpi.unread}`} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <p className="font-bold">{t.business.metrics.views} · 30 gg</p>
          <SparkArea values={data.series.map((s: any) => s.views)} labels={data.series.map((s: any) => s.day.slice(5))} />
        </Card>
        <Card className="lg:col-span-2">
          <p className="mb-2 font-bold">{t.business.upcoming}</p>
          {data.upcoming.map((e: any) => (
            <Link key={e.event_id} href={`/business/eventi/${e.event_id}`} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-surface-2">
              <img src={e.cover_url} alt="" className="h-12 w-12 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{e.title}</p>
                <p className="text-xs capitalize text-muted">{formatDay(e.starts_at)} · {formatTime(e.starts_at)} · {e.saves} {t.business.metrics.saves.toLowerCase()} · {e.going} {t.business.metrics.going.toLowerCase()}</p>
              </div>
              <Badge tone={e.status === 'published' ? 'green' : 'amber'}>{t.business.status[e.status]}</Badge>
            </Link>
          ))}
        </Card>
      </div>
    </>
  );
}
