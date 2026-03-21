'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Wrench, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import type { ToolCall } from '@/types/thinking';

interface ToolWaterfallProps {
  calls: ToolCall[];
  isRunning?: boolean;
}

// 工具调用瀑布流组件
// 展示并行/串行工具调用的执行状态和耗时
export function ToolWaterfall({ calls, isRunning }: ToolWaterfallProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-[hsl(var(--text-muted))]">
        <span>工具调用: {calls.filter(c => c.status === 'completed').length}/{calls.length}</span>
        {isRunning && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> 运行中</span>}
      </div>

      <div className="space-y-1.5">
        <AnimatePresence mode="sync">
          {calls.map((call) => (
            <motion.div
              key={call.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 rounded-lg bg-[hsl(var(--bg-muted))]/50 px-3 py-2 text-xs"
            >
              <Wrench className="h-3.5 w-3.5 text-orange-500" />

              <span className="flex-1 truncate font-medium text-[hsl(var(--text-main))]">
                {call.name}
              </span>

              {call.status === 'pending' && (
                <div className="h-2 w-2 rounded-full bg-[hsl(var(--text-muted))]/30" />
              )}
              {call.status === 'running' && (
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
              )}
              {call.status === 'completed' && (
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              )}
              {call.status === 'error' && (
                <XCircle className="h-3 w-3 text-destructive" />
              )}

              {call.endTime && (
                <span className="flex items-center gap-0.5 text-[hsl(var(--text-muted))]">
                  <Clock className="h-2.5 w-2.5" />
                  {call.endTime - call.startTime}ms
                </span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
