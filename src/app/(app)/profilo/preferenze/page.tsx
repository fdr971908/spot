'use client';
import { useEffect, useState } from 'react';
import { api, invalidate, useApi } from '@/lib/api';
import { errorMessage, t } from '@/i18n';
import { useToast } from '@/components/providers';
import { CategoryPicker, GenrePicker, SocialPrefs, type Prefs } from '@/components/preferences-form';
import { Button, Card, PageLoader, TopBar } from '@/components/ui';

export default function Preferences() {
  const toast = useToast();
  const { data } = useApi<Prefs>('/me/preferences');
  const [p, setP] = useState<Prefs | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setP(data);
  }, [data]);
  if (!p) return <PageLoader />;
  const save = async () => {
    setBusy(true);
    try {
      await api.put('/me/preferences', p);
      invalidate('/feed');
      toast(t.privacy.saved);
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="pb-8">
      <TopBar back title={t.profile.menu.interests} right={<Button size="sm" loading={busy} onClick={save}>{t.common.save}</Button>} />
      <div className="space-y-4 px-4">
        <Card>
          <p className="mb-3 font-bold">{t.onboarding.musicTitle}</p>
          <GenrePicker value={p.genres} onChange={(genres) => setP({ ...p, genres })} />
        </Card>
        <Card>
          <p className="mb-3 font-bold">{t.onboarding.activityTitle}</p>
          <CategoryPicker value={p.categories} onChange={(categories) => setP({ ...p, categories })} />
        </Card>
        <Card>
          <p className="mb-3 font-bold">{t.onboarding.socialTitle}</p>
          <SocialPrefs value={p} onChange={setP} />
        </Card>
      </div>
    </div>
  );
}
