import Link from 'next/link';
import { Bell, CalendarHeart, MessageCircle, Search, Users } from 'lucide-react';
import { AppIcon, Logo } from '@/components/ui';
import { t } from '@/i18n';

const ICONS = [Search, Users, CalendarHeart, MessageCircle];
const TINTS = ['bg-[#efe0ff] text-[#8b42f5]', 'bg-[#fff1cc] text-[#c27c00]', 'bg-[#ffe1dc] text-[#e05a43]', 'bg-[#e6ecff] text-[#4d6bff]'];

export default function Welcome() {
  return (
    <div className="flex min-h-dvh flex-col px-6 pb-8 pt-10">
      <div className="flex items-center gap-3">
        <AppIcon className="h-12 w-12" />
        <Logo size="lg" />
      </div>
      <p className="mt-2 text-xs font-semibold tracking-[0.35em] text-muted">EVENTS BRING PEOPLE TOGETHER</p>

      <div className="relative mt-8 overflow-hidden rounded-[2rem]">
        <div className="grid grid-cols-3 gap-2">
          {['techno-1', 'brunch-1', 'beach-1', 'aperitivo-1', 'concert-1', 'festival-1'].map((c, i) => (
            <img key={c} src={`/demo/covers/${c}.svg`} alt="" className={`h-28 w-full rounded-2xl object-cover ${i % 2 ? 'translate-y-4' : ''}`} />
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg to-transparent" />
      </div>

      <h1 className="mt-6 text-3xl font-extrabold leading-tight">{t.welcome.title}</h1>
      <p className="mt-2 text-muted">{t.welcome.subtitle}</p>

      <ul className="mt-6 grid grid-cols-2 gap-3">
        {t.welcome.features.map(([title, desc], i) => {
          const Icon = ICONS[i];
          return (
            <li key={title} className="rounded-2xl bg-surface p-3 shadow-[0_1px_0_var(--line)]">
              <span className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl ${TINTS[i]}`}>
                <Icon className="h-5 w-5" />
              </span>
              <p className="text-sm font-bold">{title}</p>
              <p className="text-xs text-muted">{desc}</p>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto space-y-3 pt-8">
        <Link href="/registrati" className="bg-brand flex h-14 items-center justify-center rounded-full text-base font-semibold text-white shadow-[var(--shadow-pop)]">
          {t.welcome.start}
        </Link>
        <Link href="/accedi" className="flex h-14 items-center justify-center rounded-full bg-surface text-base font-semibold text-primary-ink ring-1 ring-inset ring-[color:var(--lavender)]">
          {t.welcome.haveAccount}
        </Link>
        <Link href="/registrati?type=business" className="flex items-center justify-center gap-1.5 pt-1 text-sm font-medium text-muted underline-offset-4 hover:underline">
          <Bell className="h-4 w-4" /> {t.welcome.business}
        </Link>
      </div>
    </div>
  );
}
