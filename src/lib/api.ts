'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public issues?: { path: string; message: string }[],
  ) {
    super(code);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body instanceof FormData ? { 'x-spot-client': '1' } : { 'content-type': 'application/json', 'x-spot-client': '1' },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth')) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/accedi?next=${next}`;
    }
    throw new ApiError(res.status, data?.error?.code ?? 'generic', data?.error?.issues);
  }
  return data as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>('GET', p),
  post: <T = any>(p: string, b: unknown = {}) => request<T>('POST', p, b),
  put: <T = any>(p: string, b: unknown = {}) => request<T>('PUT', p, b),
  patch: <T = any>(p: string, b: unknown = {}) => request<T>('PATCH', p, b),
  del: <T = any>(p: string) => request<T>('DELETE', p),
  upload: async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<{ url: string }>('POST', '/uploads', fd);
  },
};

// Stale-while-revalidate cache shared across components.
const cache = new Map<string, unknown>();
const subscribers = new Map<string, Set<() => void>>();

export function invalidate(prefix: string) {
  for (const key of [...subscribers.keys()]) if (key.startsWith(prefix)) subscribers.get(key)?.forEach((fn) => fn());
}

export function useApi<T = any>(path: string | null) {
  const [data, setData] = useState<T | undefined>(() => (path ? (cache.get(path) as T | undefined) : undefined));
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path && !cache.has(path));
  const pathRef = useRef(path);
  pathRef.current = path;

  const load = useCallback(async () => {
    const p = pathRef.current;
    if (!p) return;
    if (!cache.has(p)) setLoading(true);
    try {
      const d = await api.get<T>(p);
      cache.set(p, d);
      if (pathRef.current === p) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (pathRef.current === p) setError(e as ApiError);
    } finally {
      if (pathRef.current === p) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!path) return;
    setData(cache.get(path) as T | undefined);
    load();
    let set = subscribers.get(path);
    if (!set) subscribers.set(path, (set = new Set()));
    set.add(load);
    return () => {
      set!.delete(load);
    };
  }, [path, load]);

  const mutate = useCallback((updater: T | ((prev: T | undefined) => T)) => {
    setData((prev) => {
      const next = typeof updater === 'function' ? (updater as (p: T | undefined) => T)(prev) : updater;
      if (pathRef.current) cache.set(pathRef.current, next);
      return next;
    });
  }, []);

  return { data, error, loading, reload: load, mutate };
}
