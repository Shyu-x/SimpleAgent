'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useRouter } from '@/hooks/useRouter';

/**
 * 路由 Context 类型
 */
type RouterContextValue = ReturnType<typeof useRouter>;

/**
 * 创建路由 Context
 */
const RouterContext = createContext<RouterContextValue | null>(null);

/**
 * 路由 Provider 组件
 * 在根布局中包裹，为应用提供路由功能
 */
export function RouterProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <RouterContext.Provider value={router}>
      {children}
    </RouterContext.Provider>
  );
}

/**
 * 使用路由上下文的 Hook
 * @throws 如果不在 RouterProvider 内使用
 */
export function useRoute() {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRoute 必须在 RouterProvider 内使用');
  }
  return context;
}
