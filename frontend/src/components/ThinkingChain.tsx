'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Wrench,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  Clock,
  ChevronRight
} from 'lucide-react';
import type { ThinkingChain, ThinkingStep } from '@/types/thinking';
import { useEffect, useState } from 'react';

interface ThinkingChainProps {
  chain: ThinkingChain;
  isStreaming?: boolean;
  onStepClick?: (step: ThinkingStep) => void;
}

// 步骤类型对应的图标
const stepIcons = {
  analysis: Brain,
  tool_call: Wrench,
  reasoning: Sparkles,
  verification: CheckCircle2,
  generate: Sparkles,
  waiting: Loader2,
};

// 步骤类型对应的颜色
const stepColors = {
  analysis: 'text-blue-500 bg-blue-500/10',
  tool_call: 'text-orange-500 bg-orange-500/10',
  reasoning: 'text-purple-500 bg-purple-500/10',
  verification: 'text-green-500 bg-green-500/10',
  generate: 'text-pink-500 bg-pink-500/10',
  waiting: 'text-gray-500 bg-gray-500/10',
};

export default function ThinkingChain({ chain, isStreaming, onStepClick }: ThinkingChainProps) {
  const [visibleSteps, setVisibleSteps] = useState<ThinkingStep[]>([]);

  // 流式更新步骤
  useEffect(() => {
    if (isStreaming && chain.steps.length > 0) {
      const latestStep = chain.steps[chain.steps.length - 1];
      if (!visibleSteps.find(s => s.id === latestStep.id)) {
        setVisibleSteps(prev => [...prev, latestStep]);
      }
    } else {
      setVisibleSteps(chain.steps);
    }
  }, [chain.steps, isStreaming]);

  return (
    <div className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/95 backdrop-blur-sm overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-[hsl(var(--border-subtle))] px-4 py-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary animate-pulse" />
          <span className="text-sm font-medium text-[hsl(var(--text-main))]">
            AI 思考过程
          </span>
          {chain.status === 'thinking' && (
            <span className="flex items-center gap-1 text-xs text-[hsl(var(--text-muted))]">
              <Loader2 className="h-3 w-3 animate-spin" />
              正在思考...
            </span>
          )}
        </div>

        {chain.totalDuration && (
          <div className="flex items-center gap-1 text-xs text-[hsl(var(--text-muted))]">
            <Clock className="h-3 w-3" />
            {(chain.totalDuration / 1000).toFixed(1)}s
          </div>
        )}
      </div>

      {/* 步骤列表 */}
      <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
        <AnimatePresence mode="sync">
          {visibleSteps.map((step, index) => (
            <ThinkingStepItem
              key={step.id}
              step={step}
              index={index}
              isLast={index === visibleSteps.length - 1 && isStreaming}
              onClick={() => onStepClick?.(step)}
            />
          ))}
        </AnimatePresence>

        {visibleSteps.length === 0 && (
          <div className="text-center py-4 text-sm text-[hsl(var(--text-muted))]">
            等待 AI 开始思考...
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingStepItem({
  step,
  index,
  isLast,
  onClick
}: {
  step: ThinkingStep;
  index: number;
  isLast: boolean;
  onClick?: () => void;
}) {
  const Icon = stepIcons[step.type] || Brain;
  const colorClass = stepColors[step.type] || 'text-gray-500 bg-gray-500/10';

  const statusIcon = {
    pending: <div className="h-2 w-2 rounded-full bg-[hsl(var(--text-muted))]/30" />,
    in_progress: <Loader2 className="h-3 w-3 animate-spin text-primary" />,
    completed: <CheckCircle2 className="h-3 w-3 text-green-500" />,
    error: <XCircle className="h-3 w-3 text-destructive" />,
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className={`
        relative flex items-start gap-3 rounded-lg border p-3 cursor-pointer
        transition-colors hover:bg-[hsl(var(--bg-muted))]/50
        ${step.status === 'in_progress' ? 'border-primary/30 bg-primary/5' : 'border-transparent'}
      `}
      onClick={onClick}
    >
      {/* 连接线 */}
      {index > 0 && (
        <div className="absolute -top-2 left-5 w-px h-2 bg-[hsl(var(--border-subtle))]" />
      )}

      {/* 图标 */}
      <div className={`flex shrink-0 h-6 w-6 items-center justify-center rounded-md ${colorClass}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>

      {/* 内容 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[hsl(var(--text-main))]">
            {step.title}
          </span>
          {statusIcon[step.status]}
          {step.duration && (
            <span className="text-xs text-[hsl(var(--text-muted))]">
              {step.duration}ms
            </span>
          )}
        </div>

        {step.description && (
          <p className="mt-1 text-xs text-[hsl(var(--text-muted))] line-clamp-2">
            {step.description}
          </p>
        )}

        {step.toolName && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="rounded bg-orange-500/10 px-1.5 py-0.5 text-orange-600">
              {step.toolName}
            </span>
          </div>
        )}

        {isLast && (
          <div className="mt-2 flex items-center gap-1 text-xs text-primary">
            <span className="animate-pulse">●</span>
            <span>处理中...</span>
          </div>
        )}
      </div>

      <ChevronRight className="h-4 w-4 text-[hsl(var(--text-muted))] shrink-0 mt-1" />
    </motion.div>
  );
}
