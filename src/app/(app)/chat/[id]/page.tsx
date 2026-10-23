'use client';
import { use } from 'react';
import { ChatView } from '@/components/chat';

export default function Conversation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ChatView id={id} backHref="/chat" />;
}
