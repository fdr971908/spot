'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, MapPin, Sparkles, ThumbsDown, ThumbsUp, EyeOff } from 'lucide-react';
import { api, useApi } from '@/lib/api';
import { reasonLabel } from '@/lib/format';
import { errorMessage, fmt, t } from '@/i18n';
import { useSession, useToast } from '@/components/providers';
import { EventCard, type EventCardData } from '@/components/events';
import { NotificationBell } from '@/components/app-shell';
import { Button, Chip, EmptyState, ErrorState, Logo, Sheet, Skeleton } from '@/components/ui';

const CATS = ['brunch', 'aperitivo', 'concert', 'nightclub', 'beach_club', 'outdoor', 'festival', 'dinner'];

export default function Home() {
  const { me } = useSession();
  const toast = useToast();
  const [tab, setTab] = useState<'for-you' | 'following'>('for-you');
  const [cat, setCat] = useState<string | null>(null);
  const path = `/feed?tab=${tab}${cat ? `&category=${cat}` : ''}`;
  const { data, error, loading, reload, mutate } = useApi<{ items: (EventCardData & { reasons: any[] })[] }>(path);
  const [fb, setFb] = useState<(EventCardData & { reasons?: any[] }) | null>(null);

  const sendFeedback = async (kind: string) => {
    if (!fb) return;
    try {
      await api.post(`/events/${fb.id}/feedback`, { kind });
      toast(t.home.feedbackThanks);
      if (kind !== 'interested') mutate((d) => ({ items: (d?.items ?? []).filter((x) => x.id !== fb.id) }));
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
    }
    setFb(null);
  };

  const first = me?.profile?.display_name.split(' ')[0] ?? '';
  return (
    <div>
      <header className="sticky top-0 z-30 bg-bg/85 px-4 pb-2 pt-3 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <Logo size="md" />
          <div className="flex items-center gap-2">
            <Link href="/profilo/preferenze" className="flex items-center gap-1 rounded-full bg-surface px-3 py-2 text-sm font-semibold shadow-[0_1px_0_var(--line)]">
              <MapPin className="h-4 w-4 text-purple" /> {me?.profile?.city_name ?? 'Milano'} <ChevronDown className="h-3.5 w-3.5 text-muted" />
            </Link>
            <NotificationBell />
          </div>
        </div>
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          <Chip active={tab === 'for-you' && !cat} onClick={() => { setTab('for-you'); setCat(null); }}>
            <Sparkles className="h-4 w-4" /> {t.home.forYou}
          </Chip>
          <Chip active={tab === 'following'} onClick={() => { setTab('following'); setCat(null); }}>
            {t.home.following}
          </Chip>
          {CATS.map((c) => (
            <Chip key={c} active={tab === 'for-you' && cat === c} onClick={() => { setTab('for-you'); setCat(cat === c ? null : c); }}>
              {t.categoryEmoji[c]} {t.categories[c]}
            </Chip>
          ))}
        </div>
      </header>

      <section className="px-4 pt-3">
        {tab === 'for-you' && !cat && (
          <div className="mb-4">
            <h1 className="text-2xl font-extrabold">{fmt(t.home.greeting, { name: first })}</h1>
            <p className="text-sm text-muted">{t.home.subtitle}</p>
          </div>
        )}
        {loading && !data ? (
          <div className="space-y-5">
            <Skeleton className="aspect-[4/3.6] w-full rounded-[1.75rem]" />
            <Skeleton className="aspect-[4/3.6] w-full rounded-[1.75rem]" />
          </div>
        ) : error ? (
          <ErrorState onRetry={reload} message={errorMessage(error.code)} />
        ) : !data?.items.length ? (
          <EmptyState
            icon={tab === 'following' ? '💜' : '🔍'}
            title={tab === 'following' ? t.home.following : t.home.forYou}
            action={
              <Link href="/esplora">
                <Button variant="soft">{t.home.discover}</Button>
              </Link>
            }
          >
            {tab === 'following' ? t.home.emptyFollowing : t.home.emptyForYou}
          </EmptyState>
        ) : (
          <div className="space-y-5 pb-4">
            {data.items.map((e) => (
              <EventCard key={e.id} e={e} onFeedback={setFb} />
            ))}
          </div>
        )}
      </section>

      <Sheet open={!!fb} onClose={() => setFb(null)} title={t.home.why}>
        {fb && (
          <>
            <p className="mb-3 font-semibold">{fb.title}</p>
            <div className="mb-5 flex flex-wrap gap-1.5">
              {(fb.reasons ?? []).map((r: any, i: number) => (
                <span key={i} className="rounded-full bg-primary-soft px-3 py-1 text-sm font-medium text-primary-ink">
                  {reasonLabel(r)}
                </span>
              ))}
            </div>
            <div className="space-y-2">
              <Button block variant="soft" icon={<ThumbsUp className="h-4 w-4" />} onClick={() => sendFeedback('interested')}>
                {t.home.feedback.interested}
              </Button>
              <Button block variant="secondary" icon={<ThumbsDown className="h-4 w-4" />} onClick={() => sendFeedback('not_interested')}>
                {t.home.feedback.not_interested}
              </Button>
              <Button block variant="ghost" icon={<EyeOff className="h-4 w-4" />} onClick={() => sendFeedback('fewer_like_this')}>
                {t.home.feedback.fewer_like_this}
              </Button>
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}
