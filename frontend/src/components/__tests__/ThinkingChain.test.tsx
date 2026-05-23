import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import ThinkingChain from '../ThinkingChain';
import type { ThinkingChain as ThinkingChainType } from '@/types/thinking';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
      <div data-testid="motion-div" {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

describe('ThinkingChain', () => {
  const mockChain: ThinkingChainType = {
    id: 'test-chain-1',
    status: 'completed',
    totalDuration: 1500,
    steps: []
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('显示 AI 思考过程标题', () => {
    render(<ThinkingChain chain={mockChain} />);
    expect(screen.getByText('AI 思考过程')).toBeInTheDocument();
  });

  test('显示空状态提示', () => {
    render(<ThinkingChain chain={mockChain} />);
    expect(screen.getByText('等待 AI 开始思考...')).toBeInTheDocument();
  });

  test('显示思维步骤', () => {
    const chainWithSteps: ThinkingChainType = {
      ...mockChain,
      steps: [
        { id: '1', type: 'analysis', title: '分析问题', status: 'completed' },
        { id: '2', type: 'reasoning', title: '制定方案', status: 'in_progress' }
      ]
    };

    render(<ThinkingChain chain={chainWithSteps} />);
    expect(screen.getByText('分析问题')).toBeInTheDocument();
    expect(screen.getByText('制定方案')).toBeInTheDocument();
  });

  test('显示思维中状态', () => {
    const thinkingChain: ThinkingChainType = {
      id: 'test-chain-2',
      status: 'thinking',
      steps: []
    };

    render(<ThinkingChain chain={thinkingChain} />);
    expect(screen.getByText('正在思考...')).toBeInTheDocument();
  });

  test('显示总耗时', () => {
    const chainWithDuration: ThinkingChainType = {
      ...mockChain,
      totalDuration: 2500
    };

    render(<ThinkingChain chain={chainWithDuration} />);
    expect(screen.getByText('2.5s')).toBeInTheDocument();
  });

  test('步骤点击回调', () => {
    const onStepClick = vi.fn();
    const chainWithSteps: ThinkingChainType = {
      ...mockChain,
      steps: [
        { id: '1', type: 'tool_call', title: '调用工具', status: 'completed', toolName: 'search' }
      ]
    };

    render(<ThinkingChain chain={chainWithSteps} onStepClick={onStepClick} />);

    const stepItem = screen.getByText('调用工具').closest('[class*="cursor-pointer"]');
    if (stepItem) {
      fireEvent.click(stepItem);
      expect(onStepClick).toHaveBeenCalledWith(chainWithSteps.steps[0]);
    }
  });

  test('显示工具调用信息', () => {
    const chainWithTool: ThinkingChainType = {
      ...mockChain,
      steps: [
        { id: '1', type: 'tool_call', title: '搜索工具', status: 'completed', toolName: 'web_search' }
      ]
    };

    render(<ThinkingChain chain={chainWithTool} />);
    expect(screen.getByText('web_search')).toBeInTheDocument();
  });

  test('显示步骤耗时', () => {
    const chainWithDuration: ThinkingChainType = {
      ...mockChain,
      steps: [
        { id: '1', type: 'analysis', title: '分析', status: 'completed', duration: 150 }
      ]
    };

    render(<ThinkingChain chain={chainWithDuration} />);
    expect(screen.getByText('150ms')).toBeInTheDocument();
  });

  test('完成状态显示', () => {
    const completedChain: ThinkingChainType = {
      ...mockChain,
      status: 'completed',
      steps: [
        { id: '1', type: 'verification', title: '验证完成', status: 'completed' }
      ]
    };

    render(<ThinkingChain chain={completedChain} />);
    expect(screen.getByText('验证完成')).toBeInTheDocument();
  });

  test('错误状态显示', () => {
    const errorChain: ThinkingChainType = {
      id: 'error-chain',
      status: 'error',
      steps: [
        { id: '1', type: 'analysis', title: '执行失败', status: 'error' }
      ]
    };

    render(<ThinkingChain chain={errorChain} />);
    expect(screen.getByText('执行失败')).toBeInTheDocument();
  });

  test('流式模式添加新步骤', async () => {
    const initialChain: ThinkingChainType = {
      ...mockChain,
      steps: [
        { id: '1', type: 'analysis', title: '步骤一', status: 'completed' }
      ]
    };

    const { rerender } = render(<ThinkingChain chain={initialChain} isStreaming />);

    const updatedChain: ThinkingChainType = {
      ...mockChain,
      steps: [
        { id: '1', type: 'analysis', title: '步骤一', status: 'completed' },
        { id: '2', type: 'reasoning', title: '步骤二', status: 'in_progress' }
      ]
    };

    rerender(<ThinkingChain chain={updatedChain} isStreaming />);

    await waitFor(() => {
      expect(screen.getByText('步骤一')).toBeInTheDocument();
    });
  });

  test('当前步骤显示处理中指示器', () => {
    const chainWithCurrent: ThinkingChainType = {
      ...mockChain,
      steps: [
        { id: '1', type: 'reasoning', title: '正在推理', status: 'in_progress' }
      ]
    };

    render(<ThinkingChain chain={chainWithCurrent} isStreaming />);
    expect(screen.getByText('处理中...')).toBeInTheDocument();
  });

  test('步骤类型图标显示', () => {
    const chainWithTypes: ThinkingChainType = {
      ...mockChain,
      steps: [
        { id: '1', type: 'tool_call', title: '工具调用', status: 'completed' },
        { id: '2', type: 'generate', title: '生成结果', status: 'completed' }
      ]
    };

    render(<ThinkingChain chain={chainWithTypes} />);
    expect(screen.getByText('工具调用')).toBeInTheDocument();
    expect(screen.getByText('生成结果')).toBeInTheDocument();
  });

  test('步骤描述显示', () => {
    const chainWithDesc: ThinkingChainType = {
      ...mockChain,
      steps: [
        {
          id: '1',
          type: 'analysis',
          title: '分析问题',
          status: 'completed',
          description: '这是一个详细的问题分析描述'
        }
      ]
    };

    render(<ThinkingChain chain={chainWithDesc} />);
    expect(screen.getByText('这是一个详细的问题分析描述')).toBeInTheDocument();
  });
});