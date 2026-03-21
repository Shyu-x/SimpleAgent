'use client';

import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { GripVertical } from 'lucide-react';
import type { Conversation } from '@/types';

interface DraggableConversationItemProps {
  conversation: Conversation;
  children: ReactNode;
  onDragStart?: (conversationId: string) => void;
  onDragEnd?: (conversationId: string) => void;
}

/**
 * 可拖拽对话项组件
 * 使用 HTML5 Drag API 实现拖拽功能
 */
export default function DraggableConversationItem({
  conversation,
  children,
  onDragStart,
  onDragEnd,
}: DraggableConversationItemProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    // 设置拖拽数据
    e.dataTransfer.setData('conversationId', conversation.id);
    e.dataTransfer.effectAllowed = 'move';

    // 延迟设置 dragging 状态，确保视觉反馈
    requestAnimationFrame(() => setIsDragging(true));

    // 调用回调
    onDragStart?.(conversation.id);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    onDragEnd?.(conversation.id);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart as unknown as undefined}
      onDragEnd={handleDragEnd as unknown as undefined}
      className="relative cursor-grab active:cursor-grabbing"
    >
      <motion.div
        animate={{
          opacity: isDragging ? 0.5 : 1,
          scale: isDragging ? 1.02 : 1,
        }}
        transition={{ duration: 0.15 }}
      >
        {/* 拖拽手柄 */}
        <div className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-60">
          <GripVertical size={14} className="text-[hsl(var(--text-muted))]" />
        </div>

        {/* 内容 */}
        <div className={isDragging ? 'opacity-50' : ''}>
          {children}
        </div>
      </motion.div>
    </div>
  );
}
