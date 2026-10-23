'use client';
import Link from 'next/link';
import { use } from 'react';
import { Lock, Music2 } from 'lucide-react';
import { useApi } from '@/lib/api';
import { errorMessage, fmt, t } from '@/i18n';
import { Avatar, Card, EmptyState, ErrorState, PageLoader, TopBar, Instagram } from '@/components/ui';

export default function Attendees({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi<any>(`/events/${id}/attendees`);
  if (loading && !data) return <PageLoader />;
  if (error || !data) return (<><TopBar back /><ErrorState onRetry={reload} message={errorMessage(error?.code)} /></>);
  return (
    <div>
      <TopBar back title={t.event.attendees} />
      <div className="px-4">
        <p className="font-semibold">{data.event.title}</p>
        <p className="text-sm text-muted">
          {fmt(t.event.attendeesCount, { n: data.attendee_count })} · {fmt(t.event.attendeesVisible, { n: data.attendees.length })}
        </p>
        <p className="bg-brand-soft mt-3 flex items-start gap-2 rounded-2xl p-3 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-purple" />
          {data.restricted ? t.event.attendeesRestricted : t.event.attendeesPrivacy}
        </p>
        {!data.restricted && !data.attendees.length && <EmptyState icon="👀" title={t.event.attendees}>{t.event.attendeesEmpty}</EmptyState>}
        <div className="mt-4 space-y-2.5 pb-6">
          {data.attendees.map((a: any) => (
            <Card key={a.user_id} className="flex items-center gap-3 p-3">
              <Link href={`/u/${a.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar src={a.avatar_url} name={a.display_name} size={52} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {a.display_name} {a.is_me && <span className="text-xs text-purple">({t.chat.you})</span>}
                  </p>
                  <p className="truncate text-sm text-muted">@{a.username}</p>
                  {a.is_private ? (
                    <p className="flex items-center gap-1 text-xs text-muted">
                      <Lock className="h-3 w-3" /> {t.profile.private}
                    </p>
                  ) : (
                    a.bio && <p className="line-clamp-1 text-xs text-muted">{a.bio}</p>
                  )}
                </div>
              </Link>
              <div className="flex gap-1.5">
                {a.instagram && (
                  <a href={`https://instagram.com/${a.instagram}`} target="_blank" rel="noopener noreferrer nofollow" aria-label="Instagram" className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#4f5bd5] text-white">
                    <Instagram className="h-4 w-4" />
                  </a>
                )}
                {a.tiktok && (
                  <a href={`https://tiktok.com/@${a.tiktok}`} target="_blank" rel="noopener noreferrer nofollow" aria-label="TikTok" className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-white">
                    <Music2 className="h-4 w-4" />
                  </a>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
