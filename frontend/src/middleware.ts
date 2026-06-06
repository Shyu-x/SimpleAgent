import createMiddleware from 'next-intl/middleware';
import { defineRouting } from 'next-intl/routing';

/**
 * 国际化路由配置
 * - defaultLocale: 'zh-CN' - 默认中文（中国）
 * - locales: ['zh-CN', 'en'] - 支持的语言列表
 * - localePrefix: 'as-needed' - 默认语言不带前缀,切换语言时添加 /en 前缀
 *
 * 路径示例:
 *   /                 -> zh-CN (默认)
 *   /en               -> en
 *   /en/anything      -> en
 *   /api/...          -> 不参与 i18n 路由(被 next.config.js 的 rewrites 接管)
 */
export const routing = defineRouting({
  locales: ['zh-CN', 'en'] as const,
  defaultLocale: 'zh-CN',
  localePrefix: 'as-needed',
});

export default createMiddleware(routing);

export const config = {
  // 匹配除 api、_next、_vercel、静态资源外的所有路径
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
