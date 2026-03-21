'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Sparkles, Check, AlertCircle, RefreshCw, Clock } from 'lucide-react';

export type MessageStatus = 'sending' | 'streaming' | 'complete' | 'error' | 'regenerating';

interface MessageStatusIndicatorProps {
  status: MessageStatus;
  onRetry?: () => void;
  onRegenerate?: () => void;
}

const statusConfig = {
  sending: {
    icon: Loader2,
    text: '发送中',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    animate: true,
  },
  streaming: {
    icon: Sparkles,
    text: '生成中',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    animate: true,
  },
  complete: {
    icon: Check,
    text: '',
    color: 'text-success',
    bgColor: 'bg-success/10',
    animate: false,
  },
  error: {
    icon: AlertCircle,
    text: '失败',
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
    animate: false,
  },
  regenerating: {
    icon: RefreshCw,
    text: '重新生成',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    animate: true,
  },
};

export const MessageStatusIndicator = memo(function MessageStatusIndicator({
  status,
  onRetry,
  onRegenerate,
}: MessageStatusIndicatorProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  if (status === 'complete') {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${config.bgColor}`}
      >
        <Icon size={12} className={config.color} />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${config.bgColor} ${config.color}`}
    >
      <motion.div
        animate={config.animate ? { rotate: 360 } : {}}
        transition={config.animate ? { duration: 1, repeat: Infinity, ease: 'linear' } : {}}
      >
        <Icon size={12} />
      </motion.div>
      <span className="font-medium">{config.text}</span>
      {status === 'error' && onRetry && (
        <button
          onClick={onRetry}
          className="ml-1 underline hover:opacity-80 transition-opacity"
        >
          重试
        </button>
      )}
    </motion.div>
  );
});

// 思考动画组件 - AI 思考时显示
export const ThinkingAnimation = memo(function ThinkingAnimation() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50"
    >
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-primary"
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
      <span className="text-xs text-muted-foreground">正在思考...</span>
    </motion.div>
  );
});

// 时间戳格式化
export const formatMessageTime = (timestamp: number) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
};
