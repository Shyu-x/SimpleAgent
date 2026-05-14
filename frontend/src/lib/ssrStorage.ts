/**
 * SSR 安全 Storage 工具
 *
 * 背景：Next.js 在服务端渲染（SSR）期间没有 window/document/storage API。
 * 直接访问 sessionStorage/localStorage 会导致 ReferenceError。
 *
 * 使用方法：
 *   import { ssrStorage } from '@/lib/ssrStorage';
 *   ssrStorage.getItem('key')      // ✅ SSR 安全
 *   ssrStorage.setItem('key', 'value')  // ✅ SSR 安全
 */

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

/**
 * SSR 安全存储适配器
 * - 服务端：所有操作返回 null 或静默忽略
 * - 客户端：正常调用 Web Storage API
 */
const createSSRSafeStorage = (storage: StorageLike): StorageLike => ({
  getItem: (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    return storage.getItem(key);
  },
  setItem: (key: string, value: string): void => {
    if (typeof window === 'undefined') return;
    storage.setItem(key, value);
  },
  removeItem: (key: string): void => {
    if (typeof window === 'undefined') return;
    storage.removeItem(key);
  },
});

/**
 * sessionStorage SSR 安全版本
 * - 仅在当前浏览器会话有效
 * - 关闭标签页后自动清除
 * - 数据不会在同源不同标签页间共享
 */
export const ssrSessionStorage = createSSRSafeStorage({
  getItem: (key) => window.sessionStorage.getItem(key),
  setItem: (key, value) => window.sessionStorage.setItem(key, value),
  removeItem: (key) => window.sessionStorage.removeItem(key),
});

/**
 * localStorage SSR 安全版本
 * - 数据持久化存储
 * - 同源所有标签页共享
 * - 手动清除或程序删除
 */
export const ssrLocalStorage = createSSRSafeStorage({
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
});

/**
 * 统一导出，兼容旧代码
 * @deprecated 推荐使用 ssrSessionStorage / ssrLocalStorage
 */
export const ssrStorage = {
  getItem: (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(key);
  },
  setItem: (key: string, value: string): void => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(key, value);
  },
  removeItem: (key: string): void => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(key);
  },
};

/**
 * 检查当前是否在客户端环境
 */
export const isClient = (): boolean => typeof window !== 'undefined';

/**
 * 在客户端环境执行回调
 * @param callback 要执行的回调函数
 * @param fallback 客户端不可用时的返回值
 */
export const runOnClient = <T>(callback: () => T, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  return callback();
};