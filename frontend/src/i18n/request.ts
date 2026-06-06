import { getRequestConfig } from 'next-intl/server';
import { routing } from '@/middleware';

/**
 * next-intl 服务端请求配置
 * - 根据当前 locale 加载对应的 messages JSON
 * - 通过 dynamic import 实现按需加载
 */
export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // 校验 locale, 落到 defaultLocale 上
  if (!locale || !routing.locales.includes(locale as 'zh-CN' | 'en')) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../../locales/${locale}.json`)).default,
  };
});
