'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { getHapticFeedback } from './HapticFeedback';

/**
 * 底部弹出面板 (Bottom Sheet)
 * 支持手势拖拽关闭，原生级流畅体验
 */

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  snapPoints?: number[]; // 快照点（百分比）
  defaultSnapPoint?: number;
  enableDrag?: boolean;
  className?: string;
}

export function BottomSheet({
  isOpen,
  onClose,
  children,
  title,
  snapPoints = [0.5, 0.7, 0.9],
  defaultSnapPoint = 0,
  enableDrag = true,
  className='',
}: BottomSheetProps) {
  const [currentSnapPoint, setCurrentSnapPoint] = useState(defaultSnapPoint);
  const [isDragging, setIsDragging] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const haptic = getHapticFeedback();
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 运动值
  const y = useMotionValue(0);
  const height = useTransform(y, (val) => Math.abs(val));

  // 计算当前高度百分比
  const getSnapPointHeight = (index: number) => {
    return typeof snapPoints[index] === 'number'
      ? `${snapPoints[index] * 100}%`
      : snapPoints[index];
  };

  // 处理触摸开始
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enableDrag) return;
    startY.current = e.touches[0].clientY;
    setIsDragging(true);

    if (sheetRef.current) {
      startHeight.current = sheetRef.current.offsetHeight;
    }
  }, [enableDrag]);

  // 处理触摸移动
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || !enableDrag) return;

    const currentY = e.touches[0].clientY;
    const deltaY = currentY - startY.current;

    // 只能向下拖动
    if (deltaY > 0) {
      y.set(deltaY);

      // 触感反馈 - 达到阈值时
      if (deltaY > 80 && deltaY < 85) {
        haptic.notification('warning');
      }
    }
  }, [isDragging, enableDrag, y, haptic]);

  // 处理触摸结束
  const handleTouchEnd = useCallback(() => {
    if (!isDragging || !enableDrag) return;

    setIsDragging(false);

    const currentY = y.get();
    const threshold = startHeight.current * 0.25;

    // 判断是否关闭
    if (currentY > threshold) {
      haptic.notification('success');
      onClose();
    } else {
      // 弹回
      haptic.impact('light');
    }

    y.set(0);
  }, [isDragging, enableDrag, y, onClose, haptic]);

  // 关闭时重置
  useEffect(() => {
    if (!isOpen) {
      setCurrentSnapPoint(defaultSnapPoint);
      y.set(0);
    }
  }, [isOpen, defaultSnapPoint, y]);

  // 阻止背景滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // 快捷操作按钮（用于快速切换快照点）
  const handleSnapPointClick = useCallback((index: number) => {
    setCurrentSnapPoint(index);
    haptic.impact('light');
  }, [haptic]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100]">
          {/* 背景遮罩 */}
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
            onClick={onClose}
          />

          {/* 面板主体 */}
          <motion.div
            ref={sheetRef}
            className={`absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl shadow-xl overflow-hidden ${
              className || ''
            }`}
            style={{
              height: getSnapPointHeight(currentSnapPoint),
              maxHeight: '90vh',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{
              type: 'spring',
              damping: prefersReducedMotion ? 100 : 25,
              stiffness: prefersReducedMotion ? 1000 : 300,
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* 拖拽手柄 */}
            {enableDrag && (
              <div className="flex justify-center py-3 cursor-grab active:cursor-grabbing touch-manipulation">
                <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
              </div>
            )}

            {/* 标题栏 */}
            {(title || enableDrag) && (
              <div className="flex items-center justify-between px-4 pb-2">
                {title && (
                  <h2 className="text-lg font-semibold">{title}</h2>
                )}
                {enableDrag && (
                  <button
                    onClick={onClose}
                    className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted touch-manipulation"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            )}

            {/* 快照点指示器 */}
            {snapPoints.length > 1 && (
              <div className="flex justify-center gap-2 pb-2">
                {snapPoints.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => handleSnapPointClick(index)}
                    className={`w-2 h-2 rounded-full transition-colors touch-manipulation ${
                      index === currentSnapPoint
                        ? 'bg-primary'
                        : 'bg-muted-foreground/30'
                    }`}
                  />
                ))}
              </div>
            )}

            {/* 内容区域 */}
            <div className="overflow-y-auto" style={{ height: 'calc(100% - 60px)' }}>
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/**
 * 底部动作条
 * 用于显示快捷操作
 */
interface BottomActionBarProps {
  isOpen: boolean;
  onClose: () => void;
  actions: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    destructive?: boolean;
  }[];
}

export function BottomActionBar({
  isOpen,
  onClose,
  actions,
}: BottomActionBarProps) {
  const haptic = getHapticFeedback();

  const handleActionClick = useCallback((action: BottomActionBarProps['actions'][0]) => {
    haptic.impact('light');
    action.onClick();
    onClose();
  }, [haptic, onClose]);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} snapPoints={[0.4]} enableDrag>
      <div className="p-4 space-y-2">
        {actions.map((action, index) => (
          <motion.button
            key={index}
            onClick={() => handleActionClick(action)}
            className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors ${
              action.destructive
                ? 'text-destructive hover:bg-destructive/10'
                : 'hover:bg-muted'
            }`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            whileTap={{ scale: 0.98 }}
          >
            {action.icon}
            <span>{action.label}</span>
          </motion.button>
        ))}
      </div>
    </BottomSheet>
  );
}
