import type { Metadata } from 'next';
import './globals.css';
import { RouterProvider } from '@/contexts/RouterContext';
import { GlobalErrorBoundary } from '@/utils/ErrorBoundary';

// 全局错误降级 UI
function GlobalErrorFallback({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="h-screen font-sans bg-[hsl(var(--bg-app))]">
        <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
          {/* 错误图标 */}
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-destructive/20 blur-3xl" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
              <svg
                className="h-10 w-10 text-destructive"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
          </div>

          {/* 错误信息 */}
          <div className="max-w-md text-center">
            <h1 className="mb-2 text-2xl font-bold text-[hsl(var(--text-main))]">
              页面加载失败
            </h1>
            <p className="mb-4 text-sm text-[hsl(var(--text-muted))]">
              {error.message || '发生了未知错误'}
            </p>
            {process.env.NODE_ENV === 'development' && error.stack && (
              <pre className="mt-4 max-w-2xl overflow-auto rounded-lg bg-muted p-4 text-left text-xs text-muted-foreground">
                {error.stack}
              </pre>
            )}
          </div>

          {/* 重试按钮 */}
          <button
            onClick={reset}
            className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:opacity-90 active:scale-95"
          >
            重新加载
          </button>

          <p className="text-xs text-[hsl(var(--text-muted))]">
            如果问题持续存在，请刷新页面或联系管理员
          </p>
        </div>
      </body>
    </html>
  );
}

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
        <GlobalErrorBoundary fallback={GlobalErrorFallback}>
          <RouterProvider>
            {children}
          </RouterProvider>
        </GlobalErrorBoundary>
      </body>
    </html>
  );
}
