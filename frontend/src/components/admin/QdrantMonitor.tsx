'use client';

/**
 * QdrantMonitor - Qdrant 向量数据库监控组件
 *
 * 功能：
 * - 显示 Qdrant 连接状态
 * - 显示向量检索统计
 * - 显示降级次数
 * - 集合管理
 */

import React, { useState, useEffect } from 'react';
import { fetchApi } from '@/lib/apiClient';
import { SafeAdminWrapper } from './SafeAdminWrapper';
import { useAdminPolling, type QdrantStatus, type CollectionInfo } from '@/hooks/useAdminSSE';
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

interface QdrantStats {
  rowCount: number;
  collectionName: string;
  dimension: number;
}

interface SearchStats {
  totalSearches: number;
  avgLatency: number;
  successRate: number;
}

const defaultStats: SearchStats = {
  totalSearches: 0,
  avgLatency: 0,
  successRate: 0,
};

export default function QdrantMonitor() {
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [stats, setStats] = useState<QdrantStats | null>(null);
  const [searchStats, setSearchStats] = useState<SearchStats>(defaultStats);
  const [degradeCount, setDegradeCount] = useState(0);
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set());

  // 使用通用 Admin SSE Hook 获取 Qdrant 状态和集合
  const { data: qdrantStatus, loading, error, refresh: refreshStatus } = useAdminPolling<QdrantStatus>({
    endpoint: '/api/qdrant/status',
    parser: (res) => res || { success: false, healthy: false, status: 'unknown', collection: 'chat_documents' },
    interval: 15000,
  });

  // 单独获取集合列表
  const { data: collectionsData, refresh: refreshCollections } = useAdminPolling<{ collections: string[] }>({
    endpoint: '/api/qdrant/collections',
    parser: (res) => res || { collections: [] },
    interval: 30000,
  });

  // 当集合列表更新时，获取每个集合的详细信息
  useEffect(() => {
    if (collectionsData?.collections) {
      Promise.all(
        collectionsData.collections.map(async (name: string) => {
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
            return {
              name,
              vectorsCount: 0,
              pointsCount: 0,
              status: 'error',
              indexed: false,
            } as CollectionInfo;
          }
        })
      ).then(setCollections).catch(() => {
        setCollections([]);
      });
    }
  }, [collectionsData]);

  // 手动刷新
  const fetchQdrantData = async () => {
    try {
      await refreshStatus();
      await refreshCollections();
      setDegradeCount(0);
    } catch (err) {
      setDegradeCount((prev) => prev + 1);
    }
  };

  const toggleCollection = (name: string) => {
    setExpandedCollections((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Database size={20} className="text-blue-600" />
          Qdrant 向量数据库
        </h2>
        <button
          onClick={fetchQdrantData}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="刷新"
        >
          <RefreshCw size={16} className="text-gray-500" />
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertTriangle size={16} />
          <span>{String(error)}</span>
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
          value={stats?.rowCount?.toLocaleString() ?? '0'}
          icon={<Activity size={18} className="text-purple-600" />}
          color="purple"
        />
        <StatusCard
          title="降级次数"
          value={degradeCount.toString()}
          icon={<AlertTriangle size={18} className={degradeCount > 0 ? 'text-yellow-600' : 'text-gray-400'} />}
          color={degradeCount > 0 ? 'yellow' : 'gray'}
        />
      </div>

      {/* 检索统计 */}
      <div className="bg-white dark:bg-gray-900 border rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">检索统计</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {searchStats.totalSearches.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500">总搜索次数</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {searchStats.avgLatency.toFixed(0)}ms
            </div>
            <div className="text-xs text-gray-500">平均延迟</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {(searchStats.successRate * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500">成功率</div>
          </div>
        </div>
      </div>

      {/* 集合列表 */}
      <div className="bg-white dark:bg-gray-900 border rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">集合管理</h3>
        {collections.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            暂无集合
          </div>
        ) : (
          <div className="space-y-2">
            {collections.map((collection, idx) => (
              <div
                key={`collection-${collection.name}-${idx}`}
                className="border rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => toggleCollection(collection.name)}
                  className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Database size={16} className="text-gray-400" />
                    <span className="font-medium text-gray-900 dark:text-white">
                      {collection.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500">
                      {collection.pointsCount.toLocaleString()} 点
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      collection.status === 'green'
                        ? 'bg-green-100 text-green-800'
                        : collection.status === 'yellow'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-600'
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
                        <div className="font-medium text-gray-900 dark:text-white">
                          {stats?.dimension ?? 1024}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">向量数量</div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {collection.vectorsCount.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">已索引</div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {collection.indexed ? '是' : '否'}
                        </div>
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
      <div className="text-2xl font-bold mt-2 text-gray-900 dark:text-white">
        {value}
      </div>
    </div>
  );
}

// 包装组件（供外部使用）
export function QdrantMonitorWrapper() {
  return (
    <SafeAdminWrapper moduleName="QdrantMonitor">
      <QdrantMonitor />
    </SafeAdminWrapper>
  );
}