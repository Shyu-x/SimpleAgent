import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { ResponsiveModal } from '../ResponsiveModal';

describe('ResponsiveModal', () => {
  describe('桌面端居中弹窗', () => {
    test('isOpen 为 true 时显示 Modal', () => {
      render(
        <ResponsiveModal isOpen={true} onClose={vi.fn()}>
          <div>测试内容</div>
        </ResponsiveModal>
      );
      expect(screen.getByText('测试内容')).toBeInTheDocument();
    });

    test('isOpen 为 false 时不显示 Modal', () => {
      render(
        <ResponsiveModal isOpen={false} onClose={vi.fn()}>
          <div>测试内容</div>
        </ResponsiveModal>
      );
      expect(screen.queryByText('测试内容')).not.toBeInTheDocument();
    });

    test('点击关闭按钮调用 onClose', () => {
      const onClose = vi.fn();
      render(
        <ResponsiveModal isOpen={true} onClose={onClose} title="测试标题">
          <div>内容</div>
        </ResponsiveModal>
      );

      // 找到关闭按钮
      const closeButton = screen.getByRole('button', { name: /关闭/i });
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('显示标题', () => {
      render(
        <ResponsiveModal isOpen={true} onClose={vi.fn()} title="测试标题">
          <div>内容</div>
        </ResponsiveModal>
      );
      expect(screen.getByText('测试标题')).toBeInTheDocument();
    });
  });

  describe('响应式尺寸', () => {
    test('size sm 最大宽度为 max-w-sm', () => {
      const { container } = render(
        <ResponsiveModal isOpen={true} onClose={vi.fn()} size="sm">
          <div>内容</div>
        </ResponsiveModal>
      );
      // 验证 size class
      expect(container.querySelector('.max-w-sm')).toBeTruthy();
    });

    test('size xl 最大宽度为 max-w-xl', () => {
      const { container } = render(
        <ResponsiveModal isOpen={true} onClose={vi.fn()} size="xl">
          <div>内容</div>
        </ResponsiveModal>
      );
      expect(container.querySelector('.max-w-xl')).toBeTruthy();
    });
  });
});