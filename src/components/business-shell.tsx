'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { BarChart3, CalendarDays, Home, ListChecks, LogOut, Megaphone, MessageCircle, Settings, Sofa, Store } from 'lucide-react';
import { t } from '@/i18n';
import { logout, SessionProvider, useSession } from './providers';
import { Avatar, Badge, cx, Logo, Spinner } from './ui';

const NAV = [
  { href: '/business', key: 'overview', icon: Home },
  { href: '/business/eventi', key: 'events', icon: CalendarDays },
  { href: '/business/liste', key: 'guestLists', icon: ListChecks },
  { href: '/business/tavoli', key: 'tables', icon: Sofa },
  { href: '/business/messaggi', key: 'messages', icon: MessageCircle },
  { href: '/business/campagne', key: 'campaigns', icon: Megaphone },
  { href: '/business/analytics', key: 'analytics', icon: BarChart3 },
  { href: '/business/profilo', key: 'profile', icon: Store },
  { href: '/business/impostazioni', key: 'settings', icon: Settings },
];

type Biz = { id: string; slug: string; name: string; logo_url: string | null; verification_status: string; is_demo: boolean; role: string };
const BizCtx = createContext<Biz | null>(null);
export const useBiz = () => useContext(BizCtx)!;

function Inner({ children }: { children: ReactNode }) {
  const { me, loading } = useSession();
  const router = useRouter();
  const path = usePathname();
  const onRegister = path === '/business/registrati';
  useEffect(() => {
    if (!me) return;
    if (me.user.account_type !== 'business') router.replace('/home');
    else if (!me.businesses.length && !onRegister) router.replace('/business/registrati');
  }, [me, onRegister, router]);
  if (loading && !me) return <div className="flex min-h-dvh items-center justify-center"><Spinner /></div>;
  if (onRegister) return <>{children}</>;
  const biz = me?.businesses[0];
  if (!biz) return <div className="flex min-h-dvh items-center justify-center"><Spinner /></div>;
  return (
    <BizCtx.Provider value={biz}>
      <div className="min-h-dvh bg-bg lg:flex">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface p-4 lg:flex">
          <div className="flex items-center gap-2 px-2"><Logo size="sm" /><Badge tone="purple">Business</Badge></div>
          <div className="mt-6 flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
            <Avatar src={biz.logo_url} name={biz.name} size={40} className="rounded-xl" />
            <div className="min-w-0"><p className="truncate font-semibold">{biz.name}</p><p className="text-xs text-muted">{t.business.roles[biz.role]}</p></div>
          </div>
          <nav className="mt-4 flex-1 space-y-1">
            {NAV.map(({ href, key, icon: Icon }) => {
              const active = href === '/business' ? path === href : path.startsWith(href);
              return (
                <Link key={href} href={href} className={cx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition', active ? 'bg-primary-soft text-primary-ink' : 'text-muted hover:bg-surface-2 hover:text-ink')}>
                  <Icon className="h-5 w-5" /> {t.business.nav[key]}
                </Link>
              );
            })}
          </nav>
          <button onClick={logout} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted hover:bg-surface-2"><LogOut className="h-5 w-5" /> {t.auth.logout}</button>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-xl lg:hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2"><Logo size="sm" /><Badge tone="purple">Business</Badge></div>
              <button onClick={logout} aria-label={t.auth.logout} className="p-2 text-muted"><LogOut className="h-5 w-5" /></button>
            </div>
            <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2">
              {NAV.map(({ href, key }) => {
                const active = href === '/business' ? path === href : path.startsWith(href);
                return <Link key={href} href={href} className={cx('shrink-0 rounded-full px-3 py-1.5 text-sm font-medium', active ? 'bg-purple text-white' : 'bg-surface-2')}>{t.business.nav[key]}</Link>;
              })}
            </nav>
          </header>
          <main className="mx-auto max-w-6xl p-4 lg:p-8">
            {biz.is_demo && <p className="mb-4 rounded-2xl bg-[#fff3d6] px-4 py-3 text-sm font-medium text-[#9a6200]">⚠️ {t.business.demoBanner}</p>}
            {biz.verification_status === 'pending' && <p className="mb-4 rounded-2xl bg-primary-soft px-4 py-3 text-sm text-primary-ink">{t.business.pendingBanner}</p>}
            {children}
          </main>
        </div>
      </div>
    </BizCtx.Provider>
  );
}

export function BusinessShell({ children }: { children: ReactNode }) {
  return <SessionProvider><Inner>{children}</Inner></SessionProvider>;
}

export function PageHead({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-extrabold lg:text-3xl">{title}</h1>{action}</div>;
}

export function Kpi({ label, value, sub, tone = 'default' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'default' | 'brand' }) {
  return (
    <div className={cx('rounded-3xl p-4 shadow-[0_1px_0_var(--line)]', tone === 'brand' ? 'bg-brand text-white' : 'bg-surface')}>
      <p className={cx('text-xs font-semibold', tone === 'brand' ? 'text-white/80' : 'text-muted')}>{label}</p>
      <p className="mt-1 text-3xl font-extrabold">{value}</p>
      {sub && <p className={cx('mt-0.5 text-xs', tone === 'brand' ? 'text-white/80' : 'text-muted')}>{sub}</p>}
    </div>
  );
}

/** Minimal dependency-free line/area chart. */
export function SparkArea({ values, labels, height = 160, color = '#8B42F5' }: { values: number[]; labels?: string[]; height?: number; color?: string }) {
  const w = 600, h = height, max = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * w, h - 8 - (v / max) * (h - 24)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none" style={{ height }} role="img" aria-label="grafico">
        <defs><linearGradient id={`g${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        <path d={`${line} L${w},${h} L0,${h}Z`} fill={`url(#g${color.slice(1)})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {labels && <div className="mt-1 flex justify-between text-[10px] text-muted"><span>{labels[0]}</span><span>{labels[Math.floor(labels.length / 2)]}</span><span>{labels[labels.length - 1]}</span></div>}
    </div>
  );
}
