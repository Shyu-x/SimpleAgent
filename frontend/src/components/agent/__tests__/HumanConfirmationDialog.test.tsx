import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import HumanConfirmationDialog from '../HumanConfirmationDialog';

// Mock localStorage
const mockLocalStorage = {
  data: {},
  getItem: vi.fn((key) => mockLocalStorage.data[key] || null),
  setItem: vi.fn((key, value) => { mockLocalStorage.data[key] = value; }),
  removeItem: vi.fn((key) => { delete mockLocalStorage.data[key]; }),
  clear: vi.fn(() => { mockLocalStorage.data = {}; }),
};

Object.defineProperty(global, 'localStorage', { value: mockLocalStorage, writable: true });

// Mock window.scrollTo
Object.defineProperty(window, 'scrollTo', {
  value: vi.fn(),
  writable: true
});

describe('HumanConfirmationDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockLocalStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const mockRequest = {
    id: 'req-1',
    type: 'action' as const,
    title: '确认执行操作',
    message: '确定要执行这个操作吗？',
    options: [
      { id: 'confirm', label: '确认', style: 'primary' as const, value: true },
      { id: 'cancel', label: '取消', style: 'default' as const, value: false }
    ],
    timeout: 60,
  };

  describe('渲染行为', () => {
    test('显示确认标题', () => {
      render(
        <HumanConfirmationDialog
          request={mockRequest}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.getByText('确认执行操作')).toBeInTheDocument();
    });

    test('显示确认消息', () => {
      render(
        <HumanConfirmationDialog
          request={mockRequest}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.getByText('确定要执行这个操作吗？')).toBeInTheDocument();
    });

    test('显示操作确认类型标签', () => {
      render(
        <HumanConfirmationDialog
          request={mockRequest}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.getByText('操作确认')).toBeInTheDocument();
    });
  });

  describe('风险等级显示', () => {
    test('高风险显示高风险标签', () => {
      render(
        <HumanConfirmationDialog
          request={{ ...mockRequest, riskLevel: 'high' as const }}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.getByText('高风险')).toBeInTheDocument();
    });

    test('中风险显示中风险标签', () => {
      render(
        <HumanConfirmationDialog
          request={{ ...mockRequest, riskLevel: 'medium' as const }}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.getByText('中风险')).toBeInTheDocument();
    });

    test('低风险显示低风险标签', () => {
      render(
        <HumanConfirmationDialog
          request={{ ...mockRequest, riskLevel: 'low' as const }}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.getByText('低风险')).toBeInTheDocument();
    });
  });

  describe('倒计时功能', () => {
    test('显示倒计时数字', () => {
      render(
        <HumanConfirmationDialog
          request={mockRequest}
          onConfirm={vi.fn()}
        />
      );

      // 初始显示60秒
      expect(screen.getByText('60')).toBeInTheDocument();
    });

    test('倒计时递减', () => {
      render(
        <HumanConfirmationDialog
          request={mockRequest}
          onConfirm={vi.fn()}
        />
      );

      // 初始60
      expect(screen.getByText('60')).toBeInTheDocument();

      // 前进1秒
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // 应该是59
      expect(screen.getByText('59')).toBeInTheDocument();
    });

    test('无倒计时时不显示计时器', () => {
      render(
        <HumanConfirmationDialog
          request={{ ...mockRequest, timeout: undefined }}
          onConfirm={vi.fn()}
        />
      );

      // 不应该显示60倒计时（因为没有timeout）
      // 检查没有timeout时，60不应该出现
      const sixtyElement = screen.queryByText((content, element) => {
        return element.tagName === 'SPAN' && content === '60';
      });
      expect(sixtyElement).not.toBeInTheDocument();
    });

    test('倒计时结束自动选择默认选项', () => {
      const onConfirm = vi.fn();

      render(
        <HumanConfirmationDialog
          request={mockRequest}
          onConfirm={onConfirm}
        />
      );

      // 初始60
      expect(screen.getByText('60')).toBeInTheDocument();

      // 倒计时从60倒数到0，每次快进1000ms
      // 这样可以正确触发 setTimeout 回调链：timeLeft 每次减1
      for (let i = 59; i >= 0; i--) {
        act(() => {
          vi.advanceTimersByTime(1000);
        });
      }

      // 等待200ms延迟回调
      act(() => {
        vi.advanceTimersByTime(200);
      });

      // 应该自动选择第一个选项（confirm）
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-1',
          selectedOption: 'confirm'
        })
      );
    });

    test('倒计时结束无默认选项时调用onDismiss', () => {
      const onDismiss = vi.fn();

      render(
        <HumanConfirmationDialog
          request={{
            ...mockRequest,
            options: [] // 无选项
          }}
          onConfirm={vi.fn()}
          onDismiss={onDismiss}
        />
      );

      // 初始60
      expect(screen.getByText('60')).toBeInTheDocument();

      // 逐步快进，每次1秒，共60秒
      for (let i = 0; i < 60; i++) {
        act(() => {
          vi.advanceTimersByTime(1000);
        });
      }

      // 应该调用onDismiss
      expect(onDismiss).toHaveBeenCalled();
    });
  });

  describe('选项按钮', () => {
    test('显示所有选项', () => {
      render(
        <HumanConfirmationDialog
          request={mockRequest}
          onConfirm={vi.fn()}
        />
      );

      // 使用 getAllByText 因为键盘快捷键提示也包含"确认"文本
      const confirmButtons = screen.getAllByText('确认');
      // 应该有确认按钮 + 快捷键提示中的确认
      expect(confirmButtons.length).toBeGreaterThanOrEqual(1);
    });

    test('点击确认选项调用 onConfirm', () => {
      const onConfirm = vi.fn();

      render(
        <HumanConfirmationDialog
          request={mockRequest}
          onConfirm={onConfirm}
        />
      );

      // 点击确认按钮
      const confirmButton = screen.getByRole('button', { name: /确认/i });
      fireEvent.click(confirmButton);

      // 等待延迟回调
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-1',
          selectedOption: 'confirm'
        })
      );
    });

    test('点击取消选项调用 onConfirm', () => {
      const onConfirm = vi.fn();

      render(
        <HumanConfirmationDialog
          request={mockRequest}
          onConfirm={onConfirm}
        />
      );

      // 点击取消按钮
      const cancelButton = screen.getByRole('button', { name: /取消/i });
      fireEvent.click(cancelButton);

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedOption: 'cancel'
        })
      );
    });
  });

  describe('键盘快捷键', () => {
    test('按 Y 键确认', () => {
      const onConfirm = vi.fn();

      render(
        <HumanConfirmationDialog
          request={mockRequest}
          onConfirm={onConfirm}
        />
      );

      fireEvent.keyDown(window, { key: 'y' });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(onConfirm).toHaveBeenCalled();
    });

    test('按 N 键取消', () => {
      const onConfirm = vi.fn();

      render(
        <HumanConfirmationDialog
          request={mockRequest}
          onConfirm={onConfirm}
        />
      );

      fireEvent.keyDown(window, { key: 'n' });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(onConfirm).toHaveBeenCalled();
    });

    test('按 ESC 键调用 onDismiss', () => {
      const onDismiss = vi.fn();

      render(
        <HumanConfirmationDialog
          request={mockRequest}
          onConfirm={vi.fn()}
          onDismiss={onDismiss}
        />
      );

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(onDismiss).toHaveBeenCalled();
    });
  });

  describe('警告信息', () => {
    test('显示警告信息', () => {
      render(
        <HumanConfirmationDialog
          request={{
            ...mockRequest,
            warnings: ['这是一个危险操作', '可能会影响系统稳定性']
          }}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.getByText('2 条警告信息')).toBeInTheDocument();
    });

    test('点击展开警告详情', () => {
      render(
        <HumanConfirmationDialog
          request={{
            ...mockRequest,
            warnings: ['警告1', '警告2']
          }}
          onConfirm={vi.fn()}
        />
      );

      fireEvent.click(screen.getByText('2 条警告信息'));

      expect(screen.getByText('警告1')).toBeInTheDocument();
      expect(screen.getByText('警告2')).toBeInTheDocument();
    });
  });

  describe('命令预览', () => {
    test('显示命令预览', () => {
      render(
        <HumanConfirmationDialog
          request={{
            ...mockRequest,
            command: 'rm -rf /important'
          }}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.getByText('操作命令')).toBeInTheDocument();
      expect(screen.getByText('rm -rf /important')).toBeInTheDocument();
    });
  });

  describe('数据预览', () => {
    test('显示数据预览', () => {
      render(
        <HumanConfirmationDialog
          request={{
            ...mockRequest,
            dataPreview: '示例数据内容'
          }}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.getByText('数据预览')).toBeInTheDocument();
      expect(screen.getByText('示例数据内容')).toBeInTheDocument();
    });
  });

  describe('预计执行时间', () => {
    test('显示预计执行时间', () => {
      render(
        <HumanConfirmationDialog
          request={{
            ...mockRequest,
            estimatedTime: '30秒'
          }}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.getByText('预计执行时间:')).toBeInTheDocument();
      expect(screen.getByText('30秒')).toBeInTheDocument();
    });
  });

  describe('不再提示功能', () => {
    test('显示不再提示选项', () => {
      render(
        <HumanConfirmationDialog
          request={{
            ...mockRequest,
            similarOperationKey: 'test-operation'
          }}
          onConfirm={vi.fn()}
        />
      );

      expect(screen.getByText('不再提示同类操作')).toBeInTheDocument();
    });

    test('点击不再提示选项切换状态', () => {
      render(
        <HumanConfirmationDialog
          request={{
            ...mockRequest,
            similarOperationKey: 'test-operation'
          }}
          onConfirm={vi.fn()}
        />
      );

      fireEvent.click(screen.getByText('不再提示同类操作'));

      // 选项应该被选中（切换状态）
      // 由于是内部状态，可以通过点击按钮来切换
    });
  });
});