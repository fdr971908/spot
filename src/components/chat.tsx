'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarPlus, Flag, MoreVertical, Send, ShieldOff, Trash2, Users } from 'lucide-react';
import { api, invalidate, useApi } from '@/lib/api';
import { formatDay, formatTime, timeAgo } from '@/lib/format';
import { errorMessage, fmt, t } from '@/i18n';
import { useRealtime, useSession, useToast } from './providers';
import { AttendSheet, Cover } from './events';
import { Avatar, Button, cx, ErrorState, IconButton, Sheet, Spinner, TopBar, Verified } from './ui';
import { ReportSheet } from './report';

function systemText(body: string, actor: string) {
  const [code, arg] = body.split('|');
  return fmt(t.chat.system[code] ?? code, { x: actor, y: arg ?? '' });
}

function EventBubble({ m, mine, groupId, onChanged }: { m: any; mine: boolean; groupId?: string | null; onChanged: () => void }) {
  const e = m.event;
  const toast = useToast();
  const [attendOpen, setAttendOpen] = useState(false);
  if (!e) return <p className="text-sm italic text-muted">{t.common.deletedUser}</p>;
  const rsvp = async (status: string) => {
    if (!m.rsvp) return;
    try {
      await api.put(`/groups/${groupId}/events/${m.rsvp.id}/rsvp`, { status: m.rsvp.mine === status ? null : status });
      onChanged();
    } catch (err: any) {
      toast(errorMessage(err.code), 'error');
    }
  };
  return (
    <div className={cx('w-64 overflow-hidden rounded-3xl bg-surface shadow-[0_1px_0_var(--line),0_10px_30px_-20px_rgb(23_19_38/.5)]', mine && 'ring-2 ring-lavender')}>
      <Link href={`/eventi/${e.id}`}>
        <Cover src={e.cover_url} className="h-28 w-full">
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <p className="absolute bottom-2 left-3 right-3 text-sm font-bold leading-tight text-white">{e.title}</p>
        </Cover>
        <div className="px-3 pt-2 text-xs text-muted">
          <span className="font-semibold capitalize text-purple">{formatDay(e.starts_at)} · {formatTime(e.starts_at)}</span>
          <span className="block truncate">{e.business_name}</span>
        </div>
      </Link>
      {m.body && <p className="px-3 pt-1 text-sm">{m.body}</p>}
      {m.rsvp && groupId ? (
        <div className="p-3">
          <div className="grid grid-cols-3 gap-1">
            {(['going', 'maybe', 'not_going'] as const).map((s) => (
              <button
                key={s}
                onClick={() => rsvp(s)}
                className={cx('rounded-full py-1.5 text-xs font-semibold transition', m.rsvp.mine === s ? 'bg-purple text-white' : 'bg-surface-2 text-ink hover:bg-primary-soft')}
              >
                {t.chat.rsvp[s]} {m.rsvp[s] ? `· ${m.rsvp[s]}` : ''}
              </button>
            ))}
          </div>
          {e.status === 'published' && new Date(e.ends_at) > new Date() && (
            <button onClick={() => (e.my_attendance === 'going' ? null : setAttendOpen(true))} className="mt-2 flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-primary-ink">
              <CalendarPlus className="h-3.5 w-3.5" /> {e.my_attendance === 'going' ? t.chat.inMyEvents : t.chat.addToMyEvents}
            </button>
          )}
          <AttendSheet open={attendOpen} onClose={() => setAttendOpen(false)} eventId={e.id} onDone={onChanged} />
        </div>
      ) : (
        <div className="h-3" />
      )}
    </div>
  );
}

function EventPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const { data } = useApi<{ items: any[] }>(open ? '/calendar' : null);
  const items = (data?.items ?? []).filter((e) => new Date(e.ends_at) > new Date() && e.status === 'published');
  return (
    <Sheet open={open} onClose={onClose} title={t.chat.attachEvent}>
      {!data && <Spinner />}
      {data && !items.length && <p className="py-6 text-center text-sm text-muted">{t.calendar.empty}</p>}
      <div className="space-y-1">
        {items.map((e) => (
          <button key={e.id} onClick={() => onPick(e.id)} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-surface-2">
            <img src={e.cover_url} alt="" className="h-12 w-12 rounded-xl object-cover" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{e.title}</span>
              <span className="text-xs capitalize text-muted">{formatDay(e.starts_at)} · {e.business_name}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export function ChatView({ id, asBusiness = false, backHref }: { id: string; asBusiness?: boolean; backHref?: string }) {
  const { me } = useSession();
  const toast = useToast();
  const { subscribe } = useRealtime();
  const { data, error, loading, reload, mutate } = useApi<any>(`/conversations/${id}`);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [older, setOlder] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState<boolean | null>(null);
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState<{ user?: string; message?: string } | null>(null);
  const [picker, setPicker] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const myId = me?.user.id;

  const markRead = useCallback(() => {
    api.post(`/conversations/${id}/read`).then(() => invalidate('/notifications/unread')).catch(() => {});
  }, [id]);

  useEffect(() => {
    markRead();
    return subscribe((e) => {
      if (e.t === 'message' && e.c === id) {
        reload().then(markRead);
      }
    });
  }, [id, subscribe, reload, markRead]);

  // Fallback polling when realtime is unavailable (e.g. business dashboard without SSE).
  useEffect(() => {
    if (!asBusiness) return;
    const h = setInterval(reload, 8000);
    return () => clearInterval(h);
  }, [asBusiness, reload]);

  const count = data?.messages?.length ?? 0;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [count]);

  if (loading && !data) return <div className="flex h-dvh items-center justify-center"><Spinner /></div>;
  if (error || !data) return (<><TopBar back={backHref ?? true} /><ErrorState onRetry={reload} message={errorMessage(error?.code)} /></>);

  const c = data.conversation;
  const title = c.type === 'group' ? `${c.group_emoji ?? ''} ${c.group_name}` : c.type === 'business' ? (asBusiness ? data.members[0]?.display_name : c.business_name) : c.other?.display_name;
  const avatar =
    c.type === 'group' ? (
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-soft text-xl">{c.group_emoji ?? '👥'}</span>
    ) : c.type === 'business' && !asBusiness ? (
      <Avatar src={c.business_logo} name={c.business_name} size={40} className="rounded-2xl" />
    ) : (
      <Avatar src={(asBusiness ? data.members[0] : c.other)?.avatar_url} name={title} size={40} />
    );
  const headerHref = c.type === 'group' ? `/gruppi/${c.group_id}` : c.type === 'business' ? (asBusiness ? null : `/locali/${c.business_slug}`) : c.other?.username ? `/u/${c.other.username}` : null;
  const all = [...older, ...data.messages];

  const send = async (payload: { body?: string; event_id?: string }) => {
    setSending(true);
    try {
      await api.post(`/conversations/${id}/messages`, { ...payload, as_business: asBusiness });
      setText('');
      await reload();
      invalidate('/conversations');
    } catch (err: any) {
      toast(errorMessage(err.code), 'error');
    } finally {
      setSending(false);
    }
  };
  const loadOlder = async () => {
    const before = all[0]?.created_at;
    const r = await api.get(`/conversations/${id}?before=${encodeURIComponent(before)}`);
    setOlder((o) => [...r.messages, ...o]);
    setHasMore(r.has_more);
  };
  const remove = async (mid: string) => {
    await api.del(`/messages/${mid}`).catch(() => {});
    mutate((d: any) => ({ ...d, messages: d.messages.map((m: any) => (m.id === mid ? { ...m, deleted: true, body: null } : m)) }));
  };

  return (
    <div className="flex h-dvh flex-col">
      <TopBar
        back={backHref ?? true}
        title={
          headerHref ? (
            <Link href={headerHref} className="flex items-center gap-2.5">
              {avatar}
              <span className="min-w-0">
                <span className="flex items-center gap-1 truncate text-base">
                  {title} {c.type === 'business' && c.business_verified && !asBusiness && <Verified />}
                </span>
                {c.type === 'group' && (
                  <span className="block text-xs font-medium text-muted">
                    {data.members.length} {t.common.people}
                  </span>
                )}
              </span>
            </Link>
          ) : (
            <span className="flex items-center gap-2.5">
              {avatar} <span className="truncate text-base">{title}</span>
            </span>
          )
        }
        right={
          c.type === 'direct' ? (
            <IconButton label="Menu" onClick={() => setMenu(true)}>
              <MoreVertical className="h-5 w-5" />
            </IconButton>
          ) : c.type === 'group' ? (
            <Link href={`/gruppi/${c.group_id}`} aria-label={t.groups.details} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-2">
              <Users className="h-5 w-5" />
            </Link>
          ) : null
        }
      />
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {(hasMore ?? data.has_more) && (
          <button onClick={loadOlder} className="mx-auto my-2 block rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
            {t.chat.loadOlder}
          </button>
        )}
        {c.type === 'business' && !asBusiness && <p className="mx-auto my-3 max-w-xs rounded-2xl bg-surface-2 px-3 py-2 text-center text-xs text-muted">{t.chat.businessReplyNote}</p>}
        {all.map((m: any, i: number) => {
          const mine = asBusiness ? m.as_business : !m.as_business && m.sender_id === myId;
          const prev = all[i - 1];
          const showName = !mine && c.type === 'group' && (prev?.sender_id !== m.sender_id || prev?.kind === 'system');
          if (m.kind === 'system')
            return (
              <p key={m.id} className="my-3 text-center text-xs text-muted">
                {systemText(m.body, m.sender?.display_name ?? t.common.deletedUser)}
              </p>
            );
          const senderName = m.as_business ? c.business_name : m.sender?.display_name ?? t.common.deletedUser;
          return (
            <div key={m.id} className={cx('group mt-1.5 flex items-end gap-2', mine ? 'justify-end' : 'justify-start')}>
              {!mine && c.type !== 'direct' && (
                <Avatar src={m.as_business ? c.business_logo : m.sender?.avatar_url} name={senderName} size={28} className={cx(m.as_business && 'rounded-lg', !showName && 'invisible')} />
              )}
              <div className={cx('max-w-[78%]', mine && 'items-end')}>
                {showName && <p className="mb-0.5 ml-2 text-xs font-semibold text-muted">{senderName}</p>}
                {m.kind === 'event' ? (
                  <EventBubble m={m} mine={mine} groupId={c.group_id} onChanged={reload} />
                ) : (
                  <div
                    className={cx(
                      'rounded-3xl px-4 py-2.5 text-[15px] leading-snug',
                      mine ? 'bg-brand rounded-br-lg text-white' : 'rounded-bl-lg bg-surface shadow-[0_1px_0_var(--line)]',
                      m.deleted && 'italic opacity-60',
                    )}
                  >
                    {m.deleted ? t.chat.deleted : <span className="whitespace-pre-wrap break-words">{m.body}</span>}
                  </div>
                )}
                <p className={cx('mt-0.5 flex items-center gap-2 px-2 text-[10px] text-muted', mine ? 'justify-end' : '')}>
                  {timeAgo(m.created_at)}
                  {mine && !m.deleted && m.kind === 'text' && (
                    <button className="opacity-0 transition group-hover:opacity-100" onClick={() => remove(m.id)} aria-label={t.chat.deleteMsg}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                  {!mine && !m.as_business && m.sender_id && (
                    <button className="opacity-0 transition group-hover:opacity-100" onClick={() => setReport({ user: m.sender_id, message: m.id })} aria-label={t.chat.report}>
                      <Flag className="h-3 w-3" />
                    </button>
                  )}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <div className="pb-safe border-t border-line bg-surface px-3 pt-2">
        {c.can_send ? (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) send({ body: text.trim() });
            }}
          >
            {!asBusiness && (
              <IconButton type="button" label={t.chat.attachEvent} onClick={() => setPicker(true)} className="bg-primary-soft text-primary-ink">
                <CalendarPlus className="h-5 w-5" />
              </IconButton>
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (text.trim()) send({ body: text.trim() });
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder={asBusiness ? fmt(t.business.replyAs, { x: c.business_name }) : t.chat.placeholder}
              className="max-h-32 min-h-10 flex-1 resize-none rounded-3xl bg-surface-2 px-4 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-purple/40"
              aria-label={t.chat.placeholder}
            />
            <button disabled={!text.trim() || sending} className="bg-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40" aria-label={t.common.send}>
              {sending ? <Spinner className="h-4 w-4 text-white" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        ) : (
          <p className="py-2 text-center text-sm text-muted">{c.archived_at ? t.chat.archived : t.chat.cannotSend}</p>
        )}
      </div>
      <EventPicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(eid) => {
          setPicker(false);
          send({ event_id: eid });
        }}
      />
      <Sheet open={menu} onClose={() => setMenu(false)} title={title}>
        <div className="space-y-2">
          <Button block variant="secondary" icon={<Flag className="h-4 w-4" />} onClick={() => { setMenu(false); setReport({ user: c.other?.user_id }); }}>
            {t.chat.report}
          </Button>
          {c.other?.username && (
            <Button
              block
              variant="danger"
              icon={<ShieldOff className="h-4 w-4" />}
              onClick={async () => {
                await api.post(`/users/${c.other.username}/block`);
                toast(t.profile.blocked);
                setMenu(false);
                reload();
              }}
            >
              {t.chat.block}
            </Button>
          )}
        </div>
      </Sheet>
      <ReportSheet open={!!report} onClose={() => setReport(null)} targetUserId={report?.user} messageId={report?.message} />
    </div>
  );
}

export function ConversationTitle({ c }: { c: any }) {
  if (c.type === 'group') return <>{c.group_name}</>;
  if (c.type === 'business') return <>{c.business_name}</>;
  return <>{c.other?.display_name ?? t.common.deletedUser}</>;
}
