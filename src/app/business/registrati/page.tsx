'use client';
import { useState } from 'react';
import { api, useApi } from '@/lib/api';
import { errorMessage, t } from '@/i18n';
import { useSession, useToast } from '@/components/providers';
import { AppIcon, Button, Field, Input, Select, Textarea } from '@/components/ui';

const CATS = ['club', 'bar', 'restaurant', 'beach_club', 'venue', 'organizer', 'promoter', 'festival'];

export default function BusinessRegister() {
  const toast = useToast();
  const { reload } = useSession();
  const { data: meta } = useApi<any>('/meta');
  const [f, setF] = useState({ name: '', category: 'club', city_id: 'milano', address: '', description: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/biz', { ...f, description: f.description || undefined });
      await reload();
      window.location.href = '/business';
    } catch (err: any) {
      toast(errorMessage(err.code), 'error');
      setBusy(false);
    }
  };
  return (
    <div className="app-backdrop flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-lg space-y-4 rounded-[2rem] bg-surface p-6 shadow-[var(--shadow-card)]">
        <AppIcon />
        <h1 className="text-2xl font-extrabold">{t.business.createTitle}</h1>
        <p className="text-muted">{t.business.createSubtitle}</p>
        <Field label={t.business.name}><Input required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.business.category}><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((c) => <option key={c} value={c}>{t.businessCategories[c]}</option>)}</Select></Field>
          <Field label={t.auth.city}><Select value={f.city_id} onChange={(e) => setF({ ...f, city_id: e.target.value })}>{meta?.cities.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        </div>
        <Field label={t.business.address}><Input required minLength={3} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <Field label={t.business.description}><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Button block size="lg" loading={busy}>{t.business.create}</Button>
      </form>
    </div>
  );
}
