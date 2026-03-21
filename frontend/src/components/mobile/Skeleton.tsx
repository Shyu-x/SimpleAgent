'use client';

import { motion, Variants } from 'framer-motion';

/**
 * 骨架屏动画变体
 */
const skeletonVariants = {
  initial: {
    opacity: 0.4,
  },
  animate: {
    opacity: 0.7,
    transition: {
      duration: 1.2,
      repeat: Infinity,
      repeatType: 'reverse' as const,
      ease: 'easeInOut' as const,
    },
  },
} as const satisfies Variants;

/**
 * 单个骨架条
 */
interface SkeletonBarProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
}

export function SkeletonBar({
  width = '100%',
  height = '1rem',
  borderRadius = '0.25rem',
  className='',
}: SkeletonBarProps) {
  return (
    <motion.div
      className={`bg-muted-foreground/20 ${className}`}
      style={{ width, height, borderRadius }}
      variants={skeletonVariants}
      initial="initial"
      animate="animate"
    />
  );
}

/**
 * 骨架圆圈（头像等）
 */
interface SkeletonCircleProps {
  size?: string | number;
  className?: string;
}

export function SkeletonCircle({ size = '3rem', className='' }: SkeletonCircleProps) {
  return (
    <motion.div
      className={`bg-muted-foreground/20 rounded-full ${className}`}
      style={{ width: size, height: size }}
      variants={skeletonVariants}
      initial="initial"
      animate="animate"
    />
  );
}

/**
 * 消息骨架屏
 */
export function MessageSkeleton({ isUser = false }: { isUser?: boolean }) {
  return (
    <div className={`flex gap-3 p-4 ${isUser ? 'flex-row-reverse' : ''}`}>
      {!isUser && <SkeletonCircle size="2rem" />}
      <div className="flex-1 space-y-2">
        <SkeletonBar width="20%" height="0.75rem" />
        <SkeletonBar width="90%" height="1rem" />
        <SkeletonBar width="70%" height="1rem" />
        <SkeletonBar width="50%" height="1rem" />
      </div>
      {isUser && <SkeletonCircle size="2rem" />}
    </div>
  );
}

/**
 * 对话列表骨架屏
 */
export function ConversationListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2 p-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg">
          <SkeletonCircle size="2rem" />
          <div className="flex-1 space-y-2">
            <SkeletonBar width="60%" height="0.875rem" />
            <SkeletonBar width="40%" height="0.75rem" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 聊天区域骨架屏
 */
export function ChatAreaSkeleton() {
  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between">
        <SkeletonBar width="30%" height="1.25rem" />
        <SkeletonCircle size="2.5rem" />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <MessageSkeleton isUser={false} />
        <MessageSkeleton isUser={true} />
        <MessageSkeleton isUser={false} />
        <MessageSkeleton isUser={true} />
      </div>

      {/* Input */}
      <div className="border-t p-4">
        <SkeletonBar width="100%" height="3rem" borderRadius="0.5rem" />
      </div>
    </div>
  );
}

/**
 * 设置面板骨架屏
 */
export function SettingsSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <SkeletonBar width="30%" height="1.5rem" />
        <SkeletonCircle size="2rem" />
      </div>

      {/* Tabs */}
      <div className="flex gap-4">
        <SkeletonBar width="3rem" height="2rem" />
        <SkeletonBar width="3rem" height="2rem" />
        <SkeletonBar width="3rem" height="2rem" />
      </div>

      {/* Content */}
      <div className="space-y-4">
        <SkeletonBar width="100%" height="2.5rem" />
        <SkeletonBar width="100%" height="2.5rem" />
        <SkeletonBar width="80%" height="2.5rem" />
      </div>

      {/* Buttons */}
      <div className="flex justify-end gap-2 pt-4">
        <SkeletonBar width="4rem" height="2.5rem" borderRadius="0.375rem" />
        <SkeletonBar width="4rem" height="2.5rem" borderRadius="0.375rem" />
      </div>
    </div>
  );
}

/**
 * 骨架屏容器 - 用于包裹懒加载内容
 */
interface SkeletonProps {
  children?: React.ReactNode;
  isLoading: boolean;
  skeleton?: React.ReactNode;
  className?: string;
}

export function Skeleton({ isLoading, skeleton, children, className='' }: SkeletonProps) {
  if (isLoading) {
    return <>{skeleton || children}</>;
  }
  return <div className={className}>{children}</div>;
}
