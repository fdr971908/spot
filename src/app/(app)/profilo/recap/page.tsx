'use client';
import { useRef, useState } from 'react';
import { Download, Info, Lock } from 'lucide-react';
import { useApi } from '@/lib/api';
import { fmt, t } from '@/i18n';
import { useSession } from '@/components/providers';
import { Button, Chip, EmptyState, PageLoader, TopBar } from '@/components/ui';

const PIE = ['#8B42F5', '#FF9B87', '#FFB5D2', '#DCA5FF', '#FFD36E'];

/** Exports one recap card as PNG (drawn on canvas; never uploaded anywhere). */
function downloadCard(title: string, lines: string[], name: string) {
  const c = document.createElement('canvas');
  c.width = 1080;
  c.height = 1350;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 1080, 1350);
  grad.addColorStop(0, '#8b42f5');
  grad.addColorStop(0.6, '#b36cff');
  grad.addColorStop(1, '#ff8fc8');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1080, 1350);
  g.fillStyle = 'rgba(255,255,255,.15)';
  g.beginPath();
  g.arc(900, 200, 260, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = '800 64px Poppins, sans-serif';
  g.fillText('spot.', 90, 160);
  g.font = '800 92px Poppins, sans-serif';
  title.split('\n').forEach((l, i) => g.fillText(l, 90, 420 + i * 110));
  g.font = '600 54px Poppins, sans-serif';
  lines.forEach((l, i) => g.fillText(l, 90, 720 + i * 90));
  g.font = '500 34px Poppins, sans-serif';
  g.fillText('Good plans. Great people.', 90, 1260);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = `spot-recap-${name}.png`;
  a.click();
}

export default function Recap() {
  const { me } = useSession();
  const now = new Date().getFullYear();
  const [year, setYear] = useState(now);
  const { data } = useApi<any>(`/me/recap?year=${year}`);
  if (!data) return <PageLoader />;
  const months = data.months as number[];
  const max = Math.max(1, ...months);
  const totalG = (data.top_genres as any[]).reduce((a, g) => a + g.n, 0) || 1;
  let acc = 0;
  const pie = (data.top_genres as any[]).map((g, i) => {
    const from = (acc / totalG) * 360;
    acc += g.n;
    return `${PIE[i % PIE.length]} ${from}deg ${(acc / totalG) * 360}deg`;
  });

  const Card = ({ children, onShare, className = '' }: { children: React.ReactNode; onShare?: () => void; className?: string }) => (
    <section className={`animate-pop relative overflow-hidden rounded-[2rem] p-6 shadow-[var(--shadow-card)] ${className}`}>
      {children}
      {onShare && (
        <button onClick={onShare} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 backdrop-blur" aria-label={t.recap.share}>
          <Download className="h-4 w-4" />
        </button>
      )}
    </section>
  );

  return (
    <div className="pb-10">
      <TopBar back title={fmt(t.recap.title, { y: year })} />
      <div className="px-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-1 text-sm text-muted"><Lock className="h-4 w-4" /> {t.recap.private}</p>
          <div className="flex gap-1">
            {[now - 1, now].map((y) => <Chip key={y} active={y === year} onClick={() => setYear(y)}>{y}</Chip>)}
          </div>
        </div>
        {!data.confirmed_events ? (
          <EmptyState icon="✨" title={fmt(t.recap.title, { y: year })}>{t.recap.empty}</EmptyState>
        ) : (
          <div className="space-y-4">
            <Card className="bg-brand text-white" onShare={() => downloadCard(`La mia nightlife\n${year}`, [`${data.confirmed_events} eventi`, `${data.venues_count} locali`, `${data.cities_count} città`], 'numeri')}>
              <p className="text-sm font-semibold text-white/80">{me?.profile?.display_name}</p>
              <h2 className="mt-1 text-3xl font-extrabold leading-tight">La tua nightlife<br />in numeri</h2>
              <div className="mt-6 grid grid-cols-2 gap-4">
                {[[data.confirmed_events, t.recap.confirmed], [data.venues_count, t.recap.venues], [data.cities_count, t.recap.cities], [data.events_with_groups, t.recap.withGroups]].map(([n, l]) => (
                  <div key={l as string}><p className="text-5xl font-extrabold">{n}</p><p className="text-sm text-white/85">{l}</p></div>
                ))}
              </div>
            </Card>
            <Card className="bg-navy text-white" onShare={() => downloadCard('Top locali', (data.top_venues as any[]).map((v, i) => `${i + 1}. ${v.name}`), 'locali')}>
              <h2 className="text-2xl font-extrabold">{t.recap.topVenues}</h2>
              <ol className="mt-4 space-y-3">
                {(data.top_venues as any[]).map((v, i) => (
                  <li key={v.slug} className="flex items-center gap-3">
                    <span className="text-brand text-3xl font-extrabold">{i + 1}</span>
                    <span className="flex-1 text-lg font-semibold">{v.name}</span>
                    <span className="text-sm text-white/60">{v.n}×</span>
                  </li>
                ))}
              </ol>
            </Card>
            <Card className="bg-surface" onShare={() => downloadCard('Generi preferiti', (data.top_genres as any[]).map((g) => `${t.genres[g.id]} · ${Math.round((g.n / totalG) * 100)}%`), 'generi')}>
              <h2 className="text-2xl font-extrabold">{t.recap.topGenres}</h2>
              <div className="mt-4 flex items-center gap-5">
                <div className="h-32 w-32 shrink-0 rounded-full" style={{ background: `conic-gradient(${pie.join(',')})` }}>
                  <div className="m-[22%] h-[56%] w-[56%] rounded-full bg-surface" />
                </div>
                <ul className="space-y-1.5 text-sm">
                  {(data.top_genres as any[]).map((g, i) => (
                    <li key={g.id} className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: PIE[i % PIE.length] }} />
                      <span className="font-semibold">{t.genres[g.id]}</span>
                      <span className="text-muted">{Math.round((g.n / totalG) * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
            <Card className="bg-brand-soft">
              <h2 className="text-2xl font-extrabold">{t.recap.activeMonth}</h2>
              <p className="text-brand mt-1 text-3xl font-extrabold">{data.most_active_month ? t.months[data.most_active_month - 1] : '–'}</p>
              <div className="mt-4 flex h-28 items-end gap-1.5">
                {months.map((n, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <div className="bg-brand w-full rounded-t-lg" style={{ height: `${(n / max) * 100}%`, minHeight: n ? 6 : 2, opacity: n ? 1 : 0.25 }} />
                    <span className="text-[10px] text-muted">{t.months[i][0]}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="bg-surface">
              <h2 className="text-2xl font-extrabold">{t.recap.topCategories}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {(data.top_categories as any[]).map((c) => (
                  <span key={c.id} className="rounded-full bg-primary-soft px-3 py-1.5 font-semibold text-primary-ink">{t.categoryEmoji[c.id]} {t.categories[c.id]} · {c.n}</span>
                ))}
              </div>
            </Card>
            <div className="space-y-1 rounded-2xl bg-surface-2 p-4 text-xs text-muted">
              <p className="flex items-start gap-1.5"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t.recap.disclaimer}</p>
              {data.unconfirmed_events > 0 && <p>{fmt(t.recap.unconfirmed, { n: data.unconfirmed_events })}</p>}
              <p>{t.recap.comingSoon}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
