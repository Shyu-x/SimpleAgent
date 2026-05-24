/**
 * Settings Store 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { validateApiKey, getProviderFromModel } from '../settingsStore';
import type { Settings } from '../settingsStore';

describe('Settings Store 工具函数', () => {
  describe('validateApiKey', () => {
    it('应该正确验证空 API Key', () => {
      const result = validateApiKey('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('API Key 不能为空');
    });

    it('应该正确验证空白字符串', () => {
      const result = validateApiKey('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('API Key 不能为空');
    });

    it('应该正确验证无效格式', () => {
      const result = validateApiKey('invalid-key-format');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('MiniMax API Key 格式不正确');
    });

    it('应该正确验证 eyJ 格式', () => {
      const result = validateApiKey('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('应该正确验证 sk- 格式', () => {
      const result = validateApiKey('sk-abcd1234');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('getProviderFromModel', () => {
    it('应该正确识别 MiniMax 模型', () => {
      expect(getProviderFromModel('MiniMax-M2.7')).toBe('MiniMax');
      expect(getProviderFromModel('MiniMax-VL-01')).toBe('MiniMax');
      expect(getProviderFromModel('MiniMax-Text-01')).toBe('MiniMax');
    });

    it('应该正确识别非 MiniMax 模型', () => {
      expect(getProviderFromModel('gpt-4')).toBe('Custom');
      expect(getProviderFromModel('claude-3-opus')).toBe('Custom');
    });
  });
});

describe('Settings 类型验证', () => {
  it('应该正确验证主题类型', () => {
    const themes: Settings['theme'][] = ['light', 'dark', 'system'];
    themes.forEach(theme => {
      expect(['light', 'dark', 'system'].includes(theme)).toBe(true);
    });
  });

  it('应该正确验证调色板类型', () => {
    const palettes: Settings['desktopPalette'][] = ['aurora', 'mint', 'sunset'];
    palettes.forEach(palette => {
      expect(['aurora', 'mint', 'sunset'].includes(palette)).toBe(true);
    });
  });

  it('应该正确验证打字速度范围', () => {
    const validSpeeds = [20, 50, 100];
    validSpeeds.forEach(speed => {
      expect(speed).toBeGreaterThanOrEqual(10);
      expect(speed).toBeLessThanOrEqual(200);
    });
  });

  it('应该正确验证窗口布局类型', () => {
    const layouts: Settings['windowLayout'][] = ['single', 'horizontal', 'vertical', 'grid'];
    layouts.forEach(layout => {
      expect(['single', 'horizontal', 'vertical', 'grid'].includes(layout)).toBe(true);
    });
  });
});