import { getRequestConfig } from 'next-intl/server';

const locales = ['zh-CN', 'en'] as const;
const defaultLocale = 'zh-CN' as const;

/**
 * next-intl 服务端请求配置
 * - 根据当前 locale 加载对应的 messages JSON
 * - 通过 dynamic import 实现按需加载
 *
 * 注意: 不在 URL 中加 locale 前缀 (localePrefix: 'never')
 * 通过 cookie / Accept-Language / 显式参数切换语言
 */
export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // 校验 locale, 落到 defaultLocale 上
  if (!locale || !locales.includes(locale as 'zh-CN' | 'en')) {
    locale = defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../../locales/${locale}.json`)).default,
  };
});
