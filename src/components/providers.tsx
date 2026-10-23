'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, invalidate, useApi } from '@/lib/api';

// ── Session ──
export interface Me {
  user: { id: string; email: string; account_type: 'personal' | 'business'; birthdate: string | null; onboarding_completed_at: string | null; is_adult: boolean; marketing_consent_at: string | null };
  profile: null | { username: string; display_name: string; avatar_url: string | null; bio: string | null; city_id: string | null; city_name: string | null; is_private: boolean; dm_policy: string };
  social: { platform: 'instagram' | 'tiktok'; handle: string; is_visible: boolean }[];
  businesses: { id: string; slug: string; name: string; logo_url: string | null; verification_status: string; is_demo: boolean; role: string }[];
  stats: null | { events_attended: number; venues_visited: number; groups: number; following: number };
}

const SessionCtx = createContext<{ me: Me | undefined; loading: boolean; reload: () => Promise<void>; setMe: (m: Me) => void }>({
  me: undefined,
  loading: true,
  reload: async () => {},
  setMe: () => {},
});
export const useSession = () => useContext(SessionCtx);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { data, loading, reload, mutate } = useApi<Me>('/me');
  return <SessionCtx.Provider value={{ me: data, loading, reload, setMe: mutate }}>{children}</SessionCtx.Provider>;
}

// ── Toasts ──
type Toast = { id: number; text: string; tone: 'default' | 'error' };
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'default') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`animate-pop pointer-events-auto max-w-sm rounded-2xl px-4 py-3 text-sm font-medium shadow-[var(--shadow-pop)] ${
              t.tone === 'error' ? 'bg-[#e5484d] text-white' : 'bg-navy text-white dark:bg-white dark:text-navy'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ── Realtime (SSE) ──
type RtEvent = { t: string; c?: string; m?: string };
const RealtimeCtx = createContext<{ subscribe: (fn: (e: RtEvent) => void) => () => void; unread: { notifications: number; chats: number } }>({
  subscribe: () => () => {},
  unread: { notifications: 0, chats: 0 },
});
export const useRealtime = () => useContext(RealtimeCtx);

export function RealtimeProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const listeners = useRef(new Set<(e: RtEvent) => void>());
  const { data: unread, reload } = useApi<{ notifications: number; chats: number }>(enabled ? '/notifications/unread' : null);

  useEffect(() => {
    if (!enabled) return;
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      es = new EventSource('/api/realtime');
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as RtEvent;
          if (data.t === 'ping' || data.t === 'ready') return;
          listeners.current.forEach((fn) => fn(data));
          reload();
          if (data.t === 'notification') invalidate('/notifications');
          if (data.t === 'message') invalidate('/conversations');
        } catch {}
      };
      es.onerror = () => {
        es?.close();
        retry = setTimeout(connect, 4000);
      };
    };
    connect();
    return () => {
      clearTimeout(retry);
      es?.close();
    };
  }, [enabled, reload]);

  const value = useMemo(
    () => ({
      subscribe: (fn: (e: RtEvent) => void) => {
        listeners.current.add(fn);
        return () => {
          listeners.current.delete(fn);
        };
      },
      unread: unread ?? { notifications: 0, chats: 0 },
    }),
    [unread],
  );
  return <RealtimeCtx.Provider value={value}>{children}</RealtimeCtx.Provider>;
}

// ── Theme ──
export type ThemePref = 'light' | 'dark' | 'system';
export function applyTheme(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  try {
    localStorage.setItem('spot-theme', pref);
  } catch {}
}
export function getThemePref(): ThemePref {
  try {
    return (localStorage.getItem('spot-theme') as ThemePref) ?? 'light';
  } catch {
    return 'light';
  }
}

export async function logout() {
  await api.post('/auth/logout').catch(() => {});
  window.location.href = '/benvenuto';
}
