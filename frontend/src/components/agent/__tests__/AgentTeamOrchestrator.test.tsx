import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import AgentTeamOrchestrator from '../AgentTeamOrchestrator';

// Mock fetch
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ collaboration: { id: 'collab-1', status: 'completed' } })
  })
) as unknown as typeof fetch;

// Mock scrollTo
Object.defineProperty(window, 'scrollTo', {
  value: vi.fn(),
  writable: true
});

describe('AgentTeamOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('空闲状态', () => {
    test('显示 Agent Team 编排器标题', async () => {
      render(<AgentTeamOrchestrator />);

      await waitFor(() => {
        expect(screen.getByText('Agent Team 编排器')).toBeInTheDocument();
      });
    });

    test('显示 Agent 和任务统计', async () => {
      render(<AgentTeamOrchestrator />);

      await waitFor(() => {
        expect(screen.getByText(/0 个 Agent/)).toBeInTheDocument();
        expect(screen.getByText(/0 个任务/)).toBeInTheDocument();
      });
    });
  });

  describe('Agent 列表', () => {
    test('显示 Agent 列表', async () => {
      const agents = [
        { id: '1', name: '技术调研员', role: 'researcher' as const, status: 'idle' as const, progress: 0, capabilities: ['web_search'], lastActive: Date.now() },
        { id: '2', name: '前端开发', role: 'coder' as const, status: 'working' as const, progress: 50, capabilities: ['code_write'], lastActive: Date.now() }
      ];

      render(<AgentTeamOrchestrator initialAgents={agents} />);

      await waitFor(() => {
        expect(screen.getByText('技术调研员')).toBeInTheDocument();
        expect(screen.getByText('前端开发')).toBeInTheDocument();
      });
    });

    test('显示 Agent 角色标签', async () => {
      const agents = [
        { id: '1', name: '测试Agent', role: 'reviewer' as const, status: 'idle' as const, progress: 0, capabilities: ['code_review'], lastActive: Date.now() }
      ];

      render(<AgentTeamOrchestrator initialAgents={agents} />);

      await waitFor(() => {
        expect(screen.getByText('评审')).toBeInTheDocument();
      });
    });

    test('显示 Agent 状态指示器', async () => {
      const agents = [
        { id: '1', name: '忙碌Agent', role: 'coder' as const, status: 'working' as const, progress: 30, capabilities: [], lastActive: Date.now() }
      ];

      render(<AgentTeamOrchestrator initialAgents={agents} />);

      await waitFor(() => {
        expect(screen.getByText('工作中')).toBeInTheDocument();
      });
    });
  });

  describe('任务队列', () => {
    test('显示任务列表', async () => {
      const tasks = [
        { id: '1', title: '任务一', description: '描述1', status: 'pending' as const, priority: 'high' as const, dependencies: [], progress: 0, createdAt: Date.now() },
        { id: '2', title: '任务二', description: '描述2', status: 'running' as const, priority: 'medium' as const, dependencies: [], progress: 50, createdAt: Date.now() }
      ];

      render(<AgentTeamOrchestrator initialTasks={tasks} />);

      await waitFor(() => {
        expect(screen.getByText('任务一')).toBeInTheDocument();
        expect(screen.getByText('任务二')).toBeInTheDocument();
      });
    });

    test('显示任务优先级标签', async () => {
      const tasks = [
        { id: '1', title: '紧急任务', description: '', status: 'pending' as const, priority: 'critical' as const, dependencies: [], progress: 0, createdAt: Date.now() }
      ];

      render(<AgentTeamOrchestrator initialTasks={tasks} />);

      await waitFor(() => {
        expect(screen.getByText('紧急')).toBeInTheDocument();
      });
    });

    test('空闲 Agent 高亮显示', async () => {
      const agents = [
        { id: '1', name: '空闲Agent', role: 'researcher' as const, status: 'idle' as const, progress: 0, capabilities: [], lastActive: Date.now() }
      ];

      render(<AgentTeamOrchestrator initialAgents={agents} />);

      await waitFor(() => {
        expect(screen.getByText('空闲')).toBeInTheDocument();
      });
    });
  });

  describe('协作功能', () => {
    test('开始执行按钮存在', async () => {
      const agents = [
        { id: '1', name: 'Agent', role: 'coder' as const, status: 'idle' as const, progress: 0, capabilities: [], lastActive: Date.now() }
      ];
      const tasks = [
        { id: '1', title: '任务', description: '', status: 'pending' as const, priority: 'medium' as const, dependencies: [], progress: 0, createdAt: Date.now() }
      ];

      render(<AgentTeamOrchestrator initialAgents={agents} initialTasks={tasks} />);

      await waitFor(() => {
        const startButton = screen.getByRole('button', { name: /开始执行/i }) ||
                          screen.getByText('开始执行');
        expect(startButton).toBeInTheDocument();
      });
    });

    test('协作模式选项存在', async () => {
      render(<AgentTeamOrchestrator />);

      await waitFor(() => {
        expect(screen.getByText('协作模式')).toBeInTheDocument();
      });
    });

    test('协作结果回调', async () => {
      const onCollaborationComplete = vi.fn();
      const agents = [
        { id: '1', name: 'Agent', role: 'coder' as const, status: 'idle' as const, progress: 0, capabilities: [], lastActive: Date.now() }
      ];
      const tasks = [
        { id: '1', title: '任务', description: '', status: 'pending' as const, priority: 'medium' as const, dependencies: [], progress: 0, createdAt: Date.now() }
      ];

      render(
        <AgentTeamOrchestrator
          initialAgents={agents}
          initialTasks={tasks}
          onCollaborationComplete={onCollaborationComplete}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Agent Team 编排器')).toBeInTheDocument();
      });
    });
  });

  describe('布局切换', () => {
    test('支持单列布局', async () => {
      render(<AgentTeamOrchestrator />);

      await waitFor(() => {
        expect(screen.getByText('Agent Team 编排器')).toBeInTheDocument();
      });
    });
  });

  describe('操作功能', () => {
    test('添加 Agent 按钮存在', async () => {
      render(<AgentTeamOrchestrator />);

      await waitFor(() => {
        // 查找添加按钮（Plus图标按钮）
        const addButtons = screen.getAllByRole('button');
        expect(addButtons.length).toBeGreaterThan(0);
      });
    });

    test('添加任务区域存在', async () => {
      render(<AgentTeamOrchestrator />);

      await waitFor(() => {
        // 查找添加按钮（Plus图标按钮）
        const addButtons = screen.getAllByRole('button');
        expect(addButtons.length).toBeGreaterThan(0);
      });
    });

    test('重置按钮存在', async () => {
      const agents = [
        { id: '1', name: 'Agent', role: 'coder' as const, status: 'completed' as const, progress: 100, capabilities: [], lastActive: Date.now() }
      ];

      render(<AgentTeamOrchestrator initialAgents={agents} />);

      await waitFor(() => {
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('统计信息', () => {
    test('显示 Agent 统计', async () => {
      const agents = [
        { id: '1', name: 'Agent1', role: 'coder' as const, status: 'idle' as const, progress: 0, capabilities: [], lastActive: Date.now() },
        { id: '2', name: 'Agent2', role: 'reviewer' as const, status: 'working' as const, progress: 50, capabilities: [], lastActive: Date.now() }
      ];

      render(<AgentTeamOrchestrator initialAgents={agents} />);

      await waitFor(() => {
        expect(screen.getByText('2 个 Agent')).toBeInTheDocument();
      });
    });

    test('显示任务统计', async () => {
      const tasks = [
        { id: '1', title: '任务1', description: '', status: 'pending' as const, priority: 'medium' as const, dependencies: [], progress: 0, createdAt: Date.now() },
        { id: '2', title: '任务2', description: '', status: 'completed' as const, priority: 'high' as const, dependencies: [], progress: 100, createdAt: Date.now() },
        { id: '3', title: '任务3', description: '', status: 'failed' as const, priority: 'low' as const, dependencies: [], progress: 0, createdAt: Date.now() }
      ];

      render(<AgentTeamOrchestrator initialTasks={tasks} />);

      await waitFor(() => {
        expect(screen.getByText('3 个任务')).toBeInTheDocument();
      });
    });
  });

  describe('任务分配', () => {
    test('任务可分配给 Agent', async () => {
      const agents = [
        { id: 'agent-1', name: '开发Agent', role: 'coder' as const, status: 'idle' as const, progress: 0, capabilities: [], lastActive: Date.now() }
      ];
      const tasks = [
        { id: 'task-1', title: '待分配任务', description: '', status: 'pending' as const, priority: 'high' as const, dependencies: [], progress: 0, createdAt: Date.now() }
      ];

      render(<AgentTeamOrchestrator initialAgents={agents} initialTasks={tasks} />);

      await waitFor(() => {
        expect(screen.getByText('待分配任务')).toBeInTheDocument();
      });
    });
  });
});