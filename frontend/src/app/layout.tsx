import type { Metadata } from 'next';
import './globals.css';
import { RouterProvider } from '@/contexts/RouterContext';
import { GlobalErrorBoundary } from '@/utils/ErrorBoundary';

// 使用系统本地字体
export const metadata: Metadata = {
  title: 'AI Chat',
  description: '现代化AI对话平台',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" />
        {/* 主题初始化脚本 - 在 React 水合前运行，防止闪烁 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var settings = JSON.parse(localStorage.getItem('chat-settings') || '{}');
                  var theme = settings.theme || 'system';
                  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var resolved = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
                  document.documentElement.dataset.theme = theme;
                  document.documentElement.dataset.themeResolved = resolved;
                  document.documentElement.dataset.palette = settings.desktopPalette || 'aurora';
                  if (resolved === 'dark') {
                    document.documentElement.classList.add('dark');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="h-screen font-sans">
        <GlobalErrorBoundary>
          <RouterProvider>
            {children}
          </RouterProvider>
        </GlobalErrorBoundary>
      </body>
    </html>
  );
}