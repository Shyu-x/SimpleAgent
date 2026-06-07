/**
 * 共享类型定义
 * 所有模块共享的通用类型
 */

/**
 * 应用设置接口
 */
export interface Settings {
  theme: 'light' | 'dark' | 'system';
  desktopPalette: 'aurora' | 'mint' | 'sunset';
  typingSpeed: number;
  fontSize: number;
  windowLayout: 'single' | 'horizontal' | 'vertical' | 'grid';
  animationsEnabled: boolean;
  soundEnabled: boolean;
  autoTitle: boolean;
}