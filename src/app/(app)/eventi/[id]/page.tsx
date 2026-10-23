'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { use, useState } from 'react';
import {
  AlertTriangle, Bookmark, CalendarCheck, Check, ChevronRight, Clock, ExternalLink, Eye, EyeOff, Info, ListChecks, Lock, MapPin, Music, Share2, Sofa, Ticket, Users, X,
} from 'lucide-react';
import { api, invalidate, useApi } from '@/lib/api';
import { formatDateLong, formatDay, formatPrice, formatTime } from '@/lib/format';
import { errorMessage, fmt, t } from '@/i18n';
import { useToast } from '@/components/providers';
import { AttendSheet, AttendeeStack, ContactButton, Cover, DateBadge, EventTags, ShareSheet, useSaveToggle } from '@/components/events';
import { Avatar, Badge, Button, Card, cx, ErrorState, IconButton, PageLoader, TopBar, Verified } from '@/components/ui';

const MapView = dynamic(() => import('@/components/map').then((m) => m.MapView), { ssr: false });

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5">
      <span className="mt-0.5 text-purple">{icon}</span>
      <div className="min-w-0 flex-1 text-[15px]">{children}</div>
    </div>
  );
}

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const { data: e, error, loading, reload, mutate } = useApi<any>(`/events/${id}`);
  const [attendOpen, setAttendOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading && !e) return <PageLoader />;
  if (error || !e) return (<><TopBar back /><ErrorState onRetry={reload} message={errorMessage(error?.code)} /></>);

  const attendance = e.my.attendance as null | { status: string; visibility: 'public' | 'private'; confirmation: string | null };
  const going = attendance?.status === 'going';
  const open = e.status === 'published' && !e.is_past;

  const follow = async () => {
    const next = !e.is_following;
    mutate({ ...e, is_following: next, follower_count: e.follower_count + (next ? 1 : -1) });
    try {
      if (next) await api.post(`/businesses/${e.business_slug}/follow`);
      else await api.del(`/businesses/${e.business_slug}/follow`);
    } catch (err: any) {
      toast(errorMessage(err.code), 'error');
      reload();
    }
  };
  const cancelAttendance = async () => {
    setBusy(true);
    try {
      await api.del(`/events/${id}/attend`);
      toast(t.event.cancelToast);
      invalidate('/calendar');
      reload();
    } catch (err: any) {
      toast(errorMessage(err.code), 'error');
    } finally {
      setBusy(false);
    }
  };
  const confirm = async (response: string) => {
    try {
      await api.post(`/events/${id}/confirm`, { response });
      invalidate('/calendar');
      reload();
    } catch (err: any) {
      toast(errorMessage(err.code), 'error');
    }
  };

  return (
    <div className="pb-28">
      <Cover src={e.cover_url} className="relative h-[46vh] max-h-[420px] min-h-[300px]">
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-bg" />
        <TopBar
          back
          transparent
          className="absolute inset-x-0 top-0"
          right={
            <>
              <IconButton label={t.event.share} className="bg-white/80 text-navy backdrop-blur" onClick={() => setShareOpen(true)}>
                <Share2 className="h-5 w-5" />
              </IconButton>
            </>
          }
        />
      </Cover>

      <div className="relative -mt-16 px-4">
        <Card className="animate-pop p-5">
          <div className="flex gap-4">
            <DateBadge date={e.starts_at} className="h-fit bg-primary-soft shadow-none" />
            <div className="min-w-0 flex-1">
              <h1 className={cx('text-2xl font-extrabold leading-tight', e.status === 'cancelled' && 'line-through opacity-70')}>{e.title}</h1>
              <Link href={`/locali/${e.business_slug}`} className="mt-1 flex items-center gap-1 text-[15px] font-medium text-primary-ink">
                <MapPin className="h-4 w-4" /> {e.venue_name} {e.business_verified && <Verified className="h-3.5 w-3.5" />}
              </Link>
              <p className="text-sm text-muted">{e.neighborhood ? `${e.neighborhood} · ` : ''}{e.city_name}</p>
            </div>
          </div>
          <div className="mt-4">
            <EventTags e={e} />
          </div>
          {e.status === 'cancelled' && (
            <p className="mt-4 flex items-center gap-2 rounded-2xl bg-[#fde8e8] p-3 text-sm font-semibold text-[#c0262d] dark:bg-[#3b1418] dark:text-[#ff8a8f]">
              <X className="h-4 w-4" /> {t.event.cancelled}
            </p>
          )}
          {e.status === 'draft' && <p className="mt-4 rounded-2xl bg-[#fff3d6] p-3 text-sm font-semibold text-[#9a6200]">{t.event.draft}</p>}
          {e.is_past && e.status !== 'cancelled' && <p className="mt-4 rounded-2xl bg-surface-2 p-3 text-sm font-semibold text-muted">{t.event.past}</p>}
          {!e.age_ok && (
            <p className="mt-4 flex items-center gap-2 rounded-2xl bg-[#fff3d6] p-3 text-sm font-semibold text-[#9a6200]">
              <AlertTriangle className="h-4 w-4" /> {fmt(t.event.ageRestricted, { n: e.min_age })}
            </p>
          )}

          {/* My participation */}
          {going && !e.is_past && (
            <div className="bg-brand-soft mt-4 flex items-center gap-3 rounded-2xl p-3">
              <CalendarCheck className="h-5 w-5 text-purple" />
              <div className="flex-1 text-sm">
                <p className="font-semibold">{t.event.attending}</p>
                <button onClick={() => setAttendOpen(true)} className="flex items-center gap-1 text-muted underline-offset-2 hover:underline">
                  {attendance!.visibility === 'public' ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  {fmt(t.event.changeVisibility, { v: t.event.visibilityShort[attendance!.visibility] })}
                </button>
              </div>
              <Button size="sm" variant="ghost" loading={busy} onClick={cancelAttendance}>
                {t.event.cancelAttendance}
              </Button>
            </div>
          )}
          {going && e.is_past && (
            <div className="bg-brand-soft mt-4 rounded-2xl p-4">
              {attendance!.confirmation && attendance!.confirmation !== 'skipped' ? (
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Check className="h-4 w-4 text-purple" /> {attendance!.confirmation === 'attended' ? t.event.confirmedYes : t.event.confirmedNo}
                </p>
              ) : (
                <>
                  <p className="font-semibold">{t.event.confirmTitle}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => confirm('attended')}>{t.event.confirmYes}</Button>
                    <Button size="sm" variant="secondary" onClick={() => confirm('not_attended')}>{t.event.confirmNo}</Button>
                    {!attendance!.confirmation && <Button size="sm" variant="ghost" onClick={() => confirm('skipped')}>{t.event.confirmSkip}</Button>}
                  </div>
                </>
              )}
            </div>
          )}
        </Card>

        {/* Requests */}
        {open && (e.guest_list_enabled || e.table_requests_enabled || e.ticket_url) && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {e.guest_list_enabled && (
              <Link href={`/eventi/${id}/lista`} className="flex flex-col gap-1 rounded-2xl bg-surface p-3 shadow-[0_1px_0_var(--line)]">
                <ListChecks className="h-5 w-5 text-purple" />
                <span className="text-sm font-semibold">{t.event.guestList}</span>
                {e.my.guest_list && <Badge tone={e.my.guest_list.status === 'confirmed' ? 'green' : 'amber'}>{t.event.requestStatus[e.my.guest_list.status]}</Badge>}
              </Link>
            )}
            {e.table_requests_enabled && (
              <Link href={`/eventi/${id}/tavolo`} className="flex flex-col gap-1 rounded-2xl bg-surface p-3 shadow-[0_1px_0_var(--line)]">
                <Sofa className="h-5 w-5 text-purple" />
                <span className="text-sm font-semibold">{t.event.table}</span>
                {e.my.table && <Badge tone={e.my.table.status === 'confirmed' ? 'green' : 'amber'}>{t.event.requestStatus[e.my.table.status]}</Badge>}
              </Link>
            )}
            {e.ticket_url && (
              <a
                href={e.ticket_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => api.post(`/events/${id}/track`, { kind: 'ticket_click' }).catch(() => {})}
                className="flex flex-col gap-1 rounded-2xl bg-surface p-3 shadow-[0_1px_0_var(--line)]"
              >
                <Ticket className="h-5 w-5 text-purple" />
                <span className="flex items-center gap-1 text-sm font-semibold">
                  {t.event.tickets} <ExternalLink className="h-3.5 w-3.5" />
                </span>
              </a>
            )}
          </div>
        )}

        {/* Info */}
        <Card className="mt-4">
          <Row icon={<Clock className="h-5 w-5" />}>
            <p className="font-semibold capitalize">{formatDateLong(e.starts_at)}</p>
            <p className="text-muted">
              {formatTime(e.starts_at)} – {formatTime(e.ends_at)}
              {formatDay(e.ends_at) !== formatDay(e.starts_at) && ` (${formatDay(e.ends_at)})`}
            </p>
          </Row>
          <Row icon={<MapPin className="h-5 w-5" />}>
            <p className="font-semibold">{e.venue_name}</p>
            <p className="text-muted">{e.address}</p>
          </Row>
          {e.lineup && (
            <Row icon={<Music className="h-5 w-5" />}>
              <p className="font-semibold">{t.event.lineup}</p>
              <p className="text-muted">{e.lineup}</p>
            </Row>
          )}
          <Row icon={<Ticket className="h-5 w-5" />}>
            <p className="font-semibold">{formatPrice(e)}</p>
            {e.capacity && <p className="text-muted">{fmt(t.event.capacity, { n: e.capacity.toLocaleString('it-IT') })}</p>}
          </Row>
          {e.description && (
            <Row icon={<Info className="h-5 w-5" />}>
              <p className="whitespace-pre-line text-muted">{e.description}</p>
            </Row>
          )}
          {e.rules && (
            <Row icon={<Lock className="h-5 w-5" />}>
              <p className="font-semibold">{t.event.rules}</p>
              <p className="whitespace-pre-line text-muted">{e.rules}</p>
            </Row>
          )}
        </Card>

        {e.lat != null && (
          <div className="mt-4 overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[0_1px_0_var(--line)]">
            <MapView points={[{ id: e.id, lat: e.lat, lng: e.lng, label: e.venue_name }]} className="h-44 w-full" />
            <a href={`https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lng}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between px-4 py-3 text-sm font-semibold text-primary-ink">
              {t.event.openMaps} <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        )}

        {/* Attendees */}
        <Card className="mt-4">
          <Link href={`/eventi/${id}/partecipanti`} className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">{t.event.attendees}</h2>
              <div className="mt-2">
                {e.attendees_restricted ? (
                  <p className="text-sm text-muted">{t.event.attendeesRestricted}</p>
                ) : (
                  <AttendeeStack people={e.attendees} count={e.attendee_count} />
                )}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted" />
          </Link>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
            <Lock className="h-3.5 w-3.5" /> {e.is_past ? t.event.reconnect : t.event.attendeesPrivacy}
          </p>
        </Card>

        {/* Organizer */}
        <Card className="mt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{t.event.organizer}</p>
          <div className="flex items-center gap-3">
            <Link href={`/locali/${e.business_slug}`} className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar src={e.business_logo} name={e.business_name} size={48} className="rounded-2xl" />
              <div className="min-w-0">
                <p className="flex items-center gap-1 font-bold">
                  <span className="truncate">{e.business_name}</span> {e.business_verified && <Verified />}
                </p>
                <p className="text-sm text-muted">
                  {t.businessCategories[e.business_category]} · {e.follower_count} follower
                </p>
              </div>
            </Link>
            <Button size="sm" variant={e.is_following ? 'soft' : 'primary'} onClick={follow}>
              {e.is_following ? t.event.following : t.event.follow}
            </Button>
          </div>
          <div className="mt-3">
            <ContactButton slug={e.business_slug} eventId={e.id} />
          </div>
        </Card>

        {e.other_dates?.length > 0 && (
          <Card className="mt-4">
            <h2 className="mb-2 text-lg font-bold">{t.event.otherDates}</h2>
            <div className="flex flex-wrap gap-2">
              {e.other_dates.map((d: any) => (
                <Link key={d.id} href={`/eventi/${d.id}`} className="rounded-full bg-primary-soft px-3 py-1.5 text-sm font-semibold capitalize text-primary-ink">
                  {formatDay(d.starts_at)}
                </Link>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Sticky actions */}
      {e.status !== 'draft' && <ActionBar e={e} going={going} open={open} onAttend={() => setAttendOpen(true)} onShare={() => setShareOpen(true)} />}

      <AttendSheet
        open={attendOpen}
        onClose={() => setAttendOpen(false)}
        eventId={id}
        current={going ? attendance!.visibility : undefined}
        onDone={() => reload()}
      />
      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} event={e} />
    </div>
  );
}

function ActionBar({ e, going, open, onAttend, onShare }: { e: any; going: boolean; open: boolean; onAttend: () => void; onShare: () => void }) {
  const { saved, toggle, pulse } = useSaveToggle(e.id, e.is_saved);
  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-line bg-surface/95 px-4 pt-3 backdrop-blur-xl">
      <div className="flex gap-2.5">
        <Button variant="secondary" size="lg" onClick={toggle} aria-pressed={saved} icon={<Bookmark key={pulse} className={cx('h-5 w-5', saved && 'animate-heart fill-purple')} />}>
          {saved ? t.event.saved : t.event.save}
        </Button>
        {open && e.age_ok ? (
          going ? (
            <Button size="lg" block variant="soft" icon={<Check className="h-5 w-5" />} onClick={onAttend}>
              {t.event.attending}
            </Button>
          ) : (
            <Button size="lg" block icon={<Users className="h-5 w-5" />} onClick={onAttend}>
              {t.event.attend}
            </Button>
          )
        ) : (
          <Button size="lg" block variant="soft" icon={<Share2 className="h-5 w-5" />} onClick={onShare}>
            {t.event.share}
          </Button>
        )}
      </div>
    </div>
  );
}
