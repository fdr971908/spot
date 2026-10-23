'use client';
import Link from 'next/link';
import { Bell, CalendarClock, CheckCheck, ListChecks, Megaphone, MessageCircle, Users, XCircle } from 'lucide-react';
import { api, invalidate, useApi } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { t } from '@/i18n';
import { Badge, Button, cx, EmptyState, PageLoader, TopBar } from '@/components/ui';

const ICON: Record<string, any> = {
  event_reminder: CalendarClock, attendance_prompt: CalendarClock, group_invite: Users, group_event: Users, guest_list_update: ListChecks,
  guest_list_consent: ListChecks, table_update: ListChecks, event_cancelled: XCircle, event_updated: CalendarClock, business_message: MessageCircle, campaign: Megaphone,
};

export default function Notifications() {
  const { data, reload } = useApi<{ items: any[]; unread: number }>('/notifications');
  if (!data) return <PageLoader />;
  const readAll = async () => {
    await api.post('/notifications/read', {});
    invalidate('/notifications');
    reload();
  };
  const open = (n: any) => {
    if (!n.read_at) api.post('/notifications/read', { ids: [n.id] }).then(() => invalidate('/notifications')).catch(() => {});
  };
  return (
    <div className="pb-8">
      <TopBar back title={t.notifications.title} right={data.unread > 0 && <Button size="sm" variant="ghost" icon={<CheckCheck className="h-4 w-4" />} onClick={readAll}>{t.notifications.markAll}</Button>} />
      {!data.items.length && <EmptyState icon={<Bell className="h-7 w-7" />} title={t.notifications.empty} />}
      <ul className="px-2">
        {data.items.map((n) => {
          const Icon = ICON[n.type] ?? Bell;
          return (
            <li key={n.id}>
              <Link href={n.link ?? '#'} onClick={() => open(n)} className={cx('flex gap-3 rounded-2xl p-3 transition hover:bg-surface-2', !n.read_at && 'bg-primary-soft/60')}>
                <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', n.category === 'promotional' ? 'bg-[#fff1cc] text-[#c27c00]' : 'bg-primary-soft text-primary-ink')}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start gap-2">
                    <span className="flex-1 font-semibold leading-snug">{n.title}</span>
                    <span className="shrink-0 text-xs text-muted">{timeAgo(n.created_at)}</span>
                  </span>
                  {n.body && <span className="mt-0.5 block text-sm text-muted">{n.body}</span>}
                  {n.category === 'promotional' && <Badge tone="amber" className="mt-1">{t.notifications.promo}</Badge>}
                </span>
                {!n.read_at && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-purple" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
