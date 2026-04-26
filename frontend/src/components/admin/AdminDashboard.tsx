'use client';

/**
 * 管理后台 - 仪表盘组件
 *
 * 功能：
 * - 系统状态概览
 * - 模型调用统计
 * - 工具使用统计
 * - RAG知识库状态
 * - 最近请求追踪
 */

import React, { useState, useEffect } from 'react';
import { fetchApi } from '@/lib/apiClient';

interface SystemStats {
  totalRequests: number;
  successRate: number;
  avgLatency: number;
  activeSessions: number;
  modelCalls: { model: string; count: number }[];
  toolCalls: { tool: string; count: number }[];
  knowledgeBases: { name: string; docCount: number }[];
}

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
  const [stats, setStats] = useState<SystemStats>(defaultStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
    // 定时刷新
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const { data, error: fetchError } = await fetchApi<{ success: boolean; data: SystemStats }>('/api/admin/stats');
      if (fetchError) throw new Error(fetchError.message);
      // 后端返回 { success: true, data: {...} }
      if (data?.data) {
        setStats(data.data);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">系统仪表盘</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* 概览卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="总请求数" value={stats.totalRequests} />
        <StatCard title="成功率" value={`${(stats.successRate * 100).toFixed(1)}%`} />
        <StatCard title="平均延迟" value={`${stats.avgLatency.toFixed(0)}ms`} />
        <StatCard title="活跃会话" value={stats.activeSessions} />
      </div>

      {/* 模型调用统计 */}
      <div className="bg-white border rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-4">模型调用分布</h2>
        <div className="space-y-2">
          {stats.modelCalls.map((item) => (
            <div key={item.model} className="flex items-center gap-4">
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
        <h2 className="text-lg font-semibold mb-4">工具调用分布</h2>
        <div className="space-y-2">
          {stats.toolCalls.map((item) => (
            <div key={item.tool} className="flex items-center gap-4">
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
        <h2 className="text-lg font-semibold mb-4">知识库状态</h2>
        <table className="w-full">
          <thead>
            <tr className="text-left border-b">
              <th className="pb-2">名称</th>
              <th className="pb-2">文档数</th>
              <th className="pb-2">状态</th>
            </tr>
          </thead>
          <tbody>
            {stats.knowledgeBases.map((kb) => (
              <tr key={kb.name} className="border-b last:border-0">
                <td className="py-2">{kb.name}</td>
                <td className="py-2">{kb.docCount}</td>
                <td className="py-2">
                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">
                    正常
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
