/**
 * Playwright 全局设置
 */
import { chromium } from '@playwright/test';
import '@testing-library/jest-dom/vitest';

// Mock environment variables
process.env.NEXT_PUBLIC_BACKEND_URL = 'http://localhost:30000';

/**
 * Mock localStorage for jsdom environment
 * jsdom 不支持 localStorage，需要手动 mock
 */
class LocalStorageMock {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = value;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }

  get length(): number {
    return Object.keys(this.store).length;
  }

  key(index: number): string | null {
    const keys = Object.keys(this.store);
    return keys[index] ?? null;
  }
}

// 在全局对象上设置 mock localStorage
Object.defineProperty(globalThis, 'localStorage', {
  value: new LocalStorageMock(),
  writable: true,
  configurable: true,
});

/**
 * 全局配置
 */
export default async function globalSetup() {
  // 确保浏览器已安装
  const browser = await chromium.launch();
  await browser.close();
}