'use client';

/**
 * AdminDashboardIndex - 管理后台仪表盘入口
 *
 * 功能：
 * - 系统状态概览
 * - 模型调用统计
 * - 工具使用统计
 * - RAG知识库状态
 * - Qdrant 向量数据库监控
 *
 * 特点：
 * - 纯客户端渲染，避免 SSR bailout 问题
 * - 无 SafeAdminWrapper 依赖
 * - 简化错误处理
 */

import React, { useState, useEffect } from 'react';
import { fetchApi } from '@/lib/apiClient';
import {
  Database,
  Wifi,
  WifiOff,
  Activity,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Layers,
} from 'lucide-react';

interface SystemStats {
  totalRequests: number;
  successRate: number;
  avgLatency: number;
  activeSessions: number;
  modelCalls: { model: string; count: number }[];
  toolCalls: { tool: string; count: number }[];
  knowledgeBases: { name: string; docCount: number }[];
}

interface QdrantStatus {
  success: boolean;
  healthy: boolean;
  status: string;
  collection: string;
}

interface CollectionInfo {
  name: string;
  vectorsCount: number;
  pointsCount: number;
  status: string;
  indexed: boolean;
}

interface QdrantStats {
  rowCount: number;
  collectionName: string;
  dimension: number;
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

export default function AdminDashboardIndex() {
  const [stats, setStats] = useState<SystemStats>(defaultStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Qdrant state
  const [qdrantStatus, setQdrantStatus] = useState<QdrantStatus | null>(null);
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [qdrantStats, setQdrantStats] = useState<QdrantStats | null>(null);
  const [qdrantLoading, setQdrantLoading] = useState(true);
  const [qdrantError, setQdrantError] = useState<string | null>(null);
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchStats();
    fetchQdrantData();
    const interval = setInterval(() => {
      fetchStats();
      fetchQdrantData();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const { data, error: fetchError } = await fetchApi<{ success: boolean; data: SystemStats }>('/api/admin/stats');
      if (fetchError) throw new Error(fetchError.message);
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

  const fetchQdrantData = async () => {
    try {
      const [statusRes, collectionsRes] = await Promise.all([
        fetchApi<{ success: boolean; healthy: boolean; status: string; collection: string }>('/api/qdrant/status'),
        fetchApi<{ success: boolean; collections: string[] }>('/api/qdrant/collections'),
      ]);

      if (statusRes.error) throw new Error(statusRes.error.message);

      setQdrantStatus({
        success: statusRes.data?.success ?? false,
        healthy: statusRes.data?.healthy ?? false,
        status: statusRes.data?.status ?? 'unknown',
        collection: statusRes.data?.collection ?? 'chat_documents',
      });

      if (collectionsRes.data?.collections) {
        const collectionInfos = await Promise.all(
          collectionsRes.data.collections.map(async (name) => {
            try {
              const infoRes = await fetchApi<{
                success: boolean;
                info: { vectors_count?: number; points_count?: number; status?: string; indexed?: boolean };
              }>(`/api/qdrant/collections/${name}`);
              return {
                name,
                vectorsCount: infoRes.data?.info?.vectors_count ?? 0,
                pointsCount: infoRes.data?.info?.points_count ?? 0,
                status: infoRes.data?.info?.status ?? 'unknown',
                indexed: infoRes.data?.info?.indexed ?? false,
              } as CollectionInfo;
            } catch {
              return { name, vectorsCount: 0, pointsCount: 0, status: 'error', indexed: false } as CollectionInfo;
            }
          })
        );
        setCollections(collectionInfos);

        if (collectionInfos.length > 0) {
          const statsRes = await fetchApi<QdrantStats>(`/api/qdrant/stats/${collectionInfos[0].name}`);
          if (statsRes.data) {
            setQdrantStats({
              rowCount: statsRes.data.rowCount ?? 0,
              collectionName: statsRes.data.collectionName ?? collectionInfos[0].name,
              dimension: statsRes.data.dimension ?? 1024,
            });
          }
        }
      }

      setQdrantError(null);
    } catch (err) {
      setQdrantError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setQdrantLoading(false);
    }
  };

  const toggleCollection = (name: string) => {
    setExpandedCollections((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
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
          {stats.modelCalls.length === 0 ? (
            <div className="text-gray-400 text-center py-4">暂无数据</div>
          ) : (
            stats.modelCalls.map((item, idx) => (
              <div key={`model-${idx}`} className="flex items-center gap-4">
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
            ))
          )}
        </div>
      </div>

      {/* 工具使用统计 */}
      <div className="bg-white border rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-4">工具调用分布</h2>
        <div className="space-y-2">
          {stats.toolCalls.length === 0 ? (
            <div className="text-gray-400 text-center py-4">暂无数据</div>
          ) : (
            stats.toolCalls.map((item, idx) => (
              <div key={`tool-${idx}`} className="flex items-center gap-4">
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
            ))
          )}
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
            {stats.knowledgeBases.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-4 text-center text-gray-400">暂无知识库</td>
              </tr>
            ) : (
              stats.knowledgeBases.map((kb, index) => (
                <tr key={`kb-${index}`} className="border-b last:border-0">
                  <td className="py-2">{kb.name}</td>
                  <td className="py-2">{kb.docCount}</td>
                  <td className="py-2">
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">正常</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Qdrant 向量数据库监控 */}
      <QdrantMonitor
        status={qdrantStatus}
        collections={collections}
        stats={qdrantStats}
        loading={qdrantLoading}
        error={qdrantError}
        expandedCollections={expandedCollections}
        onRefresh={fetchQdrantData}
        onToggleCollection={toggleCollection}
      />
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

interface QdrantMonitorProps {
  status: QdrantStatus | null;
  collections: CollectionInfo[];
  stats: QdrantStats | null;
  loading: boolean;
  error: string | null;
  expandedCollections: Set<string>;
  onRefresh: () => void;
  onToggleCollection: (name: string) => void;
}

function QdrantMonitor({
  status,
  collections,
  stats,
  loading,
  error,
  expandedCollections,
  onRefresh,
  onToggleCollection,
}: QdrantMonitorProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Database size={20} className="text-blue-600" />
          Qdrant 向量数据库
        </h2>
        <button
          onClick={onRefresh}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="刷新"
        >
          <RefreshCw size={16} className="text-gray-500" />
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* 连接状态卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatusCard
          title="连接状态"
          value={status?.healthy ? '正常' : '异常'}
          icon={status?.healthy ? <Wifi size={18} className="text-green-600" /> : <WifiOff size={18} className="text-red-600" />}
          color={status?.healthy ? 'green' : 'red'}
        />
        <StatusCard
          title="集合数量"
          value={collections.length.toString()}
          icon={<Layers size={18} className="text-blue-600" />}
          color="blue"
        />
        <StatusCard
          title="向量总数"
          value={stats?.rowCount?.toLocaleString() ?? '0'}
          icon={<Activity size={18} className="text-purple-600" />}
          color="purple"
        />
        <StatusCard
          title="状态"
          value={status?.status ?? 'unknown'}
          icon={<Database size={18} className="text-gray-600" />}
          color="gray"
        />
      </div>

      {/* 集合列表 */}
      <div className="bg-white dark:bg-gray-900 border rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">集合管理</h3>
        {collections.length === 0 ? (
          <div className="text-center py-8 text-gray-400">暂无集合</div>
        ) : (
          <div className="space-y-2">
            {collections.map((collection) => (
              <div key={collection.name} className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => onToggleCollection(collection.name)}
                  className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Database size={16} className="text-gray-400" />
                    <span className="font-medium text-gray-900 dark:text-white">{collection.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500">{collection.pointsCount.toLocaleString()} 点</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      collection.status === 'green' ? 'bg-green-100 text-green-800' :
                      collection.status === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {collection.status}
                    </span>
                    {expandedCollections.has(collection.name) ? (
                      <ChevronUp size={16} className="text-gray-400" />
                    ) : (
                      <ChevronDown size={16} className="text-gray-400" />
                    )}
                  </div>
                </button>
                {expandedCollections.has(collection.name) && (
                  <div className="px-4 pb-3 border-t bg-gray-50 dark:bg-gray-800/50">
                    <div className="grid grid-cols-3 gap-4 pt-3 text-sm">
                      <div>
                        <div className="text-gray-500">向量维度</div>
                        <div className="font-medium text-gray-900 dark:text-white">{stats?.dimension ?? 1024}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">向量数量</div>
                        <div className="font-medium text-gray-900 dark:text-white">{collection.vectorsCount.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">已索引</div>
                        <div className="font-medium text-gray-900 dark:text-white">{collection.indexed ? '是' : '否'}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: 'green' | 'red' | 'blue' | 'purple' | 'yellow' | 'gray';
}) {
  const colorClasses = {
    green: 'bg-green-50 border-green-200',
    red: 'bg-red-50 border-red-200',
    blue: 'bg-blue-50 border-blue-200',
    purple: 'bg-purple-50 border-purple-200',
    yellow: 'bg-yellow-50 border-yellow-200',
    gray: 'bg-gray-50 border-gray-200',
  };

  return (
    <div className={`${colorClasses[color]} border rounded-lg p-4`}>
      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
        {icon}
        <span>{title}</span>
      </div>
      <div className="text-2xl font-bold mt-2 text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}