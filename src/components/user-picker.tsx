'use client';
import { useEffect, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { t } from '@/i18n';
import { Avatar, cx } from './ui';

export interface PickedUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export function UserPicker({ value, onChange, exclude = [] }: { value: PickedUser[]; onChange: (v: PickedUser[]) => void; exclude?: string[] }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PickedUser[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const h = setTimeout(async () => {
      try {
        setResults(await api.get(`/users/search?q=${encodeURIComponent(q.trim())}`));
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(h);
  }, [q]);
  const picked = new Set(value.map((v) => v.user_id));
  return (
    <div>
      {value.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {value.map((u) => (
            <button key={u.user_id} onClick={() => onChange(value.filter((x) => x.user_id !== u.user_id))} className="flex items-center gap-1.5 rounded-full bg-primary-soft py-1 pl-1 pr-2.5 text-sm font-medium text-primary-ink">
              <Avatar src={u.avatar_url} name={u.display_name} size={24} /> {u.display_name.split(' ')[0]} <X className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      )}
      <label className="relative block">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.groups.searchPeople} className="h-12 w-full rounded-2xl bg-surface-2 pl-10 pr-4 text-[15px] outline-none focus:ring-2 focus:ring-purple/40" />
      </label>
      <div className="mt-2 space-y-1">
        {results
          .filter((u) => !exclude.includes(u.user_id))
          .map((u) => {
            const on = picked.has(u.user_id);
            return (
              <button
                key={u.user_id}
                onClick={() => onChange(on ? value.filter((x) => x.user_id !== u.user_id) : [...value, u])}
                className={cx('flex w-full items-center gap-3 rounded-2xl p-2 text-left transition', on ? 'bg-primary-soft' : 'hover:bg-surface-2')}
              >
                <Avatar src={u.avatar_url} name={u.display_name} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{u.display_name}</span>
                  <span className="text-xs text-muted">@{u.username}</span>
                </span>
                <span className={cx('flex h-6 w-6 items-center justify-center rounded-full ring-2', on ? 'bg-purple text-white ring-purple' : 'ring-line')}>{on && <Check className="h-4 w-4" />}</span>
              </button>
            );
          })}
      </div>
    </div>
  );
}
