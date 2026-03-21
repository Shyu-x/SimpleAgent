'use client';

/**
 * 移动端触感反馈系统
 * 提供原生级震动反馈体验
 */

type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

interface HapticFeedback {
  vibrate: (type: HapticType) => void;
  impact: (intensity: 'light' | 'medium' | 'heavy') => void;
  notification: (type: 'success' | 'warning' | 'error') => void;
  selection: () => void;
}

class HapticFeedbackImpl implements HapticFeedback {
  private isSupported: boolean;
  private isReducedMotion: boolean;

  constructor() {
    // SSR 安全检查
    if (typeof window === 'undefined') {
      this.isSupported = false;
      this.isReducedMotion = false;
      return;
    }

    this.isSupported = 'vibrate' in navigator;
    try {
      this.isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      this.isReducedMotion = false;
    }
  }

  /**
   * 震动反馈
   */
  vibrate(type: HapticType): void {
    if (!this.isSupported || this.isReducedMotion) return;

    const patterns: Record<HapticType, number | number[]> = {
      light: 10,
      medium: 20,
      heavy: 40,
      success: [10, 30, 10],
      warning: [20, 40, 20],
      error: [50, 30, 50],
    };

    const pattern = patterns[type];
    if (typeof pattern === 'number') {
      navigator.vibrate(pattern);
    } else {
      navigator.vibrate(pattern);
    }
  }

  /**
   * 冲击式反馈（用于按钮点击、滑动等）
   */
  impact(intensity: 'light' | 'medium' | 'heavy'): void {
    this.vibrate(intensity);
  }

  /**
   * 通知反馈（用于成功、警告、错误提示）
   */
  notification(type: 'success' | 'warning' | 'error'): void {
    this.vibrate(type);
  }

  /**
   * 选择反馈（用于列表选择、开关切换）
   */
  selection(): void {
    if (!this.isSupported || this.isReducedMotion) return;
    navigator.vibrate(5);
  }
}

// 单例实例
let hapticFeedbackInstance: HapticFeedbackImpl | null = null;

export function getHapticFeedback(): HapticFeedback {
  if (!hapticFeedbackInstance) {
    hapticFeedbackInstance = new HapticFeedbackImpl();
  }
  return hapticFeedbackInstance;
}

/**
 * React Hook: 使用触感反馈
 */
export function useHapticFeedback(): HapticFeedback {
  return getHapticFeedback();
}

/**
 * 触感反馈触发器 - 可用于 framer-motion 的 onAnimationComplete
 */
export function hapticTrigger(type: HapticType): () => void {
  const haptic = getHapticFeedback();
  return () => haptic.vibrate(type);
}
