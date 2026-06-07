/**
 * layout.tsx 主题初始化脚本单元测试
 *
 * 该测试模拟 layout.tsx 中 dangerouslySetInnerHTML 的同步脚本行为：
 *   1. 读取 sessionStorage 中 uiStore/settingsStore 的持久化数据
 *   2. 解析 theme 字段
 *   3. 在 documentElement 上设置 dataset 与 .dark class
 *
 * 修复前 BUG: 脚本读 localStorage.getItem('chat-settings')，
 *            实际 Zustand persist 用 sessionStorage + 'ai-chat-settings' key，
 *            导致刷新页面时 html.dark 不出现，主题闪烁 (FOUC)。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// 复制 layout.tsx 中的脚本逻辑（保持一致）
const THEME_INIT_SCRIPT = `(function() {
  try {
    var uiRaw = sessionStorage.getItem('ai-chat-ui');
    var stRaw = sessionStorage.getItem('ai-chat-settings');
    var ui = uiRaw ? JSON.parse(uiRaw) : {};
    var st = stRaw ? JSON.parse(stRaw) : {};
    var uiSettings = (ui && ui.state && ui.state.settings) || (ui && ui.settings) || {};
    var stSettings = (st && st.state && st.state.settings) || (st && st.settings) || {};
    var settings = Object.assign({}, uiSettings, stSettings);
    var theme = settings.theme || 'system';
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var resolved = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themeResolved = resolved;
    document.documentElement.dataset.palette = settings.desktopPalette || 'aurora';
    if (resolved === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch(e) {}
})();`;

const runThemeInit = () => {
  // 在 jsdom 上下文中执行脚本
  // eslint-disable-next-line no-new-func
  new Function(THEME_INIT_SCRIPT)();
};

describe('layout.tsx 主题初始化脚本（防 FOUC）', () => {
  beforeEach(() => {
    // 重置 DOM 与 storage
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-theme-resolved');
    document.documentElement.removeAttribute('data-palette');
    sessionStorage.clear();

    // 默认系统为浅色
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  it('应从 sessionStorage ai-chat-settings 读取 dark 主题', () => {
    // 模拟 Zustand persist 写入的数据结构
    sessionStorage.setItem(
      'ai-chat-settings',
      JSON.stringify({
        state: {
          settings: { theme: 'dark', desktopPalette: 'aurora' },
        },
        version: 0,
      })
    );

    runThemeInit();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.themeResolved).toBe('dark');
  });

  it('应从 sessionStorage ai-chat-ui 兜底读取主题', () => {
    sessionStorage.setItem(
      'ai-chat-ui',
      JSON.stringify({
        state: { settings: { theme: 'dark' } },
        version: 0,
      })
    );

    runThemeInit();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('应在 theme=system 且系统深色时添加 dark class', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    sessionStorage.setItem(
      'ai-chat-settings',
      JSON.stringify({
        state: { settings: { theme: 'system' } },
        version: 0,
      })
    );

    runThemeInit();

    expect(document.documentElement.dataset.theme).toBe('system');
    expect(document.documentElement.dataset.themeResolved).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('应在 theme=light 时不添加 dark class', () => {
    sessionStorage.setItem(
      'ai-chat-settings',
      JSON.stringify({
        state: { settings: { theme: 'light' } },
        version: 0,
      })
    );

    runThemeInit();

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.dataset.themeResolved).toBe('light');
  });

  it('应在 storage 为空时回退到默认 system/light（无 dark）', () => {
    runThemeInit();

    expect(document.documentElement.dataset.theme).toBe('system');
    expect(document.documentElement.dataset.themeResolved).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.dataset.palette).toBe('aurora');
  });

  it('应兼容旧 localStorage chat-settings key（降级但不再依赖）', () => {
    // 写入旧 key 确认它不再生效
    localStorage.setItem('chat-settings', JSON.stringify({ theme: 'dark' }));

    runThemeInit();

    // 旧 localStorage key 不再被读，所以不应出现 dark
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('应正确读取 desktopPalette（来自 settingsStore）', () => {
    sessionStorage.setItem(
      'ai-chat-settings',
      JSON.stringify({
        state: { settings: { theme: 'dark', desktopPalette: 'sunset' } },
        version: 0,
      })
    );

    runThemeInit();

    expect(document.documentElement.dataset.palette).toBe('sunset');
  });

  it('应在 JSON 解析失败时静默降级（不抛错）', () => {
    sessionStorage.setItem('ai-chat-settings', 'NOT_VALID_JSON{');

    expect(() => runThemeInit()).not.toThrow();
    // 解析失败 → 回退到默认 light
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
