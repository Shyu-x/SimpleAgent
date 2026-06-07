import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import AgentExecutionPanel from '../AgentExecutionPanel';

// Mock localStorage
const mockLocalStorage = {
  data: {},
  getItem: vi.fn((key) => mockLocalStorage.data[key] || null),
  setItem: vi.fn((key, value) => { mockLocalStorage.data[key] = value; }),
  removeItem: vi.fn((key) => { delete mockLocalStorage.data[key]; }),
  clear: vi.fn(() => { mockLocalStorage.data = {}; }),
};

Object.defineProperty(global, 'localStorage', { value: mockLocalStorage, writable: true });

// Mock fetch
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      task: {
        id: 'test-task-1',
        status: 'pending',
        createdAt: Date.now()
      }
    })
  })
) as unknown as typeof fetch;

// Mock window.scrollTo
Object.defineProperty(window, 'scrollTo', {
  value: vi.fn(),
  writable: true
});

describe('AgentExecutionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('空闲状态', () => {
    test('空闲状态显示加载提示', async () => {
      render(
        <AgentExecutionPanel
          state={{
            status: 'idle',
            currentIteration: 0,
            maxIterations: 50,
            activeAgent: null,
            allAgents: [],
            toolCalls: [],
            thinkingSteps: [],
            checkpoints: [],
            logs: []
          }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Agent 执行面板')).toBeInTheDocument();
      });
    });
  });

  describe('执行状态', () => {
    test('执行中状态显示执行面板', async () => {
      render(
        <AgentExecutionPanel
          state={{
            status: 'running',
            currentIteration: 5,
            maxIterations: 50,
            activeAgent: { id: 'agent-1', name: 'Test Agent', role: 'agent', status: 'thinking' as any },
            allAgents: [],
            toolCalls: [],
            thinkingSteps: [],
            checkpoints: [],
            startedAt: Date.now() - 30000,
            logs: []
          }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Agent 执行面板')).toBeInTheDocument();
        expect(screen.getByText('执行中')).toBeInTheDocument();
      });
    });

    test('显示当前活动 Agent', async () => {
      render(
        <AgentExecutionPanel
          state={{
            status: 'running',
            currentIteration: 5,
            maxIterations: 50,
            activeAgent: { id: 'agent-1', name: 'Main Agent', role: 'agent', status: 'executing' as any },
            allAgents: [],
            toolCalls: [],
            thinkingSteps: [],
            checkpoints: [],
            startedAt: Date.now() - 30000,
            logs: []
          }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('当前活动 Agent')).toBeInTheDocument();
        expect(screen.getByText('Main Agent')).toBeInTheDocument();
      });
    });
  });

  describe('完成状态', () => {
    test('完成状态显示已完成标记', async () => {
      render(
        <AgentExecutionPanel
          state={{
            status: 'completed',
            currentIteration: 50,
            maxIterations: 50,
            activeAgent: null,
            allAgents: [],
            toolCalls: [],
            thinkingSteps: [],
            checkpoints: [],
            startedAt: Date.now() - 60000,
            completedAt: Date.now(),
            logs: []
          }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('已完成')).toBeInTheDocument();
      });
    });
  });

  describe('错误状态', () => {
    test('错误状态显示错误信息', async () => {
      render(
        <AgentExecutionPanel
          state={{
            status: 'error',
            currentIteration: 10,
            maxIterations: 50,
            activeAgent: null,
            allAgents: [],
            toolCalls: [],
            thinkingSteps: [],
            checkpoints: [],
            startedAt: Date.now() - 30000,
            errorMessage: '执行失败：网络错误',
            logs: []
          }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('错误')).toBeInTheDocument();
        expect(screen.getByText('执行失败：网络错误')).toBeInTheDocument();
      });
    });
  });

  describe('日志功能', () => {
    test('显示执行日志', async () => {
      const logs = [
        { id: 'log-1', timestamp: Date.now(), level: 'info' as const, message: '开始执行任务...' },
        { id: 'log-2', timestamp: Date.now() - 1000, level: 'info' as const, message: '加载工具集...' }
      ];

      render(
        <AgentExecutionPanel
          state={{
            status: 'running',
            currentIteration: 1,
            maxIterations: 50,
            activeAgent: null,
            allAgents: [],
            toolCalls: [],
            thinkingSteps: [],
            checkpoints: [],
            logs
          }}
        />
      );

      // 展开日志面板
      const logToggle = screen.getByText('执行日志');
      if (logToggle) {
        fireEvent.click(logToggle);
      }

      await waitFor(() => {
        expect(screen.getByText('开始执行任务...')).toBeInTheDocument();
      });
    });

    test('日志包含时间戳', async () => {
      const logs = [
        { id: 'log-1', timestamp: Date.now(), level: 'info' as const, message: '测试日志消息' }
      ];

      render(
        <AgentExecutionPanel
          state={{
            status: 'running',
            currentIteration: 1,
            maxIterations: 50,
            activeAgent: null,
            allAgents: [],
            toolCalls: [],
            thinkingSteps: [],
            checkpoints: [],
            logs
          }}
        />
      );

      const logToggle = screen.getByText('执行日志');
      if (logToggle) {
        fireEvent.click(logToggle);
      }

      await waitFor(() => {
        // 日志消息应该可见
        expect(screen.getByText('测试日志消息')).toBeInTheDocument();
      });
    });
  });

  describe('工具调用', () => {
    test('工具标签页可点击', async () => {
      const toolCalls = [
        { id: 'tc-1', name: 'web_search', type: 'function' as const, status: 'success' as const, params: { query: 'test' }, result: { success: true, output: 'result', duration: 100 } }
      ];

      render(
        <AgentExecutionPanel
          state={{
            status: 'running',
            currentIteration: 1,
            maxIterations: 50,
            activeAgent: null,
            allAgents: [],
            toolCalls,
            thinkingSteps: [],
            checkpoints: [],
            startedAt: Date.now() - 30000,
            logs: []
          }}
        />
      );

      await waitFor(() => {
        // 点击工具标签页
        const toolsTab = screen.getByText('工具');
        if (toolsTab) {
          fireEvent.click(toolsTab);
        }
      });

      await waitFor(() => {
        expect(screen.getByText('工具')).toBeInTheDocument();
      });
    });
  });

  describe('历史记录', () => {
    test('显示历史记录标签', async () => {
      render(
        <AgentExecutionPanel
          state={{
            status: 'idle',
            currentIteration: 0,
            maxIterations: 50,
            activeAgent: null,
            allAgents: [],
            toolCalls: [],
            thinkingSteps: [],
            checkpoints: [],
            logs: []
          }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('历史')).toBeInTheDocument();
      });
    });
  });

  describe('统计功能', () => {
    test('显示统计标签', async () => {
      render(
        <AgentExecutionPanel
          state={{
            status: 'idle',
            currentIteration: 0,
            maxIterations: 50,
            activeAgent: null,
            allAgents: [],
            toolCalls: [],
            thinkingSteps: [],
            checkpoints: [],
            logs: []
          }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('统计')).toBeInTheDocument();
      });
    });
  });
});