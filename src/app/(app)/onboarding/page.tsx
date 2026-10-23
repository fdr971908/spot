'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Eye, Lock } from 'lucide-react';
import { api } from '@/lib/api';
import { errorMessage, fmt, t } from '@/i18n';
import { useSession, useToast } from '@/components/providers';
import { CategoryPicker, GenrePicker, SocialPrefs, type Prefs } from '@/components/preferences-form';
import { Button, cx, IconButton, Logo } from '@/components/ui';
import { ChevronLeft } from 'lucide-react';

const TOTAL = 5; // registration counts as step 1

export default function Onboarding() {
  const router = useRouter();
  const toast = useToast();
  const { me, reload } = useSession();
  const [step, setStep] = useState(2);
  const [busy, setBusy] = useState(false);
  const [isPrivate, setPrivate] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({ genres: [], categories: [], group_size: null, venue_size: 'any', setting: 'any', price_max: null, max_distance_km: 25, preferred_days: [5, 6] });

  useEffect(() => {
    if (me?.profile) setPrivate(me.profile.is_private);
  }, [me]);

  const finish = async () => {
    setBusy(true);
    try {
      await api.put('/me/preferences', { ...prefs, complete_onboarding: true });
      await api.put('/me/privacy', { is_private: isPrivate, dm_policy: me?.profile?.dm_policy ?? 'connections' });
      await reload();
      router.replace('/home');
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
      setBusy(false);
    }
  };

  const steps: Record<number, { title: string; subtitle: string; body: React.ReactNode; canNext: boolean }> = {
    2: { title: t.onboarding.musicTitle, subtitle: t.onboarding.musicSubtitle, body: <GenrePicker value={prefs.genres} onChange={(genres) => setPrefs({ ...prefs, genres })} />, canNext: prefs.genres.length > 0 },
    3: { title: t.onboarding.activityTitle, subtitle: t.onboarding.activitySubtitle, body: <CategoryPicker value={prefs.categories} onChange={(categories) => setPrefs({ ...prefs, categories })} />, canNext: prefs.categories.length > 0 },
    4: { title: t.onboarding.socialTitle, subtitle: t.onboarding.socialSubtitle, body: <SocialPrefs value={prefs} onChange={setPrefs} />, canNext: true },
    5: {
      title: t.onboarding.privacyTitle,
      subtitle: t.onboarding.privacySubtitle,
      canNext: true,
      body: (
        <div className="space-y-3">
          {[
            { v: false, icon: <Eye className="h-5 w-5" />, title: t.onboarding.publicProfile, desc: t.onboarding.publicProfileDesc },
            { v: true, icon: <Lock className="h-5 w-5" />, title: t.onboarding.privateProfile, desc: t.onboarding.privateProfileDesc },
          ].map((o) => (
            <button key={String(o.v)} onClick={() => setPrivate(o.v)} className={cx('flex w-full items-start gap-3 rounded-2xl p-4 text-left ring-2 transition', isPrivate === o.v ? 'bg-primary-soft ring-purple' : 'bg-surface-2 ring-transparent')}>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-primary-ink">{o.icon}</span>
              <span>
                <span className="block font-semibold">{o.title}</span>
                <span className="text-sm text-muted">{o.desc}</span>
              </span>
            </button>
          ))}
          <div className="bg-brand-soft mt-4 rounded-2xl p-4 text-sm">
            <p className="font-semibold">🔒 {t.privacy.attendanceTitle}</p>
            <p className="mt-1 text-muted">{t.onboarding.attendanceNote}</p>
          </div>
        </div>
      ),
    },
  };
  const s = steps[step];

  return (
    <div className="flex min-h-dvh flex-col px-5 pb-6">
      <header className="flex h-14 items-center gap-2">
        {step > 2 ? (
          <IconButton label={t.common.back} onClick={() => setStep(step - 1)}>
            <ChevronLeft className="h-5 w-5" />
          </IconButton>
        ) : (
          <Logo size="sm" className="ml-1" />
        )}
        <div className="flex flex-1 justify-center gap-1.5">
          {Array.from({ length: TOTAL }, (_, i) => (
            <span key={i} className={cx('h-1.5 w-8 rounded-full transition', i < step ? 'bg-purple' : 'bg-line')} />
          ))}
        </div>
        <span className="w-10 text-right text-xs font-semibold text-muted">{step}/{TOTAL}</span>
      </header>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-purple">{fmt(t.onboarding.step, { n: step, total: TOTAL })}</p>
      <h1 className="mt-1 text-[28px] font-extrabold leading-tight">{s.title}</h1>
      <p className="mt-1 text-muted">{s.subtitle}</p>
      <div key={step} className="animate-pop mt-6 flex-1">
        {s.body}
      </div>
      <div className="pb-safe sticky bottom-0 z-10 mt-6 flex gap-3 bg-bg pt-3">
        {step < 5 && step > 3 && (
          <Button variant="ghost" onClick={() => setStep(step + 1)}>
            {t.onboarding.skip}
          </Button>
        )}
        <Button block size="lg" disabled={!s.canNext} loading={busy} onClick={() => (step < 5 ? setStep(step + 1) : finish())}>
          {step < 5 ? t.common.next : t.onboarding.finish}
        </Button>
      </div>
    </div>
  );
}
