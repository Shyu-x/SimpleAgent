'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <h1>发生错误</h1>
        <button onClick={reset}>重试</button>
      </body>
    </html>
  );
}