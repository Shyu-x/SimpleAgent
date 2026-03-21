'use client';

import { AnchorHTMLAttributes, ReactNode } from 'react';
import { useRoute } from '@/contexts/RouterContext';

/**
 * 路由链接组件属性
 */
interface RouteLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /** 目标路径 */
  to: string;
  /** 子元素 */
  children: ReactNode;
  /** 是否替换当前历史记录（replace vs push） */
  replace?: boolean;
}

/**
 * 路由链接组件
 * 替代原生 <a> 标签进行客户端路由导航
 *
 * @example
 * <RouteLink to="/c/conv_123">打开对话</RouteLink>
 * <RouteLink to="/settings" replace>替换当前记录</RouteLink>
 */
export function RouteLink({
  to,
  children,
  replace = false,
  onClick,
  ...props
}: RouteLinkProps) {
  const { push, replace: routerReplace } = useRoute();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // 阻止默认行为（浏览器导航）
    e.preventDefault();

    // 执行路由导航
    if (replace) {
      routerReplace(to);
    } else {
      push(to);
    }

    // 调用外部 onClick 回调
    onClick?.(e);
  };

  return (
    <a href={to} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}
