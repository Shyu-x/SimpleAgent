'use client';

import { useState, useEffect } from 'react';
import { fetchApi, ApiResult } from '@/lib/apiClient';
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

export default function AdminPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">系统仪表盘</h1>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400"></div>
        </div>
      </div>
    );
  }

  return <AdminDashboardContent />;
}

function AdminDashboardContent() {
  const [stats, setStats] = useState<SystemStats>(defaultStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [qdrantStatus, setQdrantStatus] = useState<QdrantStatus | null>(null);
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [qdrantStats, setQdrantStats] = useState<QdrantStats | null>(null);
  const [qdrantLoading, setQdrantLoading] = useState(true);
  const [qdrantError, setQdrantError] = useState<string | null>(null);
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set());

  // 获取统计数据
  const loadStats = async () => {
    try {
      const result = await fetchApi<{ success: boolean; data: SystemStats }>('/api/admin/stats');
      if (result.error) {
        console.error('[AdminDashboard] Stats API error:', result.error);
        throw new Error(result.error.message);
      }
      if (result.data?.data) {
        setStats(result.data.data);
      }
      setError(null);
    } catch (err) {
      console.error('[AdminDashboard] loadStats error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // 获取 Qdrant 数据
  const loadQdrantData = async () => {
    try {
      setQdrantLoading(true);
      const [statusRes, collectionsRes] = await Promise.all([
        fetchApi<QdrantStatus>('/api/qdrant/status'),
        fetchApi<{ collections: string[] }>('/api/qdrant/collections'),
      ]);

      if (statusRes.error) throw new Error(statusRes.error.message);

      const statusData = statusRes.data as QdrantStatus;
      setQdrantStatus({
        success: statusData.success ?? false,
        healthy: statusData.healthy ?? false,
        status: statusData.status ?? 'unknown',
        collection: statusData.collection ?? 'chat_documents',
      });

      const collectionsData = collectionsRes.data as { collections: string[] } | undefined;
      if (collectionsData?.collections) {
        const collectionInfos = await Promise.all(
          collectionsData.collections.map(async (name) => {
            try {
              const infoRes = await fetchApi<{ info: { vectors_count?: number; points_count?: number; status?: string; indexed?: boolean } }>(`/api/qdrant/collections/${name}`);
              const infoData = infoRes.data?.info;
              return {
                name,
                vectorsCount: infoData?.vectors_count ?? 0,
                pointsCount: infoData?.points_count ?? 0,
                status: infoData?.status ?? 'unknown',
                indexed: infoData?.indexed ?? false,
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
      console.error('[AdminDashboard] loadQdrantData error:', err);
      setQdrantError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setQdrantLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    console.log('[AdminDashboard] Initial load starting...');
    setLoading(true);
    loadStats();
    loadQdrantData();

    // 定时刷新
    const interval = setInterval(() => {
      loadStats();
      loadQdrantData();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

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
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">系统仪表盘</h1>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded">
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
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">模型调用分布</h2>
        <div className="space-y-2">
          {stats.modelCalls.length === 0 ? (
            <div className="text-gray-400 dark:text-gray-500 text-center py-4">暂无数据</div>
          ) : (
            stats.modelCalls.map((item, idx) => (
              <div key={`model-${idx}`} className="flex items-center gap-4">
                <span className="w-32 truncate text-gray-700 dark:text-gray-300">{item.model}</span>
                <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{
                      width: `${Math.min(100, (item.count / Math.max(...stats.modelCalls.map(m => m.count))) * 100)}%`
                    }}
                  />
                </div>
                <span className="w-16 text-right text-gray-700 dark:text-gray-300">{item.count}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 工具使用统计 */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">工具调用分布</h2>
        <div className="space-y-2">
          {stats.toolCalls.length === 0 ? (
            <div className="text-gray-400 dark:text-gray-500 text-center py-4">暂无数据</div>
          ) : (
            stats.toolCalls.map((item, idx) => (
              <div key={`tool-${idx}`} className="flex items-center gap-4">
                <span className="w-32 truncate text-gray-700 dark:text-gray-300">{item.tool}</span>
                <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full"
                    style={{
                      width: `${Math.min(100, (item.count / Math.max(...stats.toolCalls.map(t => t.count))) * 100)}%`
                    }}
                  />
                </div>
                <span className="w-16 text-right text-gray-700 dark:text-gray-300">{item.count}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 知识库状态 */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4 overflow-hidden">
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">知识库状态</h2>
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full min-w-[400px]">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
              <tr className="text-left border-b dark:border-gray-700">
                <th className="pb-2 text-gray-700 dark:text-gray-300">名称</th>
                <th className="pb-2 w-24 text-gray-700 dark:text-gray-300">文档数</th>
                <th className="pb-2 w-20 text-gray-700 dark:text-gray-300">状态</th>
              </tr>
            </thead>
            <tbody>
              {stats.knowledgeBases.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-gray-400 dark:text-gray-500">暂无知识库</td>
                </tr>
              ) : (
                stats.knowledgeBases.map((kb, index) => (
                  <tr key={`kb-${index}`} className="border-b dark:border-gray-700 last:border-0">
                    <td className="py-2 max-w-xs truncate text-gray-700 dark:text-gray-300" title={kb.name}>{kb.name}</td>
                    <td className="py-2 text-gray-700 dark:text-gray-300">{kb.docCount}</td>
                    <td className="py-2">
                      <span className="px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 rounded text-sm">正常</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Qdrant 向量数据库监控 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Database size={20} className="text-blue-600" />
            Qdrant 向量数据库
          </h2>
          <button
            onClick={loadQdrantData}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="刷新"
          >
            <RefreshCw size={16} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {qdrantError && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>{qdrantError}</span>
          </div>
        )}

        {/* 连接状态卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatusCard
            title="连接状态"
            value={qdrantStatus?.healthy ? '正常' : '异常'}
            icon={qdrantStatus?.healthy ? <Wifi size={18} className="text-green-600" /> : <WifiOff size={18} className="text-red-600" />}
            color={qdrantStatus?.healthy ? 'green' : 'red'}
          />
          <StatusCard
            title="集合数量"
            value={collections.length.toString()}
            icon={<Layers size={18} className="text-blue-600" />}
            color="blue"
          />
          <StatusCard
            title="向量总数"
            value={qdrantStats?.rowCount?.toLocaleString() ?? '0'}
            icon={<Activity size={18} className="text-purple-600" />}
            color="purple"
          />
          <StatusCard
            title="状态"
            value={qdrantStatus?.status ?? 'unknown'}
            icon={<Database size={18} className="text-gray-600" />}
            color="gray"
          />
        </div>

        {/* 集合列表 */}
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">集合管理</h3>
          {qdrantLoading ? (
            <div className="flex items-center justify-center h-24">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 dark:border-blue-400"></div>
            </div>
          ) : collections.length === 0 ? (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500">暂无集合</div>
          ) : (
            <div className="space-y-2">
              {collections.map((collection) => (
                <div key={collection.name} className="border dark:border-gray-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleCollection(collection.name)}
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Database size={16} className="text-gray-400 dark:text-gray-500" />
                      <span className="font-medium text-gray-900 dark:text-white">{collection.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-500 dark:text-gray-400">{collection.pointsCount.toLocaleString()} 点</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        collection.status === 'green' ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300' :
                        collection.status === 'yellow' ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300' :
                        'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}>
                        {collection.status}
                      </span>
                      {expandedCollections.has(collection.name) ? (
                        <ChevronUp size={16} className="text-gray-400 dark:text-gray-500" />
                      ) : (
                        <ChevronDown size={16} className="text-gray-400 dark:text-gray-500" />
                      )}
                    </div>
                  </button>
                  {expandedCollections.has(collection.name) && (
                    <div className="px-4 pb-3 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <div className="grid grid-cols-3 gap-4 pt-3 text-sm">
                        <div>
                          <div className="text-gray-500 dark:text-gray-400">向量维度</div>
                          <div className="font-medium text-gray-900 dark:text-white">{qdrantStats?.dimension ?? 1024}</div>
                        </div>
                        <div>
                          <div className="text-gray-500 dark:text-gray-400">向量数量</div>
                          <div className="font-medium text-gray-900 dark:text-white">{collection.vectorsCount.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-gray-500 dark:text-gray-400">已索引</div>
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
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
      <div className="text-sm text-gray-500 dark:text-gray-400">{title}</div>
      <div className="text-2xl font-bold mt-1 text-gray-900 dark:text-white">{value}</div>
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
    green: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800',
    red: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800',
    blue: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800',
    purple: 'bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800',
    gray: 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700',
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