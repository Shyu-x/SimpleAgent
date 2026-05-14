/**
 * 特性开关系统
 *
 * 为什么需要特性开关？
 * 1. 灰度发布 - 逐步向用户开放新功能
 * 2. A/B 测试 - 同一功能不同实现对比效果
 * 3. 快速回滚 - 出问题时可以立即关闭功能
 * 4. 环境区分 - 开发/测试/生产不同配置
 * 5. 模块控制 - 控制哪些 Remote 模块可用
 *
 * 使用方式：
 * ```typescript
 * // 1. 在 App 顶层使用 Provider
 * <FeatureFlagsProvider>
 *   <App />
 * </FeatureFlagsProvider>
 *
 * // 2. 在组件中使用 Hook
 * const { isEnabled } = useFeatureFlags();
 * if (isEnabled('new-checkout')) {
 *   return <NewCheckout />;
 * }
 *
 * // 3. 单个开关 Hook
 * const enabled = useFeatureFlag('dark-mode');
 * ```
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode
} from 'react';

// ================================================================
// 类型定义
// ================================================================

/**
 * 特性开关配置
 */
export interface FeatureFlag {
  /** 特性标识符（唯一） */
  key: string;

  /** 是否启用 */
  enabled: boolean;

  /** 变体值（A/B 测试用） */
  variant?: string;

  /** 灰度百分比（0-100） */
  percentage?: number;

  /** 白名单用户 ID 列表 */
  userIds?: string[];

  /** 特性描述 */
  description?: string;

  /** 过期时间（可选，过期后自动禁用） */
  expiresAt?: string;

  /** 元数据（自定义数据） */
  metadata?: Record<string, any>;
}

/**
 * 特性开关配置源
 */
export interface FeatureFlagsConfig {
  /** 特性开关列表 */
  flags: FeatureFlag[];

  /** 最后更新时间 */
  updatedAt: string;

  /** 数据来源 */
  source: 'static' | 'remote' | 'override';
}

/**
 * 特性开关上下文值
 */
interface FeatureFlagsContextValue {
  /** 所有特性开关配置 */
  config: FeatureFlagsConfig;

  /** 是否正在加载远程配置 */
  loading: boolean;

  /** 检查某个特性是否启用 */
  isEnabled: (key: string) => boolean;

  /** 获取特性变体（A/B 测试） */
  getVariant: (key: string) => string | undefined;

  /** 获取特性完整配置 */
  getFlag: (key: string) => FeatureFlag | undefined;

  /** 设置本地覆盖（仅开发环境） */
  setOverride: (key: string, value: Partial<FeatureFlag>) => void;

  /** 清除覆盖 */
  clearOverride: (key: string) => void;

  /** 刷新远程配置 */
  refresh: () => Promise<void>;

  /** 获取所有已启用的特性 */
  getEnabledFlags: () => FeatureFlag[];
}

// ================================================================
// 默认配置
// ================================================================

/**
 * 默认特性开关配置
 *
 * 通过环境变量覆盖默认值：
 * - NEXT_PUBLIC_FF_* = true/false
 * - NEXT_PUBLIC_FF_*_VARIANT = 'A'/'B'
 */
const DEFAULT_FLAGS: FeatureFlag[] = [
  // ---- 新功能开关 ----
  {
    key: 'new-checkout',
    enabled: process.env.NEXT_PUBLIC_FF_NEW_CHECKOUT === 'true',
    description: '新版结账流程（重构）',
    variant: process.env.NEXT_PUBLIC_FF_NEW_CHECKOUT_VARIANT
  },

  {
    key: 'ai-assistant',
    enabled: process.env.NEXT_PUBLIC_FF_AI_ASSISTANT === 'true',
    description: 'AI 助手功能',
    // 灰度发布：只对 20% 用户开放
    percentage: 20
  },

  // ---- UI 特性开关 ----
  {
    key: 'dark-mode',
    enabled: true,
    description: '深色模式支持'
  },

  {
    key: 'compact-ui',
    enabled: false,
    description: '紧凑模式 UI（适合小屏幕）'
  },

  {
    key: 'show-tutorial',
    enabled: true,
    description: '新手引导教程',
    // 对已看过教程的用户关闭
    userIds: []
  },

  // ---- Remote 模块开关 ----
  {
    key: 'module-order-enabled',
    enabled: true,
    description: '订单模块（Module Federation）'
  },

  {
    key: 'module-user-enabled',
    enabled: true,
    description: '用户模块（Module Federation）'
  },

  {
    key: 'module-payment-enabled',
    enabled: process.env.NEXT_PUBLIC_FF_PAYMENT_V2 === 'true',
    description: '支付模块 V2（Module Federation）',
    // 支付模块需要额外验证
    metadata: {
      requiresAuth: true,
      minTrustLevel: 'verified'
    }
  },

  // ---- 实验性功能 ----
  {
    key: 'realtime-collaboration',
    enabled: false,
    description: '实时协作功能（实验中）',
    expiresAt: '2026-06-01T00:00:00Z'  // 2026-06-01 到期
  },

  {
    key: 'advanced-analytics',
    enabled: process.env.NEXT_PUBLIC_FF_ANALYTICS === 'true',
    description: '高级数据分析功能',
    // 白名单用户（内部人员）
    userIds: ['user-internal-001', 'user-internal-002']
  },

  // ---- 性能优化开关 ----
  {
    key: 'lazy-load-images',
    enabled: true,
    description: '图片懒加载优化'
  },

  {
    key: 'prefetch-routes',
    enabled: true,
    description: '路由预加载优化'
  },

  // ---- 调试开关（仅开发环境）----
  {
    key: 'show-devtools',
    enabled: process.env.NODE_ENV === 'development',
    description: '开发者工具面板'
  },

  {
    key: 'debug-mf-loading',
    enabled: process.env.NODE_ENV === 'development' &&
              process.env.DEBUG_MF === 'true',
    description: 'Module Federation 加载调试日志'
  }
];

// ================================================================
// Context
// ================================================================

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null);

// ================================================================
// Provider 组件
// ================================================================

interface FeatureFlagsProviderProps {
  children: ReactNode;

  /** 初始特性开关（可选，用于 SSR） */
  initialFlags?: FeatureFlag[];

  /** 远程配置 URL（可选，用于动态配置） */
  remoteConfigUrl?: string;

  /** 远程配置刷新间隔（毫秒，0 = 不自动刷新） */
  refreshInterval?: number;

  /** 覆盖来源标识（用于追踪） */
  overrideSource?: string;
}

/**
 * 特性开关 Provider
 *
 * @example
 * ```tsx
 * // 基础用法
 * <FeatureFlagsProvider>
 *   <App />
 * </FeatureFlagsProvider>
 *
 * // 带远程配置
 * <FeatureFlagsProvider
 *   remoteConfigUrl="https://api.example.com/feature-flags"
 *   refreshInterval={60000}  // 每分钟刷新
 * >
 *   <App />
 * </FeatureFlagsProvider>
 * ```
 */
export function FeatureFlagsProvider({
  children,
  initialFlags,
  remoteConfigUrl,
  refreshInterval = 0,
  overrideSource = 'unknown'
}: FeatureFlagsProviderProps) {
  // ---- 状态 ----
  const [config, setConfig] = useState<FeatureFlagsConfig>({
    flags: initialFlags || DEFAULT_FLAGS,
    updatedAt: new Date().toISOString(),
    source: 'static'
  });

  const [loading, setLoading] = useState(false);

  // 本地覆盖（开发环境用）
  // 格式：{ 'key': { enabled: true, variant: 'A' } }
  const [overrides, setOverrides] = useState<Record<string, Partial<FeatureFlag>>>({});

  // ---- 计算函数 ----

  /**
   * 获取当前用户 ID
   * TODO: 从 Auth Context 或 zustand store 获取
   */
  const getCurrentUserId = useCallback((): string => {
    // 尝试从 window 对象获取（由后端注入）
    if (typeof window !== 'undefined') {
      return (window as any).__USER_ID__ || '';
    }
    return '';
  }, []);

  /**
   * 计算字符串哈希（用于灰度百分比分配）
   * 确保同一用户对同一特性总是分配到同一 bucket
   */
  const computeHash = useCallback((key: string, userId: string): number => {
    const str = `${key}:${userId || 'anonymous'}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;  // 转成 32 位整数
    }
    return Math.abs(hash) % 100;
  }, []);

  /**
   * 检查特性是否启用
   *
   * 优先级（从高到低）：
   * 1. 本地覆盖（开发环境）
   * 2. 白名单用户
   * 3. 灰度百分比
   * 4. enabled 字段
   */
  const isEnabled = useCallback((key: string): boolean => {
    // 1. 检查本地覆盖
    if (key in overrides) {
      const override = overrides[key];
      if ('enabled' in override) {
        return override.enabled!;
      }
    }

    // 2. 查找特性配置
    const flag = config.flags.find(f => f.key === key);
    if (!flag) {
      // 未定义的特性默认关闭
      return false;
    }

    // 3. 检查过期时间
    if (flag.expiresAt) {
      const expiresAt = new Date(flag.expiresAt);
      if (expiresAt < new Date()) {
        console.log(`[FeatureFlags] Flag "${key}" has expired`);
        return false;
      }
    }

    // 4. 检查白名单用户
    if (flag.userIds && flag.userIds.length > 0) {
      const currentUserId = getCurrentUserId();
      if (currentUserId && flag.userIds.includes(currentUserId)) {
        return true;
      }
    }

    // 5. 检查灰度百分比
    if (typeof flag.percentage === 'number' && flag.percentage > 0) {
      const bucket = computeHash(key, getCurrentUserId());
      const inBucket = bucket < flag.percentage;
      if (process.env.NODE_ENV === 'development') {
        console.log(`[FeatureFlags] "${key}" bucket=${bucket} threshold=${flag.percentage} in=${inBucket}`);
      }
      return inBucket;
    }

    // 6. 返回 enabled 字段
    return flag.enabled ?? false;
  }, [config.flags, overrides, getCurrentUserId, computeHash]);

  /**
   * 获取特性变体（A/B 测试）
   */
  const getVariant = useCallback((key: string): string | undefined => {
    // 1. 检查本地覆盖
    if (key in overrides && 'variant' in overrides[key]) {
      return overrides[key].variant;
    }

    // 2. 查找特性配置
    const flag = config.flags.find(f => f.key === key);
    return flag?.variant;
  }, [config.flags, overrides]);

  /**
   * 获取特性完整配置
   */
  const getFlag = useCallback((key: string): FeatureFlag | undefined => {
    // 检查覆盖
    if (key in overrides) {
      const flag = config.flags.find(f => f.key === key);
      if (flag) {
        return { ...flag, ...overrides[key] };
      }
    }

    return config.flags.find(f => f.key === key);
  }, [config.flags, overrides]);

  /**
   * 获取所有已启用的特性
   */
  const getEnabledFlags = useCallback((): FeatureFlag[] => {
    return config.flags.filter(flag => isEnabled(flag.key));
  }, [config.flags, isEnabled]);

  /**
   * 设置本地覆盖（仅开发环境）
   */
  const setOverride = useCallback((key: string, value: Partial<FeatureFlag>) => {
    if (process.env.NODE_ENV !== 'production') {
      setOverrides(prev => ({
        ...prev,
        [key]: { ...prev[key], ...value }
      }));
      console.log(`[FeatureFlags] Override: ${key} = ${JSON.stringify(value)}`);
    }
  }, []);

  /**
   * 清除覆盖
   */
  const clearOverride = useCallback((key: string) => {
    if (process.env.NODE_ENV !== 'production') {
      setOverrides(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      console.log(`[FeatureFlags] Clear override: ${key}`);
    }
  }, []);

  /**
   * 从远程刷新配置
   */
  const refresh = useCallback(async () => {
    if (!remoteConfigUrl) return;

    setLoading(true);
    try {
      const response = await fetch(remoteConfigUrl, {
        // 缓存控制
        cache: 'no-cache',
        // 带上 credentials（如果需要认证）
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // 合并远程配置（远程配置优先级更高）
      setConfig({
        flags: data.flags || DEFAULT_FLAGS,
        updatedAt: new Date().toISOString(),
        source: 'remote'
      });

      console.log('[FeatureFlags] Remote config loaded');
    } catch (error) {
      console.error('[FeatureFlags] Failed to fetch remote config:', error);
      // 失败时保持现有配置
    } finally {
      setLoading(false);
    }
  }, [remoteConfigUrl]);

  /**
   * 定时刷新
   */
  useEffect(() => {
    if (refreshInterval > 0 && remoteConfigUrl) {
      const interval = setInterval(refresh, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, remoteConfigUrl, refresh]);

  // ---- 上下文值 ----
  const value = useMemo((): FeatureFlagsContextValue => ({
    config,
    loading,
    isEnabled,
    getVariant,
    getFlag,
    setOverride,
    clearOverride,
    refresh,
    getEnabledFlags
  }), [config, loading, isEnabled, getVariant, getFlag, setOverride, clearOverride, refresh, getEnabledFlags]);

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

// ================================================================
// Hooks
// ================================================================

/**
 * 使用特性开关上下文
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isEnabled, getVariant, getEnabledFlags } = useFeatureFlags();
 *
 *   // 检查单个开关
 *   const showNewFeature = isEnabled('new-checkout');
 *
 *   // 获取变体
 *   const variant = getVariant('ai-assistant');
 *
 *   // 获取所有已启用的开关
 *   const enabled = getEnabledFlags();
 *
 *   // ...
 * }
 * ```
 */
export function useFeatureFlags(): FeatureFlagsContextValue {
  const context = useContext(FeatureFlagsContext);

  if (!context) {
    throw new Error(
      'useFeatureFlags must be used within a FeatureFlagsProvider. ' +
      'Wrap your app with <FeatureFlagsProvider> to fix this error.'
    );
  }

  return context;
}

/**
 * 使用单个特性开关
 *
 * @param key 特性标识符
 * @returns boolean 是否启用
 *
 * @example
 * ```tsx
 * // 简单用法
 * const enabled = useFeatureFlag('dark-mode');
 *
 * // 在条件渲染中使用
 * {enabled && <NewFeature />}
 *
 * // 配合 Module Federation 使用
 * {useFeatureFlag('module-order-enabled') && (
 *   <Suspense fallback={<Loading />}>
 *     <OrderList />
 *   </Suspense>
 * )}
 * ```
 */
export function useFeatureFlag(key: string): boolean {
  const { isEnabled } = useFeatureFlags();
  return isEnabled(key);
}

/**
 * 使用特性变体
 *
 * @param key 特性标识符
 * @returns string 变体值或 undefined
 *
 * @example
 * ```tsx
 * const variant = useFeatureVariant('new-checkout');
 *
 * switch (variant) {
 *   case 'A': return <CheckoutA />;
 *   case 'B': return <CheckoutB />;
 *   default: return <LegacyCheckout />;
 * }
 * ```
 */
export function useFeatureVariant(key: string): string | undefined {
  const { getVariant } = useFeatureFlags();
  return getVariant(key);
}

/**
 * 使用特性配置（包含元数据）
 *
 * @param key 特性标识符
 * @returns FeatureFlag 完整配置或 undefined
 *
 * @example
 * ```tsx
 * const flag = useFeatureFlagConfig('module-payment-enabled');
 *
 * if (flag?.metadata?.requiresAuth) {
 *   // 检查用户是否已认证
 * }
 * ```
 */
export function useFeatureFlagConfig(key: string): FeatureFlag | undefined {
  const { getFlag } = useFeatureFlags();
  return getFlag(key);
}

// ================================================================
// 组件
// ================================================================

interface FeatureGateProps {
  /** 特性标识符 */
  featureKey: string;

  /** 特性启用时显示的内容 */
  children: ReactNode;

  /** 特性禁用时显示的内容（可选） */
  fallback?: ReactNode;

  /** 是否使用反向逻辑（禁用时显示 children） */
  inverse?: boolean;
}

/**
 * 特性门控组件
 *
 * 根据特性开关决定是否渲染内容
 *
 * @example
 * ```tsx
 * // 特性启用时显示 children
 * <FeatureGate featureKey="new-checkout">
 *   <NewCheckout />
 * </FeatureGate>
 *
 * // 特性禁用时显示 fallback
 * <FeatureGate
 *   featureKey="ai-assistant"
 *   fallback={<LegacyChat />}
 * >
 *   <AIAssistant />
 * </FeatureGate>
 *
 * // 反向逻辑（特性禁用时显示）
 * <FeatureGate featureKey="debug-mode" inverse>
 *   <DebugPanel />
 * </FeatureGate>
 * ```
 */
export function FeatureGate({
  featureKey,
  children,
  fallback = null,
  inverse = false
}: FeatureGateProps) {
  const enabled = useFeatureFlag(featureKey);
  const shouldRender = inverse ? !enabled : enabled;

  return shouldRender ? <>{children}</> : <>{fallback}</>;
}

/**
 * Remote 模块特性门控
 *
 * 专门用于 Module Federation Remote 模块的条件加载
 *
 * @example
 * ```tsx
 * <RemoteFeatureGate
 *   featureKey="module-order-enabled"
 *   remoteModule="remote-order/OrderList"
 *   fallback={<OrderListLegacy />}
 * />
 * ```
 */
export function RemoteFeatureGate({
  featureKey,
  remoteModule,
  fallback = null,
  loadingFallback = <div>加载模块中...</div>
}: {
  featureKey: string;
  remoteModule: () => Promise<any>;
  fallback?: ReactNode;
  loadingFallback?: ReactNode;
}) {
  const enabled = useFeatureFlag(featureKey);

  // 特性未启用时显示降级
  if (!enabled) {
    return <>{fallback}</>;
  }

  // 懒加载 Remote 模块
  return (
    <React.Suspense fallback={loadingFallback}>
      <RemoteModuleLoader remoteModule={remoteModule} />
    </React.Suspense>
  );
}

// 内部组件：加载 Remote 模块
function RemoteModuleLoader({ remoteModule }: { remoteModule: () => Promise<any> }) {
  const [Component, setComponent] = React.useState<React.ComponentType | null>(null);
  const [error, setError] = React.useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const mod = await remoteModule();
        if (!cancelled) {
          setComponent(() => mod.default || mod);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
          console.error('[RemoteFeatureGate] Load failed:', err);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [remoteModule]);

  if (error) {
    return (
      <div style={{
        padding: '20px',
        textAlign: 'center',
        color: '#c00',
        background: '#fee',
        borderRadius: '8px'
      }}>
        <h4>模块加载失败</h4>
        <p style={{ fontSize: '14px', color: '#666' }}>
          请检查网络连接或刷新页面重试
        </p>
      </div>
    );
  }

  if (!Component) {
    return null;
  }

  return <Component />;
}

// ================================================================
// 开发工具
// ================================================================

/**
 * 特性开关调试面板（开发环境）
 *
 * 按 Ctrl+Shift+F 打开调试面板
 *
 * @example
 * ```tsx
 * // 在 App 根组件中添加
 * <FeatureFlagsProvider>
 *   <App />
 *   <FeatureFlagsDevtools />
 * </FeatureFlagsProvider>
 * ```
 */
export function FeatureFlagsDevtools() {
  const { config, isEnabled, setOverride, clearOverride, refresh, loading } = useFeatureFlags();

  // 键盘快捷键：Ctrl+Shift+F 打开面板
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        toggleDevtools();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 开发环境渲染空组件（实际面板通过 portal 渲染）
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  // TODO: 实现实际的调试面板 UI
  // 可以用 Modal + 表格展示所有特性开关，支持手动覆盖

  console.log(
    '%c[FeatureFlags] Devtools available (Ctrl+Shift+F)',
    'color: gray; font-size: 12px;'
  );

  return null;
}

// ================================================================
// 与 Module Federation 集成
// ================================================================

/**
 * Remote 模块初始化参数类型
 */
export interface RemoteInitParams {
  featureFlags: FeatureFlagsConfig;
  user?: {
    id: string;
    name: string;
    roles: string[];
  };
  host: {
    version: string;
    env: 'development' | 'production' | 'staging';
  };
}

/**
 * 获取 Remote 模块的初始化参数
 * 在 Remote 模块的 bootstrap.ts 中调用
 */
export function getRemoteInitParams(): RemoteInitParams | null {
  return (window as any).__MF_INIT_PARAMS__ || null;
}

/**
 * Remote 模块中检查特性开关
 */
export function useRemoteFeatureFlag(key: string): boolean {
  const params = getRemoteInitParams();

  if (!params) {
    console.warn('[FeatureFlags] Remote init params not found');
    return false;
  }

  const flag = params.featureFlags.flags.find(f => f.key === key);

  if (!flag) {
    return false;
  }

  // 检查过期
  if (flag.expiresAt && new Date(flag.expiresAt) < new Date()) {
    return false;
  }

  // 检查白名单
  if (flag.userIds && flag.userIds.length > 0 && params.user) {
    return flag.userIds.includes(params.user.id);
  }

  // 检查灰度
  if (typeof flag.percentage === 'number' && flag.percentage > 0) {
    const hash = computeHashStatic(key, params.user?.id || 'anonymous');
    return hash < flag.percentage;
  }

  return flag.enabled;
}

// 辅助函数：计算 hash（同步版）
function computeHashStatic(key: string, userId: string): number {
  const str = `${key}:${userId}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash) % 100;
}

// ================================================================
// 导出
// ================================================================

export default {
  FeatureFlagsProvider,
  useFeatureFlags,
  useFeatureFlag,
  useFeatureVariant,
  useFeatureFlagConfig,
  FeatureGate,
  RemoteFeatureGate,
  FeatureFlagsDevtools,
  getRemoteInitParams,
  useRemoteFeatureFlag
};