'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { AlertCircle, BadgeCheck, ChevronLeft, Loader2, X } from 'lucide-react';
import { t } from '@/i18n';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

// ── Brand ──
export function Logo({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const s = { sm: 'text-2xl', md: 'text-3xl', lg: 'text-5xl', xl: 'text-7xl' }[size];
  return (
    <span className={cx('font-extrabold tracking-tight text-ink select-none', s, className)} aria-label="spot.">
      spot<span className="text-brand">.</span>
    </span>
  );
}

export function AppIcon({ className = 'h-12 w-12' }: { className?: string }) {
  return (
    <span className={cx('bg-brand inline-flex items-center justify-center rounded-[28%] shadow-[var(--shadow-pop)]', className)} aria-hidden>
      <svg viewBox="0 0 48 48" className="h-3/5 w-3/5">
        <path d="M24 4c1.6 9.6 5.4 13.4 15 15-9.6 1.6-13.4 5.4-15 15-1.6-9.6-5.4-13.4-15-15 9.6-1.6 13.4-5.4 15-15z" fill="#fff" />
        <circle cx="38" cy="38" r="5" fill="#FFB5D2" />
      </svg>
    </span>
  );
}

// ── Buttons ──
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
};
export function Button({ variant = 'primary', size = 'md', loading, icon, block, className, children, disabled, ...rest }: BtnProps) {
  const v = {
    primary: 'bg-brand text-white shadow-[var(--shadow-pop)] hover:brightness-105',
    secondary: 'bg-surface text-primary-ink ring-1 ring-inset ring-[color:var(--lavender)] hover:bg-primary-soft',
    ghost: 'text-ink hover:bg-surface-2',
    soft: 'bg-primary-soft text-primary-ink hover:brightness-95',
    danger: 'bg-[#fde8e8] text-[#c0262d] hover:bg-[#fbd5d5] dark:bg-[#3b1418] dark:text-[#ff8a8f]',
    dark: 'bg-navy text-white hover:bg-[#2a2340] dark:bg-white dark:text-navy',
  }[variant];
  const s = { sm: 'h-9 px-3.5 text-sm gap-1.5', md: 'h-11 px-5 text-[15px] gap-2', lg: 'h-14 px-6 text-base gap-2' }[size];
  return (
    <button
      className={cx(
        'inline-flex select-none items-center justify-center rounded-full font-semibold transition active:scale-[.97] disabled:pointer-events-none disabled:opacity-50',
        v,
        s,
        block && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx('inline-flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-surface-2 active:scale-95', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Chip({ active, onClick, children, className, icon }: { active?: boolean; onClick?: () => void; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition active:scale-95',
        active ? 'bg-purple text-white shadow-[0_6px_16px_-8px_rgb(139_66_245/.8)]' : 'bg-surface-2 text-ink hover:bg-primary-soft',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('flex cursor-pointer items-start justify-between gap-4 py-3', disabled && 'opacity-50')}>
      <span className="min-w-0">
        <span className="block text-[15px] font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-sm text-muted">{description}</span>}
      </span>
      <span className="relative mt-0.5 shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="block h-7 w-12 rounded-full bg-line transition peer-checked:bg-purple peer-focus-visible:ring-2 peer-focus-visible:ring-purple/50" />
        <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

// ── Forms ──
export function Field({ label, hint, error, children }: { label?: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-sm font-semibold">{label}</span>}
      {children}
      {error ? <span className="mt-1 block text-sm text-[#d92d34]">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

const inputCls =
  'w-full rounded-2xl bg-surface-2 px-4 text-[15px] text-ink outline-none ring-1 ring-transparent transition placeholder:text-muted focus:bg-surface focus:ring-purple/60';
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputCls, 'h-12', className)} {...rest} />;
}
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputCls, 'min-h-24 py-3', className)} {...rest} />;
}
export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputCls, 'h-12 appearance-none pr-10', className)} {...rest}>
      {children}
    </select>
  );
}

// ── Display ──
export function Avatar({ src, name, size = 40, className, ring }: { src?: string | null; name?: string | null; size?: number; className?: string; ring?: boolean }) {
  const initials = (name ?? '?')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft font-semibold text-primary-ink', ring && 'ring-2 ring-surface', className)}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" /> : initials}
    </span>
  );
}

export function Verified({ className = 'h-4 w-4' }: { className?: string }) {
  return <BadgeCheck className={cx('shrink-0 fill-[#4D7CFF] text-white', className)} aria-label={t.common.verified} />;
}

export function Badge({ children, tone = 'default', className }: { children: ReactNode; tone?: 'default' | 'purple' | 'green' | 'amber' | 'red' | 'dark' | 'glass'; className?: string }) {
  const c = {
    default: 'bg-surface-2 text-ink',
    purple: 'bg-primary-soft text-primary-ink',
    green: 'bg-[#e3f8ec] text-[#13804b] dark:bg-[#123224] dark:text-[#6fe0a4]',
    amber: 'bg-[#fff3d6] text-[#9a6200] dark:bg-[#3a2c0d] dark:text-[#ffcf6e]',
    red: 'bg-[#fde8e8] text-[#c0262d] dark:bg-[#3b1418] dark:text-[#ff8a8f]',
    dark: 'bg-navy/80 text-white',
    glass: 'bg-white/20 text-white backdrop-blur-md ring-1 ring-white/25',
  }[tone];
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', c, className)}>{children}</span>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-[var(--radius-card)] bg-surface p-4 shadow-[0_1px_0_var(--line),0_8px_24px_-18px_rgb(23_19_38/.35)]', className)}>{children}</div>;
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cx('flex rounded-full bg-surface-2 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('h-9 flex-1 rounded-full px-3 text-sm font-semibold transition', value === o.value ? 'bg-purple text-white shadow' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton rounded-2xl', className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('h-6 w-6 animate-spin text-purple', className)} aria-label={t.common.loading} />;
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="animate-pop flex flex-col items-center px-6 py-12 text-center">
      <div className="bg-brand-soft mb-4 flex h-16 w-16 items-center justify-center rounded-3xl text-2xl text-primary-ink">{icon ?? '✨'}</div>
      <p className="text-base font-semibold">{title}</p>
      {children && <p className="mt-1 max-w-xs text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <AlertCircle className="mb-3 h-8 w-8 text-coral" />
      <p className="text-sm text-muted">{message ?? t.errors.generic}</p>
      {onRetry && (
        <Button variant="soft" size="sm" className="mt-4" onClick={onRetry}>
          {t.common.retry}
        </Button>
      )}
    </div>
  );
}

export function TopBar({ title, back, right, transparent, className }: { title?: ReactNode; back?: boolean | string; right?: ReactNode; transparent?: boolean; className?: string }) {
  const router = useRouter();
  return (
    <header className={cx('sticky top-0 z-30 flex h-14 items-center gap-2 px-3', !transparent && 'bg-bg/85 backdrop-blur-xl', className)}>
      {back && (
        <IconButton
          label={t.common.back}
          onClick={() => (typeof back === 'string' ? router.push(back) : window.history.length > 1 ? router.back() : router.push('/home'))}
          className={transparent ? 'bg-white/80 text-navy backdrop-blur' : ''}
        >
          <ChevronLeft className="h-5 w-5" />
        </IconButton>
      )}
      <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{title}</h1>
      <div className="flex items-center gap-1">{right}</div>
    </header>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-3 flex items-center justify-between', className)}>
      <h2 className="text-lg font-bold">{children}</h2>
      {action}
    </div>
  );
}

export function LinkRow({ href, icon, label, value, onClick }: { href?: string; icon?: ReactNode; label: ReactNode; value?: ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      {icon && <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary-ink">{icon}</span>}
      <span className="flex-1 text-[15px] font-medium">{label}</span>
      {value && <span className="text-sm text-muted">{value}</span>}
      <ChevronLeft className="h-4 w-4 rotate-180 text-muted" />
    </>
  );
  const cls = 'flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-surface-2';
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/** Bottom sheet modal (dialog on desktop). */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-navy/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className="animate-sheet relative flex max-h-[90dvh] w-full max-w-[460px] flex-col rounded-t-[2rem] bg-surface shadow-2xl sm:rounded-[2rem]">
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line sm:hidden" />
        <div className="flex items-center gap-2 px-5 pb-1 pt-3">
          <h2 className="flex-1 text-lg font-bold">{title}</h2>
          <IconButton label={t.common.close} onClick={onClose}>
            <X className="h-5 w-5" />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="pb-safe border-t border-line px-5 pt-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function PageLoader() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-56 w-full" />
    </div>
  );
}

/** Generic camera-style glyph for Instagram links (lucide no longer ships brand icons). */
export function Instagram({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}
