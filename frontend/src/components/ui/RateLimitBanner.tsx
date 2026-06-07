'use client';

/**
 * 限流提醒组件
 * 用于显示当前用户的使用配额和限制信息
 */

import { memo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Clock, Zap, Info, X } from 'lucide-react';

interface QuotaInfo {
  daily?: {
    used: number;
    quota: number;
    remaining: number;
    resetAt: string;
  };
  minute?: {
    remaining: number;
    limit: number;
  };
  hour?: {
    remaining: number;
    limit: number;
  };
}

interface RateLimitBannerProps {
  quota?: QuotaInfo;
  errorInfo?: {
    code: string;
    message: string;
    retryAfter?: number;
  };
  onDismiss?: () => void;
  autoHide?: boolean;
  autoHideDelay?: number;
}

const RateLimitBanner = memo(function RateLimitBanner({
  quota,
  errorInfo,
  onDismiss,
  autoHide = true,
  autoHideDelay = 8000,
}: RateLimitBannerProps) {
  const [visible, setVisible] = useState(true);
  const [countdown, setCountdown] = useState(autoHideDelay / 1000);

  useEffect(() => {
    if (errorInfo) {
      setVisible(true);
      setCountdown(autoHideDelay / 1000);
    }
  }, [errorInfo, autoHideDelay]);

  useEffect(() => {
    if (!autoHide || !errorInfo) return;
    
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setVisible(false);
          onDismiss?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoHide, errorInfo, onDismiss, autoHideDelay]);

  if (!visible) return null;

  const isQuotaExceeded = errorInfo?.code === 'DAILY_QUOTA_EXCEEDED';
  const isRateLimited = errorInfo?.code === 'RATE_LIMIT_EXCEEDED';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4"
      >
        <div className={`
          relative rounded-lg border p-4 shadow-lg
          ${isQuotaExceeded 
            ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800' 
            : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
          }
        `}>
          {/* 关闭按钮 */}
          {onDismiss && (
            <button
              onClick={() => {
                setVisible(false);
                onDismiss();
              }}
              className="absolute top-2 right-2 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10"
            >
              <X size={16} />
            </button>
          )}

          {/* 标题 */}
          <div className="flex items-center gap-2 mb-2">
            {isQuotaExceeded ? (
              <AlertTriangle className="text-amber-600" size={20} />
            ) : (
              <Clock className="text-red-600" size={20} />
            )}
            <h4 className="font-semibold text-sm">
              {isQuotaExceeded ? '今日配额已用完' : '请求过于频繁'}
            </h4>
          </div>

          {/* 消息 */}
          <p className="text-sm text-muted-foreground mb-3">
            {errorInfo?.message || '请稍后再试'}
          </p>

          {/* 配额信息 */}
          {quota?.daily && (
            <div className="flex items-center gap-2 text-xs">
              <Zap size={14} className="text-amber-600" />
              <span>
                剩余 {quota.daily.remaining}/{quota.daily.quota} 次AI对话
              </span>
            </div>
          )}

          {/* 重试倒计时 */}
          {errorInfo?.retryAfter && (
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {isRateLimited && autoHide && `${countdown}秒后可重试`}
                {isQuotaExceeded && quota?.daily?.resetAt && `将于 ${new Date(quota.daily.resetAt).toLocaleTimeString()} 重置`}
              </span>
              {errorInfo.retryAfter > 60 && (
                <span className="text-xs bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded">
                  {Math.ceil(errorInfo.retryAfter / 60)}分钟后可重试
                </span>
              )}
            </div>
          )}

          {/* 进度条 */}
          {quota?.daily && (
            <div className="mt-2 h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${(quota.daily.remaining / quota.daily.quota) * 100}%` }}
              />
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
});

/**
 * 配额指示器组件
 * 显示在界面角落的小型配额提示
 */
interface QuotaIndicatorProps {
  quota: QuotaInfo;
  compact?: boolean;
}

export const QuotaIndicator = memo(function QuotaIndicator({
  quota,
  compact = false,
}: QuotaIndicatorProps) {
  if (!quota?.daily) return null;

  const percentage = (quota.daily.remaining / quota.daily.quota) * 100;
  const isLow = percentage < 20;
  const isEmpty = percentage === 0;

  return (
    <div className={`
      flex items-center gap-2 rounded-full px-3 py-1.5 text-xs
      ${isEmpty 
        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' 
        : isLow 
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' 
          : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      }
    `}>
      <Zap size={12} />
      <span>
        {quota.daily.remaining}/{quota.daily.quota}
      </span>
      {!compact && (
        <span className="text-muted-foreground">AI配额</span>
      )}
    </div>
  );
});

/**
 * 使用统计面板
 */
interface UsageStatsProps {
  quota: QuotaInfo;
  ip?: string;
}

export const UsageStats = memo(function UsageStats({ quota, ip }: UsageStatsProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Info size={16} />
        <h4 className="font-medium text-sm">使用统计</h4>
      </div>

      {ip && (
        <div className="text-xs text-muted-foreground mb-3">
          IP: {ip}
        </div>
      )}

      <div className="space-y-2">
        {/* 每日配额 */}
        {quota.daily && (
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>今日 AI 对话</span>
              <span className={quota.daily.remaining < 10 ? 'text-amber-600' : ''}>
                {quota.daily.remaining}/{quota.daily.quota}
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all ${
                  quota.daily.remaining < 10 
                    ? 'bg-amber-500' 
                    : 'bg-green-500'
                }`}
                style={{ width: `${(quota.daily.remaining / quota.daily.quota) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* 分钟限制 */}
        {quota.minute && (
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>本分钟</span>
              <span>{quota.minute.remaining}/{quota.minute.limit}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500"
                style={{ width: `${(quota.minute.remaining / quota.minute.limit) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* 小时限制 */}
        {quota.hour && (
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>本小时</span>
              <span>{quota.hour.remaining}/{quota.hour.limit}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-purple-500"
                style={{ width: `${(quota.hour.remaining / quota.hour.limit) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {quota.daily?.resetAt && (
        <div className="mt-3 text-xs text-muted-foreground">
          配额将于 {new Date(quota.daily.resetAt).toLocaleString()} 重置
        </div>
      )}
    </div>
  );
});

export { RateLimitBanner };
export default RateLimitBanner;