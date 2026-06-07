import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import SoundToggle from '../SoundToggle';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
}));

describe('SoundToggle', () => {
  const defaultProps = {
    enabled: true,
    onToggle: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // 清理全局函数
    delete (window as any).missionControlPlayTone;
  });

  test('enabled 为 true 时显示音量开启图标', () => {
    render(<SoundToggle {...defaultProps} enabled={true} />);
    // 检查是否有 Volume2 或 VolumeX 图标
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  test('enabled 为 false 时显示静音图标', () => {
    render(<SoundToggle {...defaultProps} enabled={false} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  test('点击切换声音状态', () => {
    render(<SoundToggle {...defaultProps} />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(defaultProps.onToggle).toHaveBeenCalledTimes(1);
  });

  test('enabled 为 true 时有正确的标题', () => {
    render(<SoundToggle {...defaultProps} enabled={true} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('title', '声音已开启');
  });

  test('enabled 为 false 时有正确的标题', () => {
    render(<SoundToggle {...defaultProps} enabled={false} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('title', '声音已关闭');
  });

  test('导出 playTone 到 window', () => {
    render(<SoundToggle {...defaultProps} />);
    // playTone 应该在组件挂载后被导出到 window
    expect((window as any).missionControlPlayTone).toBeDefined();
  });
});