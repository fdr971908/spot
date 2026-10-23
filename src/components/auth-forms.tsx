'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { api, useApi } from '@/lib/api';
import { errorMessage, t } from '@/i18n';
import { useToast } from './providers';
import { AppIcon, Button, Field, Input, Logo, Segmented, Select, TopBar } from './ui';

function SocialButtons() {
  const toast = useToast();
  const tryProvider = async (p: 'apple' | 'google') => {
    try {
      await api.get(`/auth/oauth/${p}`);
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
    }
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button type="button" variant="dark" onClick={() => tryProvider('apple')}>
        Apple
      </Button>
      <Button type="button" variant="secondary" onClick={() => tryProvider('google')}>
        <span className="font-bold text-[#4285F4]">G</span> Google
      </Button>
    </div>
  );
}

function safeNext(n: string | null) {
  return n && n.startsWith('/') && !n.startsWith('//') ? n : null;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post('/auth/login', { email, password });
      const next = safeNext(params.get('next'));
      router.replace(r.user.account_type === 'business' ? next?.startsWith('/business') ? next : '/business' : r.user.onboarding_completed_at ? next ?? '/home' : '/onboarding');
    } catch (err: any) {
      setError(errorMessage(err.code));
      setBusy(false);
    }
  };
  return (
    <>
      <TopBar back="/benvenuto" />
      <form onSubmit={submit} className="flex flex-1 flex-col px-6 pb-8">
        <AppIcon className="h-14 w-14" />
        <h1 className="mt-5 text-3xl font-extrabold">{t.auth.loginTitle}</h1>
        <p className="mt-1 text-muted">{t.auth.loginSubtitle}</p>
        <div className="mt-8 space-y-4">
          <Field label={t.auth.email}>
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label={t.auth.password} error={error}>
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
        <Button className="mt-6" size="lg" block loading={busy}>
          {t.auth.login}
        </Button>
        <div className="my-5 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-line" /> {t.common.or} <span className="h-px flex-1 bg-line" />
        </div>
        <SocialButtons />
        <p className="mt-6 rounded-2xl bg-primary-soft p-3 text-center text-xs text-primary-ink">{t.auth.demoHint}</p>
        <p className="mt-auto pt-8 text-center text-sm text-muted">
          {t.auth.noAccount}{' '}
          <Link href="/registrati" className="font-semibold text-purple">
            {t.auth.signUp}
          </Link>
        </p>
      </form>
    </>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [type, setType] = useState<'personal' | 'business'>(params.get('type') === 'business' ? 'business' : 'personal');
  const { data: meta } = useApi<{ cities: { id: string; name: string }[] }>('/meta');
  const [f, setF] = useState({ display_name: '', username: '', email: '', password: '', birthdate: '', city_id: 'milano', accept_terms: false, marketing_consent: false });
  const [avail, setAvail] = useState<boolean | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: any) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (type !== 'personal' || f.username.length < 3) return setAvail(null);
    const h = setTimeout(async () => {
      try {
        const r = await api.get(`/auth/username-available?u=${encodeURIComponent(f.username)}`);
        setAvail(r.available);
      } catch {
        setAvail(null);
      }
    }, 350);
    return () => clearTimeout(h);
  }, [f.username, type]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api.post('/auth/register', {
        ...f,
        account_type: type,
        ...(type === 'business' ? { display_name: undefined, username: undefined } : {}),
      });
      router.replace(type === 'business' ? '/business/registrati' : '/onboarding');
    } catch (err: any) {
      const map: Record<string, string> = {};
      for (const i of err.issues ?? []) map[i.path] = t.errors.validation;
      if (err.code === 'email_taken') map.email = errorMessage(err.code);
      else if (err.code === 'username_taken') map.username = errorMessage(err.code);
      else if (err.code === 'age_not_allowed') map.birthdate = errorMessage(err.code);
      else map._ = errorMessage(err.code);
      setErrors(map);
      setBusy(false);
    }
  };
  return (
    <>
      <TopBar back="/benvenuto" title={<Logo size="sm" />} />
      <form onSubmit={submit} className="flex flex-1 flex-col px-6 pb-8">
        <h1 className="mt-2 text-3xl font-extrabold">{type === 'business' ? t.auth.registerBusinessTitle : t.auth.registerTitle}</h1>
        <p className="mt-1 text-muted">{type === 'business' ? t.auth.registerBusinessSubtitle : t.auth.registerSubtitle}</p>
        <Segmented
          className="mt-5"
          value={type}
          onChange={setType}
          options={[
            { value: 'personal', label: t.auth.personal },
            { value: 'business', label: t.auth.business },
          ]}
        />
        <div className="mt-6 space-y-4">
          {type === 'personal' && (
            <>
              <Field label={t.auth.displayName} error={errors.display_name}>
                <Input required maxLength={50} value={f.display_name} onChange={(e) => set('display_name', e.target.value)} autoComplete="name" />
              </Field>
              <Field
                label={t.auth.username}
                error={errors.username}
                hint={
                  avail === null ? t.auth.usernameHint : avail ? (
                    <span className="inline-flex items-center gap-1 text-[#13804b]"><Check className="h-3.5 w-3.5" /> {t.auth.usernameFree}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[#d92d34]"><X className="h-3.5 w-3.5" /> {t.auth.usernameTaken}</span>
                  )
                }
              >
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">@</span>
                  <Input
                    required
                    className="pl-8"
                    value={f.username}
                    onChange={(e) => set('username', e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                    maxLength={24}
                    autoCapitalize="none"
                  />
                </div>
              </Field>
            </>
          )}
          <Field label={t.auth.email} error={errors.email}>
            <Input type="email" required value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
          </Field>
          <Field label={t.auth.password} hint={t.auth.passwordHint} error={errors.password}>
            <Input type="password" required minLength={8} value={f.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.auth.birthdate} error={errors.birthdate}>
              <Input type="date" required value={f.birthdate} onChange={(e) => set('birthdate', e.target.value)} max={new Date().toISOString().slice(0, 10)} />
            </Field>
            {type === 'personal' && (
              <Field label={t.auth.city}>
                <Select value={f.city_id} onChange={(e) => set('city_id', e.target.value)}>
                  {(meta?.cities ?? [{ id: 'milano', name: 'Milano' }]).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          <p className="-mt-2 text-xs text-muted">{t.auth.birthdateHint}</p>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" required className="mt-0.5 h-5 w-5 accent-[#8b42f5]" checked={f.accept_terms} onChange={(e) => set('accept_terms', e.target.checked)} />
            <span>
              {t.auth.acceptTerms.split('Termini')[0]}
              <Link href="/legal/termini" className="font-semibold text-purple" target="_blank">
                Termini di servizio
              </Link>{' '}
              e l’
              <Link href="/legal/privacy" className="font-semibold text-purple" target="_blank">
                Informativa privacy
              </Link>
            </span>
          </label>
          {type === 'personal' && (
            <label className="flex items-start gap-3 text-sm text-muted">
              <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[#8b42f5]" checked={f.marketing_consent} onChange={(e) => set('marketing_consent', e.target.checked)} />
              <span>{t.auth.marketing}</span>
            </label>
          )}
        </div>
        {errors._ && <p className="mt-4 text-sm text-[#d92d34]">{errors._}</p>}
        <Button className="mt-6" size="lg" block loading={busy} disabled={type === 'personal' && avail === false}>
          {t.auth.register}
        </Button>
        {type === 'personal' && (
          <div className="mt-4">
            <SocialButtons />
          </div>
        )}
        <p className="mt-6 text-center text-sm text-muted">
          {t.auth.haveAccount}{' '}
          <Link href="/accedi" className="font-semibold text-purple">
            {t.auth.login}
          </Link>
        </p>
      </form>
    </>
  );
}
