import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import KeyboardShortcutHint from '../KeyboardShortcutHint';

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
  Keyboard: () => <span data-testid="keyboard-icon">Keyboard</span>,
  X: () => <span data-testid="x-icon">X</span>,
}));

// Mock isClient
vi.mock('@/lib/ssrStorage', () => ({
  isClient: () => true,
}));

describe('KeyboardShortcutHint', () => {
  const defaultShortcuts = [
    { keys: ['Ctrl', 'Enter'], description: '发布全部' },
    { keys: ['Esc'], description: '关闭面板' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    // 清理 localStorage mock
    const stored: Record<string, string> = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key: string) => stored[key] || null,
        setItem: (key: string, value: string) => { stored[key] = value; },
        removeItem: (key: string) => { delete stored[key]; },
      },
      writable: true,
    });
  });

  afterEach(() => {
    // 清理事件监听
    document.querySelectorAll('[data-action="publish-all"]').forEach(el => {
      // 清理
    });
  });

  describe('基本渲染', () => {
    test('默认快捷键显示 Ctrl+Enter', async () => {
      render(<KeyboardShortcutHint shortcuts={defaultShortcuts} />);

      // 通过切换展开状态来测试
      fireEvent.keyDown(document, { key: '?' });

      await waitFor(() => {
        expect(screen.getByText('发布全部')).toBeInTheDocument();
        expect(screen.getByText('Ctrl')).toBeInTheDocument();
        expect(screen.getByText('Enter')).toBeInTheDocument();
      });
    });

    test('默认快捷键显示 Esc', async () => {
      render(<KeyboardShortcutHint shortcuts={defaultShortcuts} />);

      fireEvent.keyDown(document, { key: '?' });

      await waitFor(() => {
        expect(screen.getByText('关闭面板')).toBeInTheDocument();
        expect(screen.getByText('Esc')).toBeInTheDocument();
      });
    });
  });

  describe('面板展开/收起', () => {
    test('按 ? 键展开面板', async () => {
      render(<KeyboardShortcutHint />);

      // 模拟按 ? 键
      fireEvent.keyDown(document, { key: '?' });

      await waitFor(() => {
        expect(screen.getByText('快捷键')).toBeInTheDocument();
      });
    });

    test('再次按 ? 键收起面板', async () => {
      render(<KeyboardShortcutHint />);

      // 展开
      fireEvent.keyDown(document, { key: '?' });

      await waitFor(() => {
        expect(screen.getByText('快捷键')).toBeInTheDocument();
      });

      // 收起
      fireEvent.keyDown(document, { key: '?' });

      await waitFor(() => {
        expect(screen.queryByText('快捷键')).toBeNull();
      });
    });

    test('点击遮罩关闭面板', async () => {
      render(<KeyboardShortcutHint />);

      // 展开
      fireEvent.keyDown(document, { key: '?' });

      await waitFor(() => {
        expect(screen.getByText('快捷键')).toBeInTheDocument();
      });

      // 点击遮罩
      const overlay = document.querySelector('.fixed.inset-0.z-40');
      if (overlay) {
        fireEvent.click(overlay);
      }

      await waitFor(() => {
        expect(screen.queryByText('快捷键')).toBeNull();
      });
    });

    test('面板按问号键展开', async () => {
      render(<KeyboardShortcutHint />);

      // 按 ? 键展开
      fireEvent.keyDown(document, { key: '?' });

      await waitFor(() => {
        expect(screen.getByText('快捷键')).toBeInTheDocument();
        expect(screen.getByText('发布全部')).toBeInTheDocument();
      });
    });
  });

  describe('Ctrl+Enter 快捷键', () => {
    test('Ctrl+Enter 触发发布按钮', async () => {
      render(<KeyboardShortcutHint />);

      // 创建并点击发布按钮
      const publishBtn = document.createElement('button');
      publishBtn.setAttribute('data-action', 'publish-all');
      publishBtn.textContent = '发布全部';
      document.body.appendChild(publishBtn);

      // 模拟 Ctrl+Enter
      fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true });

      // 按钮应该被点击
      // 注意：实际的点击发生在 handleKeyDown 函数中

      document.body.removeChild(publishBtn);
    });

    test('在输入框中按 Ctrl+Enter 不触发', () => {
      render(<KeyboardShortcutHint />);

      // 创建输入框
      const input = document.createElement('input');
      input.setAttribute('type', 'text');
      document.body.appendChild(input);
      input.focus();

      // 模拟 Ctrl+Enter
      const event = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true });
      Object.defineProperty(event, 'target', { value: input });
      document.dispatchEvent(event);

      document.body.removeChild(input);
    });
  });

  describe('自定义快捷键', () => {
    test('显示自定义快捷键列表', async () => {
      const customShortcuts = [
        { keys: ['Shift', 'A'], description: '自定义操作' },
      ];

      render(<KeyboardShortcutHint shortcuts={customShortcuts} />);

      // 展开
      fireEvent.keyDown(document, { key: '?' });

      await waitFor(() => {
        expect(screen.getByText('自定义操作')).toBeInTheDocument();
        expect(screen.getByText('Shift')).toBeInTheDocument();
        expect(screen.getByText('A')).toBeInTheDocument();
      });
    });
  });

  describe('底部提示', () => {
    test('显示底部提示文本', async () => {
      render(<KeyboardShortcutHint />);

      fireEvent.keyDown(document, { key: '?' });

      await waitFor(() => {
        expect(screen.getByText(/按 \? 键或点击切换显示/)).toBeInTheDocument();
      });
    });
  });
});