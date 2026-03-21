'use client';

import { memo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  RefreshCw,
  SkipForward,
  XCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Bug,
  HelpCircle,
  FileText,
  MessageSquare,
  RotateCcw,
  ArrowRight,
  Zap,
  Settings
} from 'lucide-react';

// 错误类型
export type ErrorType =
  | 'api_error'
  | 'timeout'
  | 'rate_limit'
  | 'validation_error'
  | 'permission_denied'
  | 'resource_not_found'
  | 'internal_error'
  | 'unknown';

// 错误严重程度
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

// 恢复策略
export type RecoveryStrategy =
  | 'retry'
  | 'skip'
  | 'abort'
  | 'manual_fix'
  | 'alternative_approach'
  | 'request_help';

// 错误信息接口
export interface ErrorInfo {
  id: string;
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  details?: string;
  stack?: string;
  timestamp: string;
  agentId?: string;
  agentName?: string;
  taskId?: string;
  recoverable: boolean;
  suggestedActions?: RecoveryStrategy[];
  retryCount?: number;
  maxRetries?: number;
}

// 错误类型配置
const errorTypeConfig: Record<ErrorType, { icon: React.ReactNode; label: string; color: string }> = {
  api_error: { icon: <Zap size={16} />, label: 'API 错误', color: 'text-[hsl(var(--warning-500))]' },
  timeout: { icon: <RefreshCw size={16} />, label: '超时', color: 'text-[hsl(var(--warning-500))]' },
  rate_limit: { icon: <AlertTriangle size={16} />, label: '频率限制', color: 'text-[hsl(var(--warning-500))]' },
  validation_error: { icon: <FileText size={16} />, label: '验证错误', color: 'text-destructive' },
  permission_denied: { icon: <XCircle size={16} />, label: '权限拒绝', color: 'text-destructive' },
  resource_not_found: { icon: <HelpCircle size={16} />, label: '资源未找到', color: 'text-[hsl(var(--accent-500))]' },
  internal_error: { icon: <Bug size={16} />, label: '内部错误', color: 'text-destructive' },
  unknown: { icon: <AlertTriangle size={16} />, label: '未知错误', color: 'text-muted-foreground' },
};

// 严重程度配置
const severityConfig: Record<ErrorSeverity, { bg: string; border: string; label: string }> = {
  low: { bg: 'bg-muted/50', border: 'border-muted', label: '轻微' },
  medium: { bg: 'bg-[hsl(var(--warning-500))/0.14]', border: 'border-[hsl(var(--warning-500))/0.32]', label: '中等' },
  high: { bg: 'bg-[hsl(var(--warning-500))/0.14]', border: 'border-[hsl(var(--warning-500))/0.32]', label: '严重' },
  critical: { bg: 'bg-destructive/10', border: 'border-destructive/30', label: '致命' },
};

// 恢复策略配置
const recoveryStrategyConfig: Record<RecoveryStrategy, { icon: React.ReactNode; label: string; description: string }> = {
  retry: {
    icon: <RefreshCw size={14} />,
    label: '重试',
    description: '重新执行失败的操作'
  },
  skip: {
    icon: <SkipForward size={14} />,
    label: '跳过',
    description: '跳过此步骤继续执行'
  },
  abort: {
    icon: <XCircle size={14} />,
    label: '中止',
    description: '停止当前任务执行'
  },
  manual_fix: {
    icon: <Settings size={14} />,
    label: '手动修复',
    description: '提供手动干预选项'
  },
  alternative_approach: {
    icon: <ArrowRight size={14} />,
    label: '替代方案',
    description: '尝试其他方法完成任务'
  },
  request_help: {
    icon: <MessageSquare size={14} />,
    label: '请求帮助',
    description: '向用户请求额外信息或指导'
  },
};

// 动画变体
const errorVariants = {
  hidden: { opacity: 0, scale: 0.95, y: -10 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 400, damping: 30 }
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -10,
    transition: { duration: 0.2 }
  }
} as const;

const detailsVariants = {
  collapsed: { height: 0, opacity: 0 },
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: { duration: 0.2 }
  }
};

// 错误恢复 UI 组件
interface ErrorRecoveryUIProps {
  error: ErrorInfo;
  onRecovery?: (strategy: RecoveryStrategy) => void;
  onDismiss?: () => void;
  defaultExpanded?: boolean;
  showDetails?: boolean;
}

const ErrorRecoveryUI = memo(function ErrorRecoveryUI({
  error,
  onRecovery,
  onDismiss,
  defaultExpanded = false,
  showDetails = true,
}: ErrorRecoveryUIProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const typeConfig = errorTypeConfig[error.type];
  const severityConf = severityConfig[error.severity];

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        `Error: ${error.message}\n\nDetails: ${error.details || 'N/A'}\n\nStack: ${error.stack || 'N/A'}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Handle error silently
    }
  }, [error]);

  const handleRecovery = useCallback(async (strategy: RecoveryStrategy) => {
    if (strategy === 'retry') {
      setIsRetrying(true);
    }
    onRecovery?.(strategy);
  }, [onRecovery]);

  return (
    <motion.div
      className={`flex flex-col rounded-xl border ${severityConf.border} ${severityConf.bg} overflow-hidden`}
      variants={errorVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      layout
    >
      {/* 头部 */}
      <div className="flex items-start gap-3 p-4">
        {/* 错误图标 */}
        <motion.div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/20 ${typeConfig.color}`}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: 'spring' }}
        >
          {typeConfig.icon}
        </motion.div>

        {/* 错误信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium">{typeConfig.label}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${severityConf.bg} ${severityConf.border} border`}>
              {severityConf.label}
            </span>
            {error.agentName && (
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {error.agentName}
              </span>
            )}
          </div>
          <p className="text-sm text-foreground/80">{error.message}</p>

          {/* 重试计数 */}
          {error.retryCount !== undefined && error.maxRetries && (
            <p className="text-xs text-muted-foreground mt-1">
              已重试 {error.retryCount}/{error.maxRetries} 次
            </p>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1">
          <motion.button
            onClick={handleCopy}
            className="p-1.5 hover:bg-muted rounded transition-colors"
            title="复制错误信息"
            whileTap={{ scale: 0.9 }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </motion.button>
          {onDismiss && (
            <motion.button
              onClick={onDismiss}
              className="p-1.5 hover:bg-muted rounded transition-colors"
              title="关闭"
              whileTap={{ scale: 0.9 }}
            >
              <XCircle size={14} />
            </motion.button>
          )}
        </div>
      </div>

      {/* 展开详情 */}
      {showDetails && (error.details || error.stack) && (
        <motion.div className="border-t border-inherit">
          <motion.button
            className="flex items-center gap-1 w-full px-4 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            详细信息
          </motion.button>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                variants={detailsVariants}
                initial="collapsed"
                animate="expanded"
                exit="collapsed"
                className="overflow-hidden"
              >
                <div className="px-4 pb-3 space-y-2">
                  {error.details && (
                    <div>
                      <span className="text-xs font-medium text-muted-foreground">描述</span>
                      <p className="text-xs text-foreground/70 mt-1">{error.details}</p>
                    </div>
                  )}
                  {error.stack && (
                    <div>
                      <span className="text-xs font-medium text-muted-foreground">堆栈追踪</span>
                      <pre className="text-xs bg-muted/50 p-2 rounded mt-1 overflow-x-auto max-h-24">
                        {error.stack}
                      </pre>
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    时间: {error.timestamp}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* 恢复操作 */}
      {error.recoverable && error.suggestedActions && error.suggestedActions.length > 0 && (
        <div className="border-t border-inherit p-3 bg-muted/30">
          <div className="text-xs text-muted-foreground mb-2">选择恢复策略:</div>
          <div className="flex flex-wrap gap-2">
            {error.suggestedActions.map((strategy) => {
              const config = recoveryStrategyConfig[strategy];
              const isRetry = strategy === 'retry';
              return (
                <motion.button
                  key={strategy}
                  onClick={() => handleRecovery(strategy)}
                  disabled={isRetry && isRetrying}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isRetry
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : strategy === 'abort'
                      ? 'bg-destructive/20 text-destructive hover:bg-destructive/30'
                      : 'bg-muted hover:bg-muted/80'
                  } disabled:opacity-50`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {isRetry && isRetrying ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    config.icon
                  )}
                  {config.label}
                </motion.button>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
});

// 错误列表组件
interface ErrorListProps {
  errors: ErrorInfo[];
  onRecovery?: (errorId: string, strategy: RecoveryStrategy) => void;
  onDismiss?: (errorId: string) => void;
  maxVisible?: number;
}

export const ErrorList = memo(function ErrorList({
  errors,
  onRecovery,
  onDismiss,
  maxVisible = 3,
}: ErrorListProps) {
  const visibleErrors = errors.slice(0, maxVisible);
  const hiddenCount = errors.length - maxVisible;

  return (
    <motion.div
      className="flex flex-col gap-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-destructive">
        <AlertTriangle size={16} />
        <span>发现 {errors.length} 个错误</span>
      </div>

      <div className="flex flex-col gap-2">
        <AnimatePresence mode="popLayout">
          {visibleErrors.map((error) => (
            <ErrorRecoveryUI
              key={error.id}
              error={error}
              onRecovery={(strategy) => onRecovery?.(error.id, strategy)}
              onDismiss={() => onDismiss?.(error.id)}
            />
          ))}
        </AnimatePresence>
      </div>

      {hiddenCount > 0 && (
        <div className="text-xs text-muted-foreground text-center">
          还有 {hiddenCount} 个错误未显示
        </div>
      )}
    </motion.div>
  );
});

// 迷你错误提示
interface MiniErrorProps {
  message: string;
  onRetry?: () => void;
}

export const MiniError = memo(function MiniError({
  message,
  onRetry,
}: MiniErrorProps) {
  return (
    <motion.div
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <AlertTriangle size={12} />
      <span className="truncate max-w-[200px]">{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1 hover:underline"
        >
          <RotateCcw size={10} />
          重试
        </button>
      )}
    </motion.div>
  );
});

export default ErrorRecoveryUI;
