import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import BatchOperationMenu from '../BatchOperationMenu';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Layers: () => <span data-testid="layers-icon">Layers</span>,
  X: () => <span data-testid="x-icon">X</span>,
  CheckCircle: () => <span data-testid="check-icon">CheckCircle</span>,
  XCircle: () => <span data-testid="xcircle-icon">XCircle</span>,
  Trash2: () => <span data-testid="trash-icon">Trash2</span>,
  Copy: () => <span data-testid="copy-icon">Copy</span>,
  ArrowUp: () => <span data-testid="arrow-up-icon">ArrowUp</span>,
  ArrowDown: () => <span data-testid="arrow-down-icon">ArrowDown</span>,
}));

describe('BatchOperationMenu', () => {
  const defaultProps = {
    selectedCount: 0,
    onBatchComplete: vi.fn(),
    onBatchFail: vi.fn(),
    onBatchDelete: vi.fn(),
    onClearSelection: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // 清理键盘监听
    document.removeEventListener('keydown', expect.any(Function));
  });

  describe('基本渲染', () => {
    test('selectedCount 为 0 时不渲染', () => {
      render(<BatchOperationMenu {...defaultProps} selectedCount={0} />);
      expect(screen.queryByText(/已选/)).toBeNull();
    });

    test('selectedCount 大于 0 时显示', () => {
      render(<BatchOperationMenu {...defaultProps} selectedCount={3} />);
      expect(screen.getByText('已选 3 项')).toBeInTheDocument();
    });

    test('显示正确的选中数量', () => {
      render(<BatchOperationMenu {...defaultProps} selectedCount={5} />);
      expect(screen.getByText('已选 5 项')).toBeInTheDocument();
    });
  });

  describe('菜单展开', () => {
    test('点击按钮展开菜单', async () => {
      render(<BatchOperationMenu {...defaultProps} selectedCount={3} />);
      fireEvent.click(screen.getByText('已选 3 项'));

      await waitFor(() => {
        expect(screen.getByText('批量完成')).toBeInTheDocument();
        expect(screen.getByText('批量删除')).toBeInTheDocument();
      });
    });

    test('展开时显示清除选择选项', async () => {
      render(<BatchOperationMenu {...defaultProps} selectedCount={3} />);
      fireEvent.click(screen.getByText('已选 3 项'));

      await waitFor(() => {
        expect(screen.getByText('清除选择')).toBeInTheDocument();
      });
    });
  });

  describe('批量操作', () => {
    test('点击批量完成调用 onBatchComplete', async () => {
      render(<BatchOperationMenu {...defaultProps} selectedCount={3} />);
      fireEvent.click(screen.getByText('已选 3 项'));

      await waitFor(() => {
        fireEvent.click(screen.getByText('批量完成'));
      });

      expect(defaultProps.onBatchComplete).toHaveBeenCalledTimes(1);
    });

    test('点击批量失败调用 onBatchFail', async () => {
      render(<BatchOperationMenu {...defaultProps} selectedCount={3} />);
      fireEvent.click(screen.getByText('已选 3 项'));

      await waitFor(() => {
        fireEvent.click(screen.getByText('批量失败'));
      });

      expect(defaultProps.onBatchFail).toHaveBeenCalledTimes(1);
    });

    test('点击批量删除调用 onBatchDelete', async () => {
      render(<BatchOperationMenu {...defaultProps} selectedCount={3} />);
      fireEvent.click(screen.getByText('已选 3 项'));

      await waitFor(() => {
        fireEvent.click(screen.getByText('批量删除'));
      });

      expect(defaultProps.onBatchDelete).toHaveBeenCalledTimes(1);
    });

    test('点击清除选择调用 onClearSelection', async () => {
      render(<BatchOperationMenu {...defaultProps} selectedCount={3} />);
      fireEvent.click(screen.getByText('已选 3 项'));

      await waitFor(() => {
        fireEvent.click(screen.getByText('清除选择'));
      });

      expect(defaultProps.onClearSelection).toHaveBeenCalledTimes(1);
    });
  });

  describe('菜单关闭', () => {
    test('点击操作后菜单关闭', async () => {
      render(<BatchOperationMenu {...defaultProps} selectedCount={3} />);
      fireEvent.click(screen.getByText('已选 3 项'));

      await waitFor(() => {
        expect(screen.getByText('批量完成')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('批量完成'));

      await waitFor(() => {
        expect(screen.queryByText('批量完成')).toBeNull();
      });
    });

    test('按 Escape 关闭菜单', async () => {
      render(<BatchOperationMenu {...defaultProps} selectedCount={3} />);
      fireEvent.click(screen.getByText('已选 3 项'));

      await waitFor(() => {
        expect(screen.getByText('批量完成')).toBeInTheDocument();
      });

      fireEvent.keyDown(document, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByText('批量完成')).toBeNull();
      });
    });
  });
});