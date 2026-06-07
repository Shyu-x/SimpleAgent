'use client';

/**
 * 管理后台 - 仪表盘组件
 *
 * 功能：
 * - 系统状态概览
 * - 模型调用统计
 * - 工具使用统计
 * - RAG知识库状态
 * - Qdrant 向量数据库监控
 * - 最近请求追踪
 */

import React from 'react';
import { useTranslations } from 'next-intl';
import { SafeAdminWrapper } from './SafeAdminWrapper';
import QdrantMonitor from './QdrantMonitor';
import { useAdminPolling, type SystemStats } from '@/hooks/useAdminSSE';

const defaultStats: SystemStats = {
  totalRequests: 0,
  successRate: 0,
  avgLatency: 0,
  activeSessions: 0,
  modelCalls: [],
  toolCalls: [],
  knowledgeBases: []
};

export default function AdminDashboard() {
  const t = useTranslations('admin');
  // 使用通用 Admin SSE Hook 获取 stats 数据
  const { data: statsData, loading, error, refresh } = useAdminPolling<SystemStats>({
    endpoint: '/api/admin/stats',
    parser: (res: unknown) => (res as { data?: SystemStats })?.data || defaultStats,
    interval: 30000,
  });

  const stats = statsData || defaultStats;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">{t('dashboard')}</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {String(error)}
        </div>
      )}

      {/* 概览卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title={t('totalRequests')} value={stats.totalRequests} />
        <StatCard title={t('successRate')} value={`${(stats.successRate * 100).toFixed(1)}%`} />
        <StatCard title={t('avgLatency')} value={`${stats.avgLatency.toFixed(0)}ms`} />
        <StatCard title={t('activeSessions')} value={stats.activeSessions} />
      </div>

      {/* 模型调用统计 */}
      <div className="bg-white border rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-4">{t('modelDistribution')}</h2>
        <div className="space-y-2">
          {stats.modelCalls.map((item, idx) => (
            <div key={`model-${item.model}-${idx}`} className="flex items-center gap-4">
              <span className="w-32 truncate">{item.model}</span>
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{
                    width: `${Math.min(100, (item.count / Math.max(...stats.modelCalls.map(m => m.count))) * 100)}%`
                  }}
                />
              </div>
              <span className="w-16 text-right">{item.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 工具使用统计 */}
      <div className="bg-white border rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-4">{t('toolDistribution')}</h2>
        <div className="space-y-2">
          {stats.toolCalls.map((item, idx) => (
            <div key={`tool-${item.tool}-${idx}`} className="flex items-center gap-4">
              <span className="w-32 truncate">{item.tool}</span>
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full"
                  style={{
                    width: `${Math.min(100, (item.count / Math.max(...stats.toolCalls.map(t => t.count))) * 100)}%`
                  }}
                />
              </div>
              <span className="w-16 text-right">{item.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 知识库状态 */}
      <div className="bg-white border rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-4">{t('knowledgeBaseStatus')}</h2>
        <table className="w-full">
          <thead>
            <tr className="text-left border-b">
              <th className="pb-2">{t('columnName')}</th>
              <th className="pb-2">{t('columnDocs')}</th>
              <th className="pb-2">{t('columnStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {stats.knowledgeBases.map((kb, index) => (
              <tr key={`kb-${index}-${kb.name.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '')}`} className="border-b last:border-0">
                <td className="py-2">{kb.name}</td>
                <td className="py-2">{kb.docCount}</td>
                <td className="py-2">
                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">
                    {t('statusOk')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Qdrant 向量数据库监控 */}
      <QdrantMonitor />
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
