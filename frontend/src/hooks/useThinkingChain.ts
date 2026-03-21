'use client';

import { useCallback, useState } from 'react';
import type { ThinkingChain, ThinkingStep } from '@/types/thinking';

let stepIdCounter = 0;

export function useThinkingChain() {
  const [chain, setChain] = useState<ThinkingChain>({
    id: `chain_${Date.now()}`,
    status: 'thinking',
    steps: [],
  });

  // 开始一个新步骤
  const startStep = useCallback((
    type: ThinkingStep['type'],
    title: string,
    description?: string,
    toolName?: string
  ) => {
    const step: ThinkingStep = {
      id: `step_${++stepIdCounter}_${Date.now()}`,
      type,
      title,
      description,
      toolName,
      status: 'in_progress',
      startTime: Date.now(),
    };

    setChain(prev => ({
      ...prev,
      steps: [...prev.steps, step],
    }));

    return step.id;
  }, []);

  // 完成一个步骤
  const completeStep = useCallback((stepId: string, result?: unknown) => {
    setChain(prev => ({
      ...prev,
      steps: prev.steps.map(step =>
        step.id === stepId
          ? {
              ...step,
              status: 'completed',
              endTime: Date.now(),
              duration: Date.now() - (step.startTime || Date.now()),
              toolResult: result,
            }
          : step
      ),
    }));
  }, []);

  // 标记步骤失败
  const failStep = useCallback((stepId: string, error?: string) => {
    setChain(prev => ({
      ...prev,
      steps: prev.steps.map(step =>
        step.id === stepId
          ? {
              ...step,
              status: 'error',
              endTime: Date.now(),
              duration: Date.now() - (step.startTime || Date.now()),
              toolResult: error,
            }
          : step
      ),
    }));
  }, []);

  // 完成整个思维链
  const completeChain = useCallback(() => {
    const totalDuration = chain.steps.reduce((sum, step) => sum + (step.duration || 0), 0);
    setChain(prev => ({
      ...prev,
      status: 'completed',
      totalDuration,
    }));
  }, [chain.steps]);

  // 重置思维链
  const resetChain = useCallback(() => {
    setChain({
      id: `chain_${Date.now()}`,
      status: 'thinking',
      steps: [],
    });
  }, []);

  return {
    chain,
    startStep,
    completeStep,
    failStep,
    completeChain,
    resetChain,
  };
}
