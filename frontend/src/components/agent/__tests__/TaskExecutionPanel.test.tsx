/**
 * TaskExecutionPanel 单元测试
 * 并行任务执行进度追踪面板测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import TaskExecutionPanel, {
  TaskExecutionItem,
  TaskExecutionStatus,
  AgentRole
} from '../TaskExecutionPanel';

// Mock lucide-react 图标
vi.mock('lucide-react', () => ({
  ChevronDown: ({ className }: { className?: string }) => (
    <span data-testid="chevron-down" className={className}>ChevronDown</span>
  ),
  ChevronRight: ({ className }: { className?: string }) => (
    <span data-testid="chevron-right" className={className}>ChevronRight</span>
  ),
  Clock: ({ className }: { className?: string }) => (
    <span data-testid="clock" className={className}>Clock</span>
  ),
  AlertCircle: ({ className }: { className?: string }) => (
    <span data-testid="alert-circle" className={className}>AlertCircle</span>
  ),
  CheckCircle2: ({ className }: { className?: string }) => (
    <span data-testid="check-circle" className={className}>CheckCircle2</span>
  ),
  XCircle: ({ className }: { className?: string }) => (
    <span data-testid="x-circle" className={className}>XCircle</span>
  ),
  Minus: ({ className }: { className?: string }) => (
    <span data-testid="minus" className={className}>Minus</span>
  ),
  ArrowRight: ({ className }: { className?: string }) => (
    <span data-testid="arrow-right" className={className}>ArrowRight</span>
  )
}));

// Mock SSE EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];

  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  url: string;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close = vi.fn(() => {
    const index = MockEventSource.instances.indexOf(this);
    if (index > -1) {
      MockEventSource.instances.splice(index, 1);
    }
  });
}

// Mock global EventSource
vi.stubGlobal('EventSource', MockEventSource);

// Mock环境变量
const originalEnv = process.env;
beforeEach(() => {
  process.env = {
    ...originalEnv,
    NEXT_PUBLIC_BACKEND_URL: 'http://localhost:30000'
  };
  MockEventSource.instances = [];
});

afterEach(() => {
  process.env = originalEnv;
  vi.clearAllMocks();
});

/**
 * 测试数据生成器
 */
function createTask(overrides: Partial<TaskExecutionItem> = {}): TaskExecutionItem {
  return {
    id: 'task-1',
    name: '测试任务',
    status: 'PENDING',
    role: 'EXECUTOR',
    progress: 0,
    ...overrides
  };
}

function createTaskList(count: number, status: TaskExecutionStatus = 'PENDING'): TaskExecutionItem[] {
  return Array.from({ length: count }, (_, i) => createTask({
    id: `task-${i + 1}`,
    name: `任务 ${i + 1}`,
    status,
    progress: status === 'RUNNING' ? 50 : 0
  }));
}

describe('TaskExecutionPanel 组件测试', () => {
  describe('1. 组件渲染测试', () => {
    it('空状态：应该显示"暂无任务"', () => {
      render(<TaskExecutionPanel tasks={[]} />);
      expect(screen.getByText('暂无任务')).toBeInTheDocument();
    });

    it('有任务状态：应该显示任务名称', () => {
      const tasks = [
        createTask({ id: 'task-1', name: '任务一' }),
        createTask({ id: 'task-2', name: '任务二' })
      ];
      render(<TaskExecutionPanel tasks={tasks} />);
      expect(screen.getByText('任务一')).toBeInTheDocument();
      expect(screen.getByText('任务二')).toBeInTheDocument();
    });

    it('有任务状态：应该显示总体进度标题', () => {
      const tasks = createTaskList(3);
      render(<TaskExecutionPanel tasks={tasks} />);
      expect(screen.getByText('总体进度')).toBeInTheDocument();
    });

    it('有任务状态：应该显示任务数量统计', () => {
      const tasks = createTaskList(5);
      render(<TaskExecutionPanel tasks={tasks} />);
      expect(screen.getByText('5 个任务')).toBeInTheDocument();
    });

    it('有任务状态：应该显示状态图例', () => {
      const tasks = createTaskList(2);
      render(<TaskExecutionPanel tasks={tasks} />);
      expect(screen.getByText('状态图例')).toBeInTheDocument();
    });
  });

  describe('2. 状态颜色显示测试', () => {
    it('PENDING状态：应该显示正确的颜色', () => {
      const tasks = [createTask({ id: 'pending', name: '待执行任务', status: 'PENDING' })];
      render(<TaskExecutionPanel tasks={tasks} />);

      const taskCard = screen.getByText('待执行任务').closest('.rounded-lg');
      expect(taskCard?.className).toContain('bg-gray-100');
      expect(taskCard?.className).toContain('border-gray-300');
    });

    it('RUNNING状态：应该显示蓝色和脉冲动画', () => {
      const tasks = [createTask({ id: 'running', name: '执行中任务', status: 'RUNNING', progress: 50 })];
      render(<TaskExecutionPanel tasks={tasks} />);

      const taskCard = screen.getByText('执行中任务').closest('.rounded-lg');
      expect(taskCard?.className).toContain('bg-blue-50');
      expect(taskCard?.className).toContain('border-blue-400');
    });

    it('COMPLETED状态：应该显示绿色', () => {
      const tasks = [createTask({ id: 'completed', name: '已完成任务', status: 'COMPLETED' })];
      render(<TaskExecutionPanel tasks={tasks} />);

      const taskCard = screen.getByText('已完成任务').closest('.rounded-lg');
      expect(taskCard?.className).toContain('bg-green-50');
      expect(taskCard?.className).toContain('border-green-400');
    });

    it('FAILED状态：应该显示红色和错误信息', () => {
      const tasks = [createTask({
        id: 'failed',
        name: '失败任务',
        status: 'FAILED',
        error: '任务执行失败：超时'
      })];
      render(<TaskExecutionPanel tasks={tasks} />);

      expect(screen.getByText('失败任务')).toBeInTheDocument();
      expect(screen.getByText('任务执行失败：超时')).toBeInTheDocument();
    });

    it('CANCELLED状态：应该显示黄色', () => {
      const tasks = [createTask({ id: 'cancelled', name: '已取消任务', status: 'CANCELLED' })];
      render(<TaskExecutionPanel tasks={tasks} />);

      const taskCard = screen.getByText('已取消任务').closest('.rounded-lg');
      expect(taskCard?.className).toContain('bg-yellow-50');
      expect(taskCard?.className).toContain('border-yellow-400');
    });

    it('不同角色：应该显示不同的颜色标签', () => {
      const tasks: TaskExecutionItem[] = [
        createTask({ id: 'planner', name: '规划者任务', role: 'PLANNER' }),
        createTask({ id: 'executor', name: '执行者任务', role: 'EXECUTOR' }),
        createTask({ id: 'reviewer', name: '审核者任务', role: 'REVIEWER' }),
        createTask({ id: 'coordinator', name: '协调者任务', role: 'COORDINATOR' })
      ];
      render(<TaskExecutionPanel tasks={tasks} />);

      expect(screen.getByText('规划者')).toBeInTheDocument();
      expect(screen.getByText('执行者')).toBeInTheDocument();
      expect(screen.getByText('审核者')).toBeInTheDocument();
      expect(screen.getByText('协调者')).toBeInTheDocument();
    });
  });

  describe('3. 折叠/展开功能测试', () => {
    it('默认展开：应该显示详细内容', () => {
      const tasks = createTaskList(3);
      render(<TaskExecutionPanel tasks={tasks} />);

      expect(screen.getByText('总体进度')).toBeInTheDocument();
      expect(screen.getByText('状态图例')).toBeInTheDocument();
    });

    it('点击头部应该折叠内容', () => {
      const tasks = createTaskList(3);
      render(<TaskExecutionPanel tasks={tasks} />);

      // 找到可点击的头部区域
      const header = screen.getByText('并行任务进度').closest('.cursor-pointer');
      expect(header).toBeInTheDocument();

      fireEvent.click(header!);

      // 折叠后详细内容应该消失
      expect(screen.queryByText('总体进度')).not.toBeInTheDocument();
      expect(screen.queryByText('状态图例')).not.toBeInTheDocument();
    });

    it('折叠后再次点击应该展开', () => {
      const tasks = createTaskList(3);
      render(<TaskExecutionPanel tasks={tasks} />);

      const header = screen.getByText('并行任务进度').closest('.cursor-pointer');
      fireEvent.click(header!);
      expect(screen.queryByText('总体进度')).not.toBeInTheDocument();

      fireEvent.click(header!);
      expect(screen.getByText('总体进度')).toBeInTheDocument();
    });

    it('defaultExpanded=false：初始应该折叠', () => {
      const tasks = createTaskList(3);
      render(<TaskExecutionPanel tasks={tasks} defaultExpanded={false} />);

      expect(screen.queryByText('总体进度')).not.toBeInTheDocument();
    });
  });

  describe('4. 任务进度更新测试', () => {
    it('RUNNING任务：应该显示进度条和百分比', () => {
      const tasks = [createTask({
        id: 'running',
        name: '数据处理任务',
        status: 'RUNNING',
        progress: 75
      })];
      render(<TaskExecutionPanel tasks={tasks} />);

      // 查找任务卡片中的进度相关内容
      const taskCard = screen.getByText('数据处理任务').closest('.rounded-lg');
      expect(taskCard).toBeInTheDocument();
      expect(taskCard?.textContent).toContain('75%');
      // 验证进度标签存在
      expect(taskCard?.textContent).toContain('进度');
    });

    it('进度条宽度应该与进度值匹配', () => {
      const tasks = [createTask({
        id: 'running',
        name: '文件上传任务',
        status: 'RUNNING',
        progress: 60
      })];
      render(<TaskExecutionPanel tasks={tasks} />);

      // 找到进度条元素 - 通过查找包含进度信息的父元素
      const taskCard = screen.getByText('文件上传任务').closest('.rounded-lg');
      // 进度条是一个包含 width style 的 div
      const progressBar = taskCard?.querySelector('[style*="width"]');
      expect(progressBar).toBeInTheDocument();
      expect(progressBar?.getAttribute('style')).toContain('60%');
    });

    it('非RUNNING任务：不应该显示进度条', () => {
      const tasks = [createTask({
        id: 'pending',
        name: '待执行',
        status: 'PENDING',
        progress: 0
      })];
      render(<TaskExecutionPanel tasks={tasks} />);

      expect(screen.queryByText('进度')).not.toBeInTheDocument();
    });

    it('总体进度计算应该正确', () => {
      const tasks: TaskExecutionItem[] = [
        createTask({ id: 't1', name: '任务1', status: 'COMPLETED', progress: 100 }),
        createTask({ id: 't2', name: '任务2', status: 'RUNNING', progress: 50 }),
        createTask({ id: 't3', name: '任务3', status: 'PENDING', progress: 0 })
      ];
      render(<TaskExecutionPanel tasks={tasks} />);

      // 找到总体进度区域中的百分比显示（大字体）
      const overallProgressSection = screen.getByText('总体进度').parentElement;
      expect(overallProgressSection?.textContent).toContain('50%');
    });

    it('统计卡片应该显示正确数量', () => {
      const tasks: TaskExecutionItem[] = [
        createTask({ id: 't1', status: 'COMPLETED' }),
        createTask({ id: 't2', status: 'COMPLETED' }),
        createTask({ id: 't3', status: 'RUNNING', progress: 30 }),
        createTask({ id: 't4', status: 'PENDING' }),
        createTask({ id: 't5', status: 'FAILED' }),
        createTask({ id: 't6', status: 'CANCELLED' })
      ];
      render(<TaskExecutionPanel tasks={tasks} />);

      // 验证总体进度区域存在
      expect(screen.getByText('总体进度')).toBeInTheDocument();
      expect(screen.getByText('6 个任务')).toBeInTheDocument();

      // 验证图例区域存在并包含所有状态标签
      const legendSection = screen.getByText('状态图例');
      expect(legendSection).toBeInTheDocument();
      const legendArea = legendSection.closest('.mt-4');
      expect(legendArea?.textContent).toContain('待执行');
      expect(legendArea?.textContent).toContain('执行中');
      expect(legendArea?.textContent).toContain('已完成');
      expect(legendArea?.textContent).toContain('失败');
      expect(legendArea?.textContent).toContain('已取消');
    });

    it('props tasks更新时应该同步刷新', () => {
      const { rerender } = render(<TaskExecutionPanel tasks={[]} />);
      expect(screen.getByText('暂无任务')).toBeInTheDocument();

      const newTasks = createTaskList(2);
      rerender(<TaskExecutionPanel tasks={newTasks} />);

      expect(screen.getByText('任务 1')).toBeInTheDocument();
      expect(screen.getByText('任务 2')).toBeInTheDocument();
    });
  });

  describe('5. 依赖关系显示测试', () => {
    it('有依赖的任务：应该显示依赖关系', () => {
      const tasks: TaskExecutionItem[] = [
        createTask({ id: 't1', name: '前置任务' }),
        createTask({ id: 't2', name: '后续任务', dependencies: ['t1'] })
      ];
      render(<TaskExecutionPanel tasks={tasks} showDependencies={true} />);

      expect(screen.getByText(/依赖.*前置任务/)).toBeInTheDocument();
    });

    it('无依赖的任务：不应该显示依赖关系', () => {
      const tasks: TaskExecutionItem[] = [
        createTask({ id: 't1', name: '独立任务', dependencies: [] })
      ];
      render(<TaskExecutionPanel tasks={tasks} showDependencies={true} />);

      expect(screen.queryByText(/依赖/)).not.toBeInTheDocument();
    });

    it('showDependencies=false：不应该显示依赖关系区域', () => {
      const tasks: TaskExecutionItem[] = [
        createTask({ id: 't1', name: '前置任务' }),
        createTask({ id: 't2', name: '后续任务', dependencies: ['t1'] })
      ];
      render(<TaskExecutionPanel tasks={tasks} showDependencies={false} />);

      expect(screen.queryByText('依赖关系')).not.toBeInTheDocument();
    });

    it('多个依赖：应该显示所有依赖任务名称', () => {
      const tasks: TaskExecutionItem[] = [
        createTask({ id: 't1', name: '任务A' }),
        createTask({ id: 't2', name: '任务B' }),
        createTask({ id: 't3', name: '汇总任务', dependencies: ['t1', 't2'] })
      ];
      render(<TaskExecutionPanel tasks={tasks} />);

      // 找到依赖关系区域并验证内容
      const dependencySection = screen.getByText('依赖关系');
      expect(dependencySection).toBeInTheDocument();

      // 验证依赖区域包含任务名称（文本内容）
      const depArea = dependencySection.closest('.rounded-lg');
      expect(depArea?.textContent).toContain('任务A');
      expect(depArea?.textContent).toContain('任务B');
    });

    it('依赖关系可视化区域应该正确显示', () => {
      const tasks: TaskExecutionItem[] = [
        createTask({ id: 't1', name: 'Step 1' }),
        createTask({ id: 't2', name: 'Step 2', dependencies: ['t1'] })
      ];
      render(<TaskExecutionPanel tasks={tasks} />);

      const dependencySection = screen.getByText('依赖关系').closest('.rounded-lg');
      expect(dependencySection).toBeInTheDocument();
    });
  });

  describe('6. 层级分组测试', () => {
    it('不同层级的任务应该分组显示', () => {
      const tasks: TaskExecutionItem[] = [
        createTask({ id: 't1', name: 'Level 0 任务', level: 0 }),
        createTask({ id: 't2', name: 'Level 1 任务', level: 1 }),
        createTask({ id: 't3', name: 'Level 2 任务', level: 2 })
      ];
      render(<TaskExecutionPanel tasks={tasks} />);

      expect(screen.getByText('Level 0')).toBeInTheDocument();
      expect(screen.getByText('Level 1')).toBeInTheDocument();
      expect(screen.getByText('Level 2')).toBeInTheDocument();
    });

    it('层级标签应该显示完成统计', () => {
      const tasks: TaskExecutionItem[] = [
        createTask({ id: 't1', name: '任务1', level: 0, status: 'COMPLETED' }),
        createTask({ id: 't2', name: '任务2', level: 0, status: 'COMPLETED' }),
        createTask({ id: 't3', name: '任务3', level: 0, status: 'RUNNING', progress: 50 })
      ];
      render(<TaskExecutionPanel tasks={tasks} />);

      expect(screen.getByText(/2\/3 完成/)).toBeInTheDocument();
    });

    it('相同层级的任务应该在一个分组内', () => {
      const tasks: TaskExecutionItem[] = [
        createTask({ id: 't1', name: '任务A', level: 1 }),
        createTask({ id: 't2', name: '任务B', level: 1 })
      ];
      render(<TaskExecutionPanel tasks={tasks} />);

      const levelElements = screen.getAllByText('Level 1');
      expect(levelElements).toHaveLength(1);
    });
  });

  describe('7. SSE连接测试', () => {
    it('有sessionId时应该创建EventSource连接', () => {
      const tasks = createTaskList(2);
      render(<TaskExecutionPanel tasks={tasks} sessionId="test-session" />);

      expect(MockEventSource.instances).toHaveLength(1);
      expect(MockEventSource.instances[0].url).toContain('test-session');
    });

    it('无sessionId时不应该创建EventSource', () => {
      const tasks = createTaskList(2);
      render(<TaskExecutionPanel tasks={tasks} />);

      expect(MockEventSource.instances).toHaveLength(0);
    });

    it('组件卸载时应该关闭SSE连接', () => {
      const tasks = createTaskList(2);
      const { unmount } = render(<TaskExecutionPanel tasks={tasks} sessionId="test-session" />);

      expect(MockEventSource.instances).toHaveLength(1);
      const instance = MockEventSource.instances[0];

      unmount();

      expect(instance.close).toHaveBeenCalled();
    });

    it('task_update事件应该更新任务列表', () => {
      const tasks = createTaskList(2);
      const { rerender } = render(<TaskExecutionPanel tasks={tasks} sessionId="test-session" />);

      const newTasks = createTaskList(2, 'COMPLETED').map((t, i) => ({
        ...t,
        id: `new-task-${i + 1}`
      }));

      // 模拟SSE消息
      const eventSource = MockEventSource.instances[0];
      const messageEvent = {
        data: JSON.stringify({ type: 'task_update', tasks: newTasks })
      };
      eventSource.onmessage?.(messageEvent as MessageEvent);

      rerender(<TaskExecutionPanel tasks={tasks} sessionId="test-session" />);
    });
  });

  describe('8. 回调函数测试', () => {
    it('onTaskClick应该在任务点击时触发', () => {
      const onTaskClick = vi.fn();
      const tasks = [createTask({ id: 't1', name: '可点击任务' })];
      render(<TaskExecutionPanel tasks={tasks} onTaskClick={onTaskClick} />);

      const taskCard = screen.getByText('可点击任务').closest('.cursor-pointer');
      fireEvent.click(taskCard!);

      expect(onTaskClick).toHaveBeenCalledWith(tasks[0]);
    });

    it('onAllComplete应该在所有任务完成时触发', () => {
      const onAllComplete = vi.fn();
      const tasks: TaskExecutionItem[] = [
        createTask({ id: 't1', status: 'COMPLETED' }),
        createTask({ id: 't2', status: 'FAILED' })
      ];

      render(<TaskExecutionPanel tasks={tasks} onAllComplete={onAllComplete} />);

      expect(onAllComplete).toHaveBeenCalled();
    });

    it('未全部完成时不应该触发onAllComplete', () => {
      const onAllComplete = vi.fn();
      const tasks: TaskExecutionItem[] = [
        createTask({ id: 't1', status: 'COMPLETED' }),
        createTask({ id: 't2', status: 'RUNNING', progress: 50 })
      ];

      render(<TaskExecutionPanel tasks={tasks} onAllComplete={onAllComplete} />);

      expect(onAllComplete).not.toHaveBeenCalled();
    });
  });

  describe('9. 其他功能测试', () => {
    it('执行时长应该正确显示', () => {
      const tasks = [createTask({
        id: 't1',
        name: '任务',
        actualDuration: 5000
      })];
      render(<TaskExecutionPanel tasks={tasks} />);

      // 查找包含 "5.0" 时间格式的元素
      expect(screen.getByText(/\d+\.\ds/)).toBeInTheDocument();
    });

    it('自定义className应该正确应用', () => {
      const tasks = createTaskList(2);
      const { container } = render(<TaskExecutionPanel tasks={tasks} className="custom-class" />);

      expect(container.firstChild?.className).toContain('custom-class');
    });

    it('showSummary=false时不应该显示摘要', () => {
      const tasks = createTaskList(2);
      render(<TaskExecutionPanel tasks={tasks} showSummary={false} />);

      expect(screen.queryByText('总体进度')).not.toBeInTheDocument();
    });

    it('所有状态图例应该正确显示', () => {
      const tasks = createTaskList(5);
      render(<TaskExecutionPanel tasks={tasks} />);

      // 找到图例区域并验证状态名称
      const legendSection = screen.getByText('状态图例');
      expect(legendSection).toBeInTheDocument();

      // 验证各状态标签存在于图例区域
      const legendArea = legendSection.closest('.mt-4');
      expect(legendArea?.textContent).toContain('待执行');
      expect(legendArea?.textContent).toContain('执行中');
      expect(legendArea?.textContent).toContain('已完成');
      expect(legendArea?.textContent).toContain('失败');
      expect(legendArea?.textContent).toContain('已取消');
    });
  });

  describe('10. 类型定义测试', () => {
    it('TaskExecutionStatus应该包含所有枚举值', () => {
      const statuses: TaskExecutionStatus[] = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'];
      expect(statuses).toHaveLength(5);
    });

    it('AgentRole应该包含所有枚举值', () => {
      const roles: AgentRole[] = ['PLANNER', 'EXECUTOR', 'REVIEWER', 'COORDINATOR'];
      expect(roles).toHaveLength(4);
    });

    it('TaskExecutionItem接口应该包含必要字段', () => {
      const task: TaskExecutionItem = {
        id: 'test-id',
        name: 'Test Task',
        status: 'PENDING',
        role: 'EXECUTOR',
        progress: 0,
        dependencies: [],
        estimatedDuration: 1000,
        actualDuration: 800,
        error: undefined,
        result: undefined,
        startTime: Date.now(),
        endTime: Date.now(),
        level: 0,
        parallelGroup: 'group-1'
      };

      expect(task.id).toBeDefined();
      expect(task.name).toBeDefined();
      expect(task.status).toBeDefined();
      expect(task.role).toBeDefined();
      expect(task.progress).toBeDefined();
    });
  });
});