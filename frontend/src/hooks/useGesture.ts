'use client';

import { useRef, useCallback, useEffect, useState } from 'react';

interface SwipeState {
  startX: number;
  startY: number;
  startTime: number;
  deltaX: number;
  deltaY: number;
}

interface UseSwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number;
  timeout?: number;
}

interface UseLongPressOptions {
  onLongPress?: () => void;
  onLongPressStart?: () => void;
  onLongPressEnd?: () => void;
  threshold?: number;
}

export function useSwipeGesture(
  ref: React.RefObject<HTMLElement | null>,
  options: UseSwipeGestureOptions
) {
  const { onSwipeLeft, onSwipeRight, threshold = 50, timeout = 500 } = options;
  const state = useRef<SwipeState>({
    startX: 0,
    startY: 0,
    startTime: 0,
    deltaX: 0,
    deltaY: 0,
  });

  const handleTouchStart = useCallback((e: TouchEvent) => {
    state.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      startTime: Date.now(),
      deltaX: 0,
      deltaY: 0,
    };
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    state.current.deltaX = e.touches[0].clientX - state.current.startX;
    state.current.deltaY = e.touches[0].clientY - state.current.startY;
  }, []);

  const handleTouchEnd = useCallback(() => {
    const { deltaX, deltaY, startTime } = state.current;
    const elapsed = Date.now() - startTime;

    if (elapsed > timeout) return;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (Math.abs(deltaX) > threshold) {
        if (deltaX < 0) {
          onSwipeLeft?.();
        } else {
          onSwipeRight?.();
        }
      }
    } else {
      if (Math.abs(deltaY) > threshold) {
        if (deltaY < 0) {
          options.onSwipeUp?.();
        } else {
          options.onSwipeDown?.();
        }
      }
    }
  }, [threshold, timeout, options]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [ref, handleTouchStart, handleTouchMove, handleTouchEnd]);
}

export function useLongPress(
  ref: React.RefObject<HTMLElement | null>,
  options: UseLongPressOptions
) {
  const { onLongPress, onLongPressStart, onLongPressEnd, threshold = 500 } = options;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isPressedRef = useRef(false);

  const start = useCallback(() => {
    if (!ref.current) return;
    isPressedRef.current = true;
    onLongPressStart?.();

    timeoutRef.current = setTimeout(() => {
      if (isPressedRef.current) {
        onLongPress?.();
      }
    }, threshold);
  }, [ref, threshold, onLongPress, onLongPressStart]);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (isPressedRef.current) {
      isPressedRef.current = false;
      onLongPressEnd?.();
    }
  }, [onLongPressEnd]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.addEventListener('pointerdown', start);
    element.addEventListener('pointerup', cancel);
    element.addEventListener('pointerleave', cancel);
    element.addEventListener('pointercancel', cancel);

    return () => {
      element.removeEventListener('pointerdown', start);
      element.removeEventListener('pointerup', cancel);
      element.removeEventListener('pointerleave', cancel);
      element.removeEventListener('pointercancel', cancel);
    };
  }, [ref, start, cancel]);
}

// 触摸波纹效果 Hook
export function useRipple() {
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const rippleIdRef = useRef(0);

  const addRipple = useCallback((x: number, y: number) => {
    const id = rippleIdRef.current++;
    setRipples((prev) => [...prev, { id, x, y }]);

    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 600);
  }, []);

  const clearRipples = useCallback(() => {
    setRipples([]);
  }, []);

  return { ripples, addRipple, clearRipples };
}

// 拖拽排序 Hook
export function useDragSort<T>(
  items: T[],
  onReorder: (fromIndex: number, toIndex: number) => void
) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const handleDragStart = useCallback((index: number) => {
    dragItem.current = index;
    setDraggedIndex(index);
  }, []);

  const handleDragEnter = useCallback((index: number) => {
    dragOverItem.current = index;
    setOverIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragItem.current !== null && dragOverItem.current !== null) {
      if (dragItem.current !== dragOverItem.current) {
        onReorder(dragItem.current, dragOverItem.current);
      }
    }
    dragItem.current = null;
    dragOverItem.current = null;
    setDraggedIndex(null);
    setOverIndex(null);
  }, [onReorder]);

  return {
    draggedIndex,
    overIndex,
    handleDragStart,
    handleDragEnter,
    handleDragEnd,
    isDragging: draggedIndex !== null,
  };
}
