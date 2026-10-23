'use client';
import Link from 'next/link';
import { useApi } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { t } from '@/i18n';
import { PageHead, useBiz } from '@/components/business-shell';
import { Avatar, Card, cx, EmptyState, PageLoader } from '@/components/ui';

export default function Messages() {
  const biz = useBiz();
  const { data } = useApi<any[]>(`/biz/${biz.id}/conversations`);
  if (!data) return <PageLoader />;
  return (
    <>
      <PageHead title={t.business.messages} />
      {!data.length ? <EmptyState icon="💬" title={t.business.messagesEmpty} /> : (
        <Card className="p-2">
          {data.map((c) => (
            <Link key={c.id} href={`/business/messaggi/${c.id}`} className="flex items-center gap-3 rounded-2xl p-3 hover:bg-surface-2">
              <Avatar src={c.user?.avatar_url} name={c.user?.display_name} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2"><p className="truncate font-semibold">{c.user?.display_name ?? t.common.deletedUser}</p><span className="shrink-0 text-xs text-muted">{timeAgo(c.last_message_at)}</span></div>
                <p className={cx('truncate text-sm', c.unread ? 'font-medium' : 'text-muted')}>{c.last_as_business ? `${t.chat.you}: ` : ''}{c.last_kind === 'event' ? '🎟️ Evento' : c.last_body}</p>
              </div>
              {c.unread > 0 && <span className="rounded-full bg-purple px-2 text-xs font-bold leading-5 text-white">{c.unread}</span>}
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
