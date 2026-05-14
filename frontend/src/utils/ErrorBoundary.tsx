'use client';

/**
 * ErrorBoundary 组件 - 捕获子组件树中的 JavaScript 错误
 *
 * 功能特性：
 * - componentDidCatch 上报 Sentry（可配置）
 * - getDerivedStateFromError 状态管理
 * - 降级 UI 渲染
 * - 自定义错误处理回调
 * - 重试机制
 * - 支持 React 18 ErrorBoundary 协议 (fallback 渲染)
 *
 * 使用场景：
 * - 页面级错误边界（防止整个应用崩溃）
 * - 区域级错误边界（隔离有问题的模块）
 * - 模块级错误边界（懒加载模块保护）
 */

import React, { Component, ReactNode, ErrorInfo } from 'react';

// ==================== 类型定义 ====================

/** 错误边界 Props */
interface ErrorBoundaryProps {
  /** 子组件 */
  children: ReactNode;
  /** 自定义降级 UI（可选） */
  fallback?: ReactNode;
  /** 错误回调（可选，用于日志上报等） */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** 模块名称（用于标识错误来源） */
  moduleName?: string;
  /** 是否启用 Sentry 上报（默认启用） */
  enableSentry?: boolean;
  /** 是否显示错误堆栈（开发环境默认显示） */
  showStack?: boolean;
}

/** 错误边界状态 */
interface ErrorBoundaryState {
  /** 是否捕获到错误 */
  hasError: boolean;
  /** 捕获的错误对象 */
  error: Error | null;
  /** 错误信息（用于 UI 显示） */
  errorMessage: string;
  /** 错误堆栈（用于调试） */
  errorStack: string | null;
}

// ==================== Sentry 上报接口 ====================

/** Sentry 上报配置（可选） */
interface SentryConfig {
  /** Sentry DSN */
  dsn?: string;
  /** 项目名称 */
  project?: string;
  /** 环境 */
  environment?: string;
}

// ==================== 组件实现 ====================

/**
 * ErrorBoundary - 错误边界组件
 *
 * React 生命周期：
 * 1. 渲染子组件
 * 2. 捕获子组件中的 JavaScript 错误
 * 3. 调用 getDerivedStateFromError 更新状态
 * 4. 渲染降级 UI
 * 5. 调用 componentDidCatch 进行日志上报
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // 默认配置
  private static defaultProps = {
    enableSentry: true,
    showStack: process.env.NODE_ENV === 'development',
  };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorMessage: '',
      errorStack: null,
    };
  }

  /**
   * 静态方法：从错误中获取更新后的状态
   * React 16+ 推荐使用此方法替代 componentWillReceiveProps
   */
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorMessage: error.message || '发生了未知错误',
      errorStack: error.stack || null,
    };
  }

  /**
   * 捕获错误的生命周期方法
   * 适合用于：
   * - 日志记录
   * - 上报监控
   * - 清理操作
   */
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const { onError, moduleName, enableSentry } = this.props;

    // 1. 打印错误日志到控制台
    console.error('='.repeat(60));
    console.error(`[ErrorBoundary] 模块 "${moduleName || 'Unknown'}" 发生错误`);
    console.error('[ErrorBoundary] 错误信息:', error.message);
    console.error('[ErrorBoundary] 错误堆栈:', error.stack);
    console.error('[ErrorBoundary] 组件堆栈:', errorInfo.componentStack);
    console.error('='.repeat(60));

    // 2. 上报 Sentry（如果启用且配置正确）
    if (enableSentry !== false) {
      this.reportToSentry(error, errorInfo);
    }

    // 3. 调用自定义错误回调
    if (typeof onError === 'function') {
      onError(error, errorInfo);
    }
  }

  /**
   * 上报错误到 Sentry
   * 支持多种上报方式：
   * - 完整 Sentry SDK（通过全局变量检测）
   * - 自定义上报函数（通过 window.__SENTRY_REPORT__）
   * - 降级为 console 日志
   */
  private reportToSentry(error: Error, errorInfo: React.ErrorInfo): void {
    try {
      // 检测是否使用了 Sentry SDK
      if (typeof window !== 'undefined' && (window as any).__SENTRY__) {
        // Sentry SDK 已初始化，直接使用
        const Sentry = (window as any).__SENTRY__;
        Sentry.captureException(error, {
          extra: {
            componentStack: errorInfo.componentStack,
            moduleName: this.props.moduleName,
          },
        });
      } else if (typeof window !== 'undefined' && (window as any).__SENTRY_REPORT__) {
        // 自定义上报函数
        (window as any).__SENTRY_REPORT__(error, {
          componentStack: errorInfo.componentStack,
          moduleName: this.props.moduleName,
          timestamp: Date.now(),
        });
      } else {
        // 降级：模拟 Sentry 数据结构（可用于其他监控服务）
        const sentryEvent = {
          event_id: this.generateUUID(),
          timestamp: new Date().toISOString(),
          level: 'error',
          platform: 'javascript',
          logger: 'ErrorBoundary',
          environment: process.env.NODE_ENV || 'development',
          exception: {
            type: error.name || 'Error',
            value: error.message,
            stacktrace: {
              frames: this.parseStackTrace(error.stack),
            },
          },
          extra: {
            componentStack: errorInfo.componentStack,
            moduleName: this.props.moduleName,
          },
        };

        console.log('[ErrorBoundary] Sentry Event (模拟):', JSON.stringify(sentryEvent, null, 2));

        // TODO: 可在此处调用其他监控服务（如 Sentry、Logrocket、Bugsnag 等）
        // 示例：fetch('/api/monitoring', { method: 'POST', body: JSON.stringify(sentryEvent) });
      }
    } catch (reportError) {
      console.error('[ErrorBoundary] Sentry 上报失败:', reportError);
    }
  }

  /**
   * 生成唯一 ID（用于 Sentry event_id）
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * 解析错误堆栈为 Sentry 帧格式
   */
  private parseStackTrace(stack: string | undefined): Array<{ filename: string; lineno: number; colno: number }> {
    if (!stack) return [];

    const frames: Array<{ filename: string; lineno: number; colno: number }> = [];
    const stackLines = stack.split('\n');

    // 跳过第一行（错误类型和消息），解析后续堆栈
    for (let i = 1; i < stackLines.length; i++) {
      const line = stackLines[i].trim();
      // 匹配 at filename (lineno:colno) 格式
      const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
      if (match) {
        frames.push({
          filename: match[2],
          lineno: parseInt(match[3], 10),
          colno: parseInt(match[4], 10),
        });
      }
    }

    return frames;
  }

  /**
   * 重置错误状态，尝试恢复组件
   */
  private handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorMessage: '',
      errorStack: null,
    });
  };

  /**
   * 获取默认降级 UI
   */
  private renderDefaultFallback(): ReactNode {
    const { moduleName, showStack } = this.props;
    const { errorMessage, errorStack } = this.state;

    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] p-8 text-center bg-muted/20 rounded-lg">
        {/* 错误图标 */}
        <div className="mb-4">
          <svg
            className="w-16 h-16 mx-auto text-destructive"
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
        </div>

        {/* 模块名称 */}
        {moduleName && (
          <div className="mb-2 px-3 py-1 bg-destructive/10 text-destructive text-xs font-medium rounded-full">
            {moduleName}
          </div>
        )}

        {/* 错误标题 */}
        <h2 className="text-xl font-bold text-foreground mb-2">组件加载失败</h2>

        {/* 错误消息 */}
        <p className="text-sm text-muted-foreground max-w-md mb-4">{errorMessage}</p>

        {/* 错误堆栈（仅开发环境显示） */}
        {showStack && errorStack && (
          <pre className="mt-2 p-4 bg-muted text-xs text-left rounded-md overflow-auto max-w-2xl max-h-48 text-muted-foreground">
            {errorStack}
          </pre>
        )}

        {/* 重试按钮 */}
        <button
          onClick={this.handleRetry}
          className="mt-4 px-6 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
        >
          重新加载
        </button>

        {/* 辅助提示 */}
        <p className="mt-4 text-xs text-muted-foreground">
          如果问题持续存在，请刷新页面或联系管理员
        </p>
      </div>
    );
  }

  render(): ReactNode {
    const { hasError } = this.state;
    const { fallback } = this.props;

    if (hasError) {
      // 优先使用自定义降级 UI
      if (fallback) {
        return fallback;
      }
      // 否则使用默认降级 UI
      return this.renderDefaultFallback();
    }

    return this.props.children;
  }
}

// ==================== 工厂函数 ====================

/**
 * createErrorBoundary - ErrorBoundary 工厂函数
 *
 * 便于在函数组件中以 hook 风格使用
 *
 * @param moduleName - 模块名称（用于标识错误来源）
 * @param fallback - 自定义降级 UI
 * @param onError - 错误回调
 * @returns 高阶组件包装器
 *
 * @example
 * ```tsx
 * const MyErrorBoundary = createErrorBoundary('MyModule', <CustomFallback />, handleError);
 *
 * function MyComponent() {
 *   return (
 *     <MyErrorBoundary>
 *       <RiskyComponent />
 *     </MyErrorBoundary>
 *   );
 * }
 * ```
 */
export function createErrorBoundary(
  moduleName?: string,
  fallback?: ReactNode,
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
) {
  return function ErrorBoundaryWrapper({ children }: { children: ReactNode }) {
    return (
      <ErrorBoundary
        moduleName={moduleName}
        fallback={fallback}
        onError={onError}
      >
        {children}
      </ErrorBoundary>
    );
  };
}

// ==================== Hook 版本（需要 React 18+）====================

/**
 * useErrorBoundary - 错误边界 Hook（实验性）
 *
 * 配合 React.Suspense 使用，允许组件内部触发错误边界
 *
 * @returns 触发错误的函数
 *
 * @example
 * ```tsx
 * function SafeComponent() {
 *   const triggerError = useErrorBoundary();
 *
 *   return (
 *     <button onClick={() => triggerError(new Error('Test error'))}>
 *       触发错误
 *     </button>
 *   );
 * }
 * ```
 */
export function useErrorBoundary() {
  // 注意：React 18 的 use() hook 可以实现更优雅的方案
  // 此处提供简单实现作为过渡
  const [error, setError] = React.useState<Error | null>(null);

  const triggerError = React.useCallback((err: Error) => {
    setError(err);
  }, []);

  if (error) {
    throw error;
  }

  return triggerError;
}

// ==================== 默认导出 ====================

export default ErrorBoundary;

// ==================== 全局错误边界 (React 18 ErrorBoundary 协议) ====================

/** React 18 ErrorBoundary Props */
interface GlobalErrorBoundaryProps {
  children: ReactNode;
  /** React 18 fallback 渲染协议 */
  fallback?: ReactNode | ((props: { error: Error; reset: () => void }) => ReactNode);
  /** 错误回调 */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** 模块名称 */
  moduleName?: string;
}

/**
 * GlobalErrorBoundary - 支持 React 18 fallback 渲染协议的全局错误边界
 *
 * 特性：
 * - 兼容 React 18 use() hook 错误处理
 * - 支持 fallback props 渲染协议
 * - 支持函数式 fallback (props: { error, reset })
 *
 * @example
 * ```tsx
 * <GlobalErrorBoundary fallback={({ error, reset }) => (
 *   <div>
 *     <p>{error.message}</p>
 *     <button onClick={reset}>重试</button>
 *   </div>
 * )}>
 *   <App />
 * </GlobalErrorBoundary>
 * ```
 */
interface GlobalErrorState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class GlobalErrorBoundary extends Component<GlobalErrorBoundaryProps, GlobalErrorState> {
  constructor(props: GlobalErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<GlobalErrorState> {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { onError, moduleName } = this.props;

    // 打印错误日志
    console.error('='.repeat(60));
    console.error(`[GlobalErrorBoundary] 模块 "${moduleName || 'Unknown'}" 发生错误`);
    console.error('[GlobalErrorBoundary] 错误信息:', error.message);
    console.error('[GlobalErrorBoundary] 错误堆栈:', error.stack);
    console.error('[GlobalErrorBoundary] 组件堆栈:', errorInfo.componentStack);
    console.error('='.repeat(60));

    this.setState({ errorInfo });

    if (typeof onError === 'function') {
      onError(error, errorInfo);
    }
  }

  private handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { fallback } = this.props;

    if (hasError && error) {
      if (fallback) {
        if (typeof fallback === 'function') {
          return fallback({ error, reset: this.handleReset });
        }
        return fallback;
      }

      // 默认降级 UI
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
          <div className="mb-2">
            <svg
              className="h-12 w-12 text-destructive"
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
          </div>
          <h2 className="text-xl font-bold">组件加载失败</h2>
          <p className="text-sm text-muted-foreground max-w-md">{error.message || '发生了未知错误'}</p>
          {process.env.NODE_ENV === 'development' && error.stack && (
            <pre className="max-w-2xl overflow-auto rounded-lg bg-muted p-4 text-left text-xs">
              {error.stack}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            className="rounded-full bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            重新加载
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}