'use client';
import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { api, useApi } from '@/lib/api';
import { errorMessage, t } from '@/i18n';
import { useSession, useToast } from '@/components/providers';
import { PageHead, useBiz } from '@/components/business-shell';
import { Button, Card, Field, Input, Select, Textarea } from '@/components/ui';

const CATS = ['club', 'bar', 'restaurant', 'beach_club', 'venue', 'organizer', 'promoter', 'festival'];

export default function BizProfile() {
  const biz = useBiz();
  const toast = useToast();
  const { reload: reloadMe } = useSession();
  const { data } = useApi<any>(`/biz/${biz.id}`);
  const { data: meta } = useApi<any>('/meta');
  const [f, setF] = useState<any>(null);
  const [hours, setHours] = useState('');
  const [busy, setBusy] = useState(false);
  const logo = useRef<HTMLInputElement>(null);
  const cover = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!data) return;
    setF(data.business);
    setHours(Object.entries(data.business.opening_hours ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n'));
  }, [data]);
  if (!f) return null;
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const upload = async (k: string, fl?: File) => {
    if (!fl) return;
    try { set(k, (await api.upload(fl)).url); } catch (e: any) { toast(errorMessage(e.code), 'error'); }
  };
  const save = async () => {
    setBusy(true);
    try {
      const opening_hours = Object.fromEntries(hours.split('\n').map((l) => l.split(':')).filter((p) => p.length >= 2).map(([k, ...v]) => [k.trim().slice(0, 12), v.join(':').trim().slice(0, 40)]));
      const pick = ['name', 'category', 'logo_url', 'cover_url', 'description', 'address', 'city_id', 'neighborhood', 'lat', 'lng', 'website', 'instagram', 'phone', 'contact_email'];
      await api.patch(`/biz/${biz.id}`, { ...Object.fromEntries(pick.map((k) => [k, f[k] === '' ? null : f[k]])), opening_hours });
      toast(t.privacy.saved);
      reloadMe();
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
    } finally {
      setBusy(false);
    }
  };
  const canEdit = biz.role !== 'staff';
  return (
    <>
      <PageHead title={t.business.profileEditor} action={<div className="flex gap-2"><Link href={`/locali/${biz.slug}`} target="_blank"><Button variant="ghost" size="sm" icon={<ExternalLink className="h-4 w-4" />}>{t.business.openApp}</Button></Link>{canEdit && <Button loading={busy} onClick={save}>{t.common.save}</Button>}</div>} />
      <fieldset disabled={!canEdit} className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-4 lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.business.name}><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label={t.business.category}><Select value={f.category} onChange={(e) => set('category', e.target.value)}>{CATS.map((c) => <option key={c} value={c}>{t.businessCategories[c]}</option>)}</Select></Field>
          </div>
          <Field label={t.business.description}><Textarea className="min-h-32" value={f.description ?? ''} onChange={(e) => set('description', e.target.value)} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.business.address}><Input value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
            <Field label={t.auth.city}><Select value={f.city_id ?? ''} onChange={(e) => set('city_id', e.target.value)}>{meta?.cities.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label={t.business.form.neighborhood}><Input value={f.neighborhood ?? ''} onChange={(e) => set('neighborhood', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Lat"><Input type="number" step="any" value={f.lat ?? ''} onChange={(e) => set('lat', e.target.value === '' ? null : Number(e.target.value))} /></Field>
              <Field label="Lng"><Input type="number" step="any" value={f.lng ?? ''} onChange={(e) => set('lng', e.target.value === '' ? null : Number(e.target.value))} /></Field>
            </div>
            <Field label={t.business.website}><Input type="url" value={f.website ?? ''} onChange={(e) => set('website', e.target.value)} /></Field>
            <Field label={t.business.instagram}><Input value={f.instagram ?? ''} onChange={(e) => set('instagram', e.target.value)} /></Field>
            <Field label={t.business.phone}><Input value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label={t.business.email}><Input type="email" value={f.contact_email ?? ''} onChange={(e) => set('contact_email', e.target.value)} /></Field>
          </div>
          <Field label={t.business.hours}><Textarea value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
        </Card>
        <div className="space-y-4">
          <Card>
            <p className="mb-2 font-bold">{t.business.logo}</p>
            <img src={f.logo_url ?? ''} alt="" className="h-24 w-24 rounded-3xl bg-surface-2 object-cover" />
            <Button className="mt-3" size="sm" variant="secondary" onClick={() => logo.current?.click()}>{t.business.form.upload}</Button>
            <input ref={logo} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => upload('logo_url', e.target.files?.[0])} />
          </Card>
          <Card>
            <p className="mb-2 font-bold">{t.business.cover}</p>
            <img src={f.cover_url ?? ''} alt="" className="aspect-video w-full rounded-2xl bg-surface-2 object-cover" />
            <Button className="mt-3" size="sm" variant="secondary" onClick={() => cover.current?.click()}>{t.business.form.upload}</Button>
            <input ref={cover} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => upload('cover_url', e.target.files?.[0])} />
          </Card>
          <Card><p className="text-sm">{t.business.nav.profile}: <b>{f.verification_status === 'verified' ? t.common.verified : t.common.pendingVerification}</b></p></Card>
        </div>
      </fieldset>
    </>
  );
}
