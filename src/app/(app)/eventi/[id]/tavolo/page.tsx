'use client';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { CheckCircle2, Minus, Plus } from 'lucide-react';
import { api, invalidate, useApi } from '@/lib/api';
import { formatDay, formatTime } from '@/lib/format';
import { errorMessage, t } from '@/i18n';
import { useSession, useToast } from '@/components/providers';
import { Badge, Button, Card, EmptyState, Field, Input, PageLoader, Textarea, TopBar } from '@/components/ui';

export default function TableRequest({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const { me } = useSession();
  const { data: e, reload } = useApi<any>(`/events/${id}`);
  const [f, setF] = useState({ party_size: 4, contact_name: '', contact_phone: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    if (me?.profile && !f.contact_name) setF((x) => ({ ...x, contact_name: me.profile!.display_name }));
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!e) return <PageLoader />;
  const active = e.my.table && ['pending', 'confirmed'].includes(e.my.table.status);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/events/${id}/table`, { ...f, notes: f.notes || undefined });
      invalidate('/me/requests');
      setSent(true);
    } catch (err: any) {
      toast(errorMessage(err.code), 'error');
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    await api.post(`/tables/${e.my.table.id}/cancel`);
    reload();
  };
  if (sent)
    return (
      <div>
        <TopBar back />
        <EmptyState icon={<CheckCircle2 className="h-8 w-8 text-purple" />} title={t.tableReq.sent} action={<Button onClick={() => router.replace(`/eventi/${id}`)}>{t.common.done}</Button>}>
          {t.tableReq.subtitle}
        </EmptyState>
      </div>
    );
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar back title={t.tableReq.title} />
      <div className="flex-1 space-y-5 px-4">
        <Card className="flex items-center gap-3 p-3">
          <img src={e.cover_url} alt="" className="h-14 w-14 rounded-2xl object-cover" />
          <div>
            <p className="font-semibold">{e.title}</p>
            <p className="text-sm text-muted">{formatDay(e.starts_at)} · {formatTime(e.starts_at)} · {e.venue_name}</p>
          </div>
        </Card>
        {!e.table_requests_enabled ? (
          <EmptyState title={t.tableReq.disabled} />
        ) : active ? (
          <Card>
            <p className="font-semibold">{t.event.myRequest} · {e.my.table.party_size} {t.common.people}</p>
            <Badge tone={e.my.table.status === 'confirmed' ? 'green' : 'amber'} className="mt-2">{t.event.requestStatus[e.my.table.status]}</Badge>
            <Button variant="danger" block className="mt-4" onClick={cancel}>{t.common.cancel}</Button>
          </Card>
        ) : (
          <>
            <p className="text-sm text-muted">{t.tableReq.subtitle}</p>
            <div>
              <p className="mb-2 text-sm font-semibold">{t.tableReq.partySize}</p>
              <div className="flex items-center gap-4">
                <Button variant="soft" size="sm" aria-label="-" onClick={() => setF({ ...f, party_size: Math.max(1, f.party_size - 1) })}><Minus className="h-4 w-4" /></Button>
                <span className="w-10 text-center text-3xl font-extrabold">{f.party_size}</span>
                <Button variant="soft" size="sm" aria-label="+" onClick={() => setF({ ...f, party_size: Math.min(50, f.party_size + 1) })}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            <Field label={t.tableReq.contactName}>
              <Input value={f.contact_name} onChange={(ev) => setF({ ...f, contact_name: ev.target.value })} maxLength={80} />
            </Field>
            <Field label={t.tableReq.contactPhone} hint={t.tableReq.phoneNote}>
              <Input type="tel" inputMode="tel" value={f.contact_phone} onChange={(ev) => setF({ ...f, contact_phone: ev.target.value })} placeholder="+39 …" />
            </Field>
            <Field label={t.tableReq.notes}>
              <Textarea value={f.notes} maxLength={500} onChange={(ev) => setF({ ...f, notes: ev.target.value })} />
            </Field>
          </>
        )}
      </div>
      {e.table_requests_enabled && !active && (
        <div className="pb-safe sticky bottom-0 z-10 bg-bg px-4 pt-3">
          <Button block size="lg" loading={busy} disabled={f.contact_name.length < 2 || f.contact_phone.length < 6} onClick={submit}>{t.tableReq.submit}</Button>
        </div>
      )}
    </div>
  );
}
