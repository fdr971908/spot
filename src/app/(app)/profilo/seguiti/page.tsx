'use client';
import Link from 'next/link';
import { api, useApi } from '@/lib/api';
import { errorMessage, t } from '@/i18n';
import { useToast } from '@/components/providers';
import { Avatar, Button, Card, EmptyState, PageLoader, TopBar, Verified } from '@/components/ui';

export default function Follows() {
  const toast = useToast();
  const { data, mutate } = useApi<any[]>('/me/follows');
  if (!data) return <PageLoader />;
  const togglePromo = async (b: any) => {
    mutate(data.map((x) => (x.id === b.id ? { ...x, notify_promotions: !x.notify_promotions } : x)));
    try {
      const r = await api.patch(`/businesses/${b.slug}/follow`, { notify_promotions: !b.notify_promotions });
      if (r.notify_promotions && !r.promotional_enabled) toast(t.notifPrefs.promotionalDesc);
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
    }
  };
  return (
    <div className="pb-8">
      <TopBar back title={t.profile.menu.follows} />
      <div className="space-y-2 px-4">
        {!data.length && <EmptyState icon="💜" title={t.profile.followsEmpty} action={<Link href="/esplora"><Button variant="soft">{t.home.discover}</Button></Link>} />}
        {data.map((b) => (
          <Card key={b.id} className="flex items-center gap-3 p-3">
            <Link href={`/locali/${b.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar src={b.logo_url} name={b.name} size={48} className="rounded-2xl" />
              <span className="min-w-0">
                <span className="flex items-center gap-1 font-semibold"><span className="truncate">{b.name}</span> {b.verified && <Verified className="h-3.5 w-3.5" />}</span>
                <span className="text-xs text-muted">{t.businessCategories[b.category]} · {b.city_name}</span>
              </span>
            </Link>
            <Button size="sm" variant={b.notify_promotions ? 'primary' : 'soft'} onClick={() => togglePromo(b)} aria-pressed={b.notify_promotions}>
              🔔 {t.profile.notifyPromos}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
