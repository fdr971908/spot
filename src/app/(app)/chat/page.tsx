'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { api, invalidate, useApi } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { errorMessage, fmt, t } from '@/i18n';
import { useToast } from '@/components/providers';
import { Avatar, Button, Card, Chip, cx, EmptyState, ErrorState, Skeleton, Verified } from '@/components/ui';
import { useRouter } from 'next/navigation';

function preview(c: any) {
  if (c.last_kind === 'event') return `🎟️ ${c.last_event_title ?? ''}`;
  if (c.last_kind === 'system') return '…';
  const who = c.last_sender_name ? `${c.last_sender_name.split(' ')[0]}: ` : c.last_sender_id && !c.last_as_business ? `${t.chat.you}: ` : '';
  return c.last_body ? `${c.type === 'direct' ? '' : who}${c.last_body}` : t.chat.deleted;
}

export default function Inbox() {
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ items: any[]; invites: any[] }>('/conversations');
  const [tab, setTab] = useState<'all' | 'direct' | 'group' | 'business'>('all');
  const [q, setQ] = useState('');
  const items = (data?.items ?? []).filter((c) => (tab === 'all' || c.type === tab) && (!q || [c.group_name, c.business_name, c.other?.display_name, c.last_body].some((s) => s?.toLowerCase().includes(q.toLowerCase()))));

  const respond = async (g: any, accept: boolean) => {
    try {
      const r = await api.post(`/groups/${g.id}/respond`, { accept });
      invalidate('/notifications/unread');
      if (accept && r.conversation_id) router.push(`/chat/${r.conversation_id}`);
      else reload();
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
    }
  };

  return (
    <div>
      <header className="sticky top-0 z-30 bg-bg/85 px-4 pb-3 pt-3 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold">{t.chat.title}</h1>
          <Link href="/gruppi/nuovo" aria-label={t.chat.newGroup} className="bg-brand flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-[var(--shadow-pop)]">
            <Plus className="h-5 w-5" />
          </Link>
        </div>
        <label className="relative mt-3 block">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.chat.search} className="h-11 w-full rounded-full bg-surface pl-10 pr-4 text-sm shadow-[0_1px_0_var(--line)] outline-none focus:ring-2 focus:ring-purple/40" />
        </label>
        <div className="mt-3 flex gap-2">
          {(['all', 'direct', 'group', 'business'] as const).map((k) => (
            <Chip key={k} active={tab === k} onClick={() => setTab(k)}>
              {t.chat.tabs[k]}
            </Chip>
          ))}
        </div>
      </header>
      <div className="px-4">
        {data?.invites?.length ? (
          <div className="mb-4">
            <p className="mb-2 text-sm font-bold">{t.chat.invites}</p>
            {data.invites.map((g) => (
              <Card key={g.id} className="mb-2 flex items-center gap-3 p-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-2xl">{g.emoji ?? '👥'}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{g.name}</p>
                  <p className="text-xs text-muted">{fmt(t.chat.invitedBy, { x: g.invited_by?.display_name ?? '' })}</p>
                </div>
                <Button size="sm" onClick={() => respond(g, true)}>{t.chat.join}</Button>
                <Button size="sm" variant="ghost" onClick={() => respond(g, false)}>{t.chat.decline}</Button>
              </Card>
            ))}
          </div>
        ) : null}
        {loading && !data ? (
          <div className="space-y-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : error ? (
          <ErrorState onRetry={reload} message={errorMessage(error.code)} />
        ) : !items.length ? (
          <EmptyState icon="💬" title={t.chat.title} action={<Link href="/gruppi/nuovo"><Button variant="soft">{t.chat.newGroup}</Button></Link>}>{t.chat.empty}</EmptyState>
        ) : (
          <ul className="-mx-2 pb-4">
            {items.map((c) => (
              <li key={c.id}>
                <Link href={`/chat/${c.id}`} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-surface-2">
                  {c.type === 'group' ? (
                    <span className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-2xl" style={{ width: 52, height: 52 }}>{c.group_emoji ?? '👥'}</span>
                  ) : c.type === 'business' ? (
                    <Avatar src={c.business_logo} name={c.business_name} size={52} className="rounded-2xl" />
                  ) : (
                    <Avatar src={c.other?.avatar_url} name={c.other?.display_name} size={52} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="flex min-w-0 flex-1 items-center gap-1 font-semibold">
                        <span className="truncate">{c.type === 'group' ? c.group_name : c.type === 'business' ? c.business_name : c.other?.display_name ?? t.common.deletedUser}</span>
                        {c.type === 'business' && c.business_verified && <Verified className="h-3.5 w-3.5" />}
                      </p>
                      <span className={cx('shrink-0 text-xs', c.unread ? 'font-semibold text-purple' : 'text-muted')}>{timeAgo(c.last_message_at)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className={cx('min-w-0 flex-1 truncate text-sm', c.unread ? 'font-medium text-ink' : 'text-muted')}>{preview(c)}</p>
                      {c.unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-purple px-1.5 text-[11px] font-bold text-white">{c.unread}</span>}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
