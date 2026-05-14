'use client';

import { useState, useEffect } from 'react';

function PageLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  );
}

export default function PromptsPage() {
  const [mounted, setMounted] = useState(false);
  const [Component, setComponent] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    setMounted(true);
    import('@/components/admin/PromptTemplate/index').then((m) => {
      setComponent(() => m.default);
    });
  }, []);

  if (!mounted) return <PageLoading />;
  if (!Component) return <PageLoading />;
  return <Component />;
}