'use client';
import { useEffect, useState } from 'react';
import { Lock, Music2 } from 'lucide-react';
import { api, useApi } from '@/lib/api';
import { errorMessage, t } from '@/i18n';
import { useSession, useToast } from '@/components/providers';
import { Avatar, Button, Card, Chip, Input, TopBar, Toggle, Instagram } from '@/components/ui';

type Link = { handle: string; is_visible: boolean } | null;

export default function Privacy() {
  const { me, setMe } = useSession();
  const toast = useToast();
  const { data: blocks, reload: reloadBlocks } = useApi<any[]>('/me/blocks');
  const [isPrivate, setPrivate] = useState(false);
  const [dm, setDm] = useState('connections');
  const [ig, setIg] = useState<Link>(null);
  const [tt, setTt] = useState<Link>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!me?.profile) return;
    setPrivate(me.profile.is_private);
    setDm(me.profile.dm_policy);
    const s = (p: string) => me.social.find((x) => x.platform === p);
    setIg(s('instagram') ? { handle: s('instagram')!.handle, is_visible: s('instagram')!.is_visible } : null);
    setTt(s('tiktok') ? { handle: s('tiktok')!.handle, is_visible: s('tiktok')!.is_visible } : null);
  }, [me]);

  const save = async () => {
    setBusy(true);
    try {
      const r = await api.put('/me/privacy', {
        is_private: isPrivate,
        dm_policy: dm,
        instagram: ig && ig.handle.trim() ? ig : null,
        tiktok: tt && tt.handle.trim() ? tt : null,
      });
      setMe(r);
      toast(t.privacy.saved);
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
    } finally {
      setBusy(false);
    }
  };

  const SocialRow = ({ icon, label, value, onChange }: { icon: React.ReactNode; label: string; value: Link; onChange: (v: Link) => void }) => (
    <div className="py-3">
      <div className="flex items-center gap-2 text-sm font-semibold">{icon} {label}</div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-muted">@</span>
        <Input value={value?.handle ?? ''} placeholder={t.privacy.handlePlaceholder} maxLength={30} onChange={(e) => onChange({ handle: e.target.value.replace(/[^A-Za-z0-9_.]/g, ''), is_visible: value?.is_visible ?? true })} />
      </div>
      {value?.handle && <Toggle label={t.privacy.showOnProfile} checked={value.is_visible} onChange={(v) => onChange({ ...value, is_visible: v })} disabled={isPrivate} />}
    </div>
  );

  return (
    <div className="pb-8">
      <TopBar back title={t.privacy.title} right={<Button size="sm" loading={busy} onClick={save}>{t.common.save}</Button>} />
      <div className="space-y-4 px-4">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t.privacy.profileVisibility}</p>
          <Toggle label={t.privacy.publicProfile} description={t.privacy.publicProfileDesc} checked={!isPrivate} onChange={(v) => setPrivate(!v)} />
        </Card>
        <Card className="bg-brand-soft">
          <p className="flex items-center gap-2 font-semibold"><Lock className="h-4 w-4 text-purple" /> {t.privacy.attendanceTitle}</p>
          <p className="mt-1 text-sm text-muted">{t.privacy.attendanceDesc}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t.privacy.dmTitle}</p>
          <div className="mt-3 flex gap-2">
            {(['everyone', 'connections', 'nobody'] as const).map((k) => (
              <Chip key={k} active={dm === k} onClick={() => setDm(k)}>{t.privacy.dm[k]}</Chip>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{t.privacy.dmDesc}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t.privacy.socialTitle}</p>
          <p className="mt-1 text-xs text-muted">{t.privacy.socialDesc}</p>
          <div className="divide-y divide-line">
            {SocialRow({ icon: <Instagram className="h-4 w-4" />, label: t.profile.instagram, value: ig, onChange: setIg })}
            {SocialRow({ icon: <Music2 className="h-4 w-4" />, label: t.profile.tiktok, value: tt, onChange: setTt })}
          </div>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t.privacy.blocked}</p>
          {!blocks?.length && <p className="mt-2 text-sm text-muted">{t.privacy.blockedEmpty}</p>}
          {blocks?.map((b) => (
            <div key={b.user_id} className="mt-2 flex items-center gap-3">
              <Avatar src={b.avatar_url} name={b.display_name} size={36} />
              <span className="flex-1 text-sm font-semibold">{b.display_name}</span>
              <Button size="sm" variant="soft" onClick={async () => { await api.del(`/me/blocks/${b.user_id}`); reloadBlocks(); }}>{t.profile.unblock}</Button>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
