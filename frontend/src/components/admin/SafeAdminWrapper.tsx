'use client';

/**
 * SafeAdminWrapper - 管理后台安全包装组件
 *
 * 功能：
 * - 为管理后台组件提供 ErrorBoundary 保护
 * - 统一错误处理和降级 UI
 * - Sentry 错误上报
 *
 * 使用方式：
 * ```tsx
 * <SafeAdminWrapper moduleName="AdminDashboard">
 *   <AdminDashboard />
 * </SafeAdminWrapper>
 * ```
 */

import React, { ReactNode } from 'react';
import { ErrorBoundary } from '@/utils/ErrorBoundary';
import { FallbackUI } from '@/components/FallbackUI';

interface SafeAdminWrapperProps {
  /** 子组件 */
  children: ReactNode;
  /** 模块名称（用于标识错误来源） */
  moduleName: string;
  /** 自定义降级 UI（可选） */
  fallback?: ReactNode;
  /** 错误回调（可选） */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

/**
 * SafeAdminWrapper - 管理后台组件包装器
 *
 * 提供统一的错误边界保护，适用于：
 * - AdminDashboard
 * - KnowledgeBase
 * - ToolRegistry
 * - ModelConfig
 * - PromptTemplate
 * - TraceViewer
 */
export function SafeAdminWrapper({
  children,
  moduleName,
  fallback,
  onError,
}: SafeAdminWrapperProps) {
  const defaultFallback = fallback || (
    <div className="p-8">
      <FallbackUI
        moduleName={moduleName}
        style="detailed"
        showRetry={true}
        onRetry={() => window.location.reload()}
      />
    </div>
  );

  return (
    <ErrorBoundary
      moduleName={moduleName}
      fallback={defaultFallback}
      onError={onError}
      showStack={process.env.NODE_ENV === 'development'}
    >
      {children}
    </ErrorBoundary>
  );
}

// ==================== 预设包装器 ====================

/** 仪表盘包装器 */
export function SafeAdminDashboard({ children }: { children: ReactNode }) {
  return (
    <SafeAdminWrapper moduleName="AdminDashboard">
      {children}
    </SafeAdminWrapper>
  );
}

/** 知识库包装器 */
export function SafeKnowledgeBase({ children }: { children: ReactNode }) {
  return (
    <SafeAdminWrapper moduleName="KnowledgeBase">
      {children}
    </SafeAdminWrapper>
  );
}

/** 工具注册包装器 */
export function SafeToolRegistry({ children }: { children: ReactNode }) {
  return (
    <SafeAdminWrapper moduleName="ToolRegistry">
      {children}
    </SafeAdminWrapper>
  );
}

/** 模型配置包装器 */
export function SafeModelConfig({ children }: { children: ReactNode }) {
  return (
    <SafeAdminWrapper moduleName="ModelConfig">
      {children}
    </SafeAdminWrapper>
  );
}

/** Prompt模板包装器 */
export function SafePromptTemplate({ children }: { children: ReactNode }) {
  return (
    <SafeAdminWrapper moduleName="PromptTemplate">
      {children}
    </SafeAdminWrapper>
  );
}

/** 链路追踪包装器 */
export function SafeTraceViewer({ children }: { children: ReactNode }) {
  return (
    <SafeAdminWrapper moduleName="TraceViewer">
      {children}
    </SafeAdminWrapper>
  );
}

export default SafeAdminWrapper;