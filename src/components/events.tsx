'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bookmark, Check, Clock, Copy, Eye, EyeOff, Lock, MapPin, MessageCircle, Plus, Share2, Sparkles, Users } from 'lucide-react';
import { api, invalidate, useApi } from '@/lib/api';
import { dateBadge, formatDay, formatPrice, formatTime, reasonLabel } from '@/lib/format';
import { errorMessage, fmt, t } from '@/i18n';
import { useSession, useToast } from './providers';
import { Avatar, Badge, Button, cx, Sheet, Spinner, Verified } from './ui';

export interface EventCardData {
  id: string;
  title: string;
  cover_url: string | null;
  starts_at: string;
  ends_at: string;
  venue_name: string;
  city_name: string;
  neighborhood?: string | null;
  category_id: string;
  genres: string[];
  is_free: boolean;
  price_min: number | null;
  price_max: number | null;
  min_age: number | null;
  is_outdoor: boolean;
  status: string;
  business_name: string;
  business_slug: string;
  business_logo: string | null;
  business_verified: boolean;
  is_saved: boolean;
  my_attendance: 'going' | 'cancelled' | null;
  distance_km?: number | null;
  reasons?: { kind: string; id?: string; km?: number }[];
  explore?: boolean;
  table_requests_enabled?: boolean;
  guest_list_enabled?: boolean;
}

export function Cover({ src, className, children }: { src: string | null; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cx('relative overflow-hidden bg-brand', className)}>
      {src && <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />}
      {children}
    </div>
  );
}

/** Save toggle with optimistic UI. */
export function useSaveToggle(eventId: string, initial: boolean) {
  const [saved, setSaved] = useState(initial);
  const [pulse, setPulse] = useState(0);
  const toast = useToast();
  const toggle = async () => {
    const next = !saved;
    setSaved(next);
    setPulse((p) => p + 1);
    try {
      if (next) await api.post(`/events/${eventId}/save`);
      else await api.del(`/events/${eventId}/save`);
      toast(next ? t.event.savedToast : t.event.unsavedToast);
      invalidate('/calendar');
    } catch (e: any) {
      setSaved(!next);
      toast(errorMessage(e.code), 'error');
    }
  };
  return { saved, toggle, pulse };
}

export function SaveButton({ eventId, initial, variant = 'glass' }: { eventId: string; initial: boolean; variant?: 'glass' | 'plain' }) {
  const { saved, toggle, pulse } = useSaveToggle(eventId, initial);
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }}
      aria-pressed={saved}
      aria-label={saved ? t.event.saved : t.event.save}
      className={cx(
        'flex h-10 w-10 items-center justify-center rounded-full transition active:scale-90',
        variant === 'glass' ? 'bg-white/90 text-navy shadow backdrop-blur' : 'bg-surface-2 text-ink',
      )}
    >
      <Bookmark key={pulse} className={cx('h-5 w-5', saved && 'animate-heart fill-purple text-purple')} />
    </button>
  );
}

export function DateBadge({ date, className }: { date: string; className?: string }) {
  const d = dateBadge(date);
  return (
    <div className={cx('flex w-12 flex-col items-center rounded-2xl bg-white/95 py-1.5 text-navy shadow', className)}>
      <span className="text-[10px] font-bold text-purple">{d.dow}</span>
      <span className="text-xl font-extrabold leading-none">{d.day}</span>
      <span className="text-[10px] font-semibold">{d.month}</span>
    </div>
  );
}

export function EventTags({ e, glass }: { e: EventCardData; glass?: boolean }) {
  const tone = glass ? 'glass' : 'default';
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge tone={tone}>
        {t.categoryEmoji[e.category_id]} {t.categories[e.category_id]}
      </Badge>
      {e.genres.slice(0, 2).map((g) => (
        <Badge key={g} tone={tone}>
          {t.genres[g]}
        </Badge>
      ))}
      {e.is_outdoor && <Badge tone={tone}>Outdoor</Badge>}
      {!!e.min_age && <Badge tone={tone}>{fmt(t.event.age, { n: e.min_age })}</Badge>}
    </div>
  );
}

/** Large immersive card used in Home & Explore. */
export function EventCard({ e, onFeedback }: { e: EventCardData; onFeedback?: (e: EventCardData) => void }) {
  return (
    <Link href={`/eventi/${e.id}`} className="animate-pop group block" aria-label={e.title}>
      <Cover src={e.cover_url} className="aspect-[4/3.6] rounded-[1.75rem] shadow-[var(--shadow-card)]">
        <div className="absolute inset-0 bg-gradient-to-t from-[#120a24]/90 via-[#120a24]/25 to-transparent" />
        <div className="absolute left-3 right-3 top-3 flex items-start justify-between">
          <DateBadge date={e.starts_at} />
          <div className="flex items-center gap-2">
            {e.my_attendance === 'going' && (
              <Badge tone="purple" className="bg-purple text-white">
                <Check className="h-3.5 w-3.5" /> {t.event.attending}
              </Badge>
            )}
            <SaveButton eventId={e.id} initial={e.is_saved} />
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
          {e.reasons?.[0] && (
            <button
              onClick={(ev) => {
                ev.preventDefault();
                onFeedback?.(e);
              }}
              className="mb-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md"
            >
              <Sparkles className="h-3 w-3" /> {reasonLabel(e.reasons[0] as any)}
            </button>
          )}
          <h3 className="text-xl font-bold leading-tight">{e.title}</h3>
          <p className="mt-1 flex items-center gap-1 text-sm text-white/85">
            <Clock className="h-3.5 w-3.5" /> {formatDay(e.starts_at)} · {formatTime(e.starts_at)}
            <span className="mx-1">·</span>
            <span className="font-semibold text-white">{formatPrice(e)}</span>
          </p>
          <div className="mt-2.5">
            <EventTags e={e} glass />
          </div>
          <p className="mt-2.5 flex items-center gap-1.5 text-sm font-medium">
            <MapPin className="h-4 w-4 text-pink" /> {e.business_name} {e.business_verified && <Verified className="h-3.5 w-3.5" />}
            <span className="text-white/70">· {e.neighborhood ? `${e.neighborhood}, ` : ''}{e.city_name}</span>
            {e.distance_km != null && <span className="ml-auto text-xs text-white/70">{e.distance_km} km</span>}
          </p>
        </div>
      </Cover>
    </Link>
  );
}

/** Compact row used in lists (calendar, profile, business). */
export function EventRow({ e, right, sub }: { e: EventCardData; right?: React.ReactNode; sub?: React.ReactNode }) {
  const d = dateBadge(e.starts_at);
  return (
    <Link href={`/eventi/${e.id}`} className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-surface-2">
      <div className="flex w-10 flex-col items-center">
        <span className="text-[10px] font-bold text-purple">{d.dow}</span>
        <span className="text-xl font-extrabold leading-none">{d.day}</span>
      </div>
      <Cover src={e.cover_url} className="h-14 w-14 shrink-0 rounded-2xl" />
      <div className="min-w-0 flex-1">
        <p className={cx('truncate font-semibold', e.status === 'cancelled' && 'line-through opacity-60')}>{e.title}</p>
        <p className="truncate text-sm text-muted">{e.business_name}</p>
        <p className="text-xs text-muted">
          {formatTime(e.starts_at)} – {formatTime(e.ends_at)}
          {sub}
        </p>
      </div>
      {right}
    </Link>
  );
}

/** Attend flow: pick visibility (private default) → POST. */
export function AttendSheet({ open, onClose, eventId, current, onDone }: { open: boolean; onClose: () => void; eventId: string; current?: 'public' | 'private'; onDone: (v: 'public' | 'private') => void }) {
  const { me } = useSession();
  const adult = me?.user.is_adult ?? false;
  const [vis, setVis] = useState<'public' | 'private'>(current ?? 'private');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const submit = async () => {
    setBusy(true);
    try {
      if (current) await api.patch(`/events/${eventId}/attend`, { visibility: vis });
      else await api.post(`/events/${eventId}/attend`, { visibility: vis });
      onDone(vis);
      invalidate('/calendar');
      if (!current) toast(t.event.attendToast);
      onClose();
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
    } finally {
      setBusy(false);
    }
  };
  const Opt = ({ v, icon, title, desc, disabled }: { v: 'public' | 'private'; icon: React.ReactNode; title: string; desc: string; disabled?: boolean }) => (
    <button
      disabled={disabled}
      onClick={() => setVis(v)}
      className={cx(
        'flex w-full items-start gap-3 rounded-2xl p-4 text-left ring-2 transition disabled:opacity-40',
        vis === v ? 'bg-primary-soft ring-purple' : 'bg-surface-2 ring-transparent',
      )}
    >
      <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-primary-ink">{icon}</span>
      <span className="flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted">{desc}</span>
      </span>
      <span className={cx('mt-1 h-5 w-5 rounded-full ring-2', vis === v ? 'bg-purple ring-purple' : 'ring-line')} />
    </button>
  );
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={current ? t.event.attendees : t.event.attendSheetTitle}
      footer={
        <Button block size="lg" loading={busy} onClick={submit}>
          {t.common.confirm}
        </Button>
      }
    >
      <p className="mb-4 text-sm text-muted">{t.event.attendSheetSubtitle}</p>
      <div className="space-y-2.5">
        <Opt v="private" icon={<EyeOff className="h-5 w-5" />} title={t.event.visibilityPrivate} desc={t.event.visibilityPrivateDesc} />
        <Opt v="public" icon={<Eye className="h-5 w-5" />} title={t.event.visibilityPublic} desc={t.event.visibilityPublicDesc} disabled={!adult} />
      </div>
      {!adult && <p className="mt-3 flex items-center gap-1.5 text-sm text-muted"><Lock className="h-4 w-4" /> {t.event.minorsPrivate}</p>}
      <p className="mt-4 text-xs text-muted">{t.event.attendNote}</p>
    </Sheet>
  );
}

/** Share: existing groups, new spot group, DM, external link. */
export function ShareSheet({ open, onClose, event }: { open: boolean; onClose: () => void; event: { id: string; title: string } }) {
  const router = useRouter();
  const toast = useToast();
  const { data: groups, loading } = useApi<any[]>(open ? '/groups' : null);
  const { data: inbox } = useApi<{ items: any[] }>(open ? '/conversations' : null);
  const [busy, setBusy] = useState<string | null>(null);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/eventi/${event.id}` : '';

  const toGroup = async (g: any) => {
    setBusy(g.id);
    try {
      const r = await api.post(`/groups/${g.id}/events`, { event_id: event.id });
      toast(fmt(t.event.sharedTo, { x: g.name }));
      onClose();
      router.push(`/chat/${r.conversation_id}`);
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
    } finally {
      setBusy(null);
    }
  };
  const toDirect = async (c: any) => {
    setBusy(c.id);
    try {
      await api.post(`/conversations/${c.id}/messages`, { event_id: event.id });
      toast(fmt(t.event.sharedTo, { x: c.other?.display_name ?? '' }));
      onClose();
      router.push(`/chat/${c.id}`);
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
    } finally {
      setBusy(null);
    }
  };
  const external = async () => {
    api.post(`/events/${event.id}/track`, { kind: 'share' }).catch(() => {});
    if (navigator.share) {
      try {
        await navigator.share({ title: event.title, text: `${event.title} su spot.`, url });
        return;
      } catch {}
    }
    await navigator.clipboard?.writeText(url).catch(() => {});
    toast(t.common.copied);
  };
  const activeGroups = (groups ?? []).filter((g) => g.status === 'active' && !g.archived_at);
  const directs = (inbox?.items ?? []).filter((c) => c.type === 'direct' && c.other).slice(0, 6);
  return (
    <Sheet open={open} onClose={onClose} title={t.event.shareTitle}>
      <p className="mb-2 text-sm font-semibold text-muted">{t.event.shareGroups}</p>
      {loading && <Spinner />}
      <div className="space-y-1">
        <button onClick={() => router.push(`/gruppi/nuovo?event=${event.id}`)} className="flex w-full items-center gap-3 rounded-2xl p-2 hover:bg-surface-2">
          <span className="bg-brand flex h-11 w-11 items-center justify-center rounded-2xl text-white">
            <Plus className="h-5 w-5" />
          </span>
          <span className="font-semibold">{t.event.shareNewGroup}</span>
        </button>
        {activeGroups.map((g) => (
          <button key={g.id} onClick={() => toGroup(g)} disabled={!!busy} className="flex w-full items-center gap-3 rounded-2xl p-2 hover:bg-surface-2">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-xl">{g.emoji ?? '👥'}</span>
            <span className="flex-1 text-left">
              <span className="block font-semibold">{g.name}</span>
              <span className="text-xs text-muted">
                {g.member_count} {t.common.people}
              </span>
            </span>
            {busy === g.id ? <Spinner className="h-4 w-4" /> : <Share2 className="h-4 w-4 text-muted" />}
          </button>
        ))}
      </div>
      {directs.length > 0 && (
        <>
          <p className="mb-2 mt-4 text-sm font-semibold text-muted">{t.event.shareDirect}</p>
          <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
            {directs.map((c) => (
              <button key={c.id} onClick={() => toDirect(c)} className="flex w-16 shrink-0 flex-col items-center gap-1">
                <Avatar src={c.other.avatar_url} name={c.other.display_name} size={52} />
                <span className="w-full truncate text-xs">{c.other.display_name.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="soft" icon={<Copy className="h-4 w-4" />} onClick={async () => { await navigator.clipboard?.writeText(url).catch(() => {}); toast(t.common.copied); }}>
          {t.event.shareLink}
        </Button>
        <Button variant="secondary" icon={<Share2 className="h-4 w-4" />} onClick={external}>
          {t.event.shareExternal}
        </Button>
      </div>
    </Sheet>
  );
}

export function AttendeeStack({ people, count }: { people: { user_id: string; avatar_url: string | null; display_name: string }[]; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2.5">
        {people.slice(0, 5).map((p) => (
          <Avatar key={p.user_id} src={p.avatar_url} name={p.display_name} size={32} ring />
        ))}
        {!people.length && (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2">
            <Users className="h-4 w-4 text-muted" />
          </span>
        )}
      </div>
      <span className="text-sm font-medium">{fmt(t.event.attendeesCount, { n: count })}</span>
    </div>
  );
}

export function ContactButton({ slug, eventId, label = t.event.contact }: { slug: string; eventId?: string; label?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={busy}
      icon={<MessageCircle className="h-4 w-4" />}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await api.post(`/businesses/${slug}/contact`, { event_id: eventId });
          router.push(`/chat/${r.conversation_id}`);
        } catch (e: any) {
          toast(errorMessage(e.code), 'error');
          setBusy(false);
        }
      }}
    >
      {label}
    </Button>
  );
}
