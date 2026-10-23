'use client';
import { useEffect, useState } from 'react';
import { api, useApi } from '@/lib/api';
import { errorMessage, t } from '@/i18n';
import { useToast } from '@/components/providers';
import { Button, Card, Chip, PageLoader, TopBar, Toggle } from '@/components/ui';

export default function NotificationPrefs() {
  const toast = useToast();
  const { data } = useApi<any>('/me/notification-preferences');
  const [p, setP] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setP(data);
  }, [data]);
  if (!p) return <PageLoader />;
  const set = (k: string, v: any) => setP({ ...p, [k]: v });
  const save = async () => {
    setBusy(true);
    try {
      const { user_id, updated_at, marketing_consent, ...body } = p;
      await api.put('/me/notification-preferences', body);
      toast(t.privacy.saved);
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="pb-8">
      <TopBar back title={t.notifPrefs.title} right={<Button size="sm" loading={busy} onClick={save}>{t.common.save}</Button>} />
      <div className="space-y-4 px-4">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t.notifPrefs.transactional}</p>
          <div className="divide-y divide-line">
            <Toggle label={t.notifPrefs.event_reminders} checked={p.event_reminders} onChange={(v) => set('event_reminders', v)} />
            {p.event_reminders && (
              <div className="py-3">
                <p className="mb-2 text-sm font-medium">{t.notifPrefs.reminder_hours}</p>
                <div className="flex gap-2">
                  {[2, 6, 24, 48].map((h) => <Chip key={h} active={p.reminder_hours === h} onClick={() => set('reminder_hours', h)}>{h} h</Chip>)}
                </div>
              </div>
            )}
            <Toggle label={t.notifPrefs.group_activity} checked={p.group_activity} onChange={(v) => set('group_activity', v)} />
            <Toggle label={t.notifPrefs.messages} checked={p.messages} onChange={(v) => set('messages', v)} />
            <Toggle label={t.notifPrefs.request_updates} checked={p.request_updates} onChange={(v) => set('request_updates', v)} />
            <Toggle label={t.notifPrefs.suggestions} checked={p.suggestions} onChange={(v) => set('suggestions', v)} />
          </div>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t.notifPrefs.promotional}</p>
          <Toggle label={t.notifPrefs.promotionalLabel} description={t.notifPrefs.promotionalDesc} checked={p.promotional} onChange={(v) => set('promotional', v)} />
          {p.promotional && (
            <div className="pb-2">
              <p className="mb-2 text-sm font-medium">{t.notifPrefs.maxPerWeek}</p>
              <div className="flex gap-2">
                {[1, 3, 5, 10].map((n) => <Chip key={n} active={p.max_promotional_per_week === n} onClick={() => set('max_promotional_per_week', n)}>{n}</Chip>)}
              </div>
            </div>
          )}
        </Card>
        <p className="px-1 text-xs text-muted">{t.notifPrefs.pushNote}</p>
      </div>
    </div>
  );
}
