'use client';

import { PerformanceMonitor } from '@/components/agent/PerformanceMonitor';

export default function AgentMonitorPage() {
  return (
    <div className="h-screen w-full bg-[hsl(var(--bg-app))]">
      <PerformanceMonitor />
    </div>
  );
}