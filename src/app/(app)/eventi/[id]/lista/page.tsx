'use client';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { api, invalidate, useApi } from '@/lib/api';
import { formatDay, formatTime } from '@/lib/format';
import { errorMessage, fmt, t } from '@/i18n';
import { useSession, useToast } from '@/components/providers';
import { Avatar, Badge, Button, Card, Chip, cx, EmptyState, Field, PageLoader, Segmented, Textarea, TopBar } from '@/components/ui';

export default function GuestListRequest({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const { me } = useSession();
  const { data: e, reload } = useApi<any>(`/events/${id}`);
  const { data: groups } = useApi<any[]>('/groups');
  const [mode, setMode] = useState<'alone' | 'group'>('alone');
  const [groupId, setGroupId] = useState<string | null>(null);
  const { data: group } = useApi<any>(groupId ? `/groups/${groupId}` : null);
  const [guests, setGuests] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<number | null>(null);

  if (!e) return <PageLoader />;
  const active = e.my.guest_list && ['pending', 'confirmed'].includes(e.my.guest_list.status);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/events/${id}/guest-list`, { note: note || undefined, group_id: mode === 'group' ? groupId : undefined, guest_ids: mode === 'group' ? guests : [] });
      setSent(r.pending_consents);
      invalidate(`/events/${id}`);
      invalidate('/me/requests');
    } catch (err: any) {
      toast(errorMessage(err.code), 'error');
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    setBusy(true);
    try {
      await api.del(`/events/${id}/guest-list`);
      reload();
    } finally {
      setBusy(false);
    }
  };

  if (sent !== null)
    return (
      <div>
        <TopBar back />
        <EmptyState icon={<CheckCircle2 className="h-8 w-8 text-purple" />} title={t.guestList.sent} action={<Button onClick={() => router.replace(`/eventi/${id}`)}>{t.common.done}</Button>}>
          {t.guestList.sentDesc}
        </EmptyState>
      </div>
    );

  const activeGroups = (groups ?? []).filter((g) => g.status === 'active' && !g.archived_at);
  const others = (group?.members ?? []).filter((m: any) => m.status === 'active' && m.user_id !== me?.user.id);
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar back title={t.guestList.title} />
      <div className="flex-1 px-4">
        <Card className="flex items-center gap-3 p-3">
          <img src={e.cover_url} alt="" className="h-14 w-14 rounded-2xl object-cover" />
          <div>
            <p className="font-semibold">{e.title}</p>
            <p className="text-sm text-muted">
              {formatDay(e.starts_at)} · {formatTime(e.starts_at)} · {e.venue_name}
            </p>
          </div>
        </Card>
        {!e.guest_list_enabled ? (
          <EmptyState title={t.guestList.disabled} />
        ) : active ? (
          <Card className="mt-4">
            <p className="font-semibold">{t.event.myRequest}</p>
            <Badge tone={e.my.guest_list.status === 'confirmed' ? 'green' : 'amber'} className="mt-2">
              {t.event.requestStatus[e.my.guest_list.status]}
            </Badge>
            <Button variant="danger" className="mt-4" block loading={busy} onClick={cancel}>
              {t.guestList.cancelRequest}
            </Button>
          </Card>
        ) : (
          <div className="mt-4 space-y-5">
            <p className="text-sm text-muted">{fmt(t.guestList.subtitle, { x: e.business_name })}</p>
            <Segmented value={mode} onChange={setMode} options={[{ value: 'alone', label: t.guestList.alone }, { value: 'group', label: t.guestList.withGroup }]} />
            {mode === 'group' && (
              <>
                <div>
                  <p className="mb-2 text-sm font-semibold">{t.guestList.pickGroup}</p>
                  <div className="flex flex-wrap gap-2">
                    {activeGroups.map((g) => (
                      <Chip key={g.id} active={groupId === g.id} onClick={() => { setGroupId(g.id); setGuests([]); }}>
                        {g.emoji} {g.name}
                      </Chip>
                    ))}
                  </div>
                </div>
                {groupId && (
                  <div>
                    <p className="mb-2 text-sm font-semibold">{t.guestList.pickGuests}</p>
                    <div className="space-y-1">
                      {others.map((m: any) => {
                        const on = guests.includes(m.user_id);
                        return (
                          <button key={m.user_id} onClick={() => setGuests(on ? guests.filter((x) => x !== m.user_id) : [...guests, m.user_id])} className={cx('flex w-full items-center gap-3 rounded-2xl p-2 text-left ring-2', on ? 'bg-primary-soft ring-purple' : 'ring-transparent hover:bg-surface-2')}>
                            <Avatar src={m.profile.avatar_url} name={m.profile.display_name} size={40} />
                            <span className="flex-1 font-medium">{m.profile.display_name}</span>
                            <span className={cx('h-5 w-5 rounded-md ring-2', on ? 'bg-purple ring-purple' : 'ring-line')} />
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-3 flex items-start gap-2 rounded-2xl bg-surface-2 p-3 text-sm text-muted">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-purple" /> {t.guestList.consentNote}
                    </p>
                  </div>
                )}
              </>
            )}
            <Field label={t.guestList.note}>
              <Textarea maxLength={500} value={note} onChange={(ev) => setNote(ev.target.value)} />
            </Field>
          </div>
        )}
      </div>
      {e.guest_list_enabled && !active && (
        <div className="pb-safe sticky bottom-0 z-10 bg-bg px-4 pt-3">
          <Button block size="lg" loading={busy} disabled={mode === 'group' && !groupId} onClick={submit}>
            {t.guestList.submit}
          </Button>
        </div>
      )}
    </div>
  );
}
