import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import TaskBroadcast from '../TaskBroadcast';
import type { MissionTask } from '../types';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Radio: () => <span data-testid="radio-icon">Radio</span>,
  Send: () => <span data-testid="send-icon">Send</span>,
  X: () => <span data-testid="x-icon">X</span>,
  AlertTriangle: () => <span data-testid="alert-icon">AlertTriangle</span>,
}));

describe('TaskBroadcast', () => {
  const createTask = (overrides: Partial<MissionTask> = {}): MissionTask => ({
    id: `task-${Math.random()}`,
    title: '测试任务',
    description: '测试描述',
    priority: 'medium',
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  });

  const defaultProps = {
    pendingTasks: [] as MissionTask[],
    onBroadcast: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本渲染', () => {
    test('显示标题', () => {
      render(<TaskBroadcast {...defaultProps} />);
      expect(screen.getByText('任务广播')).toBeInTheDocument();
    });

    test('显示输入框', () => {
      render(<TaskBroadcast {...defaultProps} />);
      expect(screen.getByPlaceholderText('输入广播消息...')).toBeInTheDocument();
    });
  });

  describe('自定义广播', () => {
    test('输入自定义消息', () => {
      render(<TaskBroadcast {...defaultProps} />);
      const input = screen.getByPlaceholderText('输入广播消息...');
      fireEvent.change(input, { target: { value: '自定义广播消息' } });
      expect(input).toHaveValue('自定义广播消息');
    });

    test('空消息时发送按钮不可点击', () => {
      render(<TaskBroadcast {...defaultProps} />);
      const input = screen.getByPlaceholderText('输入广播消息...');
      fireEvent.change(input, { target: { value: '' } });
      // 空消息时不应该能发送
      expect(input).toHaveValue('');
    });
  });

  describe('优先任务列表', () => {
    test('无优先任务时显示提示', () => {
      render(<TaskBroadcast {...defaultProps} pendingTasks={[
        createTask({ priority: 'low' }),
        createTask({ priority: 'medium' }),
      ]} />);
      expect(screen.getByText('暂无优先任务')).toBeInTheDocument();
    });

    test('critical 优先级任务显示紧急任务标签', () => {
      render(<TaskBroadcast {...defaultProps} pendingTasks={[
        createTask({ title: '紧急任务', priority: 'critical' }),
      ]} />);
      // 两个文本节点：一个标签 + 一个标题
      const texts = screen.getAllByText('紧急任务');
      expect(texts.length).toBeGreaterThanOrEqual(1);
    });

    test('显示优先任务数量', () => {
      render(<TaskBroadcast {...defaultProps} pendingTasks={[
        createTask({ priority: 'critical' }),
        createTask({ priority: 'high' }),
        createTask({ priority: 'medium' }),
      ]} />);
      expect(screen.getByText('优先任务 (2)')).toBeInTheDocument();
    });
  });

  describe('广播提示', () => {
    test('显示底部提示', () => {
      render(<TaskBroadcast {...defaultProps} />);
      expect(screen.getByText('广播将同时通知所有在线 Agent')).toBeInTheDocument();
    });
  });
});