import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import AgentPool from '../AgentPool';
import type { MissionAgent } from '../types';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Bot: () => <span data-testid="bot-icon">Bot</span>,
  X: () => <span data-testid="x-icon">X</span>,
  Clock: () => <span data-testid="clock-icon">Clock</span>,
  Brain: () => <span data-testid="brain-icon">Brain</span>,
  Zap: () => <span data-testid="zap-icon">Zap</span>,
  CheckCircle2: () => <span data-testid="check-icon">CheckCircle2</span>,
  AlertCircle: () => <span data-testid="alert-icon">AlertCircle</span>,
}));

// Mock AgentCard
vi.mock('../AgentCard', () => ({
  default: function MockAgentCard({ agent, isSelected, onClick }: any) {
    return (
      <div data-testid="agent-card" data-agent-id={agent.id} data-selected={isSelected}>
        <span>{agent.name}</span>
        <button onClick={() => onClick?.(agent)}>Click</button>
      </div>
    );
  },
}));

// Mock useMissionControlStore
const mockStore = {
  agents: [] as MissionAgent[],
};

vi.mock('../store', () => ({
  useMissionControlStore: (selector?: any) => {
    if (selector) return selector(mockStore);
    return mockStore;
  },
}));

describe('AgentPool', () => {
  const createAgent = (overrides: Partial<MissionAgent> = {}): MissionAgent => ({
    id: `agent-${Math.random()}`,
    name: '测试Agent',
    role: 'executor',
    status: 'idle',
    progress: 0,
    capabilities: [],
    lastHeartbeat: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.agents = [];
  });

  describe('基本渲染', () => {
    test('无 Agent 时显示提示', () => {
      render(<AgentPool />);
      expect(screen.getByText('暂无 Agent')).toBeInTheDocument();
    });

    test('有 Agent 时显示 Agent 卡片', () => {
      mockStore.agents = [createAgent({ name: 'Agent1' })];
      render(<AgentPool />);
      expect(screen.getByText('Agent1')).toBeInTheDocument();
    });

    test('显示多个 Agent', () => {
      mockStore.agents = [
        createAgent({ name: 'Agent1' }),
        createAgent({ name: 'Agent2' }),
        createAgent({ name: 'Agent3' }),
      ];
      render(<AgentPool />);
      expect(screen.getByText('Agent1')).toBeInTheDocument();
      expect(screen.getByText('Agent2')).toBeInTheDocument();
      expect(screen.getByText('Agent3')).toBeInTheDocument();
    });
  });

  describe('统计栏', () => {
    test('显示空闲数量', () => {
      mockStore.agents = [
        createAgent({ status: 'idle' }),
        createAgent({ status: 'idle' }),
        createAgent({ status: 'working' }),
      ];
      render(<AgentPool />);
      expect(screen.getByText('2')).toBeInTheDocument(); // 空闲
    });

    test('显示工作中数量', () => {
      mockStore.agents = [
        createAgent({ status: 'idle' }),
        createAgent({ status: 'working' }),
        createAgent({ status: 'thinking' }),
      ];
      render(<AgentPool />);
      expect(screen.getByText('2')).toBeInTheDocument(); // 工作中
    });

    test('显示已完成数量', () => {
      mockStore.agents = [
        createAgent({ status: 'completed' }),
      ];
      render(<AgentPool />);
      expect(screen.getByText('1')).toBeInTheDocument(); // 已完成
    });

    test('显示错误数量', () => {
      mockStore.agents = [
        createAgent({ status: 'error' }),
      ];
      render(<AgentPool />);
      expect(screen.getByText('1')).toBeInTheDocument(); // 错误
    });
  });

  describe('选中状态', () => {
    test('点击 Agent 打开详情面板', async () => {
      mockStore.agents = [createAgent({ id: 'agent-1', name: 'Agent1' })];
      render(<AgentPool />);

      const agentCard = screen.getByTestId('agent-card');
      fireEvent.click(agentCard.querySelector('button')!);

      // 详情面板应该显示
      await waitFor(() => {
        expect(screen.getByText('Agent 详情')).toBeInTheDocument();
      });
    });

    test('点击关闭按钮关闭详情面板', async () => {
      mockStore.agents = [createAgent({ id: 'agent-1', name: 'Agent1' })];
      render(<AgentPool />);

      // 先打开
      const agentCard = screen.getByTestId('agent-card');
      fireEvent.click(agentCard.querySelector('button')!);

      await waitFor(() => {
        expect(screen.getByText('Agent 详情')).toBeInTheDocument();
      });

      // 关闭
      const closeBtn = screen.getByTestId('x-icon')?.closest('button');
      if (closeBtn) {
        fireEvent.click(closeBtn);
      }

      await waitFor(() => {
        expect(screen.queryByText('Agent 详情')).toBeNull();
      });
    });
  });
});