'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { List, Map as MapIcon, Search, SlidersHorizontal, X } from 'lucide-react';
import { useApi } from '@/lib/api';
import { formatDay, formatPrice, formatTime, rangeFor } from '@/lib/format';
import { errorMessage, fmt, t } from '@/i18n';
import { Cover, SaveButton, type EventCardData } from '@/components/events';
import { CATEGORIES, GENRES } from '@/components/preferences-form';
import { Avatar, Badge, Button, Chip, cx, EmptyState, ErrorState, Segmented, Select, Sheet, Skeleton, Toggle, Verified } from '@/components/ui';

const MapView = dynamic(() => import('@/components/map').then((m) => m.MapView), { ssr: false });

interface Filters {
  when: string;
  city: string;
  genres: string[];
  categories: string[];
  price_max: number | null;
  free: boolean;
  setting: '' | 'indoor' | 'outdoor';
  group: boolean;
  tables: boolean;
  guest_list: boolean;
  age: '' | 'all' | '18';
  km: number | null;
  sort: 'date' | 'distance';
}
const EMPTY: Filters = { when: 'any', city: '', genres: [], categories: [], price_max: null, free: false, setting: '', group: false, tables: false, guest_list: false, age: '', km: null, sort: 'date' };

function toQuery(q: string, f: Filters) {
  const p = new URLSearchParams();
  if (q.trim()) p.set('q', q.trim());
  const r = rangeFor(f.when);
  if (r.from) p.set('from', r.from);
  if (r.to) p.set('to', r.to);
  if (f.city) p.set('city', f.city);
  if (f.genres.length) p.set('genres', f.genres.join(','));
  if (f.categories.length) p.set('categories', f.categories.join(','));
  if (f.price_max != null) p.set('price_max', String(f.price_max));
  if (f.free) p.set('free', '1');
  if (f.setting) p.set('setting', f.setting);
  if (f.group) p.set('group', '1');
  if (f.tables) p.set('tables', '1');
  if (f.guest_list) p.set('guest_list', '1');
  if (f.age) p.set('age', f.age);
  if (f.km) p.set('km', String(f.km));
  p.set('sort', f.sort);
  return p.toString();
}

const toggle = <T,>(a: T[], v: T) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v]);

function ResultCard({ e }: { e: EventCardData }) {
  return (
    <Link href={`/eventi/${e.id}`} className="animate-pop flex gap-3 rounded-3xl bg-surface p-2.5 shadow-[0_1px_0_var(--line)]">
      <Cover src={e.cover_url} className="h-28 w-28 shrink-0 rounded-2xl">
        <div className="absolute right-1.5 top-1.5 scale-90">
          <SaveButton eventId={e.id} initial={e.is_saved} />
        </div>
      </Cover>
      <div className="min-w-0 flex-1 py-1">
        <p className="text-xs font-bold uppercase text-purple">
          {formatDay(e.starts_at)} · {formatTime(e.starts_at)}
        </p>
        <p className="mt-0.5 line-clamp-2 font-bold leading-snug">{e.title}</p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted">
          {e.business_name} {e.business_verified && <Verified className="h-3.5 w-3.5" />}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Badge tone="purple">{t.categories[e.category_id]}</Badge>
          <Badge>{formatPrice(e)}</Badge>
          {e.distance_km != null && <Badge>{e.distance_km} km</Badge>}
        </div>
      </div>
    </Link>
  );
}

export default function Explore() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [f, setF] = useState<Filters>(EMPTY);
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');
  const { data: meta } = useApi<{ cities: { id: string; name: string }[] }>('/meta');
  useEffect(() => {
    const h = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(h);
  }, [q]);
  const query = useMemo(() => toQuery(debounced, f), [debounced, f]);
  const { data, error, loading, reload } = useApi<{ total: number; items: (EventCardData & { lat: number; lng: number })[]; businesses: any[] }>(`/events?${query}`);
  const activeCount =
    f.genres.length + f.categories.length + (f.city ? 1 : 0) + (f.price_max != null ? 1 : 0) + (f.free ? 1 : 0) + (f.setting ? 1 : 0) + (f.group ? 1 : 0) + (f.tables ? 1 : 0) + (f.guest_list ? 1 : 0) + (f.age ? 1 : 0) + (f.km ? 1 : 0);
  const points = useMemo(() => (data?.items ?? []).filter((e) => e.lat != null).map((e) => ({ id: e.id, lat: e.lat, lng: e.lng, label: e.title, href: `/eventi/${e.id}` })), [data]);

  return (
    <div>
      <header className="sticky top-0 z-30 bg-bg/85 px-4 pb-3 pt-3 backdrop-blur-xl">
        <h1 className="mb-3 text-2xl font-extrabold">{t.explore.title}</h1>
        <div className="flex gap-2">
          <label className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.explore.placeholder}
              className="h-12 w-full rounded-full bg-surface pl-12 pr-10 text-[15px] shadow-[0_1px_0_var(--line)] outline-none ring-1 ring-transparent focus:ring-purple/50"
              aria-label={t.common.search}
            />
            {q && (
              <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-label={t.common.close}>
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          <button
            onClick={() => {
              setDraft(f);
              setOpen(true);
            }}
            className={cx('relative flex h-12 w-12 items-center justify-center rounded-full shadow-[0_1px_0_var(--line)]', activeCount ? 'bg-purple text-white' : 'bg-surface')}
            aria-label={t.explore.filters}
          >
            <SlidersHorizontal className="h-5 w-5" />
            {activeCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-coral text-[11px] font-bold text-white">{activeCount}</span>}
          </button>
        </div>
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          {['any', 'today', 'tomorrow', 'weekend', 'week'].map((w) => (
            <Chip key={w} active={f.when === w} onClick={() => setF({ ...f, when: w })}>
              {t.explore.whenOptions[w]}
            </Chip>
          ))}
          {CATEGORIES.slice(0, 8).map((c) => (
            <Chip key={c} active={f.categories.includes(c)} onClick={() => setF({ ...f, categories: toggle(f.categories, c) })}>
              {t.categoryEmoji[c]} {t.categories[c]}
            </Chip>
          ))}
        </div>
      </header>

      <div className="px-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-muted">{data ? fmt(t.explore.results, { n: data.total }) : ' '}</p>
          <Segmented
            value={view}
            onChange={setView}
            className="w-44"
            options={[
              { value: 'list', label: <span className="inline-flex items-center gap-1"><List className="h-4 w-4" />{t.explore.list}</span> },
              { value: 'map', label: <span className="inline-flex items-center gap-1"><MapIcon className="h-4 w-4" />{t.explore.map}</span> },
            ]}
          />
        </div>

        {data?.businesses?.length ? (
          <div className="mb-4">
            <p className="mb-2 text-sm font-bold">{t.explore.venues}</p>
            <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
              {data.businesses.map((b) => (
                <Link key={b.id} href={`/locali/${b.slug}`} className="flex w-24 shrink-0 flex-col items-center gap-1 text-center">
                  <Avatar src={b.logo_url} name={b.name} size={64} className="rounded-3xl" />
                  <span className="flex w-full items-center justify-center gap-0.5 truncate text-xs font-semibold">
                    <span className="truncate">{b.name}</span> {b.verified && <Verified className="h-3 w-3" />}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {view === 'map' && (
          <div className="mb-4 overflow-hidden rounded-3xl">
            <MapView points={points} className="h-72 w-full" zoom={12} />
            <p className="bg-surface-2 px-3 py-2 text-xs text-muted">{t.explore.mapUnavailable}</p>
          </div>
        )}

        {loading && !data ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-3xl" />
            ))}
          </div>
        ) : error ? (
          <ErrorState onRetry={reload} message={errorMessage(error.code)} />
        ) : !data?.items.length ? (
          <EmptyState icon="🔍" title={t.explore.noResults} action={activeCount ? <Button variant="soft" onClick={() => setF(EMPTY)}>{t.explore.reset}</Button> : undefined} />
        ) : (
          <div className={cx('space-y-3 pb-6 transition-opacity', loading && 'opacity-60')}>
            {data.items.map((e) => (
              <ResultCard key={e.id} e={e} />
            ))}
          </div>
        )}
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t.explore.filters}
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDraft(EMPTY)}>
              {t.explore.reset}
            </Button>
            <Button
              block
              onClick={() => {
                setF(draft);
                setOpen(false);
              }}
            >
              {t.explore.apply}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="mb-1.5 block text-sm font-semibold">{t.explore.city}</span>
              <Select value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })}>
                <option value="">{t.explore.anyCity}</option>
                {meta?.cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-semibold">{t.explore.sort}</span>
              <Select value={draft.sort} onChange={(e) => setDraft({ ...draft, sort: e.target.value as any })}>
                <option value="date">{t.explore.sortDate}</option>
                <option value="distance">{t.explore.sortDistance}</option>
              </Select>
            </label>
          </div>
          <div>
            <p className="mb-2 flex justify-between text-sm font-semibold">
              {t.explore.distance} <span className="text-purple">{draft.km ? `${draft.km} km` : t.explore.anyCity}</span>
            </p>
            <input type="range" min={1} max={50} value={draft.km ?? 50} onChange={(e) => setDraft({ ...draft, km: Number(e.target.value) >= 50 ? null : Number(e.target.value) })} className="w-full accent-[#8b42f5]" aria-label={t.explore.distance} />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">{t.explore.music}</p>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((g) => (
                <Chip key={g} active={draft.genres.includes(g)} onClick={() => setDraft({ ...draft, genres: toggle(draft.genres, g) })}>
                  {t.genres[g]}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">{t.explore.activity}</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <Chip key={c} active={draft.categories.includes(c)} onClick={() => setDraft({ ...draft, categories: toggle(draft.categories, c) })}>
                  {t.categoryEmoji[c]} {t.categories[c]}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 flex justify-between text-sm font-semibold">
              {t.explore.price} <span className="text-purple">{draft.price_max == null ? t.onboarding.priceAny : `€${draft.price_max}`}</span>
            </p>
            <input type="range" min={0} max={100} step={5} value={draft.price_max ?? 100} onChange={(e) => setDraft({ ...draft, price_max: Number(e.target.value) >= 100 ? null : Number(e.target.value) })} className="w-full accent-[#8b42f5]" aria-label={t.explore.price} />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">{t.explore.setting}</p>
            <div className="flex gap-2">
              {(['', 'indoor', 'outdoor'] as const).map((s) => (
                <Chip key={s} active={draft.setting === s} onClick={() => setDraft({ ...draft, setting: s })}>
                  {s ? t.onboarding.settings[s] : t.onboarding.settings.any}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">{t.explore.age}</p>
            <div className="flex gap-2">
              {(['', 'all', '18'] as const).map((a) => (
                <Chip key={a} active={draft.age === a} onClick={() => setDraft({ ...draft, age: a })}>
                  {t.explore.ageOptions[a || 'any']}
                </Chip>
              ))}
            </div>
          </div>
          <div className="divide-y divide-line">
            <Toggle label={t.explore.onlyFree} checked={draft.free} onChange={(v) => setDraft({ ...draft, free: v })} />
            <Toggle label={t.explore.group} checked={draft.group} onChange={(v) => setDraft({ ...draft, group: v })} />
            <Toggle label={t.explore.tables} checked={draft.tables} onChange={(v) => setDraft({ ...draft, tables: v })} />
            <Toggle label={t.explore.guestList} checked={draft.guest_list} onChange={(v) => setDraft({ ...draft, guest_list: v })} />
          </div>
        </div>
      </Sheet>
    </div>
  );
}
