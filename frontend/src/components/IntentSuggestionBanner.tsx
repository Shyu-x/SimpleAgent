'use client';

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  PenLine,
  ListTodo,
  BookOpen,
  MessageSquare,
  ImageIcon,
  Wrench,
  X,
  Check,
  Sparkles,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { IntentResult, IntentType } from '@/hooks/useIntentDetection';

// 意图类型配置
const intentConfig: Record<IntentType, {
  icon: React.ReactNode;
  key: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  tool_use: {
    icon: <Wrench size={16} />,
    key: 'tool_use',
    color: 'text-[hsl(var(--accent-500))]',
    bgColor: 'bg-[hsl(var(--accent-500))/0.1]',
    borderColor: 'border-[hsl(var(--accent-500))/0.3]',
  },
  creative: {
    icon: <PenLine size={16} />,
    key: 'creative',
    color: 'text-[hsl(var(--purple-500))]',
    bgColor: 'bg-[hsl(var(--purple-500))/0.1]',
    borderColor: 'border-[hsl(var(--purple-500))/0.3]',
  },
  task: {
    icon: <ListTodo size={16} />,
    key: 'task',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/30',
  },
  knowledge: {
    icon: <BookOpen size={16} />,
    key: 'knowledge',
    color: 'text-[hsl(var(--info-500))]',
    bgColor: 'bg-[hsl(var(--info-500))/0.1]',
    borderColor: 'border-[hsl(var(--info-500))/0.3]',
  },
  vision: {
    icon: <ImageIcon size={16} />,
    key: 'vision',
    color: 'text-[hsl(var(--warning-500))]',
    bgColor: 'bg-[hsl(var(--warning-500))/0.1]',
    borderColor: 'border-[hsl(var(--warning-500))/0.3]',
  },
  conversation: {
    icon: <MessageSquare size={16} />,
    key: 'conversation',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/50',
    borderColor: 'border-muted',
  },
  image_generation: {
    icon: <Sparkles size={16} />,
    key: 'image_generation',
    color: 'text-[hsl(var(--success-500))]',
    bgColor: 'bg-[hsl(var(--success-500))/0.1]',
    borderColor: 'border-[hsl(var(--success-500))/0.3]',
  },
};

// 置信度等级
function getConfidenceLevel(confidence: number, t: ReturnType<typeof useTranslations>): { label: string; color: string } {
  if (confidence >= 0.8) {
    return { label: t('intent.confidence.high'), color: 'text-[hsl(var(--success-500))]' };
  }
  if (confidence >= 0.5) {
    return { label: t('intent.confidence.medium'), color: 'text-[hsl(var(--warning-500))]' };
  }
  return { label: t('intent.confidence.low'), color: 'text-muted-foreground' };
}

// 属性
interface IntentSuggestionBannerProps {
  intent: IntentResult | null;
  onAccept?: () => void;
  onDismiss?: () => void;
  showActions?: boolean;
  className?: string;
}

// 意图建议 Banner
const IntentSuggestionBanner = memo(function IntentSuggestionBanner({
  intent,
  onAccept,
  onDismiss,
  showActions = true,
  className = '',
}: IntentSuggestionBannerProps) {
  const t = useTranslations('intent');
  if (!intent) return null;

  const config = intentConfig[intent.type];
  const confidenceLevel = getConfidenceLevel(intent.confidence, t);
  const label = t(`${config.key}.label`);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={intent.type + intent.confidence}
        initial={{ opacity: 0, height: 0, marginTop: 0 }}
        animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
        exit={{ opacity: 0, height: 0, marginTop: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' as const }}
        className={`overflow-hidden ${className}`}
      >
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm ${config.bgColor} ${config.borderColor}`}
        >
          {/* 图标 */}
          <motion.div
            className={`flex items-center justify-center w-10 h-10 rounded-lg ${config.bgColor} ${config.borderColor} border shrink-0`}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 400 }}
          >
            {config.icon}
          </motion.div>

          {/* 内容 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`font-medium ${config.color}`}>
                {label}
              </span>
              <span className={`text-xs ${confidenceLevel.color}`}>
                {confidenceLevel.label} {Math.round(intent.confidence * 100)}%
              </span>
              {intent.requiresAgent && (
                <span className="flex items-center gap-0.5 text-xs text-primary">
                  <Sparkles size={10} />
                  {t('suggestAgent')}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {intent.reasoning}
            </p>

            {/* 匹配的关键词 */}
            {intent.matchedKeywords.length > 0 && (
              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                {intent.matchedKeywords.slice(0, 4).map((keyword, index) => (
                  <motion.span
                    key={keyword}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 + index * 0.05 }}
                    className="px-1.5 py-0.5 text-[10px] bg-muted rounded text-muted-foreground"
                  >
                    {keyword}
                  </motion.span>
                ))}
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          {showActions && (
            <div className="flex items-center gap-2 shrink-0">
              {onAccept && (
                <motion.button
                  onClick={onAccept}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium ${config.color} ${config.bgColor} border ${config.borderColor} hover:opacity-80 transition-opacity`}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Check size={12} />
                  {t('apply')}
                </motion.button>
              )}
              {onDismiss && (
                <motion.button
                  onClick={onDismiss}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <X size={14} />
                </motion.button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
});

export default IntentSuggestionBanner;
