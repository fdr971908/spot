'use client';
import { useEffect, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { errorMessage, t } from '@/i18n';
import { applyTheme, getThemePref, useSession, useToast, type ThemePref } from '@/components/providers';
import { Button, Card, Chip, Field, Input, Sheet, TopBar } from '@/components/ui';

export default function Account() {
  const { me } = useSession();
  const toast = useToast();
  const [theme, setTheme] = useState<ThemePref>('light');
  const [del, setDel] = useState(false);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setTheme(getThemePref()), []);
  return (
    <div className="pb-8">
      <TopBar back title={t.profile.menu.data} />
      <div className="space-y-4 px-4">
        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{t.profile.menu.appearance}</p>
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as const).map((k) => (
              <Chip key={k} active={theme === k} onClick={() => { setTheme(k); applyTheme(k); }}>{t.profile.theme[k]}</Chip>
            ))}
          </div>
        </Card>
        <Card>
          <p className="text-sm text-muted">{me?.user.email}</p>
          <div className="mt-3 space-y-2">
            <a href="/api/me/export" download>
              <Button block variant="secondary" icon={<Download className="h-4 w-4" />}>{t.profile.exportData}</Button>
            </a>
            <Button block variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDel(true)}>{t.profile.deleteAccount}</Button>
          </div>
        </Card>
      </div>
      <Sheet
        open={del}
        onClose={() => setDel(false)}
        title={t.profile.deleteAccount}
        footer={
          <Button
            block
            variant="danger"
            loading={busy}
            disabled={!pw}
            onClick={async () => {
              setBusy(true);
              try {
                await api.post('/me/delete', { password: pw });
                window.location.href = '/benvenuto';
              } catch (e: any) {
                toast(errorMessage(e.code), 'error');
                setBusy(false);
              }
            }}
          >
            {t.profile.deleteAccount}
          </Button>
        }
      >
        <p className="mb-4 text-sm text-muted">{t.profile.deleteConfirm}</p>
        <Field label={t.auth.password}>
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        </Field>
      </Sheet>
    </div>
  );
}
