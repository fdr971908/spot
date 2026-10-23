'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { api, invalidate, useApi } from '@/lib/api';
import { errorMessage, t } from '@/i18n';
import { useToast } from './providers';
import { useBiz } from './business-shell';
import { CATEGORIES, GENRES } from './preferences-form';
import { Button, Card, Chip, Field, Input, Select, Textarea, Toggle } from './ui';

const COVERS = ['techno-1', 'house-1', 'disco-1', 'concert-1', 'beach-1', 'brunch-1', 'aperitivo-1', 'outdoor-1', 'festival-1', 'dinner-1', 'jazz-1', 'hiphop-1'];

/** datetime-local value in Europe/Rome ↔ ISO */
function toLocal(iso: string) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
  return parts.replace(' ', 'T');
}
function fromLocal(v: string) {
  // interpret as Europe/Rome wall time
  const guess = new Date(v + ':00Z');
  const offset = Number(guess.toLocaleString('en-US', { timeZone: 'Europe/Rome', timeZoneName: 'shortOffset' }).match(/GMT([+-]\d+)/)?.[1] ?? 1);
  return new Date(guess.getTime() - offset * 3600_000).toISOString();
}

export function EventForm({ initial }: { initial?: any }) {
  const biz = useBiz();
  const router = useRouter();
  const toast = useToast();
  const { data: meta } = useApi<any>('/meta');
  const file = useRef<HTMLInputElement>(null);
  const tomorrow = new Date(Date.now() + 86400_000);
  tomorrow.setHours(21, 0, 0, 0);
  const [f, setF] = useState<any>(() =>
    initial
      ? { ...initial, starts_at: toLocal(initial.starts_at), ends_at: toLocal(initial.ends_at) }
      : {
          title: '', description: '', cover_url: '/demo/covers/techno-1.svg', starts_at: toLocal(tomorrow.toISOString()), ends_at: toLocal(new Date(tomorrow.getTime() + 5 * 3600_000).toISOString()),
          venue_name: '', address: '', city_id: '', neighborhood: '', category_id: 'nightclub', genres: [], is_outdoor: false, venue_size: 'medium', is_free: false,
          price_min: 15, price_max: null, min_age: null, rules: '', lineup: '', ticket_url: '', capacity: null, group_friendly: true, guest_list_enabled: false, table_requests_enabled: false,
        },
  );
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const num = (v: string) => (v === '' ? null : Number(v));

  const submit = async (publish: boolean) => {
    setBusy(true);
    setErrors({});
    const body: any = {
      ...f,
      starts_at: fromLocal(f.starts_at),
      ends_at: fromLocal(f.ends_at),
      price_min: f.is_free ? null : f.price_min,
      price_max: f.is_free ? null : f.price_max,
      venue_name: f.venue_name || undefined,
      address: f.address || undefined,
      city_id: f.city_id || undefined,
      ticket_url: f.ticket_url || null,
      publish: initial ? undefined : publish,
    };
    for (const k of ['id', 'business_id', 'series_id', 'status', 'published_at', 'cancelled_at', 'created_by', 'created_at', 'updated_at']) delete body[k];
    try {
      if (initial) {
        await api.patch(`/biz/${biz.id}/events/${initial.id}`, body);
        toast(t.privacy.saved);
        invalidate(`/biz/${biz.id}`);
      } else {
        const r = await api.post(`/biz/${biz.id}/events`, body);
        invalidate(`/biz/${biz.id}`);
        router.replace(`/business/eventi/${r.id}`);
      }
    } catch (e: any) {
      const m: Record<string, string> = {};
      for (const i of e.issues ?? []) m[i.path] = i.message;
      setErrors(m);
      toast(errorMessage(e.code), 'error');
    } finally {
      setBusy(false);
    }
  };
  const F = t.business.form;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card className="space-y-4">
          <p className="font-bold">{F.basics}</p>
          <Field label={F.title} error={errors.title}><Input value={f.title} maxLength={120} onChange={(e) => set('title', e.target.value)} /></Field>
          <Field label={F.description}><Textarea value={f.description ?? ''} maxLength={4000} onChange={(e) => set('description', e.target.value)} className="min-h-32" /></Field>
          <Field label={F.lineup}><Input value={f.lineup ?? ''} onChange={(e) => set('lineup', e.target.value)} /></Field>
        </Card>
        <Card className="space-y-4">
          <p className="font-bold">{F.when}</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label={F.starts}><Input type="datetime-local" value={f.starts_at} onChange={(e) => set('starts_at', e.target.value)} /></Field>
            <Field label={F.ends} error={errors.ends_at}><Input type="datetime-local" value={f.ends_at} onChange={(e) => set('ends_at', e.target.value)} /></Field>
          </div>
        </Card>
        <Card className="space-y-4">
          <p className="font-bold">{F.where}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={F.venueName} hint={biz.name}><Input value={f.venue_name ?? ''} placeholder={biz.name} onChange={(e) => set('venue_name', e.target.value)} /></Field>
            <Field label={F.city}>
              <Select value={f.city_id ?? ''} onChange={(e) => set('city_id', e.target.value)}>
                <option value="">— profilo locale —</option>
                {meta?.cities.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label={F.address}><Input value={f.address ?? ''} placeholder="— profilo locale —" onChange={(e) => set('address', e.target.value)} /></Field>
            <Field label={F.neighborhood}><Input value={f.neighborhood ?? ''} onChange={(e) => set('neighborhood', e.target.value)} /></Field>
            <Field label={F.lat}><Input type="number" step="any" value={f.lat ?? ''} onChange={(e) => set('lat', num(e.target.value))} /></Field>
            <Field label={F.lng}><Input type="number" step="any" value={f.lng ?? ''} onChange={(e) => set('lng', num(e.target.value))} /></Field>
          </div>
        </Card>
        <Card className="space-y-4">
          <p className="font-bold">{F.music}</p>
          <Field label={F.category}>
            <Select value={f.category_id} onChange={(e) => set('category_id', e.target.value)}>{CATEGORIES.map((c) => <option key={c} value={c}>{t.categoryEmoji[c]} {t.categories[c]}</option>)}</Select>
          </Field>
          <div>
            <p className="mb-2 text-sm font-semibold">{F.genres}</p>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((g) => <Chip key={g} active={f.genres.includes(g)} onClick={() => set('genres', f.genres.includes(g) ? f.genres.filter((x: string) => x !== g) : [...f.genres, g])}>{t.genres[g]}</Chip>)}
            </div>
          </div>
        </Card>
        <Card className="space-y-3">
          <p className="font-bold">{F.price}</p>
          <Toggle label={F.free} checked={f.is_free} onChange={(v) => set('is_free', v)} />
          {!f.is_free && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={F.priceMin} error={errors.price_min}><Input type="number" min={0} value={f.price_min ?? ''} onChange={(e) => set('price_min', num(e.target.value))} /></Field>
              <Field label={F.priceMax}><Input type="number" min={0} value={f.price_max ?? ''} onChange={(e) => set('price_max', num(e.target.value))} /></Field>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={F.minAge}><Select value={f.min_age ?? ''} onChange={(e) => set('min_age', num(e.target.value))}><option value="">Nessuna</option>{[14, 16, 18, 21].map((a) => <option key={a} value={a}>{a}+</option>)}</Select></Field>
            <Field label={F.capacity}><Input type="number" min={1} value={f.capacity ?? ''} onChange={(e) => set('capacity', num(e.target.value))} /></Field>
          </div>
          <Field label={F.ticketUrl} error={errors.ticket_url}><Input type="url" placeholder="https://" value={f.ticket_url ?? ''} onChange={(e) => set('ticket_url', e.target.value)} /></Field>
          <Field label={F.rules}><Textarea value={f.rules ?? ''} onChange={(e) => set('rules', e.target.value)} /></Field>
        </Card>
      </div>
      <div className="space-y-4">
        <Card className="space-y-3">
          <p className="font-bold">{F.cover}</p>
          <img src={f.cover_url} alt="" className="aspect-[4/3] w-full rounded-2xl object-cover" />
          <div className="grid grid-cols-6 gap-1.5">
            {COVERS.map((c) => <button key={c} onClick={() => set('cover_url', `/demo/covers/${c}.svg`)} className="overflow-hidden rounded-lg ring-2 ring-transparent hover:ring-purple"><img src={`/demo/covers/${c}.svg`} alt="" className="aspect-square object-cover" /></button>)}
          </div>
          <Button variant="secondary" block icon={<ImagePlus className="h-4 w-4" />} onClick={() => file.current?.click()}>{F.upload}</Button>
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async (e) => {
            const fl = e.target.files?.[0];
            if (!fl) return;
            try { set('cover_url', (await api.upload(fl)).url); } catch (err: any) { toast(errorMessage(err.code), 'error'); }
          }} />
        </Card>
        <Card>
          <p className="font-bold">{F.options}</p>
          <div className="divide-y divide-line">
            <Toggle label={F.outdoor} checked={f.is_outdoor} onChange={(v) => set('is_outdoor', v)} />
            <Toggle label={F.groupFriendly} checked={f.group_friendly} onChange={(v) => set('group_friendly', v)} />
            <Toggle label={F.guestList} checked={f.guest_list_enabled} onChange={(v) => set('guest_list_enabled', v)} />
            <Toggle label={F.tables} checked={f.table_requests_enabled} onChange={(v) => set('table_requests_enabled', v)} />
          </div>
          <Field label={F.venueSize}>
            <Select value={f.venue_size} onChange={(e) => set('venue_size', e.target.value)}>{['small', 'medium', 'large'].map((s) => <option key={s} value={s}>{t.business.sizes[s]}</option>)}</Select>
          </Field>
        </Card>
        <div className="sticky bottom-4 space-y-2">
          {initial ? (
            <Button block size="lg" loading={busy} onClick={() => submit(false)}>{F.saveChanges}</Button>
          ) : (
            <>
              <Button block size="lg" loading={busy} onClick={() => submit(true)}>{F.publish}</Button>
              <Button block variant="secondary" loading={busy} onClick={() => submit(false)}>{F.saveDraft}</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
