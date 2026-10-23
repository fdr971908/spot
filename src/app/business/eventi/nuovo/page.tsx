'use client';
import { t } from '@/i18n';
import { PageHead } from '@/components/business-shell';
import { EventForm } from '@/components/event-form';

export default function NewEvent() {
  return (<><PageHead title={t.business.newEvent} /><EventForm /></>);
}
