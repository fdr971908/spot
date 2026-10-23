'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppIcon, Logo } from '@/components/ui';
import { t } from '@/i18n';

/** Splash: checks the session and routes to the right place. */
export default function Splash() {
  const router = useRouter();
  useEffect(() => {
    const go = async () => {
      const started = Date.now();
      let dest = '/benvenuto';
      try {
        const res = await fetch('/api/me');
        if (res.ok) {
          const me = await res.json();
          dest = me.user.account_type === 'business' ? '/business' : me.user.onboarding_completed_at ? '/home' : '/onboarding';
        }
      } catch {}
      setTimeout(() => router.replace(dest), Math.max(0, 900 - (Date.now() - started)));
    };
    go();
  }, [router]);
  return (
    <div className="bg-brand flex min-h-dvh flex-col items-center justify-center text-white">
      <div className="animate-pop flex flex-col items-center">
        <AppIcon className="h-20 w-20 bg-white/15 ring-1 ring-white/30" />
        <span className="mt-6 text-6xl font-extrabold tracking-tight">
          spot<span className="animate-dot inline-block text-pink">.</span>
        </span>
        <p className="mt-3 text-sm font-medium tracking-[0.3em] text-white/85">GOOD PLANS. GREAT PEOPLE.</p>
      </div>
      <p className="absolute bottom-10 text-xs text-white/70">{t.splash.loading}</p>
    </div>
  );
}
