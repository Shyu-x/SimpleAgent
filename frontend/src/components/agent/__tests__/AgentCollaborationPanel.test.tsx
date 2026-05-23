import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import AgentCollaborationPanel from '../AgentCollaborationPanel';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
      <div data-testid="motion-div" {...props}>{children}</div>
    ),
    button: ({ children, onClick, ...props }: { children: React.ReactNode; onClick?: () => void; [key: string]: unknown }) => (
      <button onClick={onClick} {...props}>{children}</button>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock localStorage
const mockLocalStorage = {
  data: {},
  getItem: vi.fn((key: string) => mockLocalStorage.data[key] || null),
  setItem: vi.fn((key: string, value: string) => { mockLocalStorage.data[key] = value; }),
  removeItem: vi.fn((key: string) => { delete mockLocalStorage.data[key]; }),
  clear: vi.fn(() => { mockLocalStorage.data = {}; }),
};
Object.defineProperty(global, 'localStorage', { value: mockLocalStorage, writable: true });

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock process.env
const originalEnv = process.env.NEXT_PUBLIC_BACKEND_URL;
beforeAll(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = 'http://localhost:30000';
});
afterAll(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = originalEnv;
});

// Helper function to create mock data
function createMockWorkflow() {
  return {
    id: 'workflow-1',
    name: '测试工作流',
    description: '测试工作流描述',
    process: 'sequential' as const,
    agents: [
      { id: 'agent-1', name: 'Agent-1', status: 'idle', type: 'worker' },
      { id: 'agent-2', name: 'Agent-2', status: 'idle', type: 'worker' }
    ],
    tasks: [
      { id: 'task-1', name: '任务一', agentId: 'agent-1', status: 'pending' as const, order: 1 },
      { id: 'task-2', name: '任务二', agentId: 'agent-2', status: 'pending' as const, order: 2 }
    ]
  };
}

function createMockExecutionState() {
  return {
    status: 'idle' as const,
    currentTaskIndex: 0,
    progress: 0,
    errors: [],
    toolCalls: [],
    pendingConfirmations: []
  };
}

describe('AgentCollaborationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.clear();
    mockFetch.mockReset();

    // Mock successful fetch responses
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, agents: [] })
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('基础渲染', () => {
    test('显示工作流名称', () => {
      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={createMockExecutionState()}
        />
      );
      expect(screen.getByText('测试工作流')).toBeInTheDocument();
    });

    test('显示执行进度', () => {
      const executionState = { ...createMockExecutionState(), progress: 50 };
      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={executionState}
        />
      );
      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    test('显示任务统计', () => {
      const workflow = createMockWorkflow();
      render(
        <AgentCollaborationPanel
          workflow={workflow}
          executionState={createMockExecutionState()}
        />
      );
      expect(screen.getByText(/0\/2 任务/)).toBeInTheDocument();
    });
  });

  describe('控制按钮', () => {
    test('空闲状态显示开始按钮', () => {
      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={createMockExecutionState()}
        />
      );
      expect(screen.getByRole('button', { name: /开始/i })).toBeInTheDocument();
    });

    test('点击开始按钮触发回调', () => {
      const onStart = vi.fn();
      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={createMockExecutionState()}
          onStart={onStart}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /开始/i }));
      expect(onStart).toHaveBeenCalled();
    });

    test('运行状态显示暂停按钮', () => {
      const runningState = { ...createMockExecutionState(), status: 'running' as const };
      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={runningState}
        />
      );
      expect(screen.getByRole('button', { name: /暂停/i })).toBeInTheDocument();
    });

    test('运行状态显示停止按钮', () => {
      const runningState = { ...createMockExecutionState(), status: 'running' as const };
      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={runningState}
        />
      );
      expect(screen.getByRole('button', { name: /停止/i })).toBeInTheDocument();
    });

    test('暂停状态显示继续按钮', () => {
      const pausedState = { ...createMockExecutionState(), status: 'paused' as const };
      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={pausedState}
        />
      );
      expect(screen.getByRole('button', { name: /继续/i })).toBeInTheDocument();
    });

    test('错误状态显示重试按钮', () => {
      const errorState = { ...createMockExecutionState(), status: 'error' as const };
      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={errorState}
        />
      );
      expect(screen.getByRole('button', { name: /重试/i })).toBeInTheDocument();
    });
  });

  describe('标签页切换', () => {
    test('默认显示 Agents 标签', () => {
      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={createMockExecutionState()}
        />
      );
      expect(screen.getByRole('button', { name: /Agents/i })).toBeInTheDocument();
    });

    test('显示任务标签', () => {
      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={createMockExecutionState()}
        />
      );
      expect(screen.getByRole('button', { name: /任务/i })).toBeInTheDocument();
    });

    test('显示工具标签', () => {
      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={createMockExecutionState()}
        />
      );
      expect(screen.getByRole('button', { name: /工具/i })).toBeInTheDocument();
    });

    test('显示 A2A 标签', () => {
      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={createMockExecutionState()}
        />
      );
      expect(screen.getByRole('button', { name: /A2A/i })).toBeInTheDocument();
    });

    test('切换到任务标签显示任务列表', async () => {
      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={createMockExecutionState()}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /任务/i }));

      await waitFor(() => {
        expect(screen.getByText('任务一')).toBeInTheDocument();
        expect(screen.getByText('任务二')).toBeInTheDocument();
      });
    });

    test('切换到工具标签显示空状态', () => {
      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={createMockExecutionState()}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /工具/i }));
      expect(screen.getByText('暂无工具调用记录')).toBeInTheDocument();
    });

    test('有错误时显示错误标签', () => {
      const stateWithErrors = {
        ...createMockExecutionState(),
        errors: [{ id: 'e1', type: 'error', message: '测试错误' }]
      };
      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={stateWithErrors}
        />
      );
      expect(screen.getByRole('button', { name: /错误/i })).toBeInTheDocument();
    });
  });

  describe('任务列表', () => {
    test('显示任务名称', () => {
      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={createMockExecutionState()}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /任务/i }));

      expect(screen.getByText('任务一')).toBeInTheDocument();
    });

    test('显示分配到的 Agent', async () => {
      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={createMockExecutionState()}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /任务/i }));

      await waitFor(() => {
        expect(screen.getByText('Agent-1')).toBeInTheDocument();
      });
    });

    test('已完成任务显示正确状态', async () => {
      const workflow = createMockWorkflow();
      workflow.tasks[0].status = 'completed';

      render(
        <AgentCollaborationPanel
          workflow={workflow}
          executionState={createMockExecutionState()}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /任务/i }));

      await waitFor(() => {
        expect(screen.getByText('任务一')).toBeInTheDocument();
      });
    });
  });

  describe('A2A 协议', () => {
    test('A2A 标签显示', () => {
      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={createMockExecutionState()}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /A2A/i }));

      // 等待 A2A 面板加载
      expect(screen.getByText('A2A')).toBeInTheDocument();
    });

    test('A2A 在线状态显示', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          agents: [],
          onlineAgents: 2,
          pendingTasks: 1
        })
      });

      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={createMockExecutionState()}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /A2A/i }));

      await waitFor(() => {
        expect(screen.getByText('A2A 在线')).toBeInTheDocument();
      });
    });
  });

  describe('错误恢复', () => {
    test('显示错误数量', () => {
      const stateWithErrors = {
        ...createMockExecutionState(),
        errors: [
          { id: 'e1', type: 'error', message: '错误1' },
          { id: 'e2', type: 'error', message: '错误2' }
        ]
      };
      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={stateWithErrors}
        />
      );
      expect(screen.getByText('2 错误')).toBeInTheDocument();
    });
  });

  describe('进度显示', () => {
    test('显示进度百分比', () => {
      const progressState = { ...createMockExecutionState(), progress: 75 };
      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={progressState}
        />
      );
      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    test('无运行中任务时不显示执行中文字', () => {
      const runningState = createMockExecutionState();
      const workflow = createMockWorkflow();

      render(
        <AgentCollaborationPanel
          workflow={workflow}
          executionState={runningState}
        />
      );
      // 运行中文字只在有 running 状态任务时显示
      expect(screen.queryByText(/执行中/)).not.toBeInTheDocument();
    });

    test('有运行中任务时显示执行中文字', () => {
      const runningState = createMockExecutionState();
      const workflow = createMockWorkflow();
      workflow.tasks[0].status = 'running';

      render(
        <AgentCollaborationPanel
          workflow={workflow}
          executionState={runningState}
        />
      );
      expect(screen.getByText('1 执行中')).toBeInTheDocument();
    });
  });

  describe('折叠状态', () => {
    test('支持 collapsed 属性', () => {
      const { container } = render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={createMockExecutionState()}
          collapsed={true}
        />
      );
      expect(container).toBeInTheDocument();
    });
  });

  describe('暂停和继续', () => {
    test('点击暂停按钮触发回调', () => {
      const onPause = vi.fn();
      const runningState = { ...createMockExecutionState(), status: 'running' as const };

      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={runningState}
          onPause={onPause}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /暂停/i }));
      expect(onPause).toHaveBeenCalled();
    });

    test('点击继续按钮触发回调', () => {
      const onResume = vi.fn();
      const pausedState = { ...createMockExecutionState(), status: 'paused' as const };

      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={pausedState}
          onResume={onResume}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /继续/i }));
      expect(onResume).toHaveBeenCalled();
    });

    test('点击停止按钮触发回调', () => {
      const onStop = vi.fn();
      const runningState = { ...createMockExecutionState(), status: 'running' as const };

      render(
        <AgentCollaborationPanel
          workflow={createMockWorkflow()}
          executionState={runningState}
          onStop={onStop}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /停止/i }));
      expect(onStop).toHaveBeenCalled();
    });
  });
});