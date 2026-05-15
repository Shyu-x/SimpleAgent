'use client';

import { MissionControl } from '@/components/agent';

export default function AgentPage() {
  return (
    <div className="h-screen w-full bg-[hsl(var(--bg-app))]">
      <MissionControl className="h-full w-full" />
    </div>
  );
}