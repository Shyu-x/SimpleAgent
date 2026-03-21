'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

/**
 * 惯性滚动容器
 * 提供原生级流畅滚动体验，带有弹簧物理效果
 */

interface InertialScrollProps {
  children: React.ReactNode;
  className?: string;
  pullToRefresh?: boolean;
  onRefresh?: () => void;
  bounce?: boolean;
  damping?: number;
  stiffness?: number;
}

export function InertialScroll({
  children,
  className='',
  pullToRefresh = false,
  onRefresh,
  bounce = true,
  damping = 20,
  stiffness = 200,
}: InertialScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const currentY = useRef(0);
  const isAtTop = useRef(true);

  const springY = useSpring(0, { damping, stiffness });
  const pullProgress = useTransform(springY, [0, 80], [0, 1]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    currentY.current = e.touches[0].clientY;

    // 检查是否在顶部
    if (containerRef.current) {
      isAtTop.current = containerRef.current.scrollTop <= 0;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const y = e.touches[0].clientY;
    const delta = y - startY.current;

    // 下拉刷新
    if (pullToRefresh && isAtTop.current && delta > 0) {
      // 限制最大下拉距离
      const maxPull = 100;
      const newDistance = Math.min(delta * 0.5, maxPull);

      if (newDistance > 10) {
        setIsPulling(true);
        setPullDistance(newDistance);
        springY.set(newDistance);

        // 阻止默认滚动，让容器跟随手指
        e.preventDefault();
      }
    }

    currentY.current = y;
  }, [pullToRefresh, springY]);

  const handleTouchEnd = useCallback(() => {
    if (pullToRefresh && isPulling && pullDistance > 60) {
      // 触发刷新
      onRefresh?.();
    }

    // 弹回
    springY.set(0);
    setIsPulling(false);
    setPullDistance(0);
  }, [pullToRefresh, isPulling, pullDistance, onRefresh, springY]);

  return (
    <div
      ref={containerRef}
      className={`overflow-y-auto overflow-x-hidden ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* Pull to refresh indicator */}
      {pullToRefresh && (
        <motion.div
          className="flex items-center justify-center h-16"
          style={{ opacity: pullProgress }}
        >
          <div className="flex items-center gap-2">
            <motion.div
              className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full"
              animate={{ rotate: isPulling ? 360 : 0 }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
            <span className="text-sm text-muted-foreground">
              {pullDistance > 60 ? '释放刷新' : '下拉刷新'}
            </span>
          </div>
        </motion.div>
      )}

      {/* Content */}
      <motion.div style={{ y: springY }}>
        {children}
      </motion.div>
    </div>
  );
}

/**
 * 弹性边缘效果
 * 用于列表滚动到边缘时的弹性反馈
 */
interface BouncyEdgeProps {
  children: React.ReactNode;
  direction?: 'x' | 'y';
  className?: string;
}

export function BouncyEdge({ children, direction = 'y', className='' }: BouncyEdgeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollStart = useRef(0);
  const springX = useSpring(0, { damping: 15, stiffness: 150 });
  const springY = useSpring(0, { damping: 15, stiffness: 150 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollLeft, scrollHeight, clientHeight, scrollWidth, clientWidth } = container;

      // 检测是否到达边缘
      const atTop = scrollTop <= 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight;
      const atLeft = scrollLeft <= 0;
      const atRight = scrollLeft + clientWidth >= scrollWidth;

      if (direction === 'y') {
        if (atTop || atBottom) {
          // 弹性效果
          const edgeOffset = atTop ? -scrollTop : scrollTop + clientHeight - scrollHeight;
          springY.set(edgeOffset * 0.3);
        } else {
          springY.set(0);
        }
      } else {
        if (atLeft || atRight) {
          const edgeOffset = atLeft ? -scrollLeft : scrollLeft + clientWidth - scrollWidth;
          springX.set(edgeOffset * 0.3);
        } else {
          springX.set(0);
        }
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [direction, springX, springY]);

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      style={{ overscrollBehavior: 'contain' }}
    >
      <motion.div
        style={{
          x: direction === 'x' ? springX : 0,
          y: direction === 'y' ? springY : 0,
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/**
 * 平滑滚动到指定位置
 */
export function useSmoothScroll() {
  const scrollTo = useCallback((element: HTMLElement, to: number, duration = 300) => {
    const start = element.scrollTop;
    const change = to - start;
    const startTime = performance.now();

    const animateScroll = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // easeOutQuad
      const easeProgress = 1 - (1 - progress) * (1 - progress);

      element.scrollTop = start + change * easeProgress;

      if (progress < 1) {
        requestAnimationFrame(animateScroll);
      }
    };

    requestAnimationFrame(animateScroll);
  }, []);

  const scrollToTop = useCallback((element: HTMLElement) => {
    scrollTo(element, 0);
  }, [scrollTo]);

  const scrollToBottom = useCallback((element: HTMLElement) => {
    scrollTo(element, element.scrollHeight);
  }, [scrollTo]);

  return {
    scrollTo,
    scrollToTop,
    scrollToBottom,
  };
}
