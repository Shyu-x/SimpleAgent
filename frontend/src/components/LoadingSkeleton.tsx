'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Bot } from 'lucide-react';

interface LoadingSkeletonProps {
  type?: 'bubble' | 'compact' | 'typing';
  count?: number;
}

// 气泡样式 Loading
export const BubbleLoadingSkeleton = memo(function BubbleLoadingSkeleton({
  count = 1,
}: LoadingSkeletonProps) {
  return (
    <div className="flex flex-col gap-4 w-full">
      {[...Array(count)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className={`flex gap-3 ${i % 2 === 0 ? '' : 'flex-row-reverse'}`}
        >
          {/* 头像占位 */}
          <motion.div
            className="w-9 h-9 rounded-2xl bg-muted/50 shrink-0"
            animate={{
              opacity: [0.5, 1, 0.5],
            }}
            transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
          />

          {/* 气泡占位 */}
          <motion.div
            className="flex flex-col gap-2 max-w-[70%]"
            animate={{
              opacity: [0.5, 1, 0.5],
            }}
            transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 + 0.1 }}
          >
            <div className="h-2 w-20 rounded-full bg-muted/50" />
            <div className="h-2 w-full rounded-full bg-muted/50" />
            <div className="h-2 w-3/4 rounded-full bg-muted/50" />
            {i % 2 === 0 && <div className="h-2 w-1/2 rounded-full bg-muted/50" />}
          </motion.div>
        </motion.div>
      ))}
    </div>
  );
});

// 紧凑样式 Loading
export const CompactLoadingSkeleton = memo(function CompactLoadingSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-3 px-4 py-3"
    >
      <motion.div
        className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center"
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
      >
        <Bot size={16} className="text-primary animate-pulse" />
      </motion.div>

      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-muted"
            animate={{
              scale: [0.8, 1.2, 0.8],
              opacity: [0.4, 1, 0.4],
            }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              delay: i * 0.15,
            }}
          />
        ))}
      </div>
    </motion.div>
  );
});

// 思考动画（三个点跳动）
export const ThinkingSkeleton = memo(function ThinkingSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="flex items-center gap-2 px-4 py-3 rounded-2xl rounded-tl-none bg-muted/50"
    >
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2.5 h-2.5 rounded-full bg-primary"
            animate={{
              scale: [1, 1.4, 1],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              delay: i * 0.15,
            }}
          />
        ))}
      </div>
      <span className="text-sm text-muted-foreground">正在思考...</span>
    </motion.div>
  );
});

// 打字动画 Loading
export const TypingLoadingSkeleton = memo(function TypingLoadingSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex gap-0.5">
        {['w', 'h', 'a', 't', ' ', 'i', 's', ' ', 'y', 'o', 'u', ' ', 't', 'h', 'i', 'n', 'k', 'i', 'n', 'g', '?'].map((char, i) => (
          <motion.span
            key={i}
            className="text-sm text-muted-foreground/60 font-mono"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.05 }}
          >
            {char}
          </motion.span>
        ))}
      </div>

      <motion.span
        className="inline-block w-0.5 h-4 bg-primary"
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 0.8, repeat: Infinity }}
      />
    </div>
  );
});

// 默认导出
export default function LoadingSkeleton({ type = 'bubble', count = 1 }: LoadingSkeletonProps) {
  switch (type) {
    case 'compact':
      return <CompactLoadingSkeleton />;
    case 'typing':
      return <TypingLoadingSkeleton />;
    default:
      return <BubbleLoadingSkeleton count={count} />;
  }
}
