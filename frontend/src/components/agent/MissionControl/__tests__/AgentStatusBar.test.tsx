import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import AgentStatusBar from '../AgentStatusBar';
import type { MissionAgent } from '../types';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    circle: ({ children, ...props }: any) => <circle {...props}>{children}</circle>,
  },
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Bot: () => <span data-testid="bot-icon">Bot</span>,
  CheckCircle2: () => <span data-testid="check-icon">CheckCircle2</span>,
  XCircle: () => <span data-testid="x-icon">XCircle</span>,
  Clock: () => <span data-testid="clock-icon">Clock</span>,
  Activity: () => <span data-testid="activity-icon">Activity</span>,
  Zap: () => <span data-testid="zap-icon">Zap</span>,
}));

describe('AgentStatusBar', () => {
  const createAgent = (overrides: Partial<MissionAgent> = {}): MissionAgent => ({
    id: `agent-${Math.random()}`,
    name: 'Agent',
    role: 'executor',
    status: 'idle',
    progress: 0,
    capabilities: [],
    lastHeartbeat: Date.now(),
    ...overrides,
  });

  const defaultProps = {
    agents: [] as MissionAgent[],
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    isActive: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本渲染', () => {
    test('isActive 为 false 显示已停止', () => {
      render(<AgentStatusBar {...defaultProps} isActive={false} />);
      expect(screen.getByText('已停止')).toBeInTheDocument();
    });

    test('isActive 为 true 显示进行中', () => {
      render(<AgentStatusBar {...defaultProps} isActive={true} />);
      expect(screen.getByText('进行中')).toBeInTheDocument();
    });
  });

  describe('任务进度', () => {
    test('显示任务进度百分比', () => {
      render(<AgentStatusBar {...defaultProps} totalTasks={10} completedTasks={5} />);
      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    test('显示完成数量', () => {
      render(<AgentStatusBar {...defaultProps} totalTasks={10} completedTasks={3} />);
      expect(screen.getByText('3/10 完成')).toBeInTheDocument();
    });

    test('显示失败数量', () => {
      render(<AgentStatusBar {...defaultProps} totalTasks={10} completedTasks={5} failedTasks={2} />);
      expect(screen.getByText('(2 失败)')).toBeInTheDocument();
    });

    test('无任务时显示 0%', () => {
      render(<AgentStatusBar {...defaultProps} totalTasks={0} completedTasks={0} />);
      expect(screen.getByText('0%')).toBeInTheDocument();
    });
  });

  describe('Agent 统计', () => {
    test('显示空闲 Agent 数量', () => {
      render(<AgentStatusBar {...defaultProps} agents={[
        createAgent({ status: 'idle' }),
        createAgent({ status: 'idle' }),
      ]} />);
      expect(screen.getByText('2')).toBeInTheDocument(); // 空闲数量
    });

    test('显示工作中 Agent 数量', () => {
      render(<AgentStatusBar {...defaultProps} agents={[
        createAgent({ status: 'working' }),
      ]} />);
      expect(screen.getByText('1')).toBeInTheDocument(); // 工作数量
    });

    test('显示已完成 Agent 数量', () => {
      render(<AgentStatusBar {...defaultProps} agents={[
        createAgent({ status: 'completed' }),
      ]} />);
      expect(screen.getByText('1')).toBeInTheDocument(); // 完成数量
    });

    test('显示错误 Agent 数量', () => {
      render(<AgentStatusBar {...defaultProps} agents={[
        createAgent({ status: 'error' }),
      ]} />);
      expect(screen.getByText('1')).toBeInTheDocument(); // 错误数量
    });
  });

  describe('活动指示器', () => {
    test('isActive 为 true 显示 LIVE 指示器', () => {
      render(<AgentStatusBar {...defaultProps} isActive={true} />);
      expect(screen.getByText('LIVE')).toBeInTheDocument();
    });

    test('isActive 为 false 不显示 LIVE', () => {
      render(<AgentStatusBar {...defaultProps} isActive={false} />);
      expect(screen.queryByText('LIVE')).toBeNull();
    });
  });

  describe('进度环', () => {
    test('显示进度环组件', () => {
      render(<AgentStatusBar {...defaultProps} totalTasks={10} completedTasks={5} />);
      // 进度环应该显示完成数量
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });
});