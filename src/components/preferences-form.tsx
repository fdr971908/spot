'use client';
import { t } from '@/i18n';
import { Chip, cx } from './ui';

export interface Prefs {
  genres: string[];
  categories: string[];
  group_size: string | null;
  venue_size: 'small' | 'large' | 'any';
  setting: 'indoor' | 'outdoor' | 'any';
  price_max: number | null;
  max_distance_km: number;
  preferred_days: number[];
}

export const GENRES = ['techno', 'house', 'dance', 'disco', 'hiphop', 'pop', 'indie', 'live', 'electronic', 'other'];
export const CATEGORIES = ['brunch', 'aperitivo', 'dinner', 'concert', 'nightclub', 'beach_club', 'outdoor', 'festival', 'standing_party', 'table_service', 'lounge_bar'];
const GROUPS = ['alone', '2', '3-5', '6-10', '10+'];

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export function GenrePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {GENRES.map((g) => (
        <Chip key={g} active={value.includes(g)} onClick={() => onChange(toggle(value, g))} className="h-11 px-4 text-[15px]">
          {t.genres[g]}
        </Chip>
      ))}
    </div>
  );
}

export function CategoryPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {CATEGORIES.map((c) => {
        const on = value.includes(c);
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(toggle(value, c))}
            className={cx('flex items-center gap-2.5 rounded-2xl p-3 text-left font-semibold ring-2 transition active:scale-[.98]', on ? 'bg-primary-soft ring-purple' : 'bg-surface-2 ring-transparent')}
          >
            <span className="text-2xl">{t.categoryEmoji[c]}</span>
            {t.categories[c]}
          </button>
        );
      })}
    </div>
  );
}

export function SocialPrefs({ value, onChange }: { value: Prefs; onChange: (v: Prefs) => void }) {
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-semibold">{t.onboarding.groupSize}</p>
        <div className="flex flex-wrap gap-2">
          {GROUPS.map((g) => (
            <Chip key={g} active={value.group_size === g} onClick={() => set('group_size', g)} className="h-11 px-4">
              {t.groupSizes[g]}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">{t.onboarding.venueSize}</p>
        <div className="flex flex-wrap gap-2">
          {(['small', 'large', 'any'] as const).map((v) => (
            <Chip key={v} active={value.venue_size === v} onClick={() => set('venue_size', v)}>
              {t.onboarding.venueSizes[v]}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">{t.onboarding.setting}</p>
        <div className="flex flex-wrap gap-2">
          {(['indoor', 'outdoor', 'any'] as const).map((v) => (
            <Chip key={v} active={value.setting === v} onClick={() => set('setting', v)}>
              {t.onboarding.settings[v]}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 flex justify-between text-sm font-semibold">
          {t.onboarding.price} <span className="text-purple">{value.price_max == null ? t.onboarding.priceAny : `€${value.price_max}`}</span>
        </p>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={value.price_max ?? 100}
          onChange={(e) => set('price_max', Number(e.target.value) >= 100 ? null : Number(e.target.value))}
          className="w-full accent-[#8b42f5]"
          aria-label={t.onboarding.price}
        />
      </div>
      <div>
        <p className="mb-2 flex justify-between text-sm font-semibold">
          {t.onboarding.distance} <span className="text-purple">{value.max_distance_km} km</span>
        </p>
        <input type="range" min={1} max={100} value={value.max_distance_km} onChange={(e) => set('max_distance_km', Number(e.target.value))} className="w-full accent-[#8b42f5]" aria-label={t.onboarding.distance} />
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">{t.onboarding.days}</p>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <Chip key={d} active={value.preferred_days.includes(d)} onClick={() => set('preferred_days', toggle(value.preferred_days, d))} className="flex-1 justify-center px-0">
              {t.days[d]}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}
