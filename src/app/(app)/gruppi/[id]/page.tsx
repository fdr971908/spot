'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { Archive, Crown, ListChecks, LogOut, MessageCircle, UserMinus, UserPlus } from 'lucide-react';
import { api, invalidate, useApi } from '@/lib/api';
import { errorMessage, fmt, t } from '@/i18n';
import { useSession, useToast } from '@/components/providers';
import { AttendSheet, EventRow } from '@/components/events';
import { UserPicker, type PickedUser } from '@/components/user-picker';
import { Avatar, Badge, Button, Card, cx, EmptyState, ErrorState, PageLoader, Sheet, TopBar } from '@/components/ui';

export default function GroupDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const { me } = useSession();
  const { data, error, loading, reload } = useApi<any>(`/groups/${id}`);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [people, setPeople] = useState<PickedUser[]>([]);
  const [attendFor, setAttendFor] = useState<string | null>(null);

  if (loading && !data) return <PageLoader />;
  if (error || !data) return (<><TopBar back /><ErrorState onRetry={reload} message={errorMessage(error?.code)} /></>);
  const g = data.group;
  const run = async (fn: () => Promise<any>, after?: () => void) => {
    try {
      await fn();
      invalidate('/conversations');
      invalidate('/groups');
      after ? after() : reload();
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
    }
  };
  const rsvp = (geId: string, status: string | null) => run(() => api.put(`/groups/${id}/events/${geId}/rsvp`, { status }));

  if (g.my_status === 'invited')
    return (
      <div>
        <TopBar back />
        <EmptyState
          icon={g.emoji ?? '👥'}
          title={g.name}
          action={
            <div className="flex gap-2">
              <Button onClick={() => run(() => api.post(`/groups/${id}/respond`, { accept: true }), () => router.replace(`/chat/${g.conversation_id}`))}>{t.chat.join}</Button>
              <Button variant="ghost" onClick={() => run(() => api.post(`/groups/${id}/respond`, { accept: false }), () => router.replace('/chat'))}>{t.chat.decline}</Button>
            </div>
          }
        >
          {t.groups.pendingInvite}
        </EmptyState>
      </div>
    );

  return (
    <div className="pb-8">
      <TopBar back title={t.groups.details} />
      <div className="px-4">
        <div className="flex flex-col items-center text-center">
          <span className="bg-brand-soft flex h-20 w-20 items-center justify-center rounded-[1.75rem] text-4xl">{g.emoji ?? '👥'}</span>
          <h1 className="mt-3 text-2xl font-extrabold">{g.name}</h1>
          <div className="mt-1 flex gap-1.5">
            <Badge tone="purple">{g.kind === 'spot' ? t.groups.kindSpot : t.groups.kindPermanent}</Badge>
            {g.archived_at && <Badge>{t.groups.archivedOn}</Badge>}
          </div>
          <div className="mt-4 flex gap-2">
            <Link href={`/chat/${g.conversation_id}`}>
              <Button size="sm" icon={<MessageCircle className="h-4 w-4" />}>{t.groups.openChat}</Button>
            </Link>
            {g.is_admin && !g.archived_at && (
              <Button size="sm" variant="secondary" icon={<UserPlus className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>
                {t.groups.invite}
              </Button>
            )}
          </div>
        </div>

        <h2 className="mb-2 mt-6 text-lg font-bold">{t.groups.plans}</h2>
        <p className="mb-3 text-xs text-muted">{t.groups.rsvpNote}</p>
        {!data.events.length && <Card><p className="text-sm text-muted">{t.groups.plansEmpty}</p></Card>}
        <div className="space-y-3">
          {data.events.map((x: any) => (
            <Card key={x.group_event_id} className="p-2">
              <EventRow e={x.event} />
              <div className="px-2 pb-2">
                <div className="flex -space-x-2">
                  {x.responses.filter((r: any) => r.status === 'going').map((r: any) => (
                    <Avatar key={r.user?.user_id} src={r.user?.avatar_url} name={r.user?.display_name} size={26} ring />
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted">{fmt(t.chat.rsvpSummary, { g: x.going, m: x.maybe })} · {x.not_going} {t.chat.rsvp.not_going.toLowerCase()}</p>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {(['going', 'maybe', 'not_going'] as const).map((s) => (
                    <button key={s} onClick={() => rsvp(x.group_event_id, x.mine === s ? null : s)} className={cx('rounded-full py-2 text-xs font-semibold transition', x.mine === s ? 'bg-purple text-white' : 'bg-surface-2 hover:bg-primary-soft')}>
                      {t.chat.rsvp[s]}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  {x.event.status === 'published' && new Date(x.event.ends_at) > new Date() && x.event.my_attendance !== 'going' && (
                    <Button size="sm" variant="soft" className="flex-1" onClick={() => setAttendFor(x.event.id)}>{t.chat.addToMyEvents}</Button>
                  )}
                  {x.event.guest_list_enabled && new Date(x.event.ends_at) > new Date() && (
                    <Link href={`/eventi/${x.event.id}/lista`} className="flex-1">
                      <Button size="sm" variant="secondary" block icon={<ListChecks className="h-4 w-4" />}>{t.groups.guestListCta}</Button>
                    </Link>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>

        <h2 className="mb-2 mt-6 text-lg font-bold">{t.groups.members} · {data.members.filter((m: any) => m.status === 'active').length}</h2>
        <Card className="p-2">
          {data.members.map((m: any) => (
            <div key={m.user_id} className="flex items-center gap-3 rounded-2xl p-2">
              <Link href={`/u/${m.profile.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar src={m.profile.avatar_url} name={m.profile.display_name} size={40} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{m.profile.display_name}{m.user_id === me?.user.id && ` (${t.chat.you})`}</span>
                  <span className="text-xs text-muted">@{m.profile.username}</span>
                </span>
              </Link>
              {m.role === 'admin' && <Badge tone="purple"><Crown className="h-3 w-3" /> {t.groups.admin}</Badge>}
              {m.status === 'invited' && <Badge tone="amber">{t.groups.invited}</Badge>}
              {g.is_admin && m.user_id !== me?.user.id && (
                <div className="flex">
                  {m.status === 'active' && m.role !== 'admin' && (
                    <button className="rounded-full p-2 text-muted hover:bg-surface-2" aria-label={t.groups.makeAdmin} title={t.groups.makeAdmin} onClick={() => run(() => api.patch(`/groups/${id}/members/${m.user_id}`, { role: 'admin' }))}>
                      <Crown className="h-4 w-4" />
                    </button>
                  )}
                  <button className="rounded-full p-2 text-muted hover:bg-surface-2" aria-label={t.groups.remove} title={t.groups.remove} onClick={() => run(() => api.del(`/groups/${id}/members/${m.user_id}`))}>
                    <UserMinus className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </Card>

        <div className="mt-6 space-y-2">
          {g.is_admin && !g.archived_at && (
            <Button block variant="secondary" icon={<Archive className="h-4 w-4" />} onClick={() => run(() => api.post(`/groups/${id}/archive`))}>
              {t.groups.archive}
            </Button>
          )}
          <Button block variant="danger" icon={<LogOut className="h-4 w-4" />} onClick={() => run(() => api.post(`/groups/${id}/leave`), () => router.replace('/chat'))}>
            {t.groups.leave}
          </Button>
        </div>
      </div>

      <Sheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={t.groups.invite}
        footer={
          <Button
            block
            disabled={!people.length}
            onClick={() =>
              run(
                () => api.post(`/groups/${id}/invite`, { user_ids: people.map((p) => p.user_id) }).then((r) => toast(fmt(t.groups.inviteSent, { n: r.invited }))),
                () => {
                  setInviteOpen(false);
                  setPeople([]);
                  reload();
                },
              )
            }
          >
            {t.common.send}
          </Button>
        }
      >
        <UserPicker value={people} onChange={setPeople} exclude={data.members.map((m: any) => m.user_id)} />
      </Sheet>
      {attendFor && <AttendSheet open onClose={() => setAttendFor(null)} eventId={attendFor} onDone={() => { invalidate('/calendar'); reload(); }} />}
    </div>
  );
}
