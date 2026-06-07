import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import AgentCard from '../AgentCard';
import type { MissionAgent } from '../types';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Bot: () => <span data-testid="bot-icon">Bot</span>,
  Brain: () => <span data-testid="brain-icon">Brain</span>,
  Zap: () => <span data-testid="zap-icon">Zap</span>,
  CheckCircle2: () => <span data-testid="check-icon">CheckCircle2</span>,
  AlertCircle: () => <span data-testid="alert-icon">AlertCircle</span>,
  Clock: () => <span data-testid="clock-icon">Clock</span>,
  User: () => <span data-testid="user-icon">User</span>,
  Radio: () => <span data-testid="radio-icon">Radio</span>,
  Info: () => <span data-testid="info-icon">Info</span>,
}));

describe('AgentCard', () => {
  const createAgent = (overrides: Partial<MissionAgent> = {}): MissionAgent => ({
    id: 'agent-1',
    name: '测试Agent',
    role: 'executor',
    status: 'idle',
    progress: 0,
    capabilities: [],
    lastHeartbeat: Date.now(),
    ...overrides,
  });

  const defaultProps = {
    agent: createAgent(),
    isSelected: false,
    onClick: vi.fn(),
    onSelect: vi.fn(),
    onTaskClick: vi.fn(),
    onBroadcast: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本渲染', () => {
    test('显示 Agent 名称', () => {
      render(<AgentCard {...defaultProps} />);
      expect(screen.getByText('测试Agent')).toBeInTheDocument();
    });

    test('显示角色标签', () => {
      render(<AgentCard {...defaultProps} agent={createAgent({ role: 'planner' })} />);
      expect(screen.getByText('规划')).toBeInTheDocument();
    });

    test('显示空闲状态', () => {
      render(<AgentCard {...defaultProps} agent={createAgent({ status: 'idle' })} />);
      expect(screen.getByText('空闲')).toBeInTheDocument();
    });

    test('显示进度', () => {
      render(<AgentCard {...defaultProps} agent={createAgent({ progress: 75 })} />);
      expect(screen.getByText('75%')).toBeInTheDocument();
    });
  });

  describe('状态显示', () => {
    test('idle 状态', () => {
      render(<AgentCard {...defaultProps} agent={createAgent({ status: 'idle' })} />);
      expect(screen.getByText('空闲')).toBeInTheDocument();
    });

    test('thinking 状态', () => {
      render(<AgentCard {...defaultProps} agent={createAgent({ status: 'thinking' })} />);
      expect(screen.getByText('思考中')).toBeInTheDocument();
    });

    test('working 状态', () => {
      render(<AgentCard {...defaultProps} agent={createAgent({ status: 'working' })} />);
      expect(screen.getByText('工作中')).toBeInTheDocument();
    });

    test('waiting 状态', () => {
      render(<AgentCard {...defaultProps} agent={createAgent({ status: 'waiting' })} />);
      expect(screen.getByText('等待中')).toBeInTheDocument();
    });

    test('completed 状态', () => {
      render(<AgentCard {...defaultProps} agent={createAgent({ status: 'completed' })} />);
      expect(screen.getByText('已完成')).toBeInTheDocument();
    });

    test('error 状态', () => {
      render(<AgentCard {...defaultProps} agent={createAgent({ status: 'error' })} />);
      expect(screen.getByText('错误')).toBeInTheDocument();
    });
  });

  describe('角色显示', () => {
    test('planner 角色', () => {
      render(<AgentCard {...defaultProps} agent={createAgent({ role: 'planner' })} />);
      expect(screen.getByText('规划')).toBeInTheDocument();
    });

    test('executor 角色', () => {
      render(<AgentCard {...defaultProps} agent={createAgent({ role: 'executor' })} />);
      expect(screen.getByText('执行')).toBeInTheDocument();
    });

    test('reviewer 角色', () => {
      render(<AgentCard {...defaultProps} agent={createAgent({ role: 'reviewer' })} />);
      expect(screen.getByText('评审')).toBeInTheDocument();
    });

    test('coordinator 角色', () => {
      render(<AgentCard {...defaultProps} agent={createAgent({ role: 'coordinator' })} />);
      expect(screen.getByText('协调')).toBeInTheDocument();
    });
  });

  describe('交互', () => {
    test('点击卡片调用 onClick', () => {
      render(<AgentCard {...defaultProps} />);
      const card = screen.getByText('测试Agent').closest('.relative');
      if (card) {
        fireEvent.click(card);
      }
      expect(defaultProps.onClick).toHaveBeenCalled();
    });

    test('点击广播按钮调用 onBroadcast', () => {
      render(<AgentCard {...defaultProps} />);
      const broadcastBtn = screen.getByTestId('radio-icon')?.closest('button');
      if (broadcastBtn) {
        fireEvent.click(broadcastBtn);
        expect(defaultProps.onBroadcast).toHaveBeenCalledWith('agent-1');
      }
    });
  });

  describe('当前任务', () => {
    test('显示当前任务', () => {
      render(<AgentCard {...defaultProps} agent={createAgent({ currentTask: '当前执行中任务' })} />);
      expect(screen.getByText('当前执行中任务')).toBeInTheDocument();
    });

    test('无当前任务时不显示', () => {
      render(<AgentCard {...defaultProps} agent={createAgent({ currentTask: undefined })} />);
      expect(screen.queryByText('当前任务')).toBeNull();
    });
  });

  describe('能力标签', () => {
    test('显示能力标签', () => {
      render(<AgentCard {...defaultProps} agent={createAgent({ capabilities: ['coding', 'testing'] })} />);
      expect(screen.getByText('coding')).toBeInTheDocument();
      expect(screen.getByText('testing')).toBeInTheDocument();
    });

    test('超过3个能力显示 +N', () => {
      render(<AgentCard {...defaultProps} agent={createAgent({
        capabilities: ['a', 'b', 'c', 'd', 'e']
      })} />);
      expect(screen.getByText('+2')).toBeInTheDocument();
    });

    test('无能力时不显示', () => {
      render(<AgentCard {...defaultProps} agent={createAgent({ capabilities: [] })} />);
      expect(screen.queryByTestId('capability-tag')).toBeNull();
    });
  });

  describe('选中状态', () => {
    test('isSelected 为 true 时渲染正常', () => {
      render(<AgentCard {...defaultProps} isSelected={true} />);
      // 组件应该正常渲染
      expect(screen.getByText('测试Agent')).toBeInTheDocument();
    });
  });
});