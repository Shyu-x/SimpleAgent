'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

/**
 * 移动端布局适配系统
 * 处理安全区域、键盘、横竖屏切换等
 */

// 安全区域类型
export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

// 设备方向
export type DeviceOrientation = 'portrait' | 'landscape';

/**
 * 获取安全区域
 */
export function getSafeAreaInsets(): SafeAreaInsets {
  if (typeof window === 'undefined') {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }

  // 从 CSS 变量中获取安全区域
  const getCSSVariableValue = (variable: string) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
    return value ? parseInt(value.replace('px', ''), 10) : 0;
  };

  // 尝试从 env 变量获取
  const top = getCSSVariableValue('--safe-area-inset-top') || 0;
  const bottom = getCSSVariableValue('--safe-area-inset-bottom') || 0;
  const left = getCSSVariableValue('--safe-area-inset-left') || 0;
  const right = getCSSVariableValue('--safe-area-inset-right') || 0;

  // 如果没有获取到，使用默认值
  return {
    top: Math.max(top, 20), // 至少留20px给状态栏
    bottom: Math.max(bottom, 34), // 至少留34px给底部条
    left,
    right,
  };
}

/**
 * 安全区域 Hook
 */
export function useSafeArea(): SafeAreaInsets {
  const [insets, setInsets] = useState<SafeAreaInsets>(getSafeAreaInsets());

  useEffect(() => {
    const updateInsets = () => {
      setInsets(getSafeAreaInsets());
    };

    // 监听窗口大小变化和横竖屏切换
    window.addEventListener('resize', updateInsets);
    window.addEventListener('orientationchange', updateInsets);

    // 初始设置 CSS 变量
    document.documentElement.style.setProperty('--safe-area-inset-top', 'env(safe-area-inset-top)');
    document.documentElement.style.setProperty('--safe-area-inset-bottom', 'env(safe-area-inset-bottom)');
    document.documentElement.style.setProperty('--safe-area-inset-left', 'env(safe-area-inset-left)');
    document.documentElement.style.setProperty('--safe-area-inset-right', 'env(safe-area-inset-right)');

    return () => {
      window.removeEventListener('resize', updateInsets);
      window.removeEventListener('orientationchange', updateInsets);
    };
  }, []);

  return insets;
}

/**
 * 设备方向 Hook
 */
export function useOrientation(): DeviceOrientation {
  const [orientation, setOrientation] = useState<DeviceOrientation>('portrait');

  useEffect(() => {
    const updateOrientation = () => {
      const isPortrait = window.innerHeight > window.innerWidth;
      setOrientation(isPortrait ? 'portrait' : 'landscape');
    };

    updateOrientation();
    window.addEventListener('resize', updateOrientation);
    window.addEventListener('orientationchange', updateOrientation);

    return () => {
      window.removeEventListener('resize', updateOrientation);
      window.removeEventListener('orientationchange', updateOrientation);
    };
  }, []);

  return orientation;
}

/**
 * 键盘高度 Hook
 */
export function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    let initialHeight = window.innerHeight;

    const handleResize = () => {
      const currentHeight = window.innerHeight;
      const newKeyboardHeight = Math.max(0, initialHeight - currentHeight);

      // 只在高度变化超过100px时认为是键盘弹出
      if (newKeyboardHeight > 100) {
        setKeyboardHeight(newKeyboardHeight);
      } else {
        setKeyboardHeight(0);
        initialHeight = currentHeight;
      }
    };

    // 监听 focus 事件，提前准备
    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        // 输入框获得焦点时，滚动到视图
        setTimeout(() => {
          (target as HTMLElement & { scrollIntoViewIfNeeded?: () => void }).scrollIntoViewIfNeeded?.();
        }, 300);
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('focusin', handleFocus);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('focusin', handleFocus);
    };
  }, []);

  return keyboardHeight;
}

/**
 * 移动端检测 Hook
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const mobileKeywords = [
        'android', 'webos', 'iphone', 'ipad', 'ipod',
        'blackberry', 'iemobile', 'opera mini'
      ];
      const isMobileDevice = mobileKeywords.some(keyword => userAgent.includes(keyword));
      const isSmallScreen = window.innerWidth < 640;

      setIsMobile(isMobileDevice || isSmallScreen);
    };

    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);

    return () => {
      window.removeEventListener('resize', checkIsMobile);
    };
  }, []);

  return isMobile;
}

/**
 * 视口单位 Hook
 * 解决移动端 100vh 问题
 */
export function useViewportUnits() {
  const [vh, setVh] = useState<number>(0);
  const [vw, setVw] = useState<number>(0);

  useEffect(() => {
    const updateViewportUnits = () => {
      const vh = window.innerHeight * 0.01;
      const vw = window.innerWidth * 0.01;

      setVh(vh);
      setVw(vw);

      document.documentElement.style.setProperty('--vh', `${vh}px`);
      document.documentElement.style.setProperty('--vw', `${vw}px`);
    };

    updateViewportUnits();
    window.addEventListener('resize', updateViewportUnits);
    window.addEventListener('orientationchange', updateViewportUnits);

    return () => {
      window.removeEventListener('resize', updateViewportUnits);
      window.removeEventListener('orientationchange', updateViewportUnits);
    };
  }, []);

  return { vh, vw };
}

/**
 * 双击退出确认
 */
export function useDoubleBackToExit(
  message: string = '再按一次退出应用',
  timeout: number = 2000
): () => boolean {
  const lastBackTime = useRef(0);

  const handleBack = useCallback(() => {
    const now = Date.now();
    if (now - lastBackTime.current < timeout) {
      return true; // 确认退出
    }

    lastBackTime.current = now;
    // 显示提示
    const toast = document.createElement('div');
    toast.className='fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-black/80 text-primary-foreground px-4 py-2 rounded-full z-50';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, timeout);

    return false;
  }, [message, timeout]);

  return handleBack;
}

/**
 * 防止双击缩放
 */
export function usePreventDoubleTapZoom() {
  useEffect(() => {
    let lastTouchEnd = 0;

    const handleTouchEnd = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    };

    document.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);
}

/**
 * 长按事件 Hook
 */
export function useLongPress(
  onLongPress: () => void,
  onPress?: () => void,
  delay: number = 500
): {
  onTouchStart: () => void;
  onTouchEnd: () => void;
  onTouchMove: () => void;
} {
  const timer = useRef<NodeJS.Timeout | null>(null);
  const isLongPressTriggered = useRef(false);

  const handleTouchStart = () => {
    isLongPressTriggered.current = false;
    timer.current = setTimeout(() => {
      isLongPressTriggered.current = true;
      onLongPress();
    }, delay);
  };

  const handleTouchEnd = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;

      if (!isLongPressTriggered.current && onPress) {
        onPress();
      }
    }
  };

  const handleTouchMove = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
    onTouchMove: handleTouchMove,
  };
}

