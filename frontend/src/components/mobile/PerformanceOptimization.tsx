'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

/**
 * 移动端性能优化系统
 * 确保60fps流畅度
 */

/**
 * 虚拟列表 Hook
 * 用于长列表性能优化
 */
interface VirtualListOptions {
  itemCount: number;
  itemHeight: number;
  containerHeight: number;
  overscan?: number; // 预渲染数量
}

interface VirtualListResult {
  startIndex: number;
  endIndex: number;
  offsetY: number;
  visibleItems: number[];
  containerProps: {
    style: React.CSSProperties;
    onScroll: (e: React.UIEvent<HTMLElement>) => void;
    ref: React.RefObject<HTMLDivElement>;
  };
  listProps: {
    style: React.CSSProperties;
  };
}

export function useVirtualList({
  itemCount,
  itemHeight,
  containerHeight,
  overscan = 3,
}: VirtualListOptions): VirtualListResult {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(itemCount - 1, startIndex + visibleCount + overscan * 2);

  const offsetY = startIndex * itemHeight;

  const handleScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const visibleItems = useMemo(() => {
    const items: number[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      items.push(i);
    }
    return items;
  }, [startIndex, endIndex]);

  return {
    startIndex,
    endIndex,
    offsetY,
    visibleItems,
    containerProps: {
      style: {
        height: containerHeight,
        overflow: 'auto',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
      },
      onScroll: handleScroll,
      ref: containerRef,
    },
    listProps: {
      style: {
        height: itemCount * itemHeight,
        position: 'relative' as const,
      },
    },
  };
}

/**
 * Intersection Observer Hook
 * 用于懒加载和可见性检测
 */
interface UseIntersectionObserverOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
}

export function useIntersectionObserver(
  options: UseIntersectionObserverOptions = {}
) {
  const { threshold = 0.1, rootMargin = '0px', triggerOnce = false } = options;
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [hasIntersected, setHasIntersected] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting);

        if (entry.isIntersecting) {
          setHasIntersected(true);
        }

        // 如果只触发一次且已触发，断开观察
        if (triggerOnce && hasIntersected) {
          observer.disconnect();
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [threshold, rootMargin, triggerOnce, hasIntersected]);

  return {
    ref: elementRef,
    isIntersecting,
    hasIntersected,
  };
}

/**
 * 防抖 Hook
 * 用于性能敏感操作
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * 节流 Hook
 * 用于滚动等高频事件
 */
export function useThrottle<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number
): T {
  const lastCall = useRef(0);

  return useCallback(
    ((...args: unknown[]) => {
      const now = Date.now();
      if (now - lastCall.current >= delay) {
        lastCall.current = now;
        callback(...args);
      }
    }) as T,
    [callback, delay]
  );
}

/**
 * RAF (RequestAnimationFrame) Hook
 * 用于流畅动画
 */
export function useRAF(callback: () => void, enabled = true) {
  const rafId = useRef<number | undefined>(undefined);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    const animate = () => {
      callbackRef.current();
      rafId.current = requestAnimationFrame(animate);
    };

    rafId.current = requestAnimationFrame(animate);

    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [enabled]);
}

/**
 * 帧率监控
 */
export function useFPSMonitor() {
  const [fps, setFps] = useState(60);
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());

  useRAF(() => {
    frameCount.current++;
    const now = performance.now();
    const delta = now - lastTime.current;

    if (delta >= 1000) {
      setFps(Math.round((frameCount.current * 1000) / delta));
      frameCount.current = 0;
      lastTime.current = now;
    }
  });

  return fps;
}

/**
 * 设备性能检测
 */
export function useDevicePerformance() {
  const [performanceLevel, setPerformanceLevel] = useState<'low' | 'medium' | 'high'>('medium');

  useEffect(() => {
    // 检测设备性能
    const checkPerformance = () => {
      // 检查硬件并发数
      const cores = navigator.hardwareConcurrency || 2;

      // 检查设备内存（如果可用）
      const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4;

      // 检查是否为移动设备
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );

      // 综合判断
      if (cores >= 6 && memory >= 6) {
        setPerformanceLevel('high');
      } else if (cores >= 4 && memory >= 4) {
        setPerformanceLevel('medium');
      } else {
        setPerformanceLevel('low');
      }
    };

    checkPerformance();
  }, []);

  return {
    performanceLevel,
    shouldReduceAnimations: performanceLevel === 'low',
    shouldUseVirtualList: performanceLevel !== 'high',
    shouldUseImageOptimization: performanceLevel === 'low',
  };
}

/**
 * 图片懒加载
 */
interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  placeholder?: string;
}

export function LazyImage({ src, alt, className, placeholder }: LazyImageProps) {
  const { ref, hasIntersected } = useIntersectionObserver({ triggerOnce: true });

  return (
    <img
      ref={ref as React.RefObject<HTMLImageElement>}
      src={hasIntersected ? src : placeholder || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}
      alt={alt}
      className={className}
      loading="lazy"
    />
  );
}

/**
 * 批量更新 Hook
 * 用于减少重渲染
 */
export function useBatchedUpdates<T>(items: T[], batchSize = 10) {
  const [displayedItems, setDisplayedItems] = useState<T[]>([]);
  const batchIndex = useRef(0);

  useEffect(() => {
    batchIndex.current = 0;
    setDisplayedItems(items.slice(0, batchSize));

    const loadNextBatch = () => {
      batchIndex.current++;
      const start = batchIndex.current * batchSize;
      const end = start + batchSize;
      const nextBatch = items.slice(start, end);

      if (nextBatch.length > 0) {
        setDisplayedItems((prev) => [...prev, ...nextBatch]);
      }
    };

    // 使用 requestIdleCallback 或 setTimeout 进行增量加载
    const idleCallback = 'requestIdleCallback' in window
      ? (window as Window & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback
      : (cb: () => void) => setTimeout(cb, 100);

    const loadMore = () => {
      if (batchIndex.current * batchSize < items.length) {
        loadNextBatch();
        idleCallback(loadMore);
      }
    };

    idleCallback(loadMore);
  }, [items, batchSize]);

  return displayedItems;
}