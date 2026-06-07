import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';

const locales = ['zh-CN', 'en'] as const;
type Locale = (typeof locales)[number];
const defaultLocale: Locale = 'zh-CN';

/**
 * next-intl 服务端请求配置
 * - 根据当前 locale 加载对应的 messages JSON
 * - 通过 dynamic import 实现按需加载
 *
 * locale 解析顺序 (无 middleware 时手动解析):
 *   1. 显式 ?lang=xx query (在 layout 中通过 searchParams 注入 requestLocale 不便, 跳过)
 *   2. Cookie NEXT_LOCALE=xx
 *   3. Accept-Language 头 (en* → en, 其他 → 默认 zh-CN)
 *   4. fallback → defaultLocale
 *
 * 注意: 不在 URL 中加 locale 前缀 (localePrefix: 'never')
 */
export default getRequestConfig(async ({ requestLocale }) => {
  let locale = (await requestLocale) as Locale | undefined;

  if (!locale || !locales.includes(locale)) {
    try {
      const h = await headers();
      const cookieHeader = h.get('cookie') || '';
      const cookieMatch = cookieHeader.match(/NEXT_LOCALE=(zh-CN|en)/);
      if (cookieMatch && locales.includes(cookieMatch[1] as Locale)) {
        locale = cookieMatch[1] as Locale;
      } else {
        const acceptLang = (h.get('accept-language') || '').toLowerCase();
        if (acceptLang.startsWith('en')) {
          locale = 'en';
        } else {
          locale = defaultLocale;
        }
      }
    } catch {
      // headers() 不可用时 (e.g. 静态生成) → fallback
      locale = defaultLocale;
    }
  }

  return {
    locale,
    messages: (await import(`../../locales/${locale}.json`)).default,
  };
});
