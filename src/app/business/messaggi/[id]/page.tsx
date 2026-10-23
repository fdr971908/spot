'use client';
import { use } from 'react';
import { ChatView } from '@/components/chat';

export default function BizConversation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="-m-4 overflow-hidden bg-bg lg:-m-8 lg:mx-auto lg:max-w-2xl lg:rounded-3xl lg:shadow-[var(--shadow-card)] [&>div]:h-[calc(100dvh-7rem)] lg:[&>div]:h-[calc(100dvh-4rem)]">
      <ChatView id={id} asBusiness backHref="/business/messaggi" />
    </div>
  );
}
