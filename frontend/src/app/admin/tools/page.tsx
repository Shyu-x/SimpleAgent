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

function ToolRegistryErrorFallback({ error, resetError }: { error: Error; resetError: () => void }) {
  return (
    <FallbackUI
      moduleName="ToolRegistry"
      error={error}
      style="detailed"
      showRetry={true}
      onRetry={resetError}
    />
  );
}

export default function ToolsPage() {
  const [mounted, setMounted] = useState(false);
  const [Component, setComponent] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    setMounted(true);
    import('@/components/admin/ToolRegistry/index').then((m) => {
      setComponent(() => m.default);
    }).catch((err) => {
      console.error('[ToolsPage] Failed to load ToolRegistry:', err);
    });
  }, []);

  if (!mounted) {
    return <PageLoading />;
  }

  if (!Component) {
    return <PageLoading />;
  }

  return (
    <ErrorBoundary moduleName="ToolRegistryPage" fallback={<ToolRegistryErrorFallback error={new Error('工具管理模块加载失败')} resetError={() => window.location.reload()} />}>
      <Component />
    </ErrorBoundary>
  );
}