import type { Metadata } from 'next';
import './globals.css';
import { RouterProvider } from '@/contexts/RouterContext';

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
      </head>
      <body className="h-screen font-sans">
        <RouterProvider>
          {children}
        </RouterProvider>
      </body>
    </html>
  );
}
