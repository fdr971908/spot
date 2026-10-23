'use client';
import Link from 'next/link';
import { api, useApi } from '@/lib/api';
import { formatDay, formatTime } from '@/lib/format';
import { errorMessage, fmt, t } from '@/i18n';
import { useToast } from '@/components/providers';
import { Badge, Button, Card, EmptyState, PageLoader, TopBar } from '@/components/ui';

const TONE: Record<string, any> = { pending: 'amber', confirmed: 'green', declined: 'red', cancelled: 'default', accepted: 'green' };

export default function Requests() {
  const toast = useToast();
  const { data, reload } = useApi<any>('/me/requests');
  if (!data) return <PageLoader />;
  const consent = async (id: string, c: 'accepted' | 'declined') => {
    try {
      await api.post(`/guest-list/entries/${id}`, { consent: c });
      reload();
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
    }
  };
  const pending = data.consents.filter((c: any) => c.consent === 'pending');
  return (
    <div className="space-y-6 px-4 pb-8">
      <TopBar back title={t.requests.title} className="-mx-4" />
      {pending.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">{t.guestList.consentTitle}</h2>
          {pending.map((c: any) => (
            <Card key={c.id} className="mb-2">
              <p className="font-semibold">{fmt(t.guestList.consentFrom, { x: c.requester_name })}</p>
              <p className="text-sm text-muted">{c.title} · <span className="capitalize">{formatDay(c.starts_at)}</span> · {c.venue_name}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => consent(c.id, 'accepted')}>{t.guestList.accept}</Button>
                <Button size="sm" variant="ghost" onClick={() => consent(c.id, 'declined')}>{t.guestList.decline}</Button>
              </div>
            </Card>
          ))}
        </section>
      )}
      <section>
        <h2 className="mb-2 font-bold">{t.requests.guestLists}</h2>
        {!data.guest_lists.length && <p className="text-sm text-muted">{t.requests.empty}</p>}
        {data.guest_lists.map((r: any) => (
          <Link key={r.id} href={`/eventi/${r.event_id}`}>
            <Card className="mb-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{r.title}</p>
                  <p className="text-sm capitalize text-muted">{formatDay(r.starts_at)} · {formatTime(r.starts_at)}</p>
                </div>
                <Badge tone={TONE[r.status]}>{t.event.requestStatus[r.status]}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.entries.map((x: any) => (
                  <Badge key={x.id} tone={TONE[x.consent]}>{x.display_name}{x.consent === 'pending' ? ' · ⏳' : ''}</Badge>
                ))}
              </div>
              {r.business_note && <p className="mt-2 text-sm text-muted">“{r.business_note}”</p>}
            </Card>
          </Link>
        ))}
      </section>
      <section>
        <h2 className="mb-2 font-bold">{t.requests.tables}</h2>
        {!data.tables.length && <p className="text-sm text-muted">{t.requests.empty}</p>}
        {data.tables.map((r: any) => (
          <Link key={r.id} href={`/eventi/${r.event_id}`}>
            <Card className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{r.title}</p>
                <p className="text-sm capitalize text-muted">{formatDay(r.starts_at)} · {r.party_size} {t.common.people}</p>
                {r.business_note && <p className="mt-1 text-sm text-muted">“{r.business_note}”</p>}
              </div>
              <Badge tone={TONE[r.status]}>{t.event.requestStatus[r.status]}</Badge>
            </Card>
          </Link>
        ))}
      </section>
      {!data.guest_lists.length && !data.tables.length && !pending.length && <EmptyState icon="📋" title={t.requests.empty} />}
    </div>
  );
}
