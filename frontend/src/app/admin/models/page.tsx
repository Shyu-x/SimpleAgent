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

function ModelConfigErrorFallback({ error, resetError }: { error: Error; resetError: () => void }) {
  return (
    <FallbackUI
      moduleName="ModelConfig"
      error={error}
      style="detailed"
      showRetry={true}
      onRetry={resetError}
    />
  );
}

export default function ModelsPage() {
  const [mounted, setMounted] = useState(false);
  const [Component, setComponent] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    setMounted(true);
    import('@/components/admin/ModelConfig/index').then((m) => {
      setComponent(() => m.default);
    }).catch((err) => {
      console.error('[ModelsPage] Failed to load ModelConfig:', err);
    });
  }, []);

  if (!mounted) return <PageLoading />;
  if (!Component) return <PageLoading />;

  return (
    <ErrorBoundary moduleName="ModelConfigPage" fallback={<ModelConfigErrorFallback error={new Error('模型配置模块加载失败')} resetError={() => window.location.reload()} />}>
      <Component />
    </ErrorBoundary>
  );
}