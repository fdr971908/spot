'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { Copy, ExternalLink, Send, Trash2, Undo2, XCircle } from 'lucide-react';
import { api, invalidate, useApi } from '@/lib/api';
import { formatDay } from '@/lib/format';
import { errorMessage, t } from '@/i18n';
import { useToast } from '@/components/providers';
import { Kpi, PageHead, useBiz } from '@/components/business-shell';
import { EventForm } from '@/components/event-form';
import { Badge, Button, Card, Field, Input, PageLoader, Sheet, Toggle } from '@/components/ui';

export default function EditEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const biz = useBiz();
  const router = useRouter();
  const toast = useToast();
  const { data, reload } = useApi<any>(`/biz/${biz.id}/events/${id}`);
  const [dup, setDup] = useState(false);
  const [dupF, setDupF] = useState({ every_days: 7, count: 3, publish: false });
  if (!data) return <PageLoader />;
  const e = data.event;
  const s = data.stats ?? {};
  const act = async (path: string, body: any = {}, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    try {
      const r = await api.post(`/biz/${biz.id}/events/${id}/${path}`, body);
      invalidate(`/biz/${biz.id}`);
      if (path === 'duplicate') { toast(`${r.ids.length} date create`); setDup(false); }
      reload();
    } catch (err: any) {
      toast(errorMessage(err.code), 'error');
    }
  };
  const editable = e.status === 'draft' || e.status === 'published';
  return (
    <>
      <PageHead
        title={<span className="flex flex-wrap items-center gap-2">{e.title} <Badge tone={e.status === 'published' ? 'green' : e.status === 'draft' ? 'amber' : 'red'}>{t.business.status[e.status]}</Badge></span>}
        action={
          <div className="flex flex-wrap gap-2">
            {e.status !== 'draft' && <Link href={`/eventi/${id}`} target="_blank"><Button variant="ghost" size="sm" icon={<ExternalLink className="h-4 w-4" />}>{t.business.actions.view}</Button></Link>}
            {e.status === 'draft' && <Button size="sm" icon={<Send className="h-4 w-4" />} onClick={() => act('publish')}>{t.business.actions.publish}</Button>}
            {e.status === 'published' && <Button size="sm" variant="secondary" icon={<Undo2 className="h-4 w-4" />} onClick={() => act('unpublish')}>{t.business.actions.unpublish}</Button>}
            <Button size="sm" variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => setDup(true)}>{t.business.actions.duplicate}</Button>
            {e.status === 'published' && <Button size="sm" variant="danger" icon={<XCircle className="h-4 w-4" />} onClick={() => act('cancel', {}, t.business.cancelConfirm)}>{t.business.actions.cancel}</Button>}
            {e.status === 'draft' && <Button size="sm" variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={async () => { await api.del(`/biz/${biz.id}/events/${id}`); router.replace('/business/eventi'); }}>{t.business.actions.delete}</Button>}
          </div>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Kpi label={t.business.metrics.impressions} value={s.impressions ?? 0} />
        <Kpi label={t.business.metrics.views} value={s.views ?? 0} />
        <Kpi label={t.business.metrics.saves} value={s.saves ?? 0} />
        <Kpi label={t.business.metrics.going} value={s.going ?? 0} />
        <Kpi label={t.business.metrics.attended} value={s.declared_attended ?? 0} />
        <Kpi label={t.business.metrics.clicks} value={s.ticket_clicks ?? 0} />
      </div>
      {data.series.length > 1 && (
        <Card className="mb-4">
          <p className="mb-2 text-sm font-bold">Serie ricorrente</p>
          <div className="flex flex-wrap gap-2">{data.series.map((x: any) => <Link key={x.id} href={`/business/eventi/${x.id}`} className={`rounded-full px-3 py-1 text-sm capitalize ${x.id === id ? 'bg-purple text-white' : 'bg-surface-2'}`}>{formatDay(x.starts_at)} · {t.business.status[x.status]}</Link>)}</div>
        </Card>
      )}
      {editable ? <EventForm key={e.updated_at} initial={e} /> : <Card><p className="text-sm text-muted">{t.errors.event_locked}</p></Card>}
      <Sheet open={dup} onClose={() => setDup(false)} title={t.business.duplicateTitle} footer={<Button block onClick={() => act('duplicate', dupF)}>{t.business.actions.duplicate}</Button>}>
        <p className="mb-4 text-sm text-muted">{t.business.duplicateDesc}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.business.everyDays}><Input type="number" min={1} max={60} value={dupF.every_days} onChange={(ev) => setDupF({ ...dupF, every_days: Number(ev.target.value) })} /></Field>
          <Field label={t.business.count}><Input type="number" min={1} max={12} value={dupF.count} onChange={(ev) => setDupF({ ...dupF, count: Number(ev.target.value) })} /></Field>
        </div>
        <Toggle label={t.business.actions.publish} checked={dupF.publish} onChange={(v) => setDupF({ ...dupF, publish: v })} />
      </Sheet>
    </>
  );
}
