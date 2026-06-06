'use client';

import { MissionControl } from '@/components/agent';

export default function AgentPage() {
  return (
    <main
      aria-label="Agent 任务控制台"
      className="h-screen w-full bg-[hsl(var(--bg-app))]"
    >
      {/* A11Y 修复: 加 h1 heading (axe page-has-heading-one) */}
      <h1 className="sr-only">Agent 任务控制台</h1>
      <MissionControl className="h-full w-full" />
    </main>
  );
}