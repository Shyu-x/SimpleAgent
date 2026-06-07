/**
 * 国际化测试辅助
 * 为组件测试提供默认 NextIntlClientProvider, 使用 zh-CN locale
 */
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import zhCNMessages from '../../../locales/zh-CN.json';

export function I18nWrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="zh-CN" messages={zhCNMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

export { render as originalRender } from '@testing-library/react';
