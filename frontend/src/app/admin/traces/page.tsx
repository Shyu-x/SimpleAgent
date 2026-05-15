'use client';

import { useState, useEffect } from 'react';
import { ErrorBoundary } from '@/utils/ErrorBoundary';
import { FallbackUI } from '@/components/FallbackUI';

function PageLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  );
}

function TraceViewerErrorFallback({ error, resetError }: { error: Error; resetError: () => void }) {
  return (
    <FallbackUI
      moduleName="TraceViewer"
      error={error}
      style="detailed"
      showRetry={true}
      onRetry={resetError}
    />
  );
}

export default function TracesPage() {
  const [mounted, setMounted] = useState(false);
  const [Component, setComponent] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    setMounted(true);
    import('@/components/admin/TraceViewer/index').then((m) => {
      setComponent(() => m.default);
    }).catch((err) => {
      console.error('[TracesPage] Failed to load TraceViewer:', err);
    });
  }, []);

  if (!mounted) return <PageLoading />;
  if (!Component) return <PageLoading />;

  return (
    <ErrorBoundary moduleName="TraceViewerPage" fallback={<TraceViewerErrorFallback error={new Error('链路追踪模块加载失败')} resetError={() => window.location.reload()} />}>
      <Component />
    </ErrorBoundary>
  );
}