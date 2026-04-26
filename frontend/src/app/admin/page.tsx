'use client';

import dynamic from 'next/dynamic';

// 禁用 SSR 防止 hydration mismatch
const AdminDashboard = dynamic(
  () => import('@/components/admin/AdminDashboard').then((m) => m.default),
  { ssr: false, loading: () => <DashboardLoading /> }
);

function DashboardLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  );
}

export default function AdminPage() {
  return <AdminDashboard />;
}
