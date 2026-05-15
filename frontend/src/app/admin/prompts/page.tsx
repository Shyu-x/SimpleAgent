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

function PromptTemplateErrorFallback({ error, resetError }: { error: Error; resetError: () => void }) {
  return (
    <FallbackUI
      moduleName="PromptTemplate"
      error={error}
      style="detailed"
      showRetry={true}
      onRetry={resetError}
    />
  );
}

export default function PromptsPage() {
  const [mounted, setMounted] = useState(false);
  const [Component, setComponent] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    setMounted(true);
    import('@/components/admin/PromptTemplate/index').then((m) => {
      setComponent(() => m.default);
    }).catch((err) => {
      console.error('[PromptsPage] Failed to load PromptTemplate:', err);
    });
  }, []);

  if (!mounted) return <PageLoading />;
  if (!Component) return <PageLoading />;

  return (
    <ErrorBoundary moduleName="PromptTemplatePage" fallback={<PromptTemplateErrorFallback error={new Error('Prompt模板模块加载失败')} resetError={() => window.location.reload()} />}>
      <Component />
    </ErrorBoundary>
  );
}