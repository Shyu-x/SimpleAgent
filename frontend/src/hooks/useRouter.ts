'use client';

import { useCallback, useEffect, useState } from 'react';
import { useChatStore } from '@/store/chatStore';

/**
 * 路由配置接口
 */
export interface Route {
  path: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

/**
 * 路由状态接口
 */
export interface RouterState {
  currentPath: string;
  params: Record<string, string>;
  query: Record<string, string>;
}

/**
 * 路由配置 - 定义路径到应用状态的映射
 */
const ROUTES = {
  '/': { mode: 'chat' as const },
  '/c/:conversationId': { mode: 'chat' as const, focus: false as const },
  '/c/:conversationId/focus': { mode: 'chat' as const, focus: true as const },
  '/agent': { mode: 'agent' as const },
  '/agent/:tab': { mode: 'agent' as const },
  '/kb': { mode: 'chat' as const, panel: 'kb' as const },
  '/settings': { mode: 'chat' as const, panel: 'settings' as const },
} as const;

type RouteName = keyof typeof ROUTES;

/**
 * 解析后的路由匹配结果
 */
interface ParsedRoute {
  pattern: string;
  config: (typeof ROUTES)[RouteName];
  params: Record<string, string>;
}

/**
 * 虚拟路由 Hook
 * 提供基于 URL 的路由导航功能，与 Zustand store 状态联动
 *
 * @example
 * const { push, currentPath } = useRouter();
 * push('/c/conv_123');
 */
export function useRouter() {
  // 当前路径状态
  const [currentPath, setCurrentPath] = useState('/');
  // 路径参数 (如 :conversationId)
  const [params, setParams] = useState<Record<string, string>>({});
  // URL 查询参数
  const [query, setQuery] = useState<Record<string, string>>({});

  // 从 store 获取状态更新函数
  const {
    setAppMode,
    setActiveConversation,
    setFocusMode,
    setSidePanelContent,
  } = useChatStore();

  /**
   * 解析路径，匹配路由配置
   */
  const parsePath = useCallback((path: string): ParsedRoute | null => {
    for (const [pattern, config] of Object.entries(ROUTES)) {
      const patternParts = pattern.split('/');
      const pathParts = path.split('/');

      // 检查路径段数量是否匹配
      if (patternParts.length !== pathParts.length) continue;

      const matchedParams: Record<string, string> = {};
      let isMatch = true;

      // 逐段匹配
      for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
          // 动态参数：捕获路径段
          matchedParams[patternParts[i].slice(1)] = pathParts[i];
        } else if (patternParts[i] !== pathParts[i]) {
          isMatch = false;
          break;
        }
      }

      if (isMatch) {
        return { pattern, config, params: matchedParams };
      }
    }

    return null;
  }, []);

  /**
   * 同步路由状态到应用状态
   */
  const syncRouteToState = useCallback((parsed: ParsedRoute | null, newQuery?: Record<string, string>) => {
    if (!parsed) return;

    const config = parsed.config;

    // 同步应用模式
    if ('mode' in config) {
      setAppMode(config.mode);
    }

    // 同步对话 ID
    if ('conversationId' in parsed.params) {
      setActiveConversation(parsed.params.conversationId);
    }

    // 同步焦点模式
    if ('focus' in config) {
      setFocusMode(config.focus);
    }

    // 同步侧边栏内容
    if ('panel' in config) {
      setSidePanelContent(config.panel as 'settings' | 'kb');
    }

    // 更新查询参数
    if (newQuery) {
      setQuery(newQuery);
    }
  }, [setAppMode, setActiveConversation, setFocusMode, setSidePanelContent]);

  /**
   * 导航到指定路径（添加历史记录）
   */
  const push = useCallback((path: string, options?: { query?: Record<string, string> }) => {
    // 更新 URL（pushState 不触发 popstate）
    window.history.pushState({}, '', path);

    // 解析路径
    const parsed = parsePath(path);
    if (parsed) {
      setCurrentPath(path);
      setParams(parsed.params);

      // 同步状态
      syncRouteToState(parsed, options?.query);
    }
  }, [parsePath, syncRouteToState]);

  /**
   * 替换当前路径（不添加历史记录）
   */
  const replace = useCallback((path: string, options?: { query?: Record<string, string> }) => {
    window.history.replaceState({}, '', path);

    const parsed = parsePath(path);
    if (parsed) {
      setCurrentPath(path);
      setParams(parsed.params);
      syncRouteToState(parsed, options?.query);
    }
  }, [parsePath, syncRouteToState]);

  /**
   * 初始化路由状态（基于当前 URL）
   */
  useEffect(() => {
    const path = window.location.pathname;
    const parsed = parsePath(path);
    if (parsed) {
      setCurrentPath(path);
      setParams(parsed.params);
      syncRouteToState(parsed);

      // 解析初始查询参数
      const searchParams = new URLSearchParams(window.location.search);
      const initialQuery: Record<string, string> = {};
      searchParams.forEach((value, key) => {
        initialQuery[key] = value;
      });
      if (Object.keys(initialQuery).length > 0) {
        setQuery(initialQuery);
      }
    }
  }, [parsePath, syncRouteToState]);

  /**
   * 监听浏览器前进/后退
   */
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const parsed = parsePath(path);

      if (parsed) {
        setCurrentPath(path);
        setParams(parsed.params);

        // 解析查询参数
        const searchParams = new URLSearchParams(window.location.search);
        const newQuery: Record<string, string> = {};
        searchParams.forEach((value, key) => {
          newQuery[key] = value;
        });

        syncRouteToState(parsed, newQuery);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [parsePath, syncRouteToState]);

  return {
    currentPath,
    params,
    query,
    push,
    replace,
    parsePath,
  };
}
