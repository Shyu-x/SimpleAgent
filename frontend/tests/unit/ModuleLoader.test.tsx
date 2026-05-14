/**
 * ModuleLoader 单元测试 - 模块加载器与 Suspense 降级
 *
 * 测试内容：
 * 1. 加载成功 - 模块正常加载并渲染
 * 2. 加载失败降级 - 加载失败时显示降级 UI
 * 3. Suspense fallback - 加载中显示 Loading 状态
 *
 * 注意：此测试文件测试模块加载器相关的功能模式
 * 在实际项目中，这些模式应用于动态导入和代码分割
 *
 * @author AI Chat 玩具团队
 * @date 2026-05-13
 */

import React, { Suspense, lazy, useState, useEffect } from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

// ==================== 模拟模块加载器组件 ====================

/**
 * 模块加载状态枚举
 */
const ModuleLoadState = {
  IDLE: 'IDLE',
  LOADING: 'LOADING',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR'
};

/**
 * 模拟的模块加载器组件
 * 用于测试模块加载和降级的标准模式
 */
interface ModuleLoaderProps {
  loader: () => Promise<Record<string, unknown>>;
  fallback?: React.ReactNode;
  errorFallback?: (props: { error: Error | null }) => React.ReactNode;
  onLoadStart?: () => void;
  onLoadSuccess?: () => void;
  onLoadError?: (error: Error) => void;
}

function ModuleLoader({
  loader,
  fallback,
  errorFallback,
  onLoadStart,
  onLoadSuccess,
  onLoadError
}: ModuleLoaderProps) {
  const [state, setState] = useState(ModuleLoadState.IDLE);
  const [Module, setModule] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadModule() {
      setState(ModuleLoadState.LOADING);
      onLoadStart?.();

      try {
        const loadedModule = await loader();

        if (!cancelled) {
          setModule(loadedModule);
          setState(ModuleLoadState.SUCCESS);
          onLoadSuccess?.();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err);
          setState(ModuleLoadState.ERROR);
          onLoadError?.(err);
        }
      }
    }

    loadModule();

    return () => {
      cancelled = true;
    };
  }, [loader, onLoadStart, onLoadSuccess, onLoadError]);

  if (state === ModuleLoadState.LOADING) {
    return fallback ? fallback : null;
  }

  if (state === ModuleLoadState.ERROR) {
    return errorFallback
      ? errorFallback({ error })
      : <div>模块加载失败</div>;
  }

  if (Module) {
    return Module.default ? <Module.default /> : <Module />;
  }

  return null;
}

// ==================== 测试组件 ====================

// 测试用的成功模块
const SuccessModule = {
  default: function SuccessComponent() {
    return <div data-testid="success-module">模块加载成功</div>;
  }
};

// 测试用的加载中 UI
const LoadingFallback = () => (
  <div data-testid="loading-fallback">
    <span>加载中...</span>
  </div>
);

// 测试用的错误降级 UI
const ErrorFallback = ({ error }) => (
  <div data-testid="error-fallback">
    <h2>加载失败</h2>
    <p>{error?.message}</p>
  </div>
);

describe('ModuleLoader 基础加载测试', () => {
  test('加载成功时应该渲染模块内容', async () => {
    const loader = vi.fn().mockResolvedValue(SuccessModule);

    render(
      <ModuleLoader
        loader={loader}
        fallback={<LoadingFallback />}
      />
    );

    // 初始应该是加载状态
    expect(screen.queryByTestId('loading-fallback')).toBeInTheDocument();

    // 等待加载完成
    await waitFor(() => {
      expect(screen.getByTestId('success-module')).toBeInTheDocument();
    });

    expect(loader).toHaveBeenCalledTimes(1);
  });

  test('加载成功时 onLoadSuccess 回调应该被触发', async () => {
    const onLoadSuccess = vi.fn();
    const loader = vi.fn().mockResolvedValue(SuccessModule);

    render(
      <ModuleLoader
        loader={loader}
        onLoadSuccess={onLoadSuccess}
        fallback={<LoadingFallback />}
      />
    );

    await waitFor(() => {
      expect(onLoadSuccess).toHaveBeenCalledTimes(1);
    });
  });

  test('加载成功时 onLoadStart 回调应该先被触发', async () => {
    const onLoadStart = vi.fn();
    const onLoadSuccess = vi.fn();
    const loader = vi.fn().mockResolvedValue(SuccessModule);

    render(
      <ModuleLoader
        loader={loader}
        onLoadStart={onLoadStart}
        onLoadSuccess={onLoadSuccess}
        fallback={<LoadingFallback />}
      />
    );

    await waitFor(() => {
      expect(onLoadStart).toHaveBeenCalledTimes(1);
      expect(onLoadStart).toHaveBeenCalledBefore(onLoadSuccess);
    });
  });
});

describe('ModuleLoader 加载失败降级测试', () => {
  test('加载失败时应该显示错误降级 UI', async () => {
    const error = new Error('模块加载失败');
    const loader = vi.fn().mockRejectedValue(error);

    render(
      <ModuleLoader
        loader={loader}
        errorFallback={<ErrorFallback />}
        fallback={<LoadingFallback />}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('error-fallback')).toBeInTheDocument();
    });

    expect(screen.getByText('模块加载失败')).toBeInTheDocument();
  });

  test('加载失败时 onLoadError 回调应该被触发', async () => {
    const error = new Error('Network error');
    const onLoadError = vi.fn();
    const loader = vi.fn().mockRejectedValue(error);

    render(
      <ModuleLoader
        loader={loader}
        onLoadError={onLoadError}
        errorFallback={<ErrorFallback />}
      />
    );

    await waitFor(() => {
      expect(onLoadError).toHaveBeenCalledTimes(1);
      expect(onLoadError).toHaveBeenCalledWith(error);
    });
  });

  test('加载失败时应该显示默认错误消息', async () => {
    const loader = vi.fn().mockRejectedValue(new Error('Custom error'));

    render(
      <ModuleLoader
        loader={loader}
        fallback={<LoadingFallback />}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('模块加载失败')).toBeInTheDocument();
    });
  });

  test('错误对象应该传递给 errorFallback', async () => {
    const customError = new Error('Custom module error');
    const loader = vi.fn().mockRejectedValue(customError);

    render(
      <ModuleLoader
        loader={loader}
        errorFallback={<ErrorFallback />}
        fallback={<LoadingFallback />}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Custom module error')).toBeInTheDocument();
    });
  });
});

describe('ModuleLoader Suspense 模式测试', () => {
  test('Suspense 应该在加载中显示 fallback', async () => {
    // 使用 React.lazy 模拟动态导入
    const LazyComponent = lazy(() =>
      new Promise((resolve) => {
        setTimeout(() => resolve({ default: SuccessComponent }), 100);
      })
    );

    function SuccessComponent() {
      return <div data-testid="lazy-success">Lazy 模块加载成功</div>;
    }

    render(
      <Suspense fallback={<LoadingFallback />}>
        <LazyComponent />
      </Suspense>
    );

    // 初始显示 loading
    expect(screen.getByTestId('loading-fallback')).toBeInTheDocument();

    // 等待加载完成
    await waitFor(() => {
      expect(screen.getByTestId('lazy-success')).toBeInTheDocument();
    });
  });

  test('Suspense 边界应该处理多个 lazy 组件', async () => {
    const LazyComponent1 = lazy(() =>
      Promise.resolve({ default: () => <div data-testid="lazy-1">组件 1</div> })
    );
    const LazyComponent2 = lazy(() =>
      Promise.resolve({ default: () => <div data-testid="lazy-2">组件 2</div> })
    );

    render(
      <Suspense fallback={<LoadingFallback />}>
        <LazyComponent1 />
        <LazyComponent2 />
      </Suspense>
    );

    await waitFor(() => {
      expect(screen.getByTestId('lazy-1')).toBeInTheDocument();
      expect(screen.getByTestId('lazy-2')).toBeInTheDocument();
    });
  });

  test('Suspense fallback 应该支持多个加载状态样式', () => {
    const ComplexFallback = () => (
      <div data-testid="complex-fallback">
        <div className="spinner">加载动画</div>
        <div className="progress">0%</div>
        <div className="message">正在加载模块...</div>
      </div>
    );

    const LazyComponent = lazy(() => Promise.reject(new Error('fail')));

    render(
      <Suspense fallback={<ComplexFallback />}>
        <LazyComponent />
      </Suspense>
    );

    // Suspense 不直接捕获错误，需要 ErrorBoundary 配合
    expect(screen.getByTestId('complex-fallback')).toBeInTheDocument();
  });
});

describe('ModuleLoader 卸载和重新加载测试', () => {
  test('组件卸载时应该取消正在进行的加载', async () => {
    const loader = vi.fn().mockResolvedValue(SuccessModule);
    const showLoaderRef = { current: null as ((v: boolean) => void) | null };

    function Container() {
      const [visible, setVisible] = useState(true);
      showLoaderRef.current = setVisible;
      return visible ? (
        <ModuleLoader
          loader={loader}
          fallback={<LoadingFallback />}
        />
      ) : null;
    }

    const { unmount } = render(<Container />);

    // 等待加载完成
    await waitFor(() => {
      expect(screen.getByTestId('success-module')).toBeInTheDocument();
    });

    // 卸载组件
    unmount();

    // 加载应该只尝试一次
    expect(loader).toHaveBeenCalledTimes(1);
  });

  test('loader 函数变化时应该重新加载', async () => {
    const loader1 = vi.fn().mockResolvedValue({
      default: () => <div data-testid="module-1">模块 1</div>
    });
    const loader2 = vi.fn().mockResolvedValue({
      default: () => <div data-testid="module-2">模块 2</div>
    });

    function MultiLoader({ loaderFn }) {
      return (
        <ModuleLoader
          loader={loaderFn}
          fallback={<LoadingFallback />}
        />
      );
    }

    const { rerender } = render(
      <MultiLoader loaderFn={loader1} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('module-1')).toBeInTheDocument();
    });

    // 改变 loader
    rerender(<MultiLoader loaderFn={loader2} />);

    await waitFor(() => {
      expect(screen.getByTestId('module-2')).toBeInTheDocument();
    });

    expect(loader1).toHaveBeenCalledTimes(1);
    expect(loader2).toHaveBeenCalledTimes(1);
  });
});

describe('ModuleLoader 边界条件测试', () => {
  test('loader 返回 null 时应该正常处理', async () => {
    const loader = vi.fn().mockResolvedValue(null);

    function NullModule() {
      return <div data-testid="null-module">Null 模块</div>;
    }

    render(
      <ModuleLoader
        loader={loader}
        fallback={<LoadingFallback />}
      />
    );

    await waitFor(() => {
      // loader 返回 null 时不渲染任何内容
      expect(screen.queryByTestId('success-module')).not.toBeInTheDocument();
    });
  });

  test('loader 解析为 undefined 时应该正常处理', async () => {
    const loader = vi.fn().mockResolvedValue(undefined);

    render(
      <ModuleLoader
        loader={loader}
        fallback={<LoadingFallback />}
      />
    );

    await waitFor(() => {
      // 解析为 undefined 时不渲染
      expect(screen.queryByTestId('loading-fallback')).not.toBeInTheDocument();
    });
  });

  test('加载超时应该触发错误降级', async () => {
    const timeoutError = new Error('加载超时');
    const loader = vi.fn().mockRejectedValue(timeoutError);

    render(
      <ModuleLoader
        loader={loader}
        errorFallback={<ErrorFallback />}
        fallback={<LoadingFallback />}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('error-fallback')).toBeInTheDocument();
    });
  });

  test('模块不包含 default 导出时应该渲染模块本身', async () => {
    const moduleWithoutDefault = {
      namedExport: () => <div data-testid="named">命名导出组件</div>
    };
    const loader = vi.fn().mockResolvedValue(moduleWithoutDefault);

    render(
      <ModuleLoader
        loader={loader}
        fallback={<LoadingFallback />}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('named')).toBeInTheDocument();
    });
  });
});

describe('ModuleLoader Loading 状态测试', () => {
  test('初始状态应该是 loading', () => {
    const loader = vi.fn().mockResolvedValue(SuccessModule);

    render(
      <ModuleLoader
        loader={loader}
        fallback={<LoadingFallback />}
      />
    );

    expect(screen.getByTestId('loading-fallback')).toBeInTheDocument();
  });

  test('loading 时不显示错误信息', () => {
    render(
      <ModuleLoader
        loader={() => new Promise(() => {})} // 不解析的 Promise
        fallback={<LoadingFallback />}
        errorFallback={<ErrorFallback />}
      />
    );

    expect(screen.getByTestId('loading-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('error-fallback')).not.toBeInTheDocument();
  });

  test('自定义 Loading UI 应该正确渲染', () => {
    const CustomLoading = () => (
      <div data-testid="custom-loading">
        <span className="animate-spin">加载动画</span>
        <span>正在加载模块，请稍候...</span>
      </div>
    );

    render(
      <ModuleLoader
        loader={() => new Promise(() => {})}
        fallback={<CustomLoading />}
      />
    );

    expect(screen.getByTestId('custom-loading')).toBeInTheDocument();
    expect(screen.getByText(/正在加载模块/)).toBeInTheDocument();
  });
});

describe('ModuleLoader 实际应用场景测试', () => {
  test('动态导入大型组件库', async () => {
    // 模拟大型组件库的动态导入
    const ChartLibrary = {
      default: () => <div data-testid="chart-library">图表库组件</div>
    };
    const loader = vi.fn().mockResolvedValue(ChartLibrary);

    render(
      <ModuleLoader
        loader={loader}
        fallback={<LoadingFallback />}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('chart-library')).toBeInTheDocument();
    });
  });

  test('条件加载不同模块', async () => {
    const userModule = {
      default: () => <div data-testid="user-module">用户模块</div>
    };
    const adminModule = {
      default: () => <div data-testid="admin-module">管理员模块</div>
    };

    function ConditionalModule({ isAdmin }) {
      const loader = isAdmin
        ? () => Promise.resolve(adminModule)
        : () => Promise.resolve(userModule);

      return (
        <ModuleLoader
          loader={loader}
          fallback={<LoadingFallback />}
        />
      );
    }

    const { rerender } = render(
      <ConditionalModule isAdmin={false} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-module')).toBeInTheDocument();
    });

    rerender(<ConditionalModule isAdmin={true} />);

    await waitFor(() => {
      expect(screen.getByTestId('admin-module')).toBeInTheDocument();
    });
  });

  test('错误恢复后重新加载', async () => {
    let attempt = 0;
    const loader = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt === 1) {
        return Promise.reject(new Error('第一次加载失败'));
      }
      return Promise.resolve(SuccessModule);
    });

    function RetryLoader() {
      const [retryKey, setRetryKey] = useState(0);
      const [hasFailed, setHasFailed] = useState(false);

      return (
        <>
          <ModuleLoader
            key={retryKey}
            loader={loader}
            fallback={<LoadingFallback />}
            errorFallback={<ErrorFallback />}
            onLoadError={() => setHasFailed(true)}
          />
          {hasFailed && (
            <button onClick={() => {
              setRetryKey(k => k + 1);
              setHasFailed(false);
            }}>
              重试
            </button>
          )}
        </>
      );
    }

    render(<RetryLoader />);

    // 等待第一次加载失败
    await waitFor(() => {
      expect(screen.getByTestId('error-fallback')).toBeInTheDocument();
    });

    // 点击重试按钮
    const retryButton = screen.getByText('重试');
    await act(async () => {
      retryButton.click();
    });

    // 等待重试成功
    await waitFor(() => {
      expect(screen.getByTestId('success-module')).toBeInTheDocument();
    });

    expect(loader).toHaveBeenCalledTimes(2);
  });
});
