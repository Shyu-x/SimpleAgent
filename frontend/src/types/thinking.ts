// AI 思维链类型定义
// 支持流式思维过程可视化

export interface ThinkingStep {
  id: string;
  type: 'analysis' | 'tool_call' | 'reasoning' | 'verification' | 'generate' | 'waiting';
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  startTime?: number;
  endTime?: number;
  duration?: number; // 毫秒
  children?: ThinkingStep[];
  toolName?: string;
  toolParams?: Record<string, unknown>;
  toolResult?: unknown;
  icon?: string;
}

export interface ThinkingChain {
  id: string;
  status: 'thinking' | 'completed' | 'error';
  totalDuration?: number;
  steps: ThinkingStep[];
}

export interface ToolCall {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  startTime: number;
  endTime?: number;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: string;
}
