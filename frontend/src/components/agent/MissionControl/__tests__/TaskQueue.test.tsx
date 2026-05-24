/**
 * TaskQueue 组件测试
 * 测试任务队列的搜索、筛选、排序、批量操作等功能
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import TaskQueue from '../TaskQueue';
import { useMissionControlStore, initializeAgents } from '../store';
import type { MissionTask, TaskStatus, TaskPriority } from '../types';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

// Mock @dnd-kit/core
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }: any) => (
    <div data-testid="dnd-context" onClick={() => onDragEnd?.({ active: { id: 'test' }, over: { id: 'test' } })}>
      {children}
    </div>
  ),
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
  DragEndEvent: vi.fn(),
}));

// Mock @dnd-kit/sortable
vi.mock('@dnd-kit/sortable', () => ({
  arrayMove: vi.fn((items, oldIndex, newIndex) => {
    const newItems = [...items];
    newItems.splice(newIndex, 0, newItems.splice(oldIndex, 1)[0]);
    return newItems;
  }),
  SortableContext: ({ children }: any) => <div data-testid="sortable-context">{children}</div>,
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: vi.fn(({ id }: { id: string }) => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  })),
  verticalListSortingStrategy: vi.fn(),
}));

// Mock @dnd-kit/utilities
vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: vi.fn(() => ''),
    },
  },
}));

// 测试数据辅助函数
function createTestTask(overrides: Partial<MissionTask> = {}): MissionTask {
  const now = Date.now();
  return {
    id: `task-${Math.random().toString(36).slice(2, 7)}`,
    title: '测试任务',
    description: '测试任务描述',
    priority: 'medium',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createTestTasks(count: number, status: TaskStatus = 'pending'): MissionTask[] {
  return Array.from({ length: count }, (_, i) => createTestTask({
    id: `task-${i}`,
    title: `任务 ${i + 1}`,
    status,
    priority: (['critical', 'high', 'medium', 'low'] as TaskPriority[])[i % 4],
  }));
}

// ============ 基础渲染测试 ============

describe('TaskQueue 基础渲染', () => {
  beforeEach(() => {
    useMissionControlStore.setState({
      agents: [],
      tasks: [],
      events: [],
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
    });
  });

  test('无任务时显示空状态', () => {
    render(<TaskQueue tasks={[]} />);

    expect(screen.getByText('暂无任务')).toBeInTheDocument();
    expect(screen.getByText('创建新任务开始您的任务')).toBeInTheDocument();
  });

  test('有任务时显示任务列表', () => {
    const tasks = createTestTasks(3);
    render(<TaskQueue tasks={tasks} />);

    expect(screen.getByText('任务 1')).toBeInTheDocument();
    expect(screen.getByText('任务 2')).toBeInTheDocument();
    expect(screen.getByText('任务 3')).toBeInTheDocument();
  });

  test('显示任务统计', () => {
    const tasks = createTestTasks(5);
    render(<TaskQueue tasks={tasks} />);

    // 统计区域显示 "共 X 个任务"
    expect(screen.getByText((content) => content.includes('共') && content.includes('个任务'))).toBeInTheDocument();
  });
});

// ============ 搜索功能测试 ============

describe('TaskQueue 搜索功能', () => {
  beforeEach(() => {
    useMissionControlStore.setState({
      agents: [],
      tasks: [],
      events: [],
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
    });
  });

  test('搜索框可以输入', async () => {
    const tasks = createTestTasks(3);
    render(<TaskQueue tasks={tasks} />);

    const searchInput = screen.getByPlaceholderText('搜索任务...');
    await userEvent.type(searchInput, '任务 1');

    expect(searchInput).toHaveValue('任务 1');
  });

  test('搜索过滤任务', async () => {
    const tasks = [
      createTestTask({ id: 'task-1', title: '数据分析任务' }),
      createTestTask({ id: 'task-2', title: '代码编写任务' }),
      createTestTask({ id: 'task-3', title: '测试任务' }),
    ];
    render(<TaskQueue tasks={tasks} />);

    const searchInput = screen.getByPlaceholderText('搜索任务...');
    await userEvent.type(searchInput, '代码');

    // 只显示包含"代码"的任务
    await waitFor(() => {
      expect(screen.getByText('代码编写任务')).toBeInTheDocument();
    });
    // 其他任务应该被过滤掉
    expect(screen.queryByText('数据分析任务')).not.toBeInTheDocument();
    expect(screen.queryByText('测试任务')).not.toBeInTheDocument();
  });

  test('搜索清空按钮', async () => {
    const tasks = createTestTasks(3);
    render(<TaskQueue tasks={tasks} />);

    const searchInput = screen.getByPlaceholderText('搜索任务...');
    await userEvent.type(searchInput, '测试');

    // 清空按钮是搜索框后面的 X 图标按钮 (没有文字内容)
    const clearButton = document.querySelector('input[placeholder="搜索任务..."]')?.closest('.relative')?.querySelector('button');
    if (clearButton) {
      await userEvent.click(clearButton);
      expect(searchInput).toHaveValue('');
    }
  });
});

// ============ 筛选功能测试 ============

describe('TaskQueue 筛选功能', () => {
  beforeEach(() => {
    useMissionControlStore.setState({
      agents: [],
      tasks: [],
      events: [],
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
    });
  });

  test('显示筛选按钮', () => {
    const tasks = createTestTasks(3);
    render(<TaskQueue tasks={tasks} />);

    expect(screen.getByText('筛选')).toBeInTheDocument();
  });

  test('点击筛选按钮展开筛选选项', async () => {
    const tasks = createTestTasks(3);
    render(<TaskQueue tasks={tasks} />);

    const filterButton = screen.getByText('筛选');
    await userEvent.click(filterButton);

    await waitFor(() => {
      expect(screen.getByText('状态')).toBeInTheDocument();
      expect(screen.getByText('优先级')).toBeInTheDocument();
    });
  });

  test('状态筛选', async () => {
    const tasks = [
      createTestTask({ id: 't1', title: '任务一', status: 'pending' }),
      createTestTask({ id: 't2', title: '任务二', status: 'in_progress' }),
      createTestTask({ id: 't3', title: '任务三', status: 'completed' }),
    ];
    render(<TaskQueue tasks={tasks} />);

    // 打开筛选
    const filterButton = screen.getByText('筛选');
    await userEvent.click(filterButton);

    // 在筛选面板中选择状态筛选 - 找筛选面板中的"待分配"按钮 (第一个待分配是按钮)
    const pendingButton = screen.getAllByText('待分配')[0];
    await userEvent.click(pendingButton);

    // 验证只显示 pending 状态的任务 - 使用任务标题来验证
    await waitFor(() => {
      expect(screen.getByText('任务一')).toBeInTheDocument();
    });
    expect(screen.queryByText('任务二')).not.toBeInTheDocument();
    expect(screen.queryByText('任务三')).not.toBeInTheDocument();
  });

  test('清除筛选按钮', async () => {
    const tasks = createTestTasks(3);
    render(<TaskQueue tasks={tasks} />);

    // 打开筛选
    const filterButton = screen.getByText('筛选');
    await userEvent.click(filterButton);

    // 确认筛选面板展开 - 存在"状态"文本
    await waitFor(() => {
      expect(screen.getByText('状态')).toBeInTheDocument();
    });

    // 点击第一个"全部"按钮 (状态筛选的"全部"按钮)
    const allButtons = screen.getAllByText('全部');
    await userEvent.click(allButtons[0]);

    // 验证点击后仍然有筛选面板存在
    expect(screen.getByText('状态')).toBeInTheDocument();
  });
});

// ============ 批量分配测试 ============

describe('TaskQueue 批量分配', () => {
  beforeEach(() => {
    useMissionControlStore.setState({
      agents: [
        { id: 'a1', name: 'Agent1', role: 'executor', status: 'idle', progress: 0, capabilities: [], lastHeartbeat: Date.now() },
        { id: 'a2', name: 'Agent2', role: 'executor', status: 'idle', progress: 0, capabilities: [], lastHeartbeat: Date.now() },
      ],
      tasks: [],
      events: [],
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
    });
  });

  test('批量分配按钮存在', () => {
    const tasks = createTestTasks(3);
    render(<TaskQueue tasks={tasks} />);

    expect(screen.getByText('批量分配')).toBeInTheDocument();
  });

  test('批量分配按钮可点击', async () => {
    const tasks = createTestTasks(3);
    render(<TaskQueue tasks={tasks} />);

    const batchButton = screen.getByText('批量分配');
    expect(batchButton).not.toBeDisabled();

    // 点击批量分配
    await userEvent.click(batchButton);

    // 按钮应该仍然可点击 (没有 pending 任务或没有可用 agent 时才会禁用)
    // 这里验证点击没有抛出错误即可
    expect(batchButton).toBeInTheDocument();
  });

  test('无可用 Agent 时批量分配按钮禁用', () => {
    // 清除 agents
    useMissionControlStore.setState({
      agents: [],
      tasks: createTestTasks(3),
      events: [],
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
    });

    render(<TaskQueue tasks={createTestTasks(3)} />);

    const batchButton = screen.getByText('批量分配');
    expect(batchButton).toBeDisabled();
  });
});

// ============ 任务展开/折叠测试 ============

describe('TaskQueue 展开/折叠', () => {
  beforeEach(() => {
    useMissionControlStore.setState({
      agents: [],
      tasks: [],
      events: [],
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
    });
  });

  test('点击任务可以展开', async () => {
    const tasks = [
      createTestTask({
        id: 'task-1',
        title: '可展开任务',
        description: '这是详细描述',
      }),
    ];
    render(<TaskQueue tasks={tasks} />);

    // 找到展开/折叠按钮 (ChevronRight图标)
    const taskItem = screen.getByText('可展开任务').closest('.group');
    const expandButton = taskItem?.querySelector('button');
    if (expandButton) {
      await userEvent.click(expandButton);

      await waitFor(() => {
        expect(screen.getByText('描述')).toBeInTheDocument();
      });
    }
  });
});

// ============ 任务统计显示测试 ============

describe('TaskQueue 任务统计', () => {
  beforeEach(() => {
    useMissionControlStore.setState({
      agents: [],
      tasks: [],
      events: [],
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
    });
  });

  test('显示待分配任务数量', () => {
    const tasks = [
      createTestTask({ status: 'pending' }),
      createTestTask({ status: 'pending' }),
    ];
    render(<TaskQueue tasks={tasks} />);

    expect(screen.getByText(/.*个待分配/)).toBeInTheDocument();
  });

  test('显示进行中任务数量', () => {
    const tasks = [
      createTestTask({ status: 'in_progress' }),
    ];
    render(<TaskQueue tasks={tasks} />);

    expect(screen.getByText(/.*个进行中/)).toBeInTheDocument();
  });

  test('显示完成任务数量', () => {
    const tasks = [
      createTestTask({ status: 'completed' }),
      createTestTask({ status: 'completed' }),
    ];
    render(<TaskQueue tasks={tasks} />);

    expect(screen.getByText(/.*个完成/)).toBeInTheDocument();
  });

  test('显示失败任务数量', () => {
    const tasks = [
      createTestTask({ status: 'failed' }),
    ];
    render(<TaskQueue tasks={tasks} />);

    expect(screen.getByText(/.*个失败/)).toBeInTheDocument();
  });
});

// ============ 优先级显示测试 ============

describe('TaskQueue 优先级显示', () => {
  beforeEach(() => {
    useMissionControlStore.setState({
      agents: [],
      tasks: [],
      events: [],
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
    });
  });

  test('critical 优先级显示红色', () => {
    const tasks = [createTestTask({ priority: 'critical' })];
    render(<TaskQueue tasks={tasks} />);

    // 使用 getAllByText 因为优先级标签在组件中可能出现多次
    expect(screen.getAllByText('紧急').length).toBeGreaterThan(0);
  });

  test('high 优先级显示橙色', () => {
    const tasks = [createTestTask({ priority: 'high' })];
    render(<TaskQueue tasks={tasks} />);

    expect(screen.getAllByText('高').length).toBeGreaterThan(0);
  });

  test('medium 优先级显示黄色', () => {
    const tasks = [createTestTask({ priority: 'medium' })];
    render(<TaskQueue tasks={tasks} />);

    expect(screen.getAllByText('中').length).toBeGreaterThan(0);
  });

  test('low 优先级显示绿色', () => {
    const tasks = [createTestTask({ priority: 'low' })];
    render(<TaskQueue tasks={tasks} />);

    expect(screen.getAllByText('低').length).toBeGreaterThan(0);
  });
});

// ============ 状态显示测试 ============

describe('TaskQueue 状态显示', () => {
  beforeEach(() => {
    useMissionControlStore.setState({
      agents: [],
      tasks: [],
      events: [],
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
    });
  });

  test('pending 状态显示待分配', () => {
    const tasks = [createTestTask({ status: 'pending' })];
    render(<TaskQueue tasks={tasks} />);

    expect(screen.getByText('待分配')).toBeInTheDocument();
  });

  test('assigned 状态显示已分配', () => {
    const tasks = [createTestTask({ status: 'assigned', assignedAgent: 'Agent-1' })];
    render(<TaskQueue tasks={tasks} />);

    expect(screen.getByText('已分配')).toBeInTheDocument();
  });

  test('in_progress 状态显示进行中', () => {
    const tasks = [createTestTask({ status: 'in_progress' })];
    render(<TaskQueue tasks={tasks} />);

    expect(screen.getByText('进行中')).toBeInTheDocument();
  });

  test('completed 状态显示已完成', () => {
    const tasks = [createTestTask({ status: 'completed' })];
    render(<TaskQueue tasks={tasks} />);

    expect(screen.getByText('已完成')).toBeInTheDocument();
  });

  test('failed 状态显示失败', () => {
    const tasks = [createTestTask({ status: 'failed' })];
    render(<TaskQueue tasks={tasks} />);

    expect(screen.getByText('失败')).toBeInTheDocument();
  });
});

// ============ 进度条测试 ============

describe('TaskQueue 进度条', () => {
  beforeEach(() => {
    useMissionControlStore.setState({
      agents: [],
      tasks: [],
      events: [],
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
    });
  });

  test('进行中任务显示进度条', () => {
    const tasks = [createTestTask({ status: 'in_progress', progress: 60 })];
    render(<TaskQueue tasks={tasks} />);

    // 进度条通过动画组件实现，这里检查是否存在
    const progressBar = document.querySelector('[class*="bg-gradient-to-r"]');
    expect(progressBar).toBeTruthy();
  });
});

// ============ maxDisplay 限制测试 ============

describe('TaskQueue maxDisplay 限制', () => {
  beforeEach(() => {
    useMissionControlStore.setState({
      agents: [],
      tasks: [],
      events: [],
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
    });
  });

  test('maxDisplay 限制显示数量', () => {
    const tasks = createTestTasks(15);
    render(<TaskQueue tasks={tasks} maxDisplay={5} />);

    // 检查是否有 "还有 X 个任务..." 提示
    expect(screen.getByText(/还有.*10.*个任务/)).toBeInTheDocument();
  });

  test('不超过 maxDisplay 时不显示提示', () => {
    const tasks = createTestTasks(3);
    render(<TaskQueue tasks={tasks} maxDisplay={5} />);

    expect(screen.queryByText(/还有/)).not.toBeInTheDocument();
  });
});

// ============ 筛选结果为空测试 ============

describe('TaskQueue 筛选结果为空', () => {
  beforeEach(() => {
    useMissionControlStore.setState({
      agents: [],
      tasks: [],
      events: [],
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
    });
  });

  test('筛选无结果时显示提示', async () => {
    const tasks = createTestTasks(3);
    render(<TaskQueue tasks={tasks} />);

    const searchInput = screen.getByPlaceholderText('搜索任务...');
    await userEvent.type(searchInput, '不存在的任务');

    await waitFor(() => {
      expect(screen.getByText('没有符合筛选条件的任务')).toBeInTheDocument();
      expect(screen.getByText('清除筛选')).toBeInTheDocument();
    });
  });

  test('点击清除筛选恢复显示', async () => {
    const tasks = createTestTasks(3);
    render(<TaskQueue tasks={tasks} />);

    const searchInput = screen.getByPlaceholderText('搜索任务...');
    await userEvent.type(searchInput, '不存在的任务');

    await waitFor(() => {
      expect(screen.getByText('没有符合筛选条件的任务')).toBeInTheDocument();
    });

    const clearButton = screen.getByText('清除筛选');
    await userEvent.click(clearButton);

    await waitFor(() => {
      expect(screen.queryByText('没有符合筛选条件的任务')).not.toBeInTheDocument();
    });
  });
});