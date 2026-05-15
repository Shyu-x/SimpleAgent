'use client';

import AgentWorkspace from '@/components/agent/AgentWorkspace';

export default function AgentWorkspacePage() {
  return (
    <div className="h-screen w-full bg-[hsl(var(--bg-app))]">
      <AgentWorkspace />
    </div>
  );
}