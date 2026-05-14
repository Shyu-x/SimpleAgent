'use client';

/**
 * ModuleLoader 组件 - 懒加载远程模块
 *
 * 功能特性：
 * - React.lazy 懒加载远程模块
 * - 加载失败降级 FallbackUI
 * - Suspense 集成
 * - 超时处理
 * - 重试机制
 * - 预加载支持
 *
 * 使用场景：
 * - 大型组件按需加载
 * - 第三方组件懒加载
 * - 多语言组件懒加载
 * - 路由级代码分割
 */

import React, {
  Suspense,
  lazy,
  ComponentType,
  ReactNode,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { FallbackUI, FallbackError } from '../components/FallbackUI';

// ==================== 类型定义 ====================

/** 加载状态 */
export type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

/** 模块加载配置 */
export interface ModuleLoaderConfig {
  /** 模块名称（用于标识和日志） */
  moduleName: string;
  /** 导入函数（返回 Promise） */
  importFn: () => Promise<{ default: ComponentType<any> }>;
  /** 超时时间（毫秒，默认 30000） */
  timeout?: number;
  /** 最大重试次数（默认 3） */
  maxRetries?: number;
  /** 重试延迟（毫秒，默认 1000） */
  retryDelay?: number;
  /** 是否启用预加载 */
  enablePreload?: boolean;
  /** 加载中显示的占位符（可选） */
  placeholder?: ReactNode;
  /** 自定义降级 UI（可选） */
  fallback?: ReactNode;
  /** 加载成功回调 */
  onLoaded?: (component: ComponentType<any>) => void;
  /** 加载失败回调 */
  onError?: (error: Error) => void;
  /** 加载开始回调 */
  onLoading?: () => void;
}

/** ModuleLoader Props */
export interface ModuleLoaderProps {
  /** 子组件 Props（透传给加载的组件） */
  [key: string]: any;
}

// ==================== 模块缓存 ====================

/** 已加载模块缓存 */
const moduleCache = new Map<string, ComponentType<any>>();

/** 预加载中的模块 */
const preloadingModules = new Set<string>();

/**
 * 预加载模块（静默预加载，不阻塞渲染）
 *
 * @param importFn - 导入函数
 * @param moduleName - 模块名称
 *
 * @example
 * ```tsx
 * // 在父组件中预加载
 * useEffect(() => {
 *   preloadModule(() => import('./HeavyChart'), 'HeavyChart');
 * }, []);
 *
 * // 子组件使用 ModuleLoader
 * <ModuleLoader moduleName="HeavyChart" importFn={() => import('./HeavyChart')} />
 * ```
 */
export function preloadModule(
  importFn: () => Promise<{ default: ComponentType<any> }>,
  moduleName: string
): void {
  // 如果已经缓存，直接返回
  if (moduleCache.has(moduleName)) {
    return;
  }

  // 如果正在预加载，不重复加载
  if (preloadingModules.has(moduleName)) {
    return;
  }

  preloadingModules.add(moduleName);

  importFn()
    .then((module) => {
      moduleCache.set(moduleName, module.default);
      preloadingModules.delete(moduleName);
    })
    .catch((error) => {
      console.error(`[ModuleLoader] 预加载失败: ${moduleName}`, error);
      preloadingModules.delete(moduleName);
    });
}

// ==================== useModuleLoader Hook ====================

/**
 * useModuleLoader - 模块加载状态管理 Hook
 *
 * @param config - 模块加载配置
 * @returns 加载状态和方法
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { component, loadState, error, retry, isLoading } = useModuleLoader({
 *     moduleName: 'HeavyChart',
 *     importFn: () => import('./HeavyChart'),
 *   });
 *
 *   if (isLoading) return <LoadingSpinner />;
 *   if (error) return <ErrorFallback error={error} onRetry={retry} />;
 *   if (component) return <component />;
 *
 *   return null;
 * }
 * ```
 */
export function useModuleLoader(config: ModuleLoaderConfig) {
  const {
    moduleName,
    importFn,
    timeout = 30000,
    maxRetries = 3,
    retryDelay = 1000,
    onLoaded,
    onError,
    onLoading,
  } = config;

  // 加载状态
  const [loadState, setLoadState] = useState<LoadState>('idle');
  // 加载的组件
  const [component, setComponent] = useState<ComponentType<any> | null>(null);
  // 错误信息
  const [error, setError] = useState<FallbackError | null>(null);
  // 重试次数
  const [retryCount, setRetryCount] = useState(0);
  // 超时定时器
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 清除超时定时器
  const clearTimeoutTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // 加载模块
  const loadModule = useCallback(async () => {
    // 检查缓存
    const cached = moduleCache.get(moduleName);
    if (cached) {
      setComponent(cached);
      setLoadState('loaded');
      onLoaded?.(cached);
      return;
    }

    setLoadState('loading');
    onLoading?.();

    // 设置超时
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutRef.current = setTimeout(() => {
        reject(new Error(`模块加载超时: ${moduleName} (${timeout}ms)`));
      }, timeout);
    });

    try {
      // 竞速：模块加载 vs 超时
      const loadedModule = await Promise.race([
        importFn(),
        timeoutPromise,
      ]);

      clearTimeoutTimer();

      // 缓存组件
      moduleCache.set(moduleName, loadedModule.default);
      setComponent(loadedModule.default);
      setLoadState('loaded');
      setError(null);
      onLoaded?.(loadedModule.default);
    } catch (err) {
      clearTimeoutTimer();

      const error = err instanceof Error ? err : new Error(String(err));

      // 如果还有重试次数，尝试重试
      if (retryCount < maxRetries) {
        console.warn(`[ModuleLoader] ${moduleName} 加载失败，${retryDelay}ms 后重试 (${retryCount + 1}/${maxRetries})`);

        setTimeout(() => {
          setRetryCount((prev) => prev + 1);
          loadModule();
        }, retryDelay);

        return;
      }

      // 重试次数用完，记录错误
      console.error(`[ModuleLoader] ${moduleName} 加载失败，已重试 ${maxRetries} 次`, error);

      setError({
        message: error.message,
        stack: error.stack,
        code: 'MODULE_LOAD_ERROR',
        timestamp: Date.now(),
      });
      setLoadState('error');
      setComponent(null);
      onError?.(error);
    }
  }, [
    moduleName,
    importFn,
    timeout,
    maxRetries,
    retryDelay,
    onLoaded,
    onError,
    onLoading,
    clearTimeoutTimer,
  ]);

  // 初始加载
  useEffect(() => {
    loadModule();

    return () => {
      clearTimeoutTimer();
    };
  }, []);

  // 重试函数
  const retry = useCallback(() => {
    setRetryCount(0);
    loadModule();
  }, [loadModule]);

  return {
    // 当前加载的组件
    component,
    // 加载状态
    loadState,
    // 错误信息
    error,
    // 是否正在加载
    isLoading: loadState === 'loading',
    // 是否加载成功
    isLoaded: loadState === 'loaded',
    // 是否加载失败
    isError: loadState === 'error',
    // 重试次数
    retryCount,
    // 重试函数
    retry,
    // 重新加载（等同于 retry）
    reload: retry,
  };
}

// ==================== ModuleLoader 组件 ====================

/**
 * ModuleLoader - 模块加载组件
 *
 * 结合 React.Suspense 和错误处理，提供完整的模块加载体验
 */
export const ModuleLoader: React.FC<ModuleLoaderConfig & ModuleLoaderProps> = ({
  moduleName,
  importFn,
  timeout = 30000,
  maxRetries = 3,
  retryDelay = 1000,
  enablePreload = false,
  placeholder,
  fallback,
  onLoaded,
  onError,
  onLoading,
  ...props
}) => {
  const { component, loadState, error, isLoading, retry } = useModuleLoader({
    moduleName,
    importFn,
    timeout,
    maxRetries,
    retryDelay,
    onLoaded,
    onError,
    onLoading,
  });

  // 预加载效果
  useEffect(() => {
    if (enablePreload && loadState === 'idle') {
      preloadModule(importFn, moduleName);
    }
  }, [enablePreload, loadState, importFn, moduleName]);

  // 加载中状态
  if (loadState === 'loading') {
    if (placeholder) {
      return <>{placeholder}</>;
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] p-8">
        {/* 加载动画 */}
        <div className="relative w-16 h-16 mb-4">
          <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
        </div>
        <p className="text-sm text-muted-foreground">正在加载 {moduleName}...</p>
      </div>
    );
  }

  // 加载失败状态
  if (loadState === 'error' && error) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <FallbackUI
        moduleName={moduleName}
        error={error}
        onRetry={retry}
        showRetry={true}
      />
    );
  }

  // 加载成功
  if (component) {
    const Component = component as React.ComponentType<Record<string, unknown>>;
    return <Component {...props} />;
  }

  // 默认返回空
  return null;
};

// ==================== 懒加载包装器 ====================

/**
 * createLazyComponent - 创建懒加载组件
 *
 * 使用 React.lazy 进行代码分割，配合 ModuleLoader 提供更好的加载体验
 *
 * @param importFn - 动态导入函数
 * @param moduleName - 模块名称
 * @param fallback - 加载占位符
 * @returns React.lazy 组件
 *
 * @example
 * ```tsx
 * const HeavyChart = createLazyComponent(
 *   () => import('./HeavyChart'),
 *   'HeavyChart',
 *   <LoadingSpinner />
 * );
 *
 * // 使用
 * <Suspense fallback={<LoadingSpinner />}>
 *   <HeavyChart />
 * </Suspense>
 * ```
 */
export function createLazyComponent(
  importFn: () => Promise<{ default: ComponentType<any> }>,
  moduleName: string,
  fallback?: ReactNode
): React.LazyExoticComponent<ComponentType<any>> {
  const LazyComponent = lazy(async () => {
    try {
      const loadedModule = await importFn();
      moduleCache.set(moduleName, loadedModule.default);
      return loadedModule;
    } catch (error) {
      console.error(`[ModuleLoader] createLazyComponent 加载失败: ${moduleName}`, error);
      throw error;
    }
  });

  // 设置 displayName
  Object.defineProperty(LazyComponent, 'displayName', {
    value: `Lazy(${moduleName})`,
    writable: false,
  });

  return LazyComponent;
}

// ==================== 预设懒加载组件工厂 ====================

/**
 * 创建一个带有默认 ErrorBoundary 的懒加载组件
 *
 * @param importFn - 动态导入函数
 * @param moduleName - 模块名称
 * @param fallbackProps - 自定义 FallbackUI 配置
 * @returns React.Suspense 包裹的组件
 *
 * @example
 * ```tsx
 * const SafeHeavyChart = createSafeLazyComponent(
 *   () => import('./HeavyChart'),
 *   'HeavyChart',
 *   { style: 'card', showRetry: true }
 * );
 *
 * return <SafeHeavyChart data={data} />;
 * ```
 */
export function createSafeLazyComponent(
  importFn: () => Promise<{ default: ComponentType<any> }>,
  moduleName: string,
  fallbackProps?: Partial<React.ComponentProps<typeof FallbackUI>>
) {
  const LazyComponent = createLazyComponent(importFn, moduleName);

  return function SafeLazyWrapper(props: any) {
    return (
      <Suspense
        fallback={
          fallbackProps?.message ? (
            <FallbackUI moduleName={moduleName} message={fallbackProps.message} />
          ) : (
            <div className="flex items-center justify-center p-8">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          )
        }
      >
        <ModuleLoader
          moduleName={moduleName}
          importFn={importFn}
          fallback={<FallbackUI moduleName={moduleName} {...fallbackProps} />}
          {...props}
        />
      </Suspense>
    );
  };
}

// ==================== 批量加载组件 ====================

/**
 * BatchLoader - 批量加载多个模块
 *
 * @param configs - 模块配置数组
 * @returns 加载状态和组件映射
 *
 * @example
 * ```tsx
 * const { components, loadingStates, errors, retry } = useBatchLoader([
 *   { moduleName: 'Chart', importFn: () => import('./Chart') },
 *   { moduleName: 'Table', importFn: () => import('./Table') },
 *   { moduleName: 'Graph', importFn: () => import('./Graph') },
 * ]);
 * ```
 */
export function useBatchLoader(
  configs: Array<{
    moduleName: string;
    importFn: () => Promise<{ default: ComponentType<any> }>;
  }>
) {
  const [results, setResults] = useState<
    Map<string, { component: ComponentType<any> | null; error: FallbackError | null; loadState: LoadState }>
  >(new Map());

  useEffect(() => {
    const loadAll = async () => {
      const promises = configs.map(async (config) => {
        try {
          const loadedModule = await config.importFn();
          moduleCache.set(config.moduleName, loadedModule.default);
          return {
            moduleName: config.moduleName,
            result: {
              component: loadedModule.default,
              error: null,
              loadState: 'loaded' as LoadState,
            },
          };
        } catch (error) {
          return {
            moduleName: config.moduleName,
            result: {
              component: null,
              error: {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
              },
              loadState: 'error' as LoadState,
            },
          };
        }
      });

      const settled = await Promise.all(promises);
      const newMap = new Map<string, { component: ComponentType<any> | null; error: FallbackError | null; loadState: LoadState }>();

      settled.forEach(({ moduleName, result }) => {
        newMap.set(moduleName, result);
      });

      setResults(newMap);
    };

    loadAll();
  }, [configs]);

  // 获取单个模块的组件
  const getComponent = (moduleName: string) => {
    return results.get(moduleName)?.component || null;
  };

  // 获取单个模块的错误
  const getError = (moduleName: string) => {
    return results.get(moduleName)?.error || null;
  };

  // 获取单个模块的加载状态
  const getLoadState = (moduleName: string) => {
    return results.get(moduleName)?.loadState || 'idle';
  };

  // 是否有任意模块正在加载
  const isAnyLoading = () => {
    return Array.from(results.values()).some((r) => r.loadState === 'loading');
  };

  // 是否有任意模块加载失败
  const hasAnyError = () => {
    return Array.from(results.values()).some((r) => r.loadState === 'error');
  };

  // 重新加载单个模块
  const retryModule = async (moduleName: string) => {
    const config = configs.find((c) => c.moduleName === moduleName);
    if (!config) return;

    // 清空该模块的状态
    setResults((prev) => {
      const newMap = new Map(prev);
      newMap.set(moduleName, { component: null, error: null, loadState: 'loading' });
      return newMap;
    });

    try {
      const loadedModule = await config.importFn();
      moduleCache.set(moduleName, loadedModule.default);
      setResults((prev) => {
        const newMap = new Map(prev);
        newMap.set(moduleName, { component: loadedModule.default, error: null, loadState: 'loaded' });
        return newMap;
      });
    } catch (error) {
      setResults((prev) => {
        const newMap = new Map(prev);
        newMap.set(moduleName, {
          component: null,
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
          loadState: 'error',
        });
        return newMap;
      });
    }
  };

  return {
    // 组件映射
    components: results,
    // 获取方法
    getComponent,
    getError,
    getLoadState,
    // 状态查询
    isAnyLoading,
    hasAnyError,
    // 重试
    retryModule,
    // 获取所有已加载组件
    getLoadedComponents: () => {
      const loaded: Record<string, ComponentType<any>> = {};
      results.forEach((value, key) => {
        if (value.component && value.loadState === 'loaded') {
          loaded[key] = value.component;
        }
      });
      return loaded;
    },
  };
}

// ==================== 缓存管理 ====================

/**
 * 清除模块缓存
 */
export function clearModuleCache(): void {
  moduleCache.clear();
  console.log('[ModuleLoader] 模块缓存已清除');
}

/**
 * 获取缓存的模块
 */
export function getCachedModule(moduleName: string): ComponentType<any> | undefined {
  return moduleCache.get(moduleName);
}

/**
 * 检查模块是否已缓存
 */
export function isModuleCached(moduleName: string): boolean {
  return moduleCache.has(moduleName);
}

// ==================== 默认导出 ====================

export default ModuleLoader;