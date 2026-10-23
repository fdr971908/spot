'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage, t } from '@/i18n';
import { useToast } from './providers';
import { Button, Chip, Field, Sheet, Textarea, Toggle } from './ui';

const REASONS = ['spam', 'harassment', 'impersonation', 'inappropriate', 'underage', 'other'];

export function ReportSheet({ open, onClose, targetUserId, messageId, eventId }: { open: boolean; onClose: () => void; targetUserId?: string; messageId?: string; eventId?: string }) {
  const toast = useToast();
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const [block, setBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/reports', { target_user_id: targetUserId, message_id: messageId, event_id: eventId, reason, details: details || undefined, block });
      toast(t.report.thanks);
      onClose();
    } catch (e: any) {
      toast(errorMessage(e.code), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={t.report.title} footer={<Button block loading={busy} onClick={submit}>{t.report.submit}</Button>}>
      <p className="mb-2 text-sm font-semibold">{t.report.reason}</p>
      <div className="flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <Chip key={r} active={reason === r} onClick={() => setReason(r)}>
            {t.report.reasons[r]}
          </Chip>
        ))}
      </div>
      <div className="mt-4">
        <Field label={t.report.details}>
          <Textarea value={details} maxLength={1000} onChange={(e) => setDetails(e.target.value)} />
        </Field>
      </div>
      {targetUserId && <Toggle label={t.report.alsoBlock} checked={block} onChange={setBlock} />}
    </Sheet>
  );
}
