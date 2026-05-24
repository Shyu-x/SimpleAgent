/**
 * Zustand SessionStorage 适配器
 * 提供统一的 sessionStorage 封装，支持 SSR 环境
 */

export const sessionStorageAdapter = {
  getItem: (name: string): string | null => {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(name);
  },
  setItem: (name: string, value: string): void => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(name, value);
  },
  removeItem: (name: string): void => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(name);
  },
};
