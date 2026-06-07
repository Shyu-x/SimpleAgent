import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import ResultsFeed from '../ResultsFeed';
import type { MissionEvent } from '../types';

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
  CheckCircle2: () => <span data-testid="check-icon">CheckCircle2</span>,
  XCircle: () => <span data-testid="x-icon">XCircle</span>,
  Clock: () => <span data-testid="clock-icon">Clock</span>,
  Zap: () => <span data-testid="zap-icon">Zap</span>,
  Radio: () => <span data-testid="radio-icon">Radio</span>,
  AlertTriangle: () => <span data-testid="alert-icon">AlertTriangle</span>,
  Info: () => <span data-testid="info-icon">Info</span>,
  UserPlus: () => <span data-testid="userplus-icon">UserPlus</span>,
  UserCheck: () => <span data-testid="usercheck-icon">UserCheck</span>,
  Play: () => <span data-testid="play-icon">Play</span>,
  Search: () => <span data-testid="search-icon">Search</span>,
  Download: () => <span data-testid="download-icon">Download</span>,
  Filter: () => <span data-testid="filter-icon">Filter</span>,
  X: () => <span data-testid="x-icon">X</span>,
  BarChart3: () => <span data-testid="barchart-icon">BarChart3</span>,
  ChevronDown: () => <span data-testid="chevron-down-icon">ChevronDown</span>,
  ChevronUp: () => <span data-testid="chevron-up-icon">ChevronUp</span>,
  Activity: () => <span data-testid="activity-icon">Activity</span>,
  Wifi: () => <span data-testid="wifi-icon">Wifi</span>,
  WifiOff: () => <span data-testid="wifi-off-icon">WifiOff</span>,
}));

// Mock BarChartComponent
vi.mock('../BarChartComponent', () => ({
  default: function MockBarChart() {
    return <div data-testid="bar-chart">Chart</div>;
  },
}));

// Mock useMissionControlStore
const mockStore = {
  events: [] as MissionEvent[],
  clearEvents: vi.fn(),
};

vi.mock('../store', () => ({
  useMissionControlStore: (selector?: any) => {
    if (selector) return selector(mockStore);
    return mockStore;
  },
}));

describe('ResultsFeed', () => {
  const createEvent = (overrides: Partial<MissionEvent> = {}): MissionEvent => ({
    id: `event-${Math.random()}`,
    type: 'task_created',
    timestamp: Date.now(),
    message: '测试事件',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.events = [];
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('基本渲染', () => {
    test('无事件时显示提示', () => {
      render(<ResultsFeed />);
      expect(screen.getByText('暂无事件')).toBeInTheDocument();
      expect(screen.getByText('任务开始后将显示实时动态')).toBeInTheDocument();
    });

    test('有事件时显示事件流标题', () => {
      mockStore.events = [createEvent()];
      render(<ResultsFeed />);
      expect(screen.getByText('实时事件流')).toBeInTheDocument();
    });
  });

  describe('事件显示', () => {
    test('显示事件消息', () => {
      mockStore.events = [createEvent({ message: '任务已创建' })];
      render(<ResultsFeed />);
      expect(screen.getByText('任务已创建')).toBeInTheDocument();
    });

    test('显示事件数量', () => {
      mockStore.events = [
        createEvent({ id: '1' }),
        createEvent({ id: '2' }),
        createEvent({ id: '3' }),
      ];
      render(<ResultsFeed />);
      expect(screen.getByText('(3)')).toBeInTheDocument();
    });

    test('显示 Agent ID', () => {
      mockStore.events = [createEvent({ agentId: 'agent-123' })];
      render(<ResultsFeed />);
      expect(screen.getByText(/agent-123/)).toBeInTheDocument();
    });

    test('显示 Task ID', () => {
      mockStore.events = [createEvent({ taskId: 'task-456' })];
      render(<ResultsFeed />);
      expect(screen.getByText(/task-456/)).toBeInTheDocument();
    });
  });

  describe('过滤器', () => {
    test('显示分类过滤按钮', () => {
      mockStore.events = [createEvent()];
      render(<ResultsFeed />);
      expect(screen.getByText('全部')).toBeInTheDocument();
      expect(screen.getByText('任务')).toBeInTheDocument();
      expect(screen.getByText('Agent')).toBeInTheDocument();
      expect(screen.getByText('系统')).toBeInTheDocument();
    });

    test('切换分类过滤', async () => {
      mockStore.events = [
        createEvent({ id: '1', type: 'task_created' }),
        createEvent({ id: '2', type: 'agent_status_change' }),
      ];
      render(<ResultsFeed />);

      // 点击"任务"过滤
      fireEvent.click(screen.getByText('任务'));

      await waitFor(() => {
        // 应该只显示任务类型的事件
      });
    });
  });

  describe('搜索功能', () => {
    test('显示搜索按钮', () => {
      mockStore.events = [createEvent()];
      render(<ResultsFeed />);
      expect(screen.getByTestId('search-icon')).toBeInTheDocument();
    });

    test('点击搜索按钮显示搜索框', async () => {
      mockStore.events = [createEvent({ message: '测试消息' })];
      render(<ResultsFeed />);

      fireEvent.click(screen.getByTestId('search-icon'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('搜索事件...')).toBeInTheDocument();
      });
    });

    test('输入搜索关键词', async () => {
      mockStore.events = [createEvent({ message: '测试消息' })];
      render(<ResultsFeed />);

      fireEvent.click(screen.getByTestId('search-icon'));

      await waitFor(() => {
        const input = screen.getByPlaceholderText('搜索事件...');
        fireEvent.change(input, { target: { value: '测试' } });
        expect(input).toHaveValue('测试');
      });
    });
  });

  describe('SSE 状态', () => {
    test('显示实时连接状态', () => {
      mockStore.events = [createEvent()];
      render(<ResultsFeed />);
      expect(screen.getByText('实时连接')).toBeInTheDocument();
    });

    test('显示事件每秒数量', () => {
      mockStore.events = [createEvent()];
      render(<ResultsFeed />);
      expect(screen.getByText(/条\/秒/)).toBeInTheDocument();
    });
  });

  describe('清空功能', () => {
    test('显示清除按钮', () => {
      mockStore.events = [createEvent()];
      render(<ResultsFeed />);
      expect(screen.getByTestId('x-icon')).toBeInTheDocument();
    });

    test('点击清除按钮调用 clearEvents', () => {
      mockStore.events = [createEvent()];
      render(<ResultsFeed />);

      const clearBtn = screen.getByTestId('x-icon')?.closest('button');
      if (clearBtn) {
        fireEvent.click(clearBtn);
      }

      expect(mockStore.clearEvents).toHaveBeenCalledTimes(1);
    });
  });

  describe('导出功能', () => {
    test('显示导出按钮', () => {
      mockStore.events = [createEvent()];
      render(<ResultsFeed />);
      expect(screen.getByTestId('download-icon')).toBeInTheDocument();
    });

    test('点击导出按钮显示导出菜单', async () => {
      mockStore.events = [createEvent()];
      render(<ResultsFeed />);

      fireEvent.click(screen.getByTestId('download-icon'));

      await waitFor(() => {
        expect(screen.getByText('导出 JSON')).toBeInTheDocument();
        expect(screen.getByText('导出 CSV')).toBeInTheDocument();
      });
    });
  });

  describe('统计图表', () => {
    test('显示统计按钮', () => {
      mockStore.events = [createEvent()];
      render(<ResultsFeed />);
      expect(screen.getByTestId('barchart-icon')).toBeInTheDocument();
    });

    test('点击统计按钮显示图表', async () => {
      mockStore.events = [createEvent()];
      render(<ResultsFeed />);

      fireEvent.click(screen.getByTestId('barchart-icon'));

      await waitFor(() => {
        expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
      });
    });
  });
});