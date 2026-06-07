import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import ConfirmDialog from '../ConfirmDialog';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

describe('ConfirmDialog', () => {
  const defaultProps = {
    isOpen: true,
    title: '确认对话框',
    message: '确定要执行此操作吗？',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本渲染', () => {
    test('isOpen 为 false 时不渲染', () => {
      render(<ConfirmDialog {...defaultProps} isOpen={false} />);
      expect(screen.queryByText('确认对话框')).toBeNull();
    });

    test('isOpen 为 true 时显示标题和消息', () => {
      render(<ConfirmDialog {...defaultProps} />);
      expect(screen.getByText('确认对话框')).toBeInTheDocument();
      expect(screen.getByText('确定要执行此操作吗？')).toBeInTheDocument();
    });

    test('显示默认按钮文本', () => {
      render(<ConfirmDialog {...defaultProps} />);
      expect(screen.getByText('确认')).toBeInTheDocument();
      expect(screen.getByText('取消')).toBeInTheDocument();
    });

    test('显示自定义按钮文本', () => {
      render(
        <ConfirmDialog
          {...defaultProps}
          confirmLabel="确定"
          cancelLabel="算了"
        />
      );
      expect(screen.getByText('确定')).toBeInTheDocument();
      expect(screen.getByText('算了')).toBeInTheDocument();
    });
  });

  describe('变体样式', () => {
    test('danger 变体渲染成功', () => {
      render(<ConfirmDialog {...defaultProps} variant="danger" />);
      // 对话框应该渲染
      expect(screen.getByText('确认对话框')).toBeInTheDocument();
      expect(screen.getByText('确定要执行此操作吗？')).toBeInTheDocument();
    });

    test('warning 变体渲染成功', () => {
      render(<ConfirmDialog {...defaultProps} variant="warning" />);
      expect(screen.getByText('确认对话框')).toBeInTheDocument();
    });

    test('info 变体渲染成功', () => {
      render(<ConfirmDialog {...defaultProps} variant="info" />);
      expect(screen.getByText('确认对话框')).toBeInTheDocument();
    });
  });

  describe('倒计时功能', () => {
    test('countdown 为 undefined 时不显示倒计时', () => {
      render(<ConfirmDialog {...defaultProps} countdown={undefined} />);
      expect(screen.queryByText(/s$/)).toBeNull();
    });

    test('countdown 为 0 时不显示倒计时', () => {
      render(<ConfirmDialog {...defaultProps} countdown={0} />);
      expect(screen.queryByText(/s$/)).toBeNull();
    });

    test('countdown 为正数时显示倒计时', () => {
      render(<ConfirmDialog {...defaultProps} countdown={60} />);
      expect(screen.getByText('60s')).toBeInTheDocument();
    });
  });

  describe('交互行为', () => {
    test('点击确认按钮调用 onConfirm', () => {
      render(<ConfirmDialog {...defaultProps} />);
      fireEvent.click(screen.getByText('确认'));
      expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
    });

    test('点击取消按钮调用 onCancel', () => {
      render(<ConfirmDialog {...defaultProps} />);
      fireEvent.click(screen.getByText('取消'));
      expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
    });

    test('点击遮罩层调用 onCancel', () => {
      render(<ConfirmDialog {...defaultProps} />);
      // 找到遮罩层 (fixed inset-0 bg-black)
      const overlay = document.querySelector('.fixed.inset-0');
      if (overlay) {
        fireEvent.click(overlay);
        expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
      }
    });
  });
});