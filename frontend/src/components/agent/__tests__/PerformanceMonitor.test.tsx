import { render, screen, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import PerformanceMonitor from '../PerformanceMonitor';

// Mock EventSource - don't trigger any events to avoid interfering with fetch
class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  readyState = 1;
  onopen: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;

  constructor(_url: string) {
    // Don't trigger onopen - this simulates a connection that doesn't send data
  }

  addEventListener(_event: string, _handler: (event: any) => void) {
    // Don't call any handlers - this prevents SSE from updating component state
  }
  removeEventListener(_event: string, _handler: (event: any) => void) {}
  close() {}
}

vi.stubGlobal('EventSource', MockEventSource);

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('PerformanceMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('渲染组件头部', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        performance: { avgResponseTime: 150 },
        throughput: { requestsPerMinute: 100 },
        tokens: { tokensPerMinute: 500, totalTokens: 1000 },
        success: { successRate: 98, errorRate: 2 },
        system: { cpuUsage: 30, memoryUsage: 50 },
        iterations: { avgIterations: 3, avgToolCalls: 5 },
        cost: { totalCost: 0.5, costPerRequest: 0.01 },
        agents: { activeAgents: 2, runningTasks: 1, queuedTasks: 3 },
        alerts: [],
      }),
    });

    render(<PerformanceMonitor />);
    expect(screen.getByText('性能监控')).toBeInTheDocument();
  });

  test('显示健康状态', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        performance: { avgResponseTime: 150 },
        throughput: { requestsPerMinute: 100 },
        tokens: { tokensPerMinute: 500, totalTokens: 1000 },
        success: { successRate: 98, errorRate: 2 },
        system: { cpuUsage: 30, memoryUsage: 50 },
        iterations: { avgIterations: 3, avgToolCalls: 5 },
        cost: { totalCost: 0.5, costPerRequest: 0.01 },
        agents: { activeAgents: 2, runningTasks: 1, queuedTasks: 3 },
        alerts: [],
      }),
    });

    render(<PerformanceMonitor />);
    expect(screen.getByText('健康')).toBeInTheDocument();
  });

  test('显示实时状态指标', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        performance: { avgResponseTime: 150 },
        throughput: { requestsPerMinute: 100 },
        tokens: { tokensPerMinute: 500, totalTokens: 1000 },
        success: { successRate: 98, errorRate: 2 },
        system: { cpuUsage: 30, memoryUsage: 50 },
        iterations: { avgIterations: 3, avgToolCalls: 5 },
        cost: { totalCost: 0.5, costPerRequest: 0.01 },
        agents: { activeAgents: 2, runningTasks: 1, queuedTasks: 3 },
        alerts: [],
      }),
    });

    render(<PerformanceMonitor />);
    expect(screen.getByText('活动 Agent')).toBeInTheDocument();
    expect(screen.getByText('运行任务')).toBeInTheDocument();
    expect(screen.getByText('队列任务')).toBeInTheDocument();
  });

  test('接受 className prop', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        performance: { avgResponseTime: 150 },
        throughput: { requestsPerMinute: 100 },
        tokens: { tokensPerMinute: 500, totalTokens: 1000 },
        success: { successRate: 98, errorRate: 2 },
        system: { cpuUsage: 30, memoryUsage: 50 },
        iterations: { avgIterations: 3, avgToolCalls: 5 },
        cost: { totalCost: 0.5, costPerRequest: 0.01 },
        agents: { activeAgents: 2, runningTasks: 1, queuedTasks: 3 },
        alerts: [],
      }),
    });

    const { container } = render(<PerformanceMonitor className="custom-class" />);
    expect(container.firstChild).toHaveClass('custom-class');
  });

  test('显示加载状态', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));
    render(<PerformanceMonitor />);
    expect(screen.getByText('正在加载指标数据...')).toBeInTheDocument();
  });
});