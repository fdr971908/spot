'use client';
import { useEffect, useState } from 'react';
import { Megaphone, Send } from 'lucide-react';
import { api, useApi } from '@/lib/api';
import { formatDay, formatTime } from '@/lib/format';
import { errorMessage, fmt, t } from '@/i18n';
import { useToast } from '@/components/providers';
import { PageHead, useBiz } from '@/components/business-shell';
import { Badge, Button, Card, Chip, EmptyState, Field, Input, PageLoader, Select, Textarea, Toggle } from '@/components/ui';

const TONE: Record<string, any> = { draft: 'default', scheduled: 'purple', sent: 'green', cancelled: 'red' };

export default function Campaigns() {
  const biz = useBiz();
  const toast = useToast();
  const { data, reload } = useApi<any>(`/biz/${biz.id}/campaigns`);
  const { data: events } = useApi<any[]>(`/biz/${biz.id}/events`);
  const [f, setF] = useState({ title: '', message: '', audience: 'followers', event_id: '', schedule: false, scheduled_at: '' });
  const [aud, setAud] = useState<{ eligible: number; followers: number } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams({ audience: f.audience, ...(f.event_id ? { event_id: f.event_id } : {}) });
    if (f.audience !== 'followers' && !f.event_id) return setAud(null);
    api.get(`/biz/${biz.id}/campaigns/audience?${q}`).then(setAud).catch(() => setAud(null));
  }, [f.audience, f.event_id, biz.id]);
  if (!data) return <PageLoader />;
  const upcoming = (events ?? []).filter((e) => e.status === 'published' && new Date(e.starts_at) > new Date());
  const create = async (sendNow: boolean) => {
    setBusy(true);
    try {
      const r = await api.post(`/biz/${biz.id}/campaigns`, {
        title: f.title, message: f.message, audience: f.audience, event_id: f.event_id || null,
        scheduled_at: f.schedule && f.scheduled_at ? new Date(f.scheduled_at).toISOString() : null, send_now: sendNow,
      });
      if (r.result) toast(`${fmt(t.business.recipients, { n: r.result.recipients })} · ${fmt(t.business.skipped, { n: r.result.skipped })}`);
      setF({ title: '', message: '', audience: 'followers', event_id: '', schedule: false, scheduled_at: '' });
      reload();
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
      reload();
    } finally {
      setBusy(false);
    }
  };
  const send = async (id: string) => {
    try {
      const r = await api.post(`/biz/${biz.id}/campaigns/${id}/send`);
      toast(fmt(t.business.recipients, { n: r.recipients }));
      reload();
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
    }
  };
  return (
    <>
      <PageHead title={t.business.campaigns} action={<Badge tone="purple">{fmt(t.business.weekly, { n: data.sent_this_week })}</Badge>} />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="space-y-4 lg:col-span-2">
          <p className="flex items-center gap-2 font-bold"><Megaphone className="h-5 w-5 text-purple" /> {t.business.newCampaign}</p>
          <Field label={t.business.campaignTitle} hint={`${f.title.length}/60`}><Input maxLength={60} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label={t.business.campaignMessage} hint={`${f.message.length}/240`}><Textarea maxLength={240} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
          <div>
            <p className="mb-2 text-sm font-semibold">{t.business.audience}</p>
            <div className="flex flex-wrap gap-2">{(['followers', 'event_savers', 'event_attendees'] as const).map((a) => <Chip key={a} active={f.audience === a} onClick={() => setF({ ...f, audience: a })}>{t.business.audiences[a]}</Chip>)}</div>
          </div>
          <Field label="Evento (facoltativo per i follower)">
            <Select value={f.event_id} onChange={(e) => setF({ ...f, event_id: e.target.value })}>
              <option value="">—</option>
              {upcoming.map((e) => <option key={e.event_id} value={e.event_id}>{e.title} · {formatDay(e.starts_at)}</option>)}
            </Select>
          </Field>
          {aud && <p className="rounded-2xl bg-primary-soft p-3 text-sm font-semibold text-primary-ink">{fmt(t.business.eligible, { n: aud.eligible, f: aud.followers })}</p>}
          <p className="text-xs text-muted">{t.business.eligibleNote}</p>
          <Toggle label={t.business.schedule} checked={f.schedule} onChange={(v) => setF({ ...f, schedule: v })} />
          {f.schedule && <Input type="datetime-local" value={f.scheduled_at} onChange={(e) => setF({ ...f, scheduled_at: e.target.value })} />}
          <div className="flex gap-2">
            {f.schedule ? (
              <Button block loading={busy} disabled={f.title.length < 3 || f.message.length < 3 || !f.scheduled_at} onClick={() => create(false)}>{t.business.schedule}</Button>
            ) : (
              <>
                <Button variant="secondary" loading={busy} disabled={f.title.length < 3 || f.message.length < 3} onClick={() => create(false)}>{t.business.saveCampaign}</Button>
                <Button block loading={busy} icon={<Send className="h-4 w-4" />} disabled={f.title.length < 3 || f.message.length < 3} onClick={() => create(true)}>{t.business.sendNow}</Button>
              </>
            )}
          </div>
          <p className="text-xs text-muted">{t.business.pushPlaceholder}</p>
        </Card>
        <div className="space-y-3 lg:col-span-3">
          {!data.items.length && <EmptyState icon="📣" title={t.business.campaigns} />}
          {data.items.map((c: any) => (
            <Card key={c.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{c.title}</p>
                  <p className="text-sm text-muted">{c.message}</p>
                  {c.event_title && <p className="mt-1 text-xs text-primary-ink">🎟️ {c.event_title}</p>}
                </div>
                <Badge tone={TONE[c.status]}>{t.business.campaignStatus[c.status]}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
                <span>{t.business.audiences[c.audience]}</span>
                {c.status === 'scheduled' && <span className="capitalize">⏰ {formatDay(c.scheduled_at)} {formatTime(c.scheduled_at)}</span>}
                {c.status === 'sent' && (
                  <>
                    <span className="capitalize">{formatDay(c.sent_at)}</span>
                    <span className="font-semibold text-ink">{fmt(t.business.recipients, { n: c.recipients_count })}</span>
                    <span>{fmt(t.business.opened, { n: c.opened })}</span>
                    {c.skipped_count > 0 && <span>{fmt(t.business.skipped, { n: c.skipped_count })}</span>}
                  </>
                )}
                {(c.status === 'draft' || c.status === 'scheduled') && (
                  <span className="ml-auto flex gap-2">
                    <Button size="sm" onClick={() => send(c.id)}>{t.business.sendNow}</Button>
                    <Button size="sm" variant="ghost" onClick={async () => { await api.post(`/biz/${biz.id}/campaigns/${c.id}/cancel`); reload(); }}>{t.common.cancel}</Button>
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
