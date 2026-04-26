'use client';

import dynamic from 'next/dynamic';

// 禁用 SSR 防止 hydration mismatch
const ToolRegistryPage = dynamic(
  () => import('@/components/admin/ToolRegistry/index').then((m) => m.default),
  { ssr: false, loading: () => <PageLoading /> }
);

function PageLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  );
}

export default function ToolsPage() {
  return <ToolRegistryPage />;
}
