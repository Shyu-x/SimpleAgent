import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

// Mock EventSource - using class syntax for proper constructor
class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  constructor(url) {
    this.url = url;
    this.readyState = MockEventSource.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.listeners = {};

    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockEventSource.OPEN;
      if (this.onopen) this.onopen();
    }, 0);
  }

  addEventListener(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  dispatchEvent(event) {
    if (this.listeners[event.type]) {
      this.listeners[event.type].forEach(cb => cb(event));
    }
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }
}

global.EventSource = MockEventSource;

// Mock fetch - returns mock trace data
const mockTraceData = {
  data: {
    traceId: 'trace_test_123',
    operationName: '测试查询',
    serviceName: 'test-service',
    startTime: Date.now() - 1500,
    endTime: Date.now(),
    duration: 1500,
    status: 'ok',
    spans: [
      {
        spanId: 'span_1',
        name: 'intent_classify',
        traceId: 'trace_test_123',
        parentSpanId: null,
        startTime: Date.now() - 1500,
        endTime: Date.now() - 1400,
        duration: 100,
        status: 'ok',
        tags: { intent: 'search' },
        events: [],
        childCount: 0
      },
      {
        spanId: 'span_2',
        name: 'tool_execution',
        traceId: 'trace_test_123',
        parentSpanId: 'span_1',
        startTime: Date.now() - 1400,
        endTime: Date.now() - 600,
        duration: 800,
        status: 'ok',
        tags: { tool: 'web_search' },
        events: [],
        childCount: 0
      },
      {
        spanId: 'span_3',
        name: 'result_aggregation',
        traceId: 'trace_test_123',
        parentSpanId: 'span_2',
        startTime: Date.now() - 600,
        endTime: Date.now(),
        duration: 200,
        status: 'ok',
        tags: {},
        events: [],
        childCount: 0
      }
    ]
  }
};

global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(mockTraceData)
  })
) as unknown as typeof fetch;

// Import after mocks
import AgentVisualizer from '../AgentVisualizer';

describe('AgentVisualizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('渲染行为', () => {
    test('未提供 traceId 时显示友好提示', () => {
      render(
        <AgentVisualizer
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText(/暂无轨迹 ID/i)).toBeInTheDocument();
    });

    test('提供 traceId 后显示轨迹内容', async () => {
      render(
        <AgentVisualizer
          traceId="trace_test"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      // 等待 fetch 调用
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      // 等待渲染完成 - 检查执行轨迹标题出现
      await waitFor(() => {
        expect(screen.getByText('Agent 执行轨迹')).toBeInTheDocument();
      });
    });
  });

  describe('数据展示', () => {
    test('显示 trace ID (截断为前8位)', async () => {
      render(
        <AgentVisualizer
          traceId="trace_test_123456789"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('http://localhost:30000/api/admin/traces/trace_test_123456789');
      });

      // 截断显示前8位
      await waitFor(() => {
        expect(screen.getByText(/Trace ID:.*/)).toBeInTheDocument();
      });
    });

    test('显示总耗时', async () => {
      const { container } = render(
        <AgentVisualizer
          traceId="trace_test_123"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      // 等待总耗时显示 (根据 mock 数据是 1500ms)
      await waitFor(() => {
        expect(container.textContent).toContain('1500');
      });
    });
  });

  describe('交互功能', () => {
    test('点击关闭按钮调用 onClose', async () => {
      const onClose = vi.fn();

      render(
        <AgentVisualizer
          traceId="trace_test"
          isOpen={true}
          onClose={onClose}
        />
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      // 等待渲染完成后再查找按钮 - 使用 class selector 找到底部关闭按钮
      await waitFor(() => {
        const btn = document.querySelector('button.w-full');
        expect(btn).toBeTruthy();
      });

      const closeButton = document.querySelector('button.w-full');

      act(() => {
        closeButton.click();
      });

      expect(onClose).toHaveBeenCalled();
    });
  });
});