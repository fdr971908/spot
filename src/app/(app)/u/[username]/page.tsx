'use client';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { Flag, Lock, MessageCircle, Music2, ShieldOff } from 'lucide-react';
import { api, useApi } from '@/lib/api';
import { errorMessage, t } from '@/i18n';
import { useToast } from '@/components/providers';
import { ReportSheet } from '@/components/report';
import { Avatar, Badge, Button, Card, ErrorState, PageLoader, TopBar, Instagram } from '@/components/ui';

export default function PublicProfile({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<any>(`/users/${username}`);
  const [report, setReport] = useState(false);
  const [busy, setBusy] = useState(false);
  if (loading && !data) return <PageLoader />;
  if (error || !data) return (<><TopBar back /><ErrorState message={errorMessage(error?.code)} /></>);
  const p = data.profile;
  const message = async () => {
    setBusy(true);
    try {
      const r = await api.post('/conversations/direct', { user_id: p.user_id });
      router.push(`/chat/${r.conversation_id}`);
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
      setBusy(false);
    }
  };
  const block = async () => {
    try {
      if (data.blocked) await api.del(`/me/blocks/${p.user_id}`);
      else await api.post(`/users/${username}/block`);
      toast(data.blocked ? t.profile.unblock : t.profile.blocked);
      if (!data.blocked) router.back();
      else reload();
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
    }
  };
  return (
    <div className="pb-8">
      <TopBar back />
      <div className="flex flex-col items-center px-4 text-center">
        <Avatar src={p.avatar_url} name={p.display_name} size={112} />
        <h1 className="mt-3 text-2xl font-extrabold">{p.display_name}</h1>
        <p className="text-muted">@{p.username}</p>
        {p.is_private && !data.is_me && <Badge className="mt-2"><Lock className="h-3 w-3" /> {t.profile.private}</Badge>}
        {p.bio && <p className="mt-3 max-w-xs">{p.bio}</p>}
        {p.city_name && <Badge tone="purple" className="mt-2">{p.city_name}</Badge>}
        {data.social.length > 0 && (
          <div className="mt-4 flex gap-2">
            {data.social.map((s: any) => (
              <a key={s.platform} href={s.platform === 'instagram' ? `https://instagram.com/${s.handle}` : `https://tiktok.com/@${s.handle}`} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1.5 rounded-full bg-surface px-4 py-2 text-sm font-semibold shadow-[0_1px_0_var(--line)]">
                {s.platform === 'instagram' ? <Instagram className="h-4 w-4 text-[#d62976]" /> : <Music2 className="h-4 w-4" />} {s.handle}
              </a>
            ))}
          </div>
        )}
        {!data.is_me && (
          <div className="mt-5 w-full max-w-xs">
            {data.can_message ? (
              <Button block loading={busy} icon={<MessageCircle className="h-4 w-4" />} onClick={message}>{t.profile.message}</Button>
            ) : (
              <p className="rounded-2xl bg-surface-2 p-3 text-sm text-muted">{t.profile.messageUnavailable}</p>
            )}
          </div>
        )}
        {p.is_private && !data.is_me && <p className="mt-4 text-sm text-muted">{t.profile.privateProfileNote}</p>}
      </div>
      {data.shared_groups.length > 0 && (
        <Card className="mx-4 mt-6">
          <p className="mb-2 font-bold">{t.profile.sharedGroups}</p>
          <div className="flex flex-wrap gap-2">
            {data.shared_groups.map((g: any) => <Badge key={g.id} tone="purple">{g.emoji} {g.name}</Badge>)}
          </div>
        </Card>
      )}
      <p className="mx-4 mt-6 flex items-center justify-center gap-1 text-xs text-muted"><Lock className="h-3 w-3" /> {t.profile.publicNote}</p>
      {!data.is_me && (
        <div className="mx-4 mt-4 flex gap-2">
          <Button variant="ghost" block icon={<Flag className="h-4 w-4" />} onClick={() => setReport(true)}>{t.profile.report}</Button>
          <Button variant="ghost" block icon={<ShieldOff className="h-4 w-4" />} onClick={block}>{data.blocked ? t.profile.unblock : t.profile.block}</Button>
        </div>
      )}
      <ReportSheet open={report} onClose={() => setReport(false)} targetUserId={p.user_id} />
    </div>
  );
}
