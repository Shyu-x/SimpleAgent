'use client';

import AgentExecutionPanel from '@/components/agent/AgentExecutionPanel';
import { use } from 'react';

interface Props {
  params: Promise<{ taskId: string }>;
}

export default function AgentExecutePage({ params }: Props) {
  const { taskId } = use(params);

  return (
    <div className="h-screen w-full bg-[hsl(var(--bg-app))]">
      <AgentExecutionPanel taskId={taskId} />
    </div>
  );
}