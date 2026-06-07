import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import ActionBar from '../ActionBar';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

// Mock 子组件
vi.mock('../ConfirmDialog', () => ({
  default: function MockConfirmDialog({
    isOpen,
    title,
    message,
    variant,
    onConfirm,
    onCancel,
  }: any) {
    if (!isOpen) return null;
    return (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <span>{message}</span>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    );
  },
}));

vi.mock('../ActionHistory', () => ({
  default: function MockActionHistory({ history, onClear }: any) {
    return (
      <div data-testid="action-history">
        <span>History: {history.length}</span>
      </div>
    );
  },
}));

vi.mock('../BatchOperationMenu', () => ({
  default: function MockBatchOperationMenu({
    selectedCount,
    onBatchComplete,
    onBatchFail,
    onBatchDelete,
    onClearSelection,
  }: any) {
    return (
      <div data-testid="batch-menu">
        <span>Selected: {selectedCount}</span>
      </div>
    );
  },
}));

vi.mock('../SoundToggle', () => ({
  default: function MockSoundToggle({ enabled, onToggle }: any) {
    return (
      <button data-testid="sound-toggle" onClick={onToggle}>
        Sound: {enabled ? 'ON' : 'OFF'}
      </button>
    );
  },
}));

vi.mock('../KeyboardShortcutHint', () => ({
  default: function MockKeyboardShortcutHint() {
    return <div data-testid="shortcut-hint" />;
  },
}));

// Mock useMissionControlStore
const createMockStore = (overrides = {}) => ({
  soundEnabled: true,
  toggleSound: vi.fn(),
  actionHistory: [],
  clearActionHistory: vi.fn(),
  selectedTaskIds: [],
  batchComplete: vi.fn(),
  batchFail: vi.fn(),
  clearSelection: vi.fn(),
  removeTask: vi.fn(),
  tasks: [],
  ...overrides,
});

let mockStore = createMockStore();

vi.mock('../store', () => ({
  useMissionControlStore: (selector?: any) => {
    if (selector) return selector(mockStore);
    return mockStore;
  },
}));

describe('ActionBar', () => {
  const defaultProps = {
    onPublishAll: vi.fn(),
    onPauseAll: vi.fn(),
    onResumeAll: vi.fn(),
    onStopAll: vi.fn(),
    onClearCompleted: vi.fn(),
    isPaused: false,
    activeCount: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore = createMockStore();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('基本渲染', () => {
    test('显示发布全部按钮', () => {
      render(<ActionBar {...defaultProps} />);
      expect(screen.getByText('发布全部')).toBeInTheDocument();
    });

    test('显示暂停按钮', () => {
      render(<ActionBar {...defaultProps} />);
      expect(screen.getByText('暂停')).toBeInTheDocument();
    });

    test('显示停止按钮', () => {
      render(<ActionBar {...defaultProps} />);
      expect(screen.getByText('停止')).toBeInTheDocument();
    });

    test('显示清理已完成按钮', () => {
      render(<ActionBar {...defaultProps} />);
      expect(screen.getByText('清理已完成')).toBeInTheDocument();
    });

    test('显示重置按钮', () => {
      render(<ActionBar {...defaultProps} />);
      expect(screen.getByText('重置')).toBeInTheDocument();
    });
  });

  describe('按钮交互', () => {
    test('点击发布全部调用 onPublishAll', () => {
      render(<ActionBar {...defaultProps} />);
      fireEvent.click(screen.getByText('发布全部'));
      expect(defaultProps.onPublishAll).toHaveBeenCalledTimes(1);
    });

    test('点击暂停调用 onPauseAll', () => {
      render(<ActionBar {...defaultProps} />);
      fireEvent.click(screen.getByText('暂停'));
      expect(defaultProps.onPauseAll).toHaveBeenCalledTimes(1);
    });

    test('isPaused 为 true 时显示恢复按钮', () => {
      render(<ActionBar {...defaultProps} isPaused={true} />);
      expect(screen.getByText('恢复')).toBeInTheDocument();
    });

    test('点击恢复调用 onResumeAll', () => {
      render(<ActionBar {...defaultProps} isPaused={true} />);
      fireEvent.click(screen.getByText('恢复'));
      expect(defaultProps.onResumeAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('状态显示', () => {
    test('显示任务进行中数量', () => {
      render(<ActionBar {...defaultProps} activeCount={5} />);
      // 应该显示数字 5
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  describe('确认对话框', () => {
    test('activeCount > 0 时点击停止显示确认对话框', async () => {
      render(<ActionBar {...defaultProps} activeCount={3} />);
      fireEvent.click(screen.getByText('停止'));

      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
        expect(screen.getByText('确认停止')).toBeInTheDocument();
      });
    });

    test('确认对话框显示正确的消息', async () => {
      render(<ActionBar {...defaultProps} activeCount={5} />);
      fireEvent.click(screen.getByText('停止'));

      await waitFor(() => {
        expect(screen.getByText(/确定要停止当前 5 个进行中的任务吗/)).toBeInTheDocument();
      });
    });

    test('点击确认对话框的确认按钮调用 onStopAll', async () => {
      render(<ActionBar {...defaultProps} activeCount={3} />);
      fireEvent.click(screen.getByText('停止'));

      await waitFor(() => {
        fireEvent.click(screen.getByText('Confirm'));
      });

      expect(defaultProps.onStopAll).toHaveBeenCalledTimes(1);
    });

    test('点击取消关闭对话框', async () => {
      render(<ActionBar {...defaultProps} activeCount={3} />);
      fireEvent.click(screen.getByText('停止'));

      await waitFor(() => {
        fireEvent.click(screen.getByText('Cancel'));
      });

      await waitFor(() => {
        expect(screen.queryByTestId('confirm-dialog')).toBeNull();
      });
    });
  });

  describe('清理确认', () => {
    test('有已完成任务时点击清理显示确认对话框', async () => {
      mockStore = createMockStore({
        tasks: [
          { id: '1', status: 'completed' },
          { id: '2', status: 'completed' },
        ],
      });
      render(<ActionBar {...defaultProps} />);
      fireEvent.click(screen.getByText('清理已完成'));

      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
        expect(screen.getByText('清理确认')).toBeInTheDocument();
      });
    });
  });

  describe('重置确认', () => {
    test('点击重置显示确认对话框', async () => {
      render(<ActionBar {...defaultProps} />);
      fireEvent.click(screen.getByText('重置'));

      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
        expect(screen.getByText('确认重置')).toBeInTheDocument();
      });
    });
  });
});