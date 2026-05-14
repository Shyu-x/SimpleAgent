'use client';

/**
 * 模型配置管理页面
 *
 * 功能：
 * - 模型列表展示与配置
 * - 健康状态监控
 * - 调用统计
 * - 熔断器状态
 */

import React, { useState, useCallback, useEffect } from 'react';
import { fetchApi } from '@/lib/apiClient';
import { useAdminPolling } from '@/hooks/useAdminSSE';

// ============ 类型定义 ============

interface ModelConfig {
  id: string;
  name: string;
  provider: 'minimax' | 'openai' | 'anthropic';
  model: string;
  enabled: boolean;
  priority: number;
  maxTokens: number;
  timeout: number;
  maxConcurrent: number;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  stats: {
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
    avgLatency: number;
    p50Latency: number;
    p99Latency: number;
    totalTokens: number;
  };
  circuitBreaker: {
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
    lastFailure: string | null;
    recoveryTimeout: number;
  };
}

interface ModelStats {
  totalRequests: number;
  totalTokens: number;
  avgLatency: number;
  successRate: number;
  topModels: { model: string; calls: number }[];
}

// ============ 主组件 ============

export default function ModelConfigPage() {
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelConfig | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'stats'>('list');

  // SSE 订阅 models 数据
  const { data: modelsData, loading: modelsLoading, refresh: refreshModels } = useAdminPolling<ModelConfig[]>({
    endpoint: '/api/admin/models',
    parser: (res) => res?.data?.data?.models || [],
    interval: 30000,
  });

  // SSE 订阅 stats 数据
  const { data: statsData, loading: statsLoading, refresh: refreshStats } = useAdminPolling<ModelStats | null>({
    endpoint: '/api/admin/models/stats',
    parser: (res) => res?.data?.data || null,
    interval: 30000,
  });

  const models = modelsData || [];
  const loading = modelsLoading || statsLoading;

  // 同步 stats
  useEffect(() => {
    if (statsData) setStats(statsData);
  }, [statsData]);

  const fetchModels = useCallback(async () => {
    await refreshModels();
  }, [refreshModels]);

  const fetchStats = useCallback(async () => {
    await refreshStats();
  }, [refreshStats]);

  const toggleModel = async (modelId: string, enabled: boolean) => {
    try {
      await fetchApi(`/api/admin/models/${modelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      fetchModels();
    } catch (err) {
      console.error('Failed to toggle model:', err);
    }
  };

  const resetCircuitBreaker = async (modelId: string) => {
    try {
      await fetchApi(`/api/admin/models/${modelId}/circuit-breaker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      fetchModels();
    } catch (err) {
      console.error('Failed to reset circuit breaker:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">模型配置</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 rounded ${
              activeTab === 'list'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            模型列表
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`px-4 py-2 rounded ${
              activeTab === 'stats'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            统计数据
          </button>
        </div>
      </div>

      {/* 概览卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <OverviewCard
          title="总模型数"
          value={models.length}
          icon="🤖"
        />
        <OverviewCard
          title="在线模型"
          value={models.filter((m) => m.healthStatus === 'healthy').length}
          icon="✅"
          color="green"
        />
        <OverviewCard
          title="总调用次数"
          value={stats?.totalRequests ?? 0}
          icon="📊"
        />
        <OverviewCard
          title="成功率"
          value={stats ? `${(stats.successRate * 100).toFixed(1)}%` : '0%'}
          icon="🎯"
          color="blue"
        />
      </div>

      {/* 内容区域 */}
      {activeTab === 'list' ? (
        <ModelList
          models={models}
          selectedModel={selectedModel}
          onSelect={setSelectedModel}
          onToggle={toggleModel}
          onResetCircuit={resetCircuitBreaker}
        />
      ) : (
        stats && <ModelStatsView stats={stats} models={models} />
      )}
    </div>
  );
}

// ============ 概览卡片 ============

function OverviewCard({
  title,
  value,
  icon,
  color = 'gray',
}: {
  title: string;
  value: number | string;
  icon: string;
  color?: 'gray' | 'green' | 'blue';
}) {
  const colorClasses = {
    gray: 'bg-gray-50 border-gray-200',
    green: 'bg-green-50 border-green-200',
    blue: 'bg-blue-50 border-blue-200',
  };

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="text-sm text-gray-500">{title}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

// ============ 模型列表 ============

function ModelList({
  models,
  selectedModel,
  onSelect,
  onToggle,
  onResetCircuit,
}: {
  models: ModelConfig[];
  selectedModel: ModelConfig | null;
  onSelect: (m: ModelConfig | null) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onResetCircuit: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 模型列表 */}
      <div className="lg:col-span-2 bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                  模型
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                  状态
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                  健康度
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                  熔断器
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {models.map((model) => (
                <tr
                  key={model.id}
                  className={`hover:bg-gray-50 cursor-pointer ${
                    selectedModel?.id === model.id ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => onSelect(model)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{model.name}</div>
                    <div className="text-sm text-gray-500">
                      {model.provider} / {model.model}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={model.enabled}
                        onChange={(e) => {
                          e.stopPropagation();
                          onToggle(model.id, e.target.checked);
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                    </label>
                  </td>
                  <td className="px-4 py-3">
                    <HealthStatusBadge status={model.healthStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <CircuitBreakerStatus state={model.circuitBreaker.state} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(model);
                      }}
                      className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      详情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 模型详情面板 */}
      <div className="bg-white border rounded-lg p-4">
        {selectedModel ? (
          <ModelDetail
            model={selectedModel}
            onClose={() => onSelect(null)}
            onResetCircuit={onResetCircuit}
          />
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-400">
            选择一个模型查看详情
          </div>
        )}
      </div>
    </div>
  );
}

// ============ 模型详情 ============

function ModelDetail({
  model,
  onClose,
  onResetCircuit,
}: {
  model: ModelConfig;
  onClose: () => void;
  onResetCircuit: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-lg">{model.name}</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>

      {/* 基本信息 */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">提供商</span>
          <span className="font-medium">{model.provider}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">模型</span>
          <span className="font-medium">{model.model}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">最大Token</span>
          <span className="font-medium">{model.maxTokens.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">超时</span>
          <span className="font-medium">{model.timeout}ms</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">最大并发</span>
          <span className="font-medium">{model.maxConcurrent}</span>
        </div>
      </div>

      {/* 统计信息 */}
      <div className="border-t pt-4">
        <h4 className="font-medium mb-3">调用统计</h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-gray-50 rounded p-2">
            <div className="text-gray-500">总调用</div>
            <div className="font-bold">{model.stats.totalCalls.toLocaleString()}</div>
          </div>
          <div className="bg-gray-50 rounded p-2">
            <div className="text-gray-500">成功</div>
            <div className="font-bold text-green-600">
              {model.stats.successCalls.toLocaleString()}
            </div>
          </div>
          <div className="bg-gray-50 rounded p-2">
            <div className="text-gray-500">失败</div>
            <div className="font-bold text-red-600">
              {model.stats.failedCalls.toLocaleString()}
            </div>
          </div>
          <div className="bg-gray-50 rounded p-2">
            <div className="text-gray-500">平均延迟</div>
            <div className="font-bold">{model.stats.avgLatency.toFixed(0)}ms</div>
          </div>
          <div className="bg-gray-50 rounded p-2">
            <div className="text-gray-500">P50延迟</div>
            <div className="font-bold">{model.stats.p50Latency.toFixed(0)}ms</div>
          </div>
          <div className="bg-gray-50 rounded p-2">
            <div className="text-gray-500">P99延迟</div>
            <div className="font-bold">{model.stats.p99Latency.toFixed(0)}ms</div>
          </div>
        </div>
      </div>

      {/* 熔断器状态 */}
      <div className="border-t pt-4">
        <h4 className="font-medium mb-3">熔断器状态</h4>
        <div className="bg-gray-50 rounded p-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">状态</span>
            <CircuitBreakerStatus state={model.circuitBreaker.state} />
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">失败计数</span>
            <span className="font-medium">{model.circuitBreaker.failureCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">恢复超时</span>
            <span className="font-medium">{model.circuitBreaker.recoveryTimeout}s</span>
          </div>
          {model.circuitBreaker.lastFailure && (
            <div className="flex justify-between">
              <span className="text-gray-500">最后失败</span>
              <span className="font-medium text-xs">
                {new Date(model.circuitBreaker.lastFailure).toLocaleString()}
              </span>
            </div>
          )}
        </div>
        {model.circuitBreaker.state === 'open' && (
          <button
            onClick={() => onResetCircuit(model.id)}
            className="mt-3 w-full px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
          >
            重置熔断器
          </button>
        )}
      </div>
    </div>
  );
}

// ============ 统计视图 ============

function ModelStatsView({ stats, models }: { stats: ModelStats; models: ModelConfig[] }) {
  return (
    <div className="space-y-6">
      {/* 概览统计 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border rounded-lg p-6">
          <div className="text-sm text-gray-500 mb-1">总请求数</div>
          <div className="text-3xl font-bold">{stats.totalRequests.toLocaleString()}</div>
        </div>
        <div className="bg-white border rounded-lg p-6">
          <div className="text-sm text-gray-500 mb-1">总Token消耗</div>
          <div className="text-3xl font-bold">{stats.totalTokens.toLocaleString()}</div>
        </div>
        <div className="bg-white border rounded-lg p-6">
          <div className="text-sm text-gray-500 mb-1">平均延迟</div>
          <div className="text-3xl font-bold">{stats.avgLatency.toFixed(0)}ms</div>
        </div>
      </div>

      {/* 模型调用分布 */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="font-semibold text-lg mb-4">模型调用分布</h3>
        <div className="space-y-3">
          {stats.topModels.map((item) => {
            const maxCalls = Math.max(...stats.topModels.map((m) => m.calls));
            const percentage = maxCalls > 0 ? (item.calls / maxCalls) * 100 : 0;
            return (
              <div key={item.model} className="flex items-center gap-4">
                <span className="w-32 truncate text-sm">{item.model}</span>
                <div className="flex-1 bg-gray-200 rounded-full h-4">
                  <div
                    className="bg-blue-600 h-4 rounded-full transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="w-20 text-right text-sm">{item.calls.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 模型健康状态 */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="font-semibold text-lg mb-4">模型健康状态</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {models.map((model) => (
            <div key={model.id} className="border rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-medium">{model.name}</div>
                  <div className="text-xs text-gray-500">{model.model}</div>
                </div>
                <HealthStatusBadge status={model.healthStatus} />
              </div>
              <div className="mt-2 text-xs text-gray-500">
                成功率:{' '}
                {model.stats.totalCalls > 0
                  ? ((model.stats.successCalls / model.stats.totalCalls) * 100).toFixed(1)
                  : 0}
                %
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ 状态指示器 ============

function HealthStatusBadge({ status }: { status: ModelConfig['healthStatus'] }) {
  const styles = {
    healthy: 'bg-green-100 text-green-800',
    degraded: 'bg-yellow-100 text-yellow-800',
    unhealthy: 'bg-red-100 text-red-800',
    unknown: 'bg-gray-100 text-gray-600',
  };
  const labels = {
    healthy: '健康',
    degraded: '降级',
    unhealthy: '异常',
    unknown: '未知',
  };

  return (
    <span className={`px-2 py-1 rounded text-xs ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function CircuitBreakerStatus({ state }: { state: ModelConfig['circuitBreaker']['state'] }) {
  const styles = {
    closed: 'bg-green-100 text-green-800',
    open: 'bg-red-100 text-red-800',
    'half-open': 'bg-yellow-100 text-yellow-800',
  };
  const labels = {
    closed: '关闭',
    open: '熔断',
    'half-open': '半开',
  };

  return (
    <span className={`px-2 py-1 rounded text-xs ${styles[state]}`}>
      {labels[state]}
    </span>
  );
}
