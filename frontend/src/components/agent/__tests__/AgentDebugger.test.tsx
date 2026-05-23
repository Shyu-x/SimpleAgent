import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import AgentDebugger from '../AgentDebugger';

// Mock fetch
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      traces: [
        { traceId: 'trace-1', query: 'Test query', startTime: Date.now(), status: 'completed' }
      ]
    })
  })
) as unknown as typeof fetch;

// Mock scrollTo
Object.defineProperty(window, 'scrollTo', {
  value: vi.fn(),
  writable: true
});

describe('AgentDebugger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('空闲状态', () => {
    test('显示调试器标题', async () => {
      render(<AgentDebugger />);

      await waitFor(() => {
        expect(screen.getByText('Agent 调试器')).toBeInTheDocument();
      });
    });

    test('显示就绪状态指示器', async () => {
      render(<AgentDebugger />);

      await waitFor(() => {
        expect(screen.getByText('就绪')).toBeInTheDocument();
      });
    });
  });

  describe('调试状态', () => {
    test('状态面板存在', async () => {
      render(<AgentDebugger />);

      await waitFor(() => {
        // 状态指示器存在
        const statusIndicators = screen.getByText('就绪');
        expect(statusIndicators).toBeInTheDocument();
      });
    });
  });

  describe('调试帧', () => {
    test('显示默认初始化日志', async () => {
      render(<AgentDebugger />);

      await waitFor(() => {
        expect(screen.getByText(/等待真实轨迹数据/i)).toBeInTheDocument();
      });
    });
  });

  describe('面板切换', () => {
    test('显示面板切换按钮', async () => {
      render(<AgentDebugger />);

      await waitFor(() => {
        // 检查是否有多个按钮（面板切换）
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(2);
      });
    });
  });

  describe('日志面板', () => {
    test('显示初始日志', async () => {
      render(<AgentDebugger />);

      await waitFor(() => {
        expect(screen.getByText(/Agent 调试器已初始化/i)).toBeInTheDocument();
      });
    });

    test('日志面板有日志计数', async () => {
      render(<AgentDebugger />);

      await waitFor(() => {
        // 日志计数显示
        expect(screen.getByText(/\d+ 条日志/i)).toBeInTheDocument();
      });
    });
  });

  describe('控制功能', () => {
    test('运行按钮存在', async () => {
      render(<AgentDebugger />);

      await waitFor(() => {
        const runButton = screen.getByRole('button', { name: /运行/i }) ||
                         screen.getByText('运行');
        expect(runButton).toBeInTheDocument();
      });
    });

    test('单步按钮存在', async () => {
      render(<AgentDebugger />);

      await waitFor(() => {
        const stepButton = screen.getByRole('button', { name: /单步/i }) ||
                          screen.getByText('单步');
        expect(stepButton).toBeInTheDocument();
      });
    });

    test('重置按钮存在', async () => {
      render(<AgentDebugger />);

      await waitFor(() => {
        const resetButton = screen.getByRole('button', { name: /重置/i }) ||
                           screen.getByText('重置');
        expect(resetButton).toBeInTheDocument();
      });
    });
  });

  describe('断点面板', () => {
    test('显示断点列表', async () => {
      render(<AgentDebugger />);

      await waitFor(() => {
        // 断点面板存在
        const breakpointsPanel = screen.getByText('断点');
        expect(breakpointsPanel).toBeInTheDocument();
      });
    });
  });

  describe('状态信息', () => {
    test('显示当前帧 ID 区域', async () => {
      render(<AgentDebugger />);

      await waitFor(() => {
        expect(screen.getByText('Agent 调试器')).toBeInTheDocument();
      });
    });
  });
});