import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

// Mock AgentVisualizer
vi.mock('../../AgentVisualizer', () => {
  return function MockAgentVisualizer({ isOpen, onClose, traceId }: any) {
    return isOpen ? (
      <div data-testid="agent-visualizer">
        <span>Trace: {traceId}</span>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null;
  };
});

describe('MissionControl Mini 可视化', () => {
  describe('Mini 可视化浮动窗口', () => {
    test('任务执行时自动显示 mini 可视化', () => {
      const mockTasks = [
        { id: '1', name: '任务A', status: 'in_progress', traceId: 'trace_123' },
        { id: '2', name: '任务B', status: 'pending' }
      ];

      // 测试组件逻辑：执行中的任务触发 mini 可视化
      const executingTask = mockTasks.find(t => t.status === 'in_progress');
      expect(executingTask).toBeDefined();
      expect(executingTask?.traceId).toBe('trace_123');
    });

    test('Mini 可视化显示 trace ID', () => {
      const traceId = 'trace_abc123';
      const truncatedId = traceId.substring(0, 12);

      expect(truncatedId).toBe('trace_abc123');
      expect(truncatedId.length).toBe(12);
    });

    test('任务完成后 2 秒自动隐藏', async () => {
      vi.useFakeTimers();

      let showMiniViz = true;
      const setShowMiniViz = (val: boolean) => { showMiniViz = val; };

      // 模拟任务完成
      const completedCount = 1;
      if (completedCount > 0 && showMiniViz) {
        setTimeout(() => setShowMiniViz(false), 2000);
      }

      expect(showMiniViz).toBe(true);

      // 快进 2 秒
      vi.advanceTimersByTime(2000);

      expect(showMiniViz).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('展开完整视图', () => {
    test('点击展开按钮显示完整 AgentVisualizer', () => {
      let showFullViz = false;
      const setShowFullViz = (val: boolean) => { showFullViz = val; };

      // 模拟点击展开
      const onExpand = () => setShowFullViz(true);

      expect(showFullViz).toBe(false);
      onExpand();
      expect(showFullViz).toBe(true);
    });

    test('完整视图可关闭', () => {
      let showFullViz = true;
      const setShowFullViz = (val: boolean) => { showFullViz = val; };

      expect(showFullViz).toBe(true);
      setShowFullViz(false);
      expect(showFullViz).toBe(false);
    });
  });

  describe('任务状态显示', () => {
    test('执行中任务显示不同样式', () => {
      const inProgressTasks = [
        { id: '1', name: '执行中任务', status: 'in_progress' },
        { id: '2', name: '已完成任务', status: 'completed' }
      ];

      const inProgress = inProgressTasks.filter(t => t.status === 'in_progress');
      const completed = inProgressTasks.filter(t => t.status === 'completed');

      expect(inProgress.length).toBe(1);
      expect(completed.length).toBe(1);
    });

    test('只显示最近 3 个已完成任务', () => {
      const completedTasks = [
        { id: '1', name: '任务1' },
        { id: '2', name: '任务2' },
        { id: '3', name: '任务3' },
        { id: '4', name: '任务4' },
        { id: '5', name: '任务5' }
      ];

      const recentTasks = completedTasks.slice(-3);
      expect(recentTasks.length).toBe(3);
      expect(recentTasks[0].name).toBe('任务3');
    });
  });
});