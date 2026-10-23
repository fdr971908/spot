'use client';
import { useState } from 'react';
import { api, useApi } from '@/lib/api';
import { formatDay, formatTime, timeAgo } from '@/lib/format';
import { errorMessage, t } from '@/i18n';
import { useToast } from './providers';
import { PageHead, useBiz } from './business-shell';
import { Avatar, Badge, Button, Card, Chip, EmptyState, Input, PageLoader } from './ui';

const TONE: Record<string, any> = { pending: 'amber', confirmed: 'green', declined: 'red' };

export function BizRequests({ kind }: { kind: 'guest-lists' | 'tables' }) {
  const biz = useBiz();
  const toast = useToast();
  const { data, reload } = useApi<any[]>(`/biz/${biz.id}/${kind}`);
  const [status, setStatus] = useState('pending');
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!data) return <PageLoader />;
  const rows = data.filter((r) => status === 'all' || r.status === status);
  const decide = async (id: string, s: string) => {
    try {
      await api.patch(`/biz/${biz.id}/${kind}/${id}`, { status: s, business_note: notes[id] || undefined });
      reload();
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
    }
  };
  const isGl = kind === 'guest-lists';
  return (
    <>
      <PageHead title={isGl ? t.business.guestLists : t.business.tables} />
      {isGl && <p className="-mt-4 mb-4 text-sm text-muted">🔒 {t.business.entriesNote}</p>}
      <div className="mb-4 flex flex-wrap gap-2">
        {['pending', 'confirmed', 'declined', 'all'].map((s) => (
          <Chip key={s} active={status === s} onClick={() => setStatus(s)}>{s === 'all' ? t.business.allEvents : t.event.requestStatus[s]} · {s === 'all' ? data.length : data.filter((r) => r.status === s).length}</Chip>
        ))}
      </div>
      {!rows.length ? <EmptyState icon="📋" title={isGl ? t.business.guestListsEmpty : t.business.tablesEmpty} /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start gap-3">
                <Avatar src={r.requester?.avatar_url} name={r.requester?.display_name ?? r.contact_name} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{isGl ? r.requester?.display_name : r.contact_name}{!isGl && ` · ${r.party_size} ${t.common.people}`}</p>
                  <p className="text-xs capitalize text-muted">{r.title} · {formatDay(r.starts_at)} {formatTime(r.starts_at)} · {timeAgo(r.created_at)}</p>
                </div>
                <Badge tone={TONE[r.status]}>{t.event.requestStatus[r.status]}</Badge>
              </div>
              {isGl ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-muted">{t.requests.guests} ({r.entries_visible})</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">{r.entries.map((x: any, i: number) => <Badge key={i}>{x.display_name}</Badge>)}</div>
                </div>
              ) : (
                <p className="mt-3 text-sm">📞 <a className="font-semibold text-primary-ink" href={`tel:${r.contact_phone}`}>{r.contact_phone}</a></p>
              )}
              {(r.note || r.notes) && <p className="mt-2 rounded-xl bg-surface-2 p-2 text-sm">“{r.note ?? r.notes}”</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input className="h-10 flex-1 text-sm" placeholder={t.business.note} value={notes[r.id] ?? r.business_note ?? ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                {r.status !== 'confirmed' && <Button size="sm" onClick={() => decide(r.id, 'confirmed')}>{t.business.approve}</Button>}
                {r.status !== 'declined' && <Button size="sm" variant="danger" onClick={() => decide(r.id, 'declined')}>{t.business.decline}</Button>}
                {r.status !== 'pending' && <Button size="sm" variant="ghost" onClick={() => decide(r.id, 'pending')}>{t.business.reset}</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
