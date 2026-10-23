'use client';
import { useState } from 'react';
import { api, useApi } from '@/lib/api';
import { errorMessage, t } from '@/i18n';
import { useToast } from '@/components/providers';
import { PageHead, useBiz } from '@/components/business-shell';
import { Badge, Button, Card, Field, Input, Select } from '@/components/ui';

export default function Settings() {
  const biz = useBiz();
  const toast = useToast();
  const { data, reload } = useApi<any[]>(`/biz/${biz.id}/staff`);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const add = async () => {
    try {
      await api.post(`/biz/${biz.id}/staff`, { email, role });
      setEmail('');
      reload();
    } catch (e: any) {
      toast(errorMessage(e.code === 'user_not_found' ? 'not_found' : e.code), 'error');
    }
  };
  return (
    <>
      <PageHead title={t.business.nav.settings} />
      <Card className="max-w-2xl">
        <p className="font-bold">{t.business.staff}</p>
        <p className="text-sm text-muted">{t.business.staffDesc}</p>
        <div className="mt-4 divide-y divide-line">
          {data?.map((s) => (
            <div key={s.user_id} className="flex items-center gap-3 py-3">
              <span className="flex-1 text-sm font-medium">{s.email}</span>
              <Badge tone={s.role === 'owner' ? 'purple' : 'default'}>{t.business.roles[s.role]}</Badge>
              {biz.role === 'owner' && s.role !== 'owner' && <Button size="sm" variant="ghost" onClick={async () => { await api.del(`/biz/${biz.id}/staff/${s.user_id}`); reload(); }}>{t.groups.remove}</Button>}
            </div>
          ))}
        </div>
        {biz.role === 'owner' && (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1"><Field label={t.business.staffEmail}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field></div>
            <Field label={t.business.role}><Select value={role} onChange={(e) => setRole(e.target.value)}><option value="manager">{t.business.roles.manager}</option><option value="staff">{t.business.roles.staff}</option></Select></Field>
            <Button onClick={add} disabled={!email}>{t.business.add}</Button>
          </div>
        )}
      </Card>
    </>
  );
}
