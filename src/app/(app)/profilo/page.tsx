'use client';
import Link from 'next/link';
import { Bell, Bookmark, Heart, History, ListChecks, Lock, Music2, Palette, Settings, Shield, SlidersHorizontal, Sparkles, UserCircle } from 'lucide-react';
import { useApi } from '@/lib/api';
import { fmt, t } from '@/i18n';
import { logout, useSession } from '@/components/providers';
import { Avatar, Badge, Button, Card, LinkRow, PageLoader, Instagram } from '@/components/ui';

export default function Profile() {
  const { me } = useSession();
  const year = new Date().getFullYear();
  const { data: recap } = useApi<any>(`/me/recap?year=${year}`);
  if (!me?.profile) return <PageLoader />;
  const p = me.profile;
  return (
    <div className="pb-6">
      <header className="flex items-center justify-between px-4 pt-3">
        <Link href="/profilo/account" aria-label={t.profile.menu.appearance} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-2">
          <Palette className="h-5 w-5" />
        </Link>
        <Link href="/profilo/privacy" aria-label={t.profile.menu.privacy} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-2">
          <Settings className="h-5 w-5" />
        </Link>
      </header>
      <div className="flex flex-col items-center px-4 text-center">
        <div className="bg-brand rounded-full p-1">
          <Avatar src={p.avatar_url} name={p.display_name} size={104} className="ring-4 ring-bg" />
        </div>
        <h1 className="mt-3 text-2xl font-extrabold">{p.display_name}</h1>
        <p className="text-muted">@{p.username}</p>
        <div className="mt-1.5 flex gap-1.5">
          {p.is_private && <Badge><Lock className="h-3 w-3" /> {t.profile.private}</Badge>}
          {p.city_name && <Badge tone="purple">{p.city_name}</Badge>}
        </div>
        {p.bio && <p className="mt-3 max-w-xs text-[15px]">{p.bio}</p>}
        {me.social.filter((s) => s.is_visible).length > 0 && (
          <div className="mt-3 flex gap-2">
            {me.social.filter((s) => s.is_visible).map((s) => (
              <a key={s.platform} href={s.platform === 'instagram' ? `https://instagram.com/${s.handle}` : `https://tiktok.com/@${s.handle}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 text-sm font-medium">
                {s.platform === 'instagram' ? <Instagram className="h-4 w-4" /> : <Music2 className="h-4 w-4" />} {s.handle}
              </a>
            ))}
          </div>
        )}
        <div className="mt-5 grid w-full grid-cols-3 rounded-3xl bg-surface p-3 shadow-[0_1px_0_var(--line)]">
          {[
            [me.stats?.events_attended ?? 0, t.profile.events],
            [me.stats?.venues_visited ?? 0, t.profile.venues],
            [me.stats?.groups ?? 0, t.profile.groups],
          ].map(([n, l]) => (
            <div key={l as string}>
              <p className="text-2xl font-extrabold">{n}</p>
              <p className="text-xs text-muted">{l}</p>
            </div>
          ))}
        </div>
        <Link href="/profilo/modifica" className="mt-3 w-full">
          <Button variant="secondary" block>{t.profile.editProfile}</Button>
        </Link>
        <p className="mt-2 flex items-center gap-1 text-xs text-muted"><Lock className="h-3 w-3" /> {t.profile.publicNote}</p>
      </div>

      <div className="mt-6 px-4">
        <h2 className="mb-3 text-lg font-bold">{fmt(t.profile.myYear, { y: year })}</h2>
        <Link href="/profilo/recap" className="bg-brand relative block overflow-hidden rounded-[1.75rem] p-5 text-white shadow-[var(--shadow-pop)]">
          <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/15" />
          <div className="absolute -bottom-10 right-10 h-24 w-24 rounded-full bg-pink/40" />
          <Sparkles className="h-6 w-6" />
          <p className="mt-2 text-xl font-extrabold leading-tight">{t.profile.recapCta}</p>
          <div className="mt-4 flex gap-6">
            <div><p className="text-3xl font-extrabold">{recap?.confirmed_events ?? '–'}</p><p className="text-xs text-white/80">{t.recap.confirmed}</p></div>
            <div><p className="text-3xl font-extrabold">{recap?.venues_count ?? '–'}</p><p className="text-xs text-white/80">{t.recap.venues}</p></div>
          </div>
          {recap?.top_venues?.length > 0 && (
            <ol className="mt-4 space-y-0.5 text-sm">
              {recap.top_venues.slice(0, 3).map((v: any, i: number) => <li key={v.slug}>{i + 1}. {v.name}</li>)}
            </ol>
          )}
        </Link>
      </div>

      <Card className="mx-4 mt-6 p-2">
        <LinkRow href="/calendario?view=saved" icon={<Bookmark className="h-5 w-5" />} label={t.profile.menu.saved} />
        <LinkRow href="/profilo/storico" icon={<History className="h-5 w-5" />} label={t.profile.menu.history} />
        <LinkRow href="/profilo/richieste" icon={<ListChecks className="h-5 w-5" />} label={t.profile.menu.requests} />
        <LinkRow href="/profilo/seguiti" icon={<Heart className="h-5 w-5" />} label={t.profile.menu.follows} value={me.stats?.following} />
        <LinkRow href="/profilo/preferenze" icon={<SlidersHorizontal className="h-5 w-5" />} label={t.profile.menu.interests} />
        <LinkRow href="/profilo/privacy" icon={<Shield className="h-5 w-5" />} label={t.profile.menu.privacy} />
        <LinkRow href="/profilo/notifiche" icon={<Bell className="h-5 w-5" />} label={t.profile.menu.notifications} />
        <LinkRow href="/profilo/account" icon={<UserCircle className="h-5 w-5" />} label={t.profile.menu.data} />
      </Card>
      <div className="mt-4 px-4">
        <Button variant="ghost" block onClick={logout}>{t.auth.logout}</Button>
      </div>
    </div>
  );
}
