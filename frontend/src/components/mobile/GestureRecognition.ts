'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * 手势识别系统
 * 支持滑动返回、滑动删除、捏合缩放等原生手势
 */

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';
export type SwipeEdge = 'left' | 'right' | 'top' | 'bottom';

interface SwipeGestureOptions {
  threshold?: number; // 滑动阈值（像素）
  velocityThreshold?: number; // 速度阈值（像素/毫秒）
  edgeToClose?: boolean; // 从边缘滑动关闭
  edge?: SwipeEdge; // 边缘
  onSwipe?: (direction: SwipeDirection) => void;
  onSwipeStart?: () => void;
  onSwipeEnd?: () => void;
}

interface SwipeState {
  startX: number;
  startY: number;
  startTime: number;
  currentX: number;
  currentY: number;
  isSwiping: boolean;
}

export function useSwipeGesture(options: SwipeGestureOptions = {}) {
  const {
    threshold = 50,
    velocityThreshold = 0.3,
    edgeToClose = false,
    edge = 'left',
    onSwipe,
    onSwipeStart,
    onSwipeEnd,
  } = options;

  const [swipeState, setSwipeState] = useState<SwipeState>({
    startX: 0,
    startY: 0,
    startTime: 0,
    currentX: 0,
    currentY: 0,
    isSwiping: false,
  });

  const [progress, setProgress] = useState(0);
  const [isEdgeSwipe, setIsEdgeSwipe] = useState(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    const now = Date.now();

    setSwipeState({
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: now,
      currentX: touch.clientX,
      currentY: touch.clientY,
      isSwiping: true,
    });

    // 检查是否从边缘开始
    if (edgeToClose) {
      const { clientX, clientY } = touch;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      switch (edge) {
        case 'left':
          setIsEdgeSwipe(clientX < 30);
          break;
        case 'right':
          setIsEdgeSwipe(clientX > windowWidth - 30);
          break;
        case 'top':
          setIsEdgeSwipe(clientY < 30);
          break;
        case 'bottom':
          setIsEdgeSwipe(clientY > windowHeight - 30);
          break;
      }
    }

    onSwipeStart?.();
  }, [edgeToClose, edge, onSwipeStart]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!swipeState.isSwiping) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - swipeState.startX;
    const deltaY = touch.clientY - swipeState.startY;

    setSwipeState((prev) => ({
      ...prev,
      currentX: touch.clientX,
      currentY: touch.clientY,
    }));

    // 计算进度（用于拖拽动画）
    if (edgeToClose && isEdgeSwipe) {
      switch (edge) {
        case 'left':
          setProgress(Math.max(0, Math.min(1, deltaX / window.innerWidth)));
          break;
        case 'right':
          setProgress(Math.max(0, Math.min(1, -deltaX / window.innerWidth)));
          break;
        case 'top':
          setProgress(Math.max(0, Math.min(1, deltaY / window.innerHeight)));
          break;
        case 'bottom':
          setProgress(Math.max(0, Math.min(1, -deltaY / window.innerHeight)));
          break;
      }
    }
  }, [swipeState.isSwiping, edgeToClose, isEdgeSwipe, edge]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!swipeState.isSwiping) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - swipeState.startX;
    const deltaY = touch.clientY - swipeState.startY;
    const deltaTime = Date.now() - swipeState.startTime;

    // 计算速度
    const velocityX = Math.abs(deltaX) / deltaTime;
    const velocityY = Math.abs(deltaY) / deltaTime;

    let direction: SwipeDirection | null = null;

    // 判断主要滑动方向
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (Math.abs(deltaX) > threshold && velocityX > velocityThreshold) {
        direction = deltaX > 0 ? 'right' : 'left';
      }
    } else {
      if (Math.abs(deltaY) > threshold && velocityY > velocityThreshold) {
        direction = deltaY > 0 ? 'down' : 'up';
      }
    }

    // 从边缘滑动触发
    if (edgeToClose && isEdgeSwipe && direction) {
      const shouldTrigger = progress > 0.3; // 拖动超过30%则触发
      if (shouldTrigger) {
        onSwipe?.(direction);
      }
    } else if (direction) {
      onSwipe?.(direction);
    }

    setSwipeState({
      startX: 0,
      startY: 0,
      startTime: 0,
      currentX: 0,
      currentY: 0,
      isSwiping: false,
    });

    setProgress(0);
    setIsEdgeSwipe(false);

    onSwipeEnd?.();
  }, [swipeState, threshold, edgeToClose, isEdgeSwipe, progress, onSwipe, onSwipeEnd]);

  const bind = useCallback(() => ({
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  }), [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    bind,
    progress,
    isSwiping: swipeState.isSwiping,
    isEdgeSwipe,
    reset: useCallback(() => {
      setProgress(0);
      setIsEdgeSwipe(false);
    }, []),
  };
}

/**
 * 手势方向锁定
 */
export function useGestureLock() {
  const lockDirection = useRef<'horizontal' | 'vertical' | null>(null);

  const setLock = useCallback((direction: 'horizontal' | 'vertical') => {
    if (!lockDirection.current) {
      lockDirection.current = direction;
    }
  }, []);

  const reset = useCallback(() => {
    lockDirection.current = null;
  }, []);

  const isLocked = useCallback((direction: 'horizontal' | 'vertical') => {
    return lockDirection.current !== null && lockDirection.current !== direction;
  }, []);

  return {
    setLock,
    reset,
    isLocked,
  };
}

/**
 * 双指捏合缩放手势
 */
export function usePinchGesture(onScaleChange: (scale: number) => void) {
  const [distance, setDistance] = useState(0);
  const [scale, setScale] = useState(1);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setDistance(Math.sqrt(dx * dx + dy * dy));
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2 && distance > 0) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentDistance = Math.sqrt(dx * dx + dy * dy);
      const newScale = currentDistance / distance;

      if (newScale > 0.5 && newScale < 3) {
        setScale(newScale);
        onScaleChange(newScale);
      }
    }
  }, [distance, onScaleChange]);

  const handleTouchEnd = useCallback(() => {
    setDistance(0);
    setScale(1);
  }, []);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    scale,
  };
}
