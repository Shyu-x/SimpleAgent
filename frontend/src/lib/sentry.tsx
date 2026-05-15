/**
 * Sentry 前端监控配置
 * @description 为前端应用集成 Sentry 错误追踪和性能监控
 *
 * 功能特性：
 * - 模块名 tags 自动标记
 * - ErrorBoundary 错误边界集成
 * - tracesSampleRate 采样率配置
 * - Source Map 上传配置
 * - Session 追踪
 *
 * @author AI Chat 玩具团队
 * @date 2026-05-13
 */

// Sentry SDK 导入
import * as Sentry from '@sentry/react';
import { BrowserClient, ErrorBoundary } from '@sentry/react';

/**
 * FallbackError 类型 - 保持与 ErrorBoundary/FallbackUI 兼容
 */
export interface FallbackError {
  message: string;
  stack?: string;
  code?: string;
  timestamp?: number;
}

/**
 * 前端模块枚举 - 用于 Sentry tags 标记
 */
export const FRONTEND_MODULES = {
  // 核心模块
  CHAT: 'chat',                    // 聊天模块
  CHAT_INPUT: 'chat_input',        // 输入框模块
  CHAT_AREA: 'chat_area',          // 聊天区域模块

  // Agent 模块
  AGENT: 'agent',                  // Agent 执行模块
  AGENT_ORCHESTRATOR: 'agent_orchestrator', // Agent 编排器
  TOOL_EXECUTOR: 'tool_executor', // 工具执行器

  // RAG 模块
  RAG: 'rag',                      // 检索增强生成
  RAG_RETRIEVAL: 'rag_retrieval',  // RAG 检索
  RAG_RERANK: 'rag_rerank',       // RAG 重排序

  // 工具和市场模块
  TOOL_REGISTRY: 'tool_registry',  // 工具注册
  TOOL_MARKETPLACE: 'tool_marketplace', // 工具市场
  MCP_TOOLS: 'mcp_tools',          // MCP 工具

  // 管理后台模块
  ADMIN: 'admin',                  // 管理后台
  ADMIN_KB: 'admin_kb',           // 知识库管理
  ADMIN_TOOL: 'admin_tool',       // 工具管理
  ADMIN_MODEL: 'admin_model',      // 模型管理
  ADMIN_PROMPT: 'admin_prompt',    // Prompt 管理
  ADMIN_TRACE: 'admin_trace',      // 链路追踪

  // 系统模块
  UI: 'ui',                        // UI 组件
  STORE: 'store',                  // 状态管理
  API_CLIENT: 'api_client',       // API 客户端
  SSE: 'sse',                      // SSE 连接
  ROUTER: 'router',               // 路由

  // 多 Agent 模块
  MULTI_AGENT: 'multi_agent',     // 多 Agent 系统
  A2A: 'a2a',                     // Agent 间通信
  HITL: 'hitl',                   // 人机协作

  // 其他
  MEMORY: 'memory',               // 记忆系统
  SESSION: 'session',             // 会话管理
  CONFIG: 'config',               // 配置
  AUTH: 'auth',                   // 认证
} as const;

export type FrontendModule = typeof FRONTEND_MODULES[keyof typeof FRONTEND_MODULES];

/**
 * Sentry 配置选项
 */
export interface SentryConfig {
  /** DSN 地址 */
  dsn?: string;
  /** 环境 */
  environment?: 'development' | 'production' | 'staging';
  /** 应用版本 */
  release?: string;
  /** 错误采样率 (0-1) */
  errorSampleRate?: number;
  /** 性能追踪采样率 (0-1) */
  tracesSampleRate?: number;
  /** Profiles 采样率 (0-1) */
  profilesSampleRate?: number;
  /** 是否启用调试模式 */
  debug?: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<SentryConfig> = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || '',
  environment: (process.env.NODE_ENV as 'development' | 'production') || 'development',
  release: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
  errorSampleRate: 1.0,
  tracesSampleRate: 0.1,
  profilesSampleRate: 0.1,
  debug: process.env.NODE_ENV === 'development',
};

/**
 * 初始化 Sentry
 * @param config - 配置选项（可选）
 * @returns Sentry 客户端实例
 */
export function initSentry(config: SentryConfig = {}): BrowserClient | null {
  // 如果没有配置 DSN，不初始化 Sentry
  if (!config.dsn && !DEFAULT_CONFIG.dsn) {
    console.warn('[Sentry] 未配置 DSN，跳过初始化');
    return null;
  }

  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // 初始化 Sentry
  Sentry.init({
    dsn: mergedConfig.dsn || DEFAULT_CONFIG.dsn,

    // 环境配置
    environment: mergedConfig.environment,
    release: mergedConfig.release,

    // 采样率配置
    sampleRate: mergedConfig.errorSampleRate,
    tracesSampleRate: mergedConfig.tracesSampleRate,
    profilesSampleRate: mergedConfig.profilesSampleRate,

    // 调试模式
    debug: mergedConfig.debug,

    // 忽略错误列表
    ignoreErrors: [
      // 网络错误
      'Failed to fetch',
      'Network request failed',
      'NetworkError',
      // 浏览器扩展
      'Extension context invalidated',
      // 取消的请求
      'AbortError',
      'canceled',
    ],

    // 忽略来源
    denyUrls: [
      // 浏览器扩展
      /extensions/i,
      // Chrome 内部页面
      /chrome:\/\//i,
      /safari-extension:/i,
    ],

    // 指标收集
    attachStacktrace: true,
    sendClientReports: true,
  });

  // 设置全局错误处理器
  setupGlobalErrorHandlers();

  console.log('[Sentry] 初始化完成', {
    environment: mergedConfig.environment,
    release: mergedConfig.release,
    errorSampleRate: mergedConfig.errorSampleRate,
    tracesSampleRate: mergedConfig.tracesSampleRate,
  });

  return Sentry.getClient() as BrowserClient;
}

/**
 * 设置全局错误处理器
 */
function setupGlobalErrorHandlers(): void {
  // 处理未捕获的 Promise 错误
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason;

    // 忽略 AbortError
    if (error instanceof DOMException && error.name === 'AbortError') {
      return;
    }

    // 记录错误
    captureError(error, {
      type: 'unhandledrejection',
      promise: true,
    });
  });

  // 处理未捕获的错误
  window.addEventListener('error', (event) => {
    const error = event.error;

    // 忽略资源加载错误
    if (event.target && event.target !== window) {
      return;
    }

    captureError(error, {
      type: 'error',
      promise: false,
    });
  });
}

/**
 * 捕获错误
 * @param error - 错误对象
 * @param context - 上下文信息
 */
export function captureError(
  error: Error | unknown,
  context: {
    type: string;
    promise: boolean;
    module?: FrontendModule;
  }
): void {
  if (!Sentry.getClient()) return;

  // 设置模块标签
  const scope = new Sentry.Scope();
  if (context.module) {
    scope.setTag('module', context.module);
  }

  // 设置额外信息
  scope.setExtra('errorType', context.type);
  scope.setExtra('isUnhandledRejection', context.promise);

  // 根据错误类型设置级别
  scope.setLevel('error');

  // 捕获错误
  if (error instanceof Error) {
    Sentry.captureException(error);
  } else {
    Sentry.captureMessage(String(error));
  }
}

/**
 * 记录模块特定的错误
 * @param module - 模块名
 * @param error - 错误对象
 * @param context - 额外上下文
 */
export function captureModuleError(
  module: FrontendModule,
  error: Error | unknown,
  context?: Record<string, unknown>
): void {
  captureError(error, { type: 'module_error', promise: false, module });

  // 添加额外上下文
  if (context) {
    const scope = new Sentry.Scope();
    scope.setTag('module', module);
    Object.entries(context).forEach(([key, value]) => {
      scope.setExtra(key, value);
    });
    Sentry.captureEvent({
      message: `Module ${module} error context`,
    });
  }
}

/**
 * 记录性能追踪
 * @param module - 模块名
 * @param operation - 操作名称
 * @param duration - 持续时间（毫秒）
 */
export function recordPerformance(
  module: FrontendModule,
  operation: string,
  duration: number
): void {
  if (!Sentry.getClient()) return;

  Sentry.addBreadcrumb({
    category: 'performance',
    message: `${module}:${operation}`,
    data: {
      module,
      operation,
      duration,
      timestamp: Date.now(),
    },
    level: 'info',
  });
}

/**
 * 记录用户行为
 * @param action - 行为名称
 * @param metadata - 元数据
 */
export function recordUserAction(
  action: string,
  metadata?: Record<string, unknown>
): void {
  if (!Sentry.getClient()) return;

  Sentry.addBreadcrumb({
    category: 'user_action',
    message: action,
    data: {
      action,
      ...metadata,
      timestamp: Date.now(),
    },
    level: 'info',
  });
}

/**
 * 创建带模块标记的 Sentry 组件包装器
 * @param WrappedComponent - 要包装的组件
 * @param moduleName - 模块名称
 * @returns 包装后的组件
 */
export function withSentryMonitoring<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  moduleName: FrontendModule
): React.FC<P> {
  return function MonitoredComponent(props: P) {
    return (
      <ErrorBoundary
        fallback={({ error, resetError }) => (
          <ErrorFallback
            error={error as Error | { message?: string; stack?: string }}
            resetError={resetError}
            module={moduleName}
          />
        )}
        onError={(error) => {
          captureModuleError(moduleName, error);
        }}
      >
        <ComponentWithContext componentName={moduleName}>
          <WrappedComponent {...props} />
        </ComponentWithContext>
      </ErrorBoundary>
    );
  };
}

/**
 * 带上下文信息的组件
 */
function ComponentWithContext({
  componentName,
  children,
}: {
  componentName: FrontendModule;
  children: React.ReactNode;
}) {
  // 设置当前模块上下文
  React.useEffect(() => {
    Sentry.setTag('current_module', componentName);
    return () => {
      Sentry.setTag('current_module', '');
    };
  }, [componentName]);

  return <>{children}</>;
}

/**
 * 错误回退组件
 */
function ErrorFallback({
  error,
  resetError,
  module,
}: {
  error: Error | { message?: string; stack?: string };
  resetError: () => void;
  module: FrontendModule;
}) {
  return (
    <div
      style={{
        padding: '20px',
        backgroundColor: '#fee2e2',
        border: '1px solid #ef4444',
        borderRadius: '8px',
        margin: '20px',
      }}
    >
      <h2 style={{ color: '#dc2626' }}>
        模块 {module} 发生错误
      </h2>
      <p style={{ color: '#991b1b' }}>
        {error.message || '未知错误'}
      </p>
      <button
        onClick={resetError}
        style={{
          padding: '8px 16px',
          backgroundColor: '#ef4444',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        重试
      </button>
    </div>
  );
}

/**
 * Sentry ErrorBoundary 组件
 * 用于包装需要错误监控的组件
 */
export { ErrorBoundary };

/**
 * 获取 Sentry 客户端
 */
export function getSentryClient(): BrowserClient | null {
  return Sentry.getClient() as BrowserClient | null;
}

/**
 * 获取当前用户信息（用于设置用户上下文）
 */
export interface UserInfo {
  id: string;
  username?: string;
  email?: string;
  role?: string;
}

/**
 * 设置用户上下文
 * @param user - 用户信息
 */
export function setUserContext(user: UserInfo | null): void {
  if (!Sentry.getClient()) return;

  if (user) {
    Sentry.setUser({
      id: user.id,
      username: user.username,
      email: user.email,
      // 不包含敏感信息
    });
    Sentry.setContext('user', {
      role: user.role,
    });
  } else {
    Sentry.setUser(null);
  }
}

// React 相关导入
import React from 'react';

// ==================== 导出所有功能 ====================

export default {
  initSentry,
  captureError,
  captureModuleError,
  recordPerformance,
  recordUserAction,
  withSentryMonitoring,
  setUserContext,
  FRONTEND_MODULES,
};