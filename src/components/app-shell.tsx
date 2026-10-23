'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Bell, CalendarDays, Compass, Home, MessageCircle, User } from 'lucide-react';
import { t } from '@/i18n';
import { RealtimeProvider, SessionProvider, useRealtime, useSession } from './providers';
import { cx, Spinner } from './ui';

const TABS = [
  { href: '/home', label: t.nav.home, icon: Home },
  { href: '/esplora', label: t.nav.explore, icon: Compass },
  { href: '/calendario', label: t.nav.calendar, icon: CalendarDays },
  { href: '/chat', label: t.nav.chat, icon: MessageCircle },
  { href: '/profilo', label: t.nav.profile, icon: User },
];

function BottomNav() {
  const path = usePathname();
  const { unread } = useRealtime();
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-line bg-surface/90 backdrop-blur-xl" aria-label="Navigazione principale">
      <ul className="flex">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(href + '/');
          const badge = href === '/chat' ? unread.chats : 0;
          return (
            <li key={href} className="flex-1">
              <Link href={href} className={cx('relative flex flex-col items-center gap-0.5 pb-1 pt-2 text-[11px] font-medium transition', active ? 'text-purple' : 'text-muted')} aria-current={active ? 'page' : undefined}>
                <span className={cx('flex h-8 w-12 items-center justify-center rounded-full transition', active && 'bg-primary-soft')}>
                  <Icon className={cx('h-[22px] w-[22px]', active && 'stroke-[2.4]')} />
                </span>
                {label}
                {badge > 0 && <span className="absolute right-[calc(50%-22px)] top-1.5 min-w-4 rounded-full bg-coral px-1 text-[10px] font-bold leading-4 text-white">{badge}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Gate({ children, hideNav }: { children: ReactNode; hideNav: boolean }) {
  const { me, loading } = useSession();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (!me) return;
    if (me.user.account_type === 'business') router.replace('/business');
    else if (!me.user.onboarding_completed_at && !path.startsWith('/onboarding')) router.replace('/onboarding');
  }, [me, path, router]);
  if (loading && !me) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }
  return (
    <RealtimeProvider enabled={!!me && me.user.account_type === 'personal'}>
      <main className={cx('min-h-dvh', !hideNav && 'pb-24')}>{children}</main>
      {!hideNav && <BottomNav />}
    </RealtimeProvider>
  );
}

/** Mobile-first app column; on desktop it is centered like a phone. */
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const hideNav = /^\/(chat\/|onboarding|gruppi\/nuovo|eventi\/)/.test(path);
  return (
    <div className="app-backdrop min-h-dvh">
      <div className="relative mx-auto min-h-dvh max-w-[480px] bg-bg shadow-[0_0_80px_-30px_rgb(139_66_245/.35)]">
        <SessionProvider>
          <Gate hideNav={hideNav}>{children}</Gate>
        </SessionProvider>
      </div>
    </div>
  );
}

export function NotificationBell() {
  const { unread } = useRealtime();
  return (
    <Link href="/notifiche" aria-label={t.nav.notifications} className="relative flex h-10 w-10 items-center justify-center rounded-full bg-surface shadow-[0_1px_0_var(--line)]">
      <Bell className="h-5 w-5" />
      {unread.notifications > 0 && (
        <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-coral px-1 text-center text-[10px] font-bold leading-5 text-white ring-2 ring-bg">{unread.notifications}</span>
      )}
    </Link>
  );
}
