'use client';

/**
 * FallbackUI 组件 - 降级 UI 组件
 *
 * 功能特性：
 * - 模块名展示
 * - 友好错误提示
 * - 重试按钮
 * - 错误详情展示（可折叠）
 * - 多种预设样式
 *
 * 使用场景：
 * - 组件加载失败时显示
 * - 网络错误提示
 * - 超时提示
 * - 模块不存在提示
 */

import React, { useState } from 'react';

// ==================== 类型定义 ====================

/** FallbackUI 样式类型 */
export type FallbackStyle = 'default' | 'minimal' | 'detailed' | 'card';

/** FallbackUI 错误类型 */
export interface FallbackError {
  /** 错误消息 */
  message: string;
  /** 错误堆栈（可选） */
  stack?: string;
  /** 错误码（可选） */
  code?: string;
  /** 错误时间戳 */
  timestamp?: number;
}

/** FallbackUI Props */
export interface FallbackUIProps {
  /** 模块名称 */
  moduleName?: string;
  /** 错误信息 */
  error?: FallbackError | string;
  /** 自定义错误消息（覆盖 error.message） */
  message?: string;
  /** 样式类型 */
  style?: FallbackStyle;
  /** 是否显示重试按钮 */
  showRetry?: boolean;
  /** 是否显示错误堆栈 */
  showStack?: boolean;
  /** 重试回调函数 */
  onRetry?: () => void;
  /** 自定义图标（可选） */
  icon?: React.ReactNode;
  /** 自定义操作按钮（可选） */
  actions?: React.ReactNode;
  /** 额外的 CSS 类名 */
  className?: string;
  /** 显示错误详情（折叠面板） */
  collapsible?: boolean;
}

// ==================== 预设图标组件 ====================

/** 默认错误图标 */
const DefaultErrorIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className || 'w-16 h-16'}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
  </svg>
);

/** 网络错误图标 */
const NetworkErrorIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className || 'w-16 h-16'}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
    />
  </svg>
);

/** 超时错误图标 */
const TimeoutErrorIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className || 'w-16 h-16'}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

/** 模块未找到图标 */
const NotFoundIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className || 'w-16 h-16'}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

// ==================== FallbackUI 组件 ====================

/**
 * FallbackUI - 降级 UI 组件
 *
 * 当模块加载失败时显示友好提示
 */
export const FallbackUI: React.FC<FallbackUIProps> = ({
  moduleName,
  error,
  message,
  style = 'default',
  showRetry = true,
  showStack = process.env.NODE_ENV === 'development',
  onRetry,
  icon,
  actions,
  className = '',
  collapsible = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // 解析错误信息
  const errorInfo = typeof error === 'string'
    ? { message: error }
    : error || { message: message || '发生了未知错误' };

  // 选择图标
  const renderIcon = () => {
    if (icon) return icon;

    // 根据错误类型选择图标
    const errorMessage = errorInfo.message.toLowerCase();
    if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      return <NetworkErrorIcon className="w-16 h-16 text-orange-500" />;
    }
    if (errorMessage.includes('timeout') || errorMessage.includes('超时')) {
      return <TimeoutErrorIcon className="w-16 h-16 text-yellow-500" />;
    }
    if (errorMessage.includes('not found') || errorMessage.includes('未找到') || errorMessage.includes('不存在')) {
      return <NotFoundIcon className="w-16 h-16 text-gray-400" />;
    }

    return <DefaultErrorIcon className="w-16 h-16 text-red-500" />;
  };

  // 重新加载处理
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      // 默认刷新页面
      window.location.reload();
    }
  };

  // 默认样式
  const defaultStyles = {
    container: 'flex flex-col items-center justify-center min-h-[200px] p-8 text-center',
    moduleTag: 'mb-2 px-3 py-1 bg-destructive/10 text-destructive text-xs font-medium rounded-full',
    title: 'text-xl font-bold text-foreground mb-2',
    message: 'text-sm text-muted-foreground max-w-md mb-4',
    stackPre: 'mt-2 p-4 bg-muted text-xs text-left rounded-md overflow-auto max-w-2xl max-h-48 text-muted-foreground',
    retryButton: 'px-6 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity',
    helpText: 'mt-4 text-xs text-muted-foreground',
  };

  // minimal 样式
  const minimalStyles = {
    container: 'flex flex-col items-center justify-center p-4 text-center',
    moduleTag: 'mb-1 px-2 py-0.5 bg-destructive/10 text-destructive text-xs font-medium rounded',
    title: 'text-base font-medium text-foreground mb-1',
    message: 'text-xs text-muted-foreground mb-2 max-w-xs',
    stackPre: 'mt-1 p-2 bg-muted text-xs text-left rounded overflow-auto max-w-xs max-h-24',
    retryButton: 'px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90',
    helpText: 'mt-2 text-xs text-muted-foreground',
  };

  // card 样式
  const cardStyles = {
    container: 'flex flex-col items-center justify-center p-6 bg-card text-card-foreground rounded-lg border border-border shadow-sm',
    moduleTag: 'mb-3 px-3 py-1 bg-destructive/10 text-destructive text-xs font-medium rounded-full',
    title: 'text-lg font-semibold mb-2',
    message: 'text-sm text-muted-foreground mb-4 max-w-sm',
    stackPre: 'mt-2 p-3 bg-muted text-xs text-left rounded overflow-auto max-w-sm max-h-32',
    retryButton: 'px-5 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity',
    helpText: 'mt-3 text-xs text-muted-foreground',
  };

  // detailed 样式
  const detailedStyles = {
    container: 'flex flex-col items-center justify-center p-8 text-center bg-muted/20 rounded-lg',
    moduleTag: 'mb-3 px-4 py-2 bg-destructive/20 text-destructive text-sm font-medium rounded-lg',
    title: 'text-2xl font-bold text-foreground mb-3',
    message: 'text-base text-muted-foreground mb-4 max-w-lg',
    stackPre: 'mt-3 p-4 bg-background text-xs text-left rounded-md overflow-auto max-w-3xl max-h-64 border',
    retryButton: 'px-6 py-2.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity',
    helpText: 'mt-4 text-sm text-muted-foreground',
  };

  // 选择样式
  const styles = {
    default: defaultStyles,
    minimal: minimalStyles,
    card: cardStyles,
    detailed: detailedStyles,
  }[style];

  return (
    <div className={`${styles.container} ${className}`}>
      {/* 图标 */}
      <div className="mb-4">
        {renderIcon()}
      </div>

      {/* 模块名称标签 */}
      {moduleName && (
        <div className={styles.moduleTag}>
          {moduleName}
        </div>
      )}

      {/* 错误标题 */}
      <h2 className={styles.title}>
        {getDefaultTitle(errorInfo.message)}
      </h2>

      {/* 错误消息 */}
      <p className={styles.message}>
        {errorInfo.message}
      </p>

      {/* 错误详情（可折叠） */}
      {collapsible && showStack && errorInfo.stack && (
        <div className="w-full max-w-2xl mt-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {isExpanded ? '▲ 收起详情' : '▼ 查看详情'}
          </button>

          {isExpanded && (
            <pre className={styles.stackPre}>
              {errorInfo.stack}
            </pre>
          )}
        </div>
      )}

      {/* 非折叠模式下的错误堆栈 */}
      {!collapsible && showStack && errorInfo.stack && (
        <pre className={styles.stackPre}>
          {errorInfo.stack}
        </pre>
      )}

      {/* 操作按钮区域 */}
      <div className="flex items-center gap-3 mt-4">
        {/* 重试按钮 */}
        {showRetry && (
          <button onClick={handleRetry} className={styles.retryButton}>
            重新加载
          </button>
        )}

        {/* 自定义操作按钮 */}
        {actions}
      </div>

      {/* 辅助提示 */}
      {style !== 'minimal' && (
        <p className={styles.helpText}>
          如果问题持续存在，请刷新页面或联系管理员
        </p>
      )}
    </div>
  );
};

// ==================== 快捷工厂函数 ====================

/**
 * 创建预设样式的 FallbackUI
 */
export const createFallbackUI = (preset: 'network' | 'timeout' | 'notFound' | 'error') => {
  const presets = {
    network: {
      icon: <NetworkErrorIcon className="w-16 h-16 text-orange-500" />,
      message: '网络连接失败，请检查您的网络设置',
    },
    timeout: {
      icon: <TimeoutErrorIcon className="w-16 h-16 text-yellow-500" />,
      message: '加载超时，请稍后重试',
    },
    notFound: {
      icon: <NotFoundIcon className="w-16 h-16 text-gray-400" />,
      message: '请求的资源未找到',
    },
    error: {
      icon: <DefaultErrorIcon className="w-16 h-16 text-red-500" />,
      message: '发生了未知错误',
    },
  };

  const config = presets[preset];

  const CreateFallback = (props: Omit<FallbackUIProps, 'icon' | 'message'>) => (
    <FallbackUI
      {...props}
      icon={config.icon}
      message={config.message}
    />
  );
  CreateFallback.displayName = `CreateFallback(${preset})`;
  return CreateFallback;
};

/**
 * 获取默认标题
 */
function getDefaultTitle(errorMessage: string): string {
  const lower = errorMessage.toLowerCase();

  if (lower.includes('network') || lower.includes('fetch') || lower.includes('网络')) {
    return '网络连接失败';
  }
  if (lower.includes('timeout') || lower.includes('超时')) {
    return '加载超时';
  }
  if (lower.includes('not found') || lower.includes('未找到') || lower.includes('不存在')) {
    return '资源不存在';
  }
  if (lower.includes('unauthorized') || lower.includes('未授权') || lower.includes('权限')) {
    return '权限不足';
  }
  if (lower.includes('parse') || lower.includes('解析')) {
    return '数据解析失败';
  }

  return '组件加载失败';
}

// ==================== 预设 FallbackUI 组件 ====================

/** 网络错误 FallbackUI */
export const NetworkFallback = createFallbackUI('network');

/** 超时 FallbackUI */
export const TimeoutFallback = createFallbackUI('timeout');

/** 未找到 FallbackUI */
export const NotFoundFallback = createFallbackUI('notFound');

/** 通用错误 FallbackUI */
export const ErrorFallback = createFallbackUI('error');

// ==================== 默认导出 ====================

export default FallbackUI;