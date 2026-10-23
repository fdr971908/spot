'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { api, useApi } from '@/lib/api';
import { errorMessage, t } from '@/i18n';
import { useSession, useToast } from '@/components/providers';
import { Avatar, Button, Field, Input, Select, Textarea, TopBar } from '@/components/ui';

export default function EditProfile() {
  const router = useRouter();
  const toast = useToast();
  const { me, setMe } = useSession();
  const { data: meta } = useApi<any>('/meta');
  const [f, setF] = useState({ display_name: '', username: '', bio: '', city_id: '', avatar_url: '' as string | null });
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (me?.profile) setF({ display_name: me.profile.display_name, username: me.profile.username, bio: me.profile.bio ?? '', city_id: me.profile.city_id ?? '', avatar_url: me.profile.avatar_url });
  }, [me]);
  const upload = async (fl: File) => {
    try {
      const r = await api.upload(fl);
      setF((x) => ({ ...x, avatar_url: r.url }));
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
    }
  };
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.patch('/me/profile', { ...f, bio: f.bio || null, city_id: f.city_id || null });
      setMe(r);
      toast(t.privacy.saved);
      router.back();
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="pb-8">
      <TopBar back title={t.profile.editProfile} right={<Button size="sm" loading={busy} onClick={save}>{t.common.save}</Button>} />
      <div className="space-y-4 px-4">
        <div className="flex flex-col items-center">
          <button onClick={() => file.current?.click()} className="relative" aria-label={t.profile.changePhoto}>
            <Avatar src={f.avatar_url} name={f.display_name} size={104} />
            <span className="bg-brand absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full text-white ring-4 ring-bg"><Camera className="h-4 w-4" /></span>
          </button>
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>
        <Field label={t.auth.displayName}><Input value={f.display_name} maxLength={50} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></Field>
        <Field label={t.auth.username} hint={t.auth.usernameHint}><Input value={f.username} maxLength={24} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '') })} /></Field>
        <Field label={t.profile.bio} hint={`${f.bio.length}/280`}><Textarea value={f.bio} maxLength={280} onChange={(e) => setF({ ...f, bio: e.target.value })} /></Field>
        <Field label={t.auth.city}>
          <Select value={f.city_id} onChange={(e) => setF({ ...f, city_id: e.target.value })}>
            <option value="">—</option>
            {meta?.cities.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      </div>
    </div>
  );
}
