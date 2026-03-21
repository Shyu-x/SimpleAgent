'use client';

import { type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '@/store/chatStore';

interface MultiWindowDropZoneProps {
  windowId: string;
  isHighlighted: boolean;
  onHighlightChange: (highlighted: boolean) => void;
  children: ReactNode;
  onDrop?: (conversationId: string, windowId: string) => void;
}

/**
 * 多窗口放置区域组件
 * 监听拖拽事件，提供视觉反馈
 */
export default function MultiWindowDropZone({
  windowId,
  isHighlighted,
  onHighlightChange,
  children,
  onDrop,
}: MultiWindowDropZoneProps) {
  const { assignConversationToWindow } = useChatStore();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isHighlighted) {
      onHighlightChange(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // 只有真正离开放置区域时才取消高亮
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      onHighlightChange(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    onHighlightChange(false);

    const conversationId = e.dataTransfer.getData('conversationId');
    if (conversationId) {
      // 调用 store 方法分配对话到窗口
      assignConversationToWindow(conversationId, windowId);
      // 调用回调
      onDrop?.(conversationId, windowId);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative h-full w-full"
    >
      {/* 放置区域高亮边框 */}
      <AnimatePresence>
        {isHighlighted && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-10 rounded-3xl border-2 border-dashed border-primary bg-primary/10 pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* 放置提示 */}
      <AnimatePresence>
        {isHighlighted && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-20 flex items-center justify-center rounded-3xl bg-[hsl(var(--bg-surface))]/80 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-2 text-primary">
              <svg
                className="h-10 w-10"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
              <span className="text-sm font-medium">放置此处</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 内容 */}
      {children}
    </div>
  );
}
