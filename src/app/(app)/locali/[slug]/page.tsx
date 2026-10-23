'use client';
import { use, useState } from 'react';
import { Clock, ExternalLink, Globe, MapPin, Phone } from 'lucide-react';
import dynamic from 'next/dynamic';
import { api, useApi } from '@/lib/api';
import { compact } from '@/lib/format';
import { errorMessage, t } from '@/i18n';
import { useToast } from '@/components/providers';
import { ContactButton, Cover, EventCard, EventRow } from '@/components/events';
import { Avatar, Badge, Button, Card, ErrorState, PageLoader, Segmented, TopBar, Verified, Instagram } from '@/components/ui';

const MapView = dynamic(() => import('@/components/map').then((m) => m.MapView), { ssr: false });

export default function BusinessProfile({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const toast = useToast();
  const { data, error, loading, reload, mutate } = useApi<any>(`/businesses/${slug}`);
  const [tab, setTab] = useState<'events' | 'info'>('events');
  if (loading && !data) return <PageLoader />;
  if (error || !data) return (<><TopBar back /><ErrorState onRetry={reload} message={errorMessage(error?.code)} /></>);
  const b = data.business;
  const follow = async () => {
    const next = !b.is_following;
    mutate({ ...data, business: { ...b, is_following: next, follower_count: b.follower_count + (next ? 1 : -1) } });
    try {
      if (next) await api.post(`/businesses/${slug}/follow`);
      else await api.del(`/businesses/${slug}/follow`);
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
      reload();
    }
  };
  return (
    <div className="pb-8">
      <Cover src={b.cover_url} className="h-56">
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-bg" />
        <TopBar back transparent className="absolute inset-x-0 top-0" />
      </Cover>
      <div className="relative -mt-14 px-4">
        <div className="flex items-end gap-3">
          <Avatar src={b.logo_url} name={b.name} size={88} className="rounded-[1.75rem] ring-4 ring-bg" />
          <div className="pb-1">
            <div className="flex gap-1.5">
              {b.is_demo && <Badge tone="amber">{t.common.demoBadge}</Badge>}
              <Badge tone="purple">{t.businessCategories[b.category]}</Badge>
            </div>
          </div>
        </div>
        <h1 className="mt-3 flex items-center gap-1.5 text-2xl font-extrabold">
          {b.name} {b.verified ? <Verified className="h-5 w-5" /> : <Badge>{t.common.pendingVerification}</Badge>}
        </h1>
        <p className="flex items-center gap-1 text-sm text-muted"><MapPin className="h-4 w-4" /> {b.neighborhood ? `${b.neighborhood} · ` : ''}{b.city_name}</p>
        <div className="mt-4 grid grid-cols-3 rounded-3xl bg-surface p-3 text-center shadow-[0_1px_0_var(--line)]">
          <div><p className="text-xl font-extrabold">{compact(b.follower_count)}</p><p className="text-xs text-muted">follower</p></div>
          <div><p className="text-xl font-extrabold">{data.upcoming.length}</p><p className="text-xs text-muted">in arrivo</p></div>
          <div><p className="text-xl font-extrabold">{data.past.length}</p><p className="text-xs text-muted">passati</p></div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" variant={b.is_following ? 'soft' : 'primary'} onClick={follow}>{b.is_following ? t.event.following : t.event.follow}</Button>
          <ContactButton slug={slug} label={t.profile.message} />
          {b.website && (
            <a href={b.website} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="secondary" icon={<Globe className="h-4 w-4" />} aria-label={t.business.website}> </Button>
            </a>
          )}
        </div>
        <Segmented className="mt-5" value={tab} onChange={setTab} options={[{ value: 'events', label: 'Eventi' }, { value: 'info', label: t.event.info }]} />
        {tab === 'events' ? (
          <div className="mt-4 space-y-4">
            {!data.upcoming.length && <p className="py-6 text-center text-sm text-muted">Nessun evento in programma.</p>}
            {data.upcoming.map((e: any) => <EventCard key={e.id} e={e} />)}
            {data.past.length > 0 && (
              <Card className="p-2">
                <p className="px-2 pt-2 font-bold">Eventi passati</p>
                {data.past.map((e: any) => <EventRow key={e.id} e={e} />)}
              </Card>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {b.description && <Card><p className="whitespace-pre-line text-[15px]">{b.description}</p></Card>}
            <Card className="space-y-3 text-[15px]">
              <p className="flex gap-2"><MapPin className="h-5 w-5 shrink-0 text-purple" /> {b.address}</p>
              {Object.keys(b.opening_hours ?? {}).length > 0 && (
                <div className="flex gap-2">
                  <Clock className="h-5 w-5 shrink-0 text-purple" />
                  <ul>{Object.entries(b.opening_hours).map(([d, h]) => <li key={d}><span className="font-semibold capitalize">{d}</span> {h as string}</li>)}</ul>
                </div>
              )}
              {b.instagram && <a className="flex gap-2" href={`https://instagram.com/${b.instagram}`} target="_blank" rel="noopener noreferrer"><Instagram className="h-5 w-5 text-purple" /> @{b.instagram}</a>}
              {b.phone && <a className="flex gap-2" href={`tel:${b.phone}`}><Phone className="h-5 w-5 text-purple" /> {b.phone}</a>}
              {b.website && <a className="flex gap-2" href={b.website} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-5 w-5 text-purple" /> {b.website.replace(/^https?:\/\//, '')}</a>}
            </Card>
            {b.lat != null && <div className="overflow-hidden rounded-3xl"><MapView points={[{ id: b.id, lat: b.lat, lng: b.lng, label: b.name }]} className="h-48 w-full" /></div>}
          </div>
        )}
      </div>
    </div>
  );
}
