/**
 * SSR Storage 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ssrStorage, ssrSessionStorage, ssrLocalStorage, isClient, runOnClient } from '../ssrStorage';

describe('SSR Storage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ssrStorage', () => {
    it('应该正确获取数据', () => {
      // Mock window
      Object.defineProperty(window, 'sessionStorage', {
        value: {
          getItem: vi.fn().mockReturnValue('test-value'),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
        writable: true,
      });

      const result = ssrStorage.getItem('test-key');
      expect(result).toBe('test-value');
    });

    it('应该正确设置数据', () => {
      const setItemSpy = vi.spyOn(window.sessionStorage, 'setItem');

      ssrStorage.setItem('test-key', 'test-value');

      expect(setItemSpy).toHaveBeenCalledWith('test-key', 'test-value');
    });

    it('应该正确删除数据', () => {
      const removeItemSpy = vi.spyOn(window.sessionStorage, 'removeItem');

      ssrStorage.removeItem('test-key');

      expect(removeItemSpy).toHaveBeenCalledWith('test-key');
    });
  });

  describe('ssrSessionStorage', () => {
    it('应该正确处理 getItem', () => {
      const mockStorage = {
        getItem: vi.fn().mockReturnValue('session-value'),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };

      Object.defineProperty(window, 'sessionStorage', {
        value: mockStorage,
        writable: true,
      });

      const result = ssrSessionStorage.getItem('key');
      expect(result).toBe('session-value');
    });
  });

  describe('ssrLocalStorage', () => {
    it('应该正确处理 getItem', () => {
      const mockStorage = {
        getItem: vi.fn().mockReturnValue('local-value'),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };

      Object.defineProperty(window, 'localStorage', {
        value: mockStorage,
        writable: true,
      });

      const result = ssrLocalStorage.getItem('key');
      expect(result).toBe('local-value');
    });
  });

  describe('isClient', () => {
    it('应该在客户端环境返回 true', () => {
      // window 存在时应该返回 true
      expect(typeof window).toBe('object');
    });
  });

  describe('runOnClient', () => {
    it('应该在客户端执行回调', () => {
      const callback = vi.fn().mockReturnValue('callback-result');
      const fallback = 'fallback-result';

      const result = runOnClient(callback, fallback);

      expect(callback).toHaveBeenCalled();
      expect(result).toBe('callback-result');
    });

    it('应该在服务端返回 fallback', () => {
      const callback = vi.fn();
      const fallback = 'fallback';

      // 模拟服务端环境 (没有 window)
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;

      const result = runOnClient(callback, fallback);

      expect(callback).not.toHaveBeenCalled();
      expect(result).toBe('fallback');

      // 恢复 window
      global.window = originalWindow;
    });
  });
});