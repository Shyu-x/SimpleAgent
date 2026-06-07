'use client';

export * from './HapticFeedback';
export * from './GestureRecognition';
export * from './Skeleton';
export * from './InertialScroll';
export * from './BottomSheet';
export * from './PerformanceOptimization';
export * from './LayoutAdapter';
export { default as MobileLayout } from './MobileLayout';
export { default as MobileChatArea } from './MobileChatArea';

import { useEffect, useMemo } from 'react';
import { useSafeArea, useViewportUnits, useIsMobile, useKeyboardHeight } from './LayoutAdapter';
import { useDevicePerformance } from './PerformanceOptimization';
import { getHapticFeedback } from './HapticFeedback';

/**
 * 移动端体验增强 Provider
 * 统一初始化所有移动端功能
 */
interface MobileExperienceProviderProps {
  children: React.ReactNode;
}

export function MobileExperienceProvider({ children }: MobileExperienceProviderProps) {
  // 初始化核心移动端功能
  const isMobile = useIsMobile();
  const safeArea = useSafeArea();
  const keyboardHeight = useKeyboardHeight();
  const viewportUnits = useViewportUnits();
  const performance = useDevicePerformance();

  const haptic = useMemo(() => getHapticFeedback(), []);

  // 移动端全局样式和事件处理
  useEffect(() => {
    if (!isMobile) return;

    // 设置根元素类名
    document.documentElement.classList.add('mobile-device');

    // 防止双击缩放
    let lastTouchEnd = 0;
    const handleTouchEnd = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    };
    document.addEventListener('touchend', handleTouchEnd, { passive: false });

    // 触感反馈全局绑定 - 按钮点击
    const handleButtonClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button, [role="button"], .touchable')) {
        haptic.selection();
      }
    };
    document.addEventListener('click', handleButtonClick);

    // CSS 变量设置
    const root = document.documentElement;
    root.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
    root.style.setProperty('--safe-area-top', `${safeArea.top}px`);
    root.style.setProperty('--safe-area-bottom', `${safeArea.bottom}px`);
    root.style.setProperty('--safe-area-left', `${safeArea.left}px`);
    root.style.setProperty('--safe-area-right', `${safeArea.right}px`);

    // 性能优化 - 根据设备性能调整动画设置
    if (performance.shouldReduceAnimations) {
      document.documentElement.classList.add('reduce-motion');
    }

    return () => {
      document.documentElement.classList.remove('mobile-device');
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('click', handleButtonClick);
    };
  }, [isMobile, safeArea, keyboardHeight, viewportUnits, performance, haptic]);

  return (
    <div className="mobile-experience-container">
      {/* 移动端专属样式（global，原本用 styled-jsx <style jsx global> 但与 React 19 不兼容）*/}
      <style>{`
        :root {
          --touch-target-size: 44px;
          --min-tap-height: 44px;
        }

        .mobile-device * {
          -webkit-tap-highlight-color: transparent;
          -webkit-touch-callout: none;
        }

        .mobile-device button,
        .mobile-device [role="button"],
        .mobile-device .touchable {
          min-height: var(--min-tap-height);
          min-width: var(--touch-target-size);
        }

        .mobile-device input,
        .mobile-device textarea {
          font-size: 16px !important; /* 防止 iOS 缩放 */
        }

        .safe-area-top {
          padding-top: var(--safe-area-top, env(safe-area-inset-top, 20px));
        }

        .safe-area-bottom {
          padding-bottom: var(--safe-area-bottom, env(safe-area-inset-bottom, 34px));
        }

        .safe-area-left {
          padding-left: var(--safe-area-left, env(safe-area-inset-left, 0px));
        }

        .safe-area-right {
          padding-right: var(--safe-area-right, env(safe-area-inset-right, 0px));
        }

        /* 键盘适配 */
        .keyboard-adapter {
          transition: transform 0.3s ease;
          transform: translateY(calc(-1 * var(--keyboard-height, 0px)));
        }

        /* 性能优化样式 */
        .reduce-motion * {
          animation-duration: 0.001ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.001ms !important;
        }

        /* 滚动优化 */
        .smooth-scroll {
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
        }
      `}</style>
      {children}
    </div>
  );
}

/**
 * 触摸友好组件包装器
 * 确保触摸目标足够大
 */
interface TouchableProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hapticType?: 'light' | 'medium' | 'heavy' | 'selection';
  disabled?: boolean;
}

export function Touchable({
  children,
  className='',
  onClick,
  hapticType = 'selection',
  disabled = false,
}: TouchableProps) {
  const haptic = getHapticFeedback();

  const handleClick = () => {
    if (disabled) return;

    // 触发触感反馈
    if (hapticType === 'selection') {
      haptic.selection();
    } else {
      haptic.impact(hapticType);
    }

    onClick?.();
  };

  return (
    <div
      className={`touchable cursor-pointer ${className} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
      onClick={handleClick}
      style={{
        minHeight: '44px',
        minWidth: '44px',
      }}
    >
      {children}
    </div>
  );
}
