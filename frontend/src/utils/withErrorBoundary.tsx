'use client';

/**
 * withErrorBoundary - 高阶组件（HOC）
 *
 * 将任意组件包装为带有错误边界的组件
 *
 * 功能特性：
 * - 自动捕获组件渲染错误
 * - 支持自定义降级 UI
 * - 支持错误回调
 * - 支持模块名称标记
 * - 可选 Sentry 上报
 *
 * 使用场景：
 * - 包装高风险组件（如第三方库组件）
 * - 包装懒加载组件
 * - 包装可能有渲染错误的复杂组件
 */

import React, { ComponentType, ReactNode, ErrorInfo } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

// ==================== 类型定义 ====================

/** withErrorBoundary 配置选项 */
export interface WithErrorBoundaryOptions {
  /** 模块名称（用于标识错误来源） */
  moduleName?: string;
  /** 自定义降级 UI */
  fallback?: ReactNode;
  /** 错误回调函数 */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** 是否启用 Sentry 上报（默认 true） */
  enableSentry?: boolean;
  /** 是否显示错误堆栈（开发环境默认显示） */
  showStack?: boolean;
  /** 是否显示组件名称 */
  showComponentName?: boolean;
}

// ==================== HOC 实现 ====================

/**
 * withErrorBoundary - 高阶组件工厂函数
 *
 * 创建一个包装了 ErrorBoundary 的高阶组件
 *
 * @param Component - 要包装的组件
 * @param options - 配置选项
 * @returns 包装后的组件
 *
 * @example
 * ```tsx
 * // 基本用法
 * const SafeComponent = withErrorBoundary(MyComponent);
 *
 * // 完整配置
 * const SafeComponent = withErrorBoundary(MyComponent, {
 *   moduleName: 'MyComponent',
 *   fallback: <CustomErrorUI />,
 *   onError: (error, info) => {
 *     // 自定义错误处理
 *     console.error('MyComponent Error:', error);
 *   },
 *   enableSentry: true,
 *   showStack: true,
 * });
 *
 * // 渲染
 * return <SafeComponent prop1="value" prop2={123} />;
 * ```
 */
export function withErrorBoundary<P extends object>(
  Component: ComponentType<P>,
  options: WithErrorBoundaryOptions = {}
): ComponentType<P> {
  const {
    moduleName,
    fallback,
    onError,
    enableSentry = true,
    showStack = process.env.NODE_ENV === 'development',
    showComponentName = false,
  } = options;

  // 显示的模块名称（组件名优先）
  const displayModuleName = moduleName || Component.displayName || Component.name || 'Unknown';

  // 创建 ErrorBoundary 组件
  const ErrorBoundaryWrapper = (props: P) => (
    <ErrorBoundary
      moduleName={displayModuleName}
      fallback={fallback}
      onError={onError}
      enableSentry={enableSentry}
      showStack={showStack}
    >
      <Component {...props} />
    </ErrorBoundary>
  );

  // 设置显示名称（便于 React DevTools 调试）
  ErrorBoundaryWrapper.displayName = `withErrorBoundary(${displayModuleName})`;

  return ErrorBoundaryWrapper;
}

// ==================== 快捷 HOC 工厂 ====================

/**
 * createSafeComponent - 创建带错误边界的组件（快捷方式）
 *
 * 简化常见使用场景
 *
 * @param moduleName - 模块名称
 * @param customFallback - 自定义降级 UI（可选）
 * @returns 高阶组件
 *
 * @example
 * ```tsx
 * const SafeImageUploader = createSafeComponent('ImageUploader', <div>图片上传组件加载失败</div>);
 *
 * const SafeChart = createSafeComponent('Chart');
 * ```
 */
export function createSafeComponent(
  moduleName: string,
  customFallback?: ReactNode
): <P extends object>(Component: ComponentType<P>) => ComponentType<P> {
  return (Component) => withErrorBoundary(Component, {
    moduleName,
    fallback: customFallback,
  });
}

// ==================== 装饰器语法支持（实验性）====================

/**
 * @errorBoundary - 装饰器语法（需要 TypeScript experimentalDecorators）
 *
 * @example
 * ```ts
 * @errorBoundary({ moduleName: 'UserProfile', enableSentry: true })
 * class UserProfile extends React.Component {
 *   // ...
 * }
 * ```
 *
 * 注意：由于函数组件更常用，建议使用 withErrorBoundary HOC
 */
export function errorBoundary(options: WithErrorBoundaryOptions = {}): any {
  return function <P extends object>(Component: ComponentType<P>): ComponentType<P> {
    return withErrorBoundary(Component, options);
  };
}

// ==================== 预设错误边界组件 ====================

/**
 * 预设的降级 UI 组件
 */

/** 简单重试按钮 */
export const SimpleRetryFallback: React.FC<{ message?: string }> = ({
  message = '组件加载失败，请重试'
}) => (
  <div className="flex flex-col items-center justify-center p-4">
    <p className="text-sm text-muted-foreground mb-2">{message}</p>
    <button
      onClick={() => window.location.reload()}
      className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded hover:opacity-90"
    >
      刷新页面
    </button>
  </div>
);

/** 带图标的降级 UI */
export const IconFallback: React.FC<{ moduleName?: string }> = ({ moduleName }) => (
  <div className="flex flex-col items-center justify-center p-6 bg-muted/20 rounded-lg">
    <svg
      className="w-12 h-12 text-muted-foreground mb-4"
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
    <h3 className="text-lg font-medium mb-1">组件加载异常</h3>
    {moduleName && (
      <p className="text-sm text-muted-foreground mb-2">
        模块: <span className="font-mono">{moduleName}</span>
      </p>
    )}
    <button
      onClick={() => window.location.reload()}
      className="mt-2 px-4 py-2 text-sm bg-destructive text-destructive-foreground rounded hover:opacity-90"
    >
      刷新页面
    </button>
  </div>
);

// ==================== 组合 HOC ====================

/**
 * composeErrorBoundary - 组合多个错误边界
 *
 * 当组件有多个潜在错误源时使用
 *
 * @param components - 要包装的组件及其配置
 * @returns 包装后的组件
 *
 * @example
 * ```tsx
 * const SafeComplexComponent = composeErrorBoundary([
 *   { component: HeavyChart, moduleName: 'HeavyChart', fallback: <ChartFallback /> },
 *   { component: DataTable, moduleName: 'DataTable', fallback: <TableFallback /> },
 *   { component: ImageGallery, moduleName: 'ImageGallery', fallback: <GalleryFallback /> },
 * ]);
 * ```
 */
export function composeErrorBoundary<P extends object>(
  components: Array<{
    component: ComponentType<P>;
    moduleName?: string;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  }>
): ComponentType<P> {
  // 从最后一个组件开始包装（确保最外层是第一个 ErrorBoundary）
  return components
    .slice()
    .reverse()
    .reduce<ComponentType<P>>((WrappedComponent, { component, moduleName, fallback, onError }) => {
      const wrapper = withErrorBoundary(component, {
        moduleName,
        fallback,
        onError,
      });
      // @ts-expect-error - wrapper expects wrapped props type
      return (props) => wrapper(props);
    }, (props: P) => <></>);
}

// ==================== 默认导出 ====================

export default withErrorBoundary;