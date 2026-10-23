'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api, invalidate, useApi } from '@/lib/api';
import { formatDay, formatTime } from '@/lib/format';
import { errorMessage, t } from '@/i18n';
import { useToast } from '@/components/providers';
import { UserPicker, type PickedUser } from '@/components/user-picker';
import { Button, Card, cx, Field, Input, TopBar } from '@/components/ui';

const EMOJIS = ['🎉', '🪩', '🍹', '🥞', '🎪', '🏖️', '🎤', '🌿', '🍕', '💜'];

function CreateGroupInner() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const eventId = params.get('event');
  const { data: ev } = useApi<any>(eventId ? `/events/${eventId}` : null);
  const [kind, setKind] = useState<'permanent' | 'spot'>(eventId ? 'spot' : 'permanent');
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(eventId ? '🪩' : '🎉');
  const [people, setPeople] = useState<PickedUser[]>([]);
  const [busy, setBusy] = useState(false);
  const effectiveName = name || (kind === 'spot' && ev ? `Spot · ${ev.title}`.slice(0, 60) : '');

  const create = async () => {
    setBusy(true);
    try {
      const r = await api.post('/groups', { name: effectiveName, kind, emoji, event_id: eventId ?? undefined, invite_ids: people.map((p) => p.user_id) });
      invalidate('/conversations');
      invalidate('/groups');
      router.replace(`/chat/${r.conversation_id}`);
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar back title={t.groups.createTitle} />
      <div className="flex-1 space-y-5 px-4 pb-4">
        <div className="grid grid-cols-2 gap-2">
          {(['permanent', 'spot'] as const).map((k) => (
            <button
              key={k}
              disabled={k === 'spot' && !eventId}
              onClick={() => setKind(k)}
              className={cx('rounded-2xl p-3 text-left ring-2 transition disabled:opacity-40', kind === k ? 'bg-primary-soft ring-purple' : 'bg-surface-2 ring-transparent')}
            >
              <p className="font-semibold">{k === 'permanent' ? t.groups.kindPermanent : t.groups.kindSpot}</p>
              <p className="mt-0.5 text-xs text-muted">{k === 'permanent' ? t.groups.kindPermanentDesc : t.groups.kindSpotDesc}</p>
            </button>
          ))}
        </div>
        {ev && (
          <Card className="flex items-center gap-3 p-3">
            <img src={ev.cover_url} alt="" className="h-12 w-12 rounded-xl object-cover" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{ev.title}</p>
              <p className="text-xs capitalize text-muted">{formatDay(ev.starts_at)} · {formatTime(ev.starts_at)} · {ev.venue_name}</p>
            </div>
          </Card>
        )}
        <Field label={t.groups.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'spot' && ev ? `Spot · ${ev.title}` : t.groups.namePlaceholder} maxLength={60} />
        </Field>
        <div>
          <p className="mb-2 text-sm font-semibold">{t.groups.emoji}</p>
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => setEmoji(e)} className={cx('flex h-11 w-11 items-center justify-center rounded-2xl text-2xl ring-2 transition', emoji === e ? 'bg-primary-soft ring-purple' : 'bg-surface-2 ring-transparent')}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">{t.groups.invite}</p>
          <UserPicker value={people} onChange={setPeople} />
        </div>
      </div>
      <div className="pb-safe sticky bottom-0 z-10 bg-bg px-4 pt-3">
        <Button block size="lg" loading={busy} disabled={effectiveName.trim().length < 2} onClick={create}>
          {t.groups.create}
        </Button>
      </div>
    </div>
  );
}

export default function CreateGroup() {
  return (
    <Suspense>
      <CreateGroupInner />
    </Suspense>
  );
}
