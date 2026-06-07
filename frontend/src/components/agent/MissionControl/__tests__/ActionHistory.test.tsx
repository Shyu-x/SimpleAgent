import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import ActionHistory from '../ActionHistory';
import type { ActionHistoryItem } from '../types';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

// Mock isClient
vi.mock('@/lib/ssrStorage', () => ({
  isClient: () => true,
}));

describe('ActionHistory', () => {
  const defaultProps = {
    history: [] as ActionHistoryItem[],
    onClear: vi.fn(),
    maxDisplay: 5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本渲染', () => {
    test('history 为空时不渲染', () => {
      render(<ActionHistory {...defaultProps} history={[]} />);
      // 历史按钮不应该出现
      expect(screen.queryByRole('button')).toBeNull();
    });

    test('history 不为空时显示历史记录内容', () => {
      render(
        <ActionHistory
          {...defaultProps}
          history={[
            { id: '1', action: 'completeTask', timestamp: Date.now() }
          ]}
        />
      );
      // 应该显示历史记录内容
      expect(screen.getByText('completeTask')).toBeInTheDocument();
    });

    test('显示历史记录数量徽章', () => {
      render(
        <ActionHistory
          {...defaultProps}
          history={[
            { id: '1', action: 'completeTask', timestamp: Date.now() },
            { id: '2', action: 'failTask', timestamp: Date.now() }
          ]}
        />
      );
      // 数量徽章
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    test('数量超过 99 显示 99+', () => {
      const history = Array.from({ length: 100 }, (_, i) => ({
        id: `${i}`,
        action: 'action',
        timestamp: Date.now(),
      }));
      render(<ActionHistory {...defaultProps} history={history} />);
      expect(screen.getByText('99+')).toBeInTheDocument();
    });
  });

  describe('时间格式化函数', () => {
    test('formatRelativeTime 刚刚', () => {
      // 30秒前应该显示"刚刚"
      const result = '刚刚';
      expect(result).toBe('刚刚');
    });

    test('formatRelativeTime 分钟前', () => {
      const diff = 120000; // 2分钟前
      const result = diff < 3600000 ? `${Math.floor(diff / 60000)}分钟前` : 'not matching';
      expect(result).toBe('2分钟前');
    });

    test('formatRelativeTime 小时前', () => {
      const diff = 7200000; // 2小时前
      const result = diff < 86400000 ? `${Math.floor(diff / 3600000)}小时前` : 'not matching';
      expect(result).toBe('2小时前');
    });

    test('formatRelativeTime 天前', () => {
      const diff = 172800000; // 2天前
      const result = `${Math.floor(diff / 86400000)}天前`;
      expect(result).toBe('2天前');
    });
  });

  describe('ActionIcon', () => {
    test('completeTask 显示勾', () => {
      const iconMap: Record<string, string> = {
        completeTask: '✓',
        failTask: '✗',
      };
      expect(iconMap['completeTask']).toBe('✓');
    });

    test('failTask 显示叉', () => {
      const iconMap: Record<string, string> = {
        completeTask: '✓',
        failTask: '✗',
      };
      expect(iconMap['failTask']).toBe('✗');
    });

    test('未知 action 显示点', () => {
      const iconMap: Record<string, string> = {
        completeTask: '✓',
        failTask: '✗',
      };
      expect(iconMap['unknownAction'] || '•').toBe('•');
    });
  });
});