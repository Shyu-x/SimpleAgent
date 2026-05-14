'use client';

/**
 * 链路追踪查看器
 *
 * 功能：
 * - Trace 列表与筛选
 * - Trace 详情与时间线
 * - 瀑布流时间线展示
 * - 各环节耗时统计
 * - 慢请求与错误标识
 */

import React, { useState, useCallback, useEffect } from 'react';
import { fetchApi } from '@/lib/apiClient';
import { useAdminPolling } from '@/hooks/useAdminSSE';

// ============ 类型定义 ============

interface Trace {
  traceId: string;
  operationName: string;
  serviceName: string;
  startTime: number;
  endTime: number;
  duration: number;
  status: 'success' | 'error' | 'partial';
  totalSpans: number;
  metadata?: Record<string, unknown>;
}

interface TraceSpan {
  spanId: string;
  operationName: string;
  serviceName: string;
  duration: number;
  startTime: number;
  endTime: number;
  status: 'ok' | 'error';
  tags?: Record<string, string>;
  logs?: TraceEvent[];
  children?: TraceSpan[];
  attributes?: Record<string, unknown>;
}

interface TraceEvent {
  timestamp: number;
  event?: string;
  message?: string;
  attributes?: Record<string, unknown>;
}

interface TraceStats {
  totalTraces: number;
  avgDuration: number;
  successRate: number;
  slowTraces: number;
  errorTraces: number;
  tracesByType: Record<string, number>;
  durationDistribution: { bucket: string; count: number }[];
  overview?: {
    totalTraces: number;
    errorRate: string;
    errorCount: number;
  };
  performance?: {
    avgDuration: string | number;
  };
  distribution?: {
    byOperation: Record<string, number>;
  };
}

interface TraceFilter {
  status: 'all' | 'success' | 'error' | 'partial';
  type: 'all' | 'chat' | 'agent' | 'rag' | 'tool';
  durationRange: 'all' | 'fast' | 'normal' | 'slow' | 'very-slow';
  searchQuery: string;
  timeRange: 'all' | '1h' | '6h' | '24h' | '7d';
}

// ============ 主组件 ============

export default function TraceViewerPage() {
  const [stats, setStats] = useState<TraceStats | null>(null);
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);
  const [filter, setFilter] = useState<TraceFilter>({
    status: 'all',
    type: 'all',
    durationRange: 'all',
    searchQuery: '',
    timeRange: 'all',
  });
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');

  // SSE 订阅 traces 数据
  const { data: tracesData, loading: tracesLoading, refresh: refreshTraces } = useAdminPolling<Trace[]>({
    endpoint: `/api/admin/traces?status=${filter.status !== 'all' ? filter.status : ''}&type=${filter.type !== 'all' ? filter.type : ''}&duration=${filter.durationRange !== 'all' ? filter.durationRange : ''}&timeRange=${filter.timeRange !== 'all' ? filter.timeRange : ''}`,
    parser: (res) => res?.data?.data?.traces || res?.data?.traces || [],
    interval: 15000,
  });

  // SSE 订阅 stats 数据
  const { data: statsData, loading: statsLoading, refresh: refreshStats } = useAdminPolling<TraceStats | null>({
    endpoint: '/api/admin/traces/stats',
    parser: (res) => {
      const data = res?.data;
      if (data?.overview) {
        return {
          totalTraces: data.overview.totalTraces,
          avgDuration: parseInt(data.performance?.avgDuration) || 0,
          successRate: 1 - (parseFloat(data.overview.errorRate) / 100),
          slowTraces: 0,
          errorTraces: data.overview.errorCount,
          tracesByType: data.distribution?.byOperation || {},
          durationDistribution: []
        };
      }
      return data || null;
    },
    interval: 15000,
  });

  const traces = tracesData || [];
  const loading = tracesLoading || statsLoading;

  // 同步 stats
  useEffect(() => {
    if (statsData) setStats(statsData);
  }, [statsData]);

  const fetchTraces = useCallback(async () => {
    await refreshTraces();
  }, [refreshTraces]);

  const fetchStats = useCallback(async () => {
    await refreshStats();
  }, [refreshStats]);

  const filteredTraces = traces.filter((t) => {
    if (filter.searchQuery) {
      const query = filter.searchQuery.toLowerCase();
      return (
        t.traceId.toLowerCase().includes(query) ||
        t.operationName.toLowerCase().includes(query) ||
        JSON.stringify(t.metadata || {}).toLowerCase().includes(query)
      );
    }
    return true;
  });

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
        <h1 className="text-2xl font-bold">链路追踪</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('list')}
            className={`px-4 py-2 rounded ${
              viewMode === 'list'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            列表视图
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={`px-4 py-2 rounded ${
              viewMode === 'timeline'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            时间线视图
          </button>
        </div>
      </div>

      {/* 统计概览 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard
            title="总追踪数"
            value={stats.totalTraces}
            icon="📊"
          />
          <StatCard
            title="平均耗时"
            value={`${stats.avgDuration.toFixed(0)}ms`}
            icon="⏱️"
            color="blue"
          />
          <StatCard
            title="成功率"
            value={`${(stats.successRate * 100).toFixed(1)}%`}
            icon="✅"
            color="green"
          />
          <StatCard
            title="慢请求"
            value={stats.slowTraces}
            icon="🐌"
            color="yellow"
          />
          <StatCard
            title="错误"
            value={stats.errorTraces}
            icon="❌"
            color="red"
          />
        </div>
      )}

      {/* 筛选器 */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex flex-wrap gap-4">
          {/* 搜索框 */}
          <div className="flex-1 min-w-64">
            <input
              type="text"
              placeholder="搜索 trace ID 或元数据..."
              value={filter.searchQuery}
              onChange={(e) =>
                setFilter((prev) => ({ ...prev, searchQuery: e.target.value }))
              }
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 状态筛选 */}
          <select
            value={filter.status}
            onChange={(e) =>
              setFilter((prev) => ({
                ...prev,
                status: e.target.value as TraceFilter['status'],
              }))
            }
            className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部状态</option>
            <option value="success">成功</option>
            <option value="error">错误</option>
            <option value="partial">部分成功</option>
          </select>

          {/* 类型筛选 */}
          <select
            value={filter.type}
            onChange={(e) =>
              setFilter((prev) => ({
                ...prev,
                type: e.target.value as TraceFilter['type'],
              }))
            }
            className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部类型</option>
            <option value="chat">聊天</option>
            <option value="agent">Agent</option>
            <option value="rag">RAG</option>
            <option value="tool">工具</option>
          </select>

          {/* 耗时筛选 */}
          <select
            value={filter.durationRange}
            onChange={(e) =>
              setFilter((prev) => ({
                ...prev,
                durationRange: e.target.value as TraceFilter['durationRange'],
              }))
            }
            className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部耗时</option>
            <option value="fast">快速 (&lt;500ms)</option>
            <option value="normal">正常 (500ms-2s)</option>
            <option value="slow">慢 (2s-5s)</option>
            <option value="very-slow">极慢 (&gt;5s)</option>
          </select>

          {/* 时间范围 */}
          <select
            value={filter.timeRange}
            onChange={(e) =>
              setFilter((prev) => ({
                ...prev,
                timeRange: e.target.value as TraceFilter['timeRange'],
              }))
            }
            className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部时间</option>
            <option value="1h">最近 1 小时</option>
            <option value="6h">最近 6 小时</option>
            <option value="24h">最近 24 小时</option>
            <option value="7d">最近 7 天</option>
          </select>
        </div>
      </div>

      {/* 主内容区域 */}
      {viewMode === 'list' ? (
        <TraceListView
          traces={filteredTraces}
          selectedTrace={selectedTrace}
          onSelect={async (t) => {
            if (!t) {
              setSelectedTrace(null);
              return;
            }
            // 获取完整详情（包含 spans）
            try {
              const { data } = await fetchApi<{ data?: Trace & { spans: TraceSpan[] } }>(`/api/admin/traces/${t.traceId}`);
              setSelectedTrace(data?.data || t);
            } catch {
              setSelectedTrace(t);
            }
          }}
        />
      ) : (
        <TraceTimelineView
          traces={filteredTraces}
          selectedTrace={selectedTrace}
          onSelect={setSelectedTrace}
        />
      )}
    </div>
  );
}

// ============ 统计卡片 ============

function StatCard({
  title,
  value,
  icon,
  color = 'gray',
}: {
  title: string;
  value: number | string;
  icon: string;
  color?: 'gray' | 'green' | 'blue' | 'yellow' | 'red';
}) {
  const colorClasses = {
    gray: 'bg-gray-50 border-gray-200',
    green: 'bg-green-50 border-green-200',
    blue: 'bg-blue-50 border-blue-200',
    yellow: 'bg-yellow-50 border-yellow-200',
    red: 'bg-red-50 border-red-200',
  };

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        <span>{icon}</span>
        <span className="text-sm text-gray-500">{title}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

// ============ 列表视图 ============

function TraceListView({
  traces,
  selectedTrace,
  onSelect,
}: {
  traces: Trace[];
  selectedTrace: Trace | null;
  onSelect: (t: Trace | null) => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 追踪列表 */}
      <div className="lg:col-span-1 bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b">
          <span className="text-sm text-gray-500">
            {traces.length} 个追踪
          </span>
        </div>
        <div className="max-h-[calc(100vh-400px)] overflow-y-auto">
          {traces.map((trace) => (
            <TraceListItem
              key={trace.traceId}
              trace={trace}
              isSelected={selectedTrace?.traceId === trace.traceId}
              onClick={() => onSelect(trace)}
            />
          ))}
          {traces.length === 0 && (
            <div className="p-8 text-center text-gray-400">暂无追踪数据</div>
          )}
        </div>
      </div>

      {/* 追踪详情 */}
      <div className="lg:col-span-2 bg-white border rounded-lg">
        {selectedTrace ? (
          <TraceDetailPanel trace={selectedTrace} />
        ) : (
          <div className="flex items-center justify-center h-96 text-gray-400">
            选择一个追踪查看详情
          </div>
        )}
      </div>
    </div>
  );
}

// ============ 追踪列表项 ============

function TraceListItem({
  trace,
  isSelected,
  onClick,
}: {
  trace: Trace;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`p-4 border-b cursor-pointer hover:bg-gray-50 transition-colors ${
        isSelected ? 'bg-blue-50' : ''
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-mono text-gray-500">
          {trace.traceId.slice(0, 8)}...
        </span>
        <DurationBadge duration={trace.duration} />
      </div>
      <div className="flex items-center gap-2 mb-1">
        <TypeBadge type={trace.serviceName as Trace['serviceName']} />
        <StatusDot status={trace.status} />
      </div>
      <div className="text-xs text-gray-400">
        {new Date(trace.startTime).toLocaleTimeString()}
      </div>
    </div>
  );
}

// ============ 追踪详情面板 ============

function TraceDetailPanel({ trace }: { trace: Trace }) {
  const [activeTab, setActiveTab] = useState<'spans' | 'events' | 'metadata'>('spans');
  const spans = (trace as any).spans || [];
  const metadata = (trace as any).metadata || {};

  return (
    <div className="p-6 space-y-4">
      {/* 头部信息 */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="font-mono text-lg">{trace.traceId}</h2>
          <p className="text-sm text-gray-500">
            {new Date(trace.startTime).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <TypeBadge type={trace.serviceName as Trace['serviceName']} />
          <StatusBadge status={trace.status} />
        </div>
      </div>

      {/* 概览卡片 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-50 rounded p-3">
          <div className="text-sm text-gray-500">总耗时</div>
          <div className="text-xl font-bold">{trace.duration}ms</div>
        </div>
        <div className="bg-gray-50 rounded p-3">
          <div className="text-sm text-gray-500">Span 数量</div>
          <div className="text-xl font-bold">{spans.length || trace.totalSpans || 0}</div>
        </div>
        <div className="bg-gray-50 rounded p-3">
          <div className="text-sm text-gray-500">事件数量</div>
          <div className="text-xl font-bold">
            {spans.reduce ? spans.reduce((acc: number, s: TraceSpan) => acc + (s.logs?.length || 0), 0) : 0}
          </div>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab('spans')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'spans'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500'
          }`}
        >
          Spans
        </button>
        <button
          onClick={() => setActiveTab('events')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'events'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500'
          }`}
        >
          事件
        </button>
        <button
          onClick={() => setActiveTab('metadata')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'metadata'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500'
          }`}
        >
          元数据
        </button>
      </div>

      {/* Tab 内容 */}
      <div className="max-h-96 overflow-y-auto">
        {activeTab === 'spans' && <SpanList spans={spans} />}
        {activeTab === 'events' && <EventList spans={spans} />}
        {activeTab === 'metadata' && (
          <MetadataView metadata={metadata} />
        )}
      </div>
    </div>
  );
}

// ============ Span 列表 ============

function SpanList({ spans }: { spans: TraceSpan[] }) {
  if (spans.length === 0) {
    return <div className="text-center py-8 text-gray-400">暂无 Span 数据</div>;
  }

  const maxDuration = Math.max(...spans.map((s) => s.duration));

  return (
    <div className="space-y-2">
      {spans.map((span) => (
        <div
          key={span.spanId}
          className="border rounded-lg p-3 hover:bg-gray-50"
        >
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <span className="font-medium">{span.operationName}</span>
              <span className="text-xs text-gray-500">{span.serviceName}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                {(span.startTime / 1000).toFixed(2)}s
              </span>
              <SpanStatusBadge status={span.status} />
            </div>
          </div>

          {/* 耗时条 */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${
                span.status === 'error'
                  ? 'bg-red-500'
                  : 'bg-blue-500'
              }`}
              style={{ width: `${(span.duration / maxDuration) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{span.duration}ms</span>
            {span.attributes && Object.keys(span.attributes).length > 0 && (
              <span>{Object.keys(span.attributes).length} 个属性</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============ 事件列表 ============

function EventList({ spans }: { spans: TraceSpan[] }) {
  const allEvents = spans.flatMap((span) =>
    (span.logs || []).map((event) => ({
      ...event,
      spanName: span.operationName,
    }))
  );

  if (allEvents.length === 0) {
    return <div className="text-center py-8 text-gray-400">暂无事件数据</div>;
  }

  return (
    <div className="space-y-2">
      {allEvents
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((event, idx) => (
          <div
            key={idx}
            className="border rounded p-3 hover:bg-gray-50"
          >
            <div className="flex justify-between items-start">
              <div>
                <span className="font-medium">{event.event || event.message || 'event'}</span>
                <span className="ml-2 text-xs text-gray-500">
                  来自 {event.spanName}
                </span>
              </div>
              <span className="text-xs text-gray-400">
                {(event.timestamp / 1000).toFixed(3)}s
              </span>
            </div>
            {event.attributes && Object.keys(event.attributes).length > 0 && (
              <div className="mt-2 text-xs text-gray-500">
                {Object.entries(event.attributes).map(([key, value]) => (
                  <span key={key} className="mr-3">
                    {key}: {String(value)}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
    </div>
  );
}

// ============ 元数据视图 ============

function MetadataView({ metadata }: { metadata: Record<string, unknown> }) {
  const entries = Object.entries(metadata);

  if (entries.length === 0) {
    return <div className="text-center py-8 text-gray-400">暂无元数据</div>;
  }

  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => (
        <div key={key} className="border rounded p-3">
          <div className="text-sm font-medium text-gray-600 mb-1">{key}</div>
          <pre className="text-xs text-gray-800 overflow-x-auto">
            {typeof value === 'object'
              ? JSON.stringify(value, null, 2)
              : String(value)}
          </pre>
        </div>
      ))}
    </div>
  );
}

// ============ 时间线视图 ============

function TraceTimelineView({
  traces,
  selectedTrace,
  onSelect,
}: {
  traces: Trace[];
  selectedTrace: Trace | null;
  onSelect: (t: Trace | null) => void;
}) {
  return (
    <div className="space-y-4">
      {traces.map((trace) => (
        <div
          key={trace.traceId}
          onClick={() => onSelect(trace)}
          className={`bg-white border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${
            selectedTrace?.traceId === trace.traceId ? 'ring-2 ring-blue-200' : ''
          }`}
        >
          {/* 追踪头部 */}
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm">{trace.traceId.slice(0, 8)}...</span>
              <TypeBadge type={trace.serviceName as Trace['serviceName']} />
              <StatusBadge status={trace.status} />
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-500">
                {new Date(trace.startTime).toLocaleTimeString()}
              </span>
              <DurationBadge duration={trace.duration} />
            </div>
          </div>

          {/* 瀑布流时间线（需要完整 spans 数据，仅在详情时显示） */}
          {(trace as any).spans?.length > 0 && <TraceWaterfall trace={trace} />}
        </div>
      ))}
      {traces.length === 0 && (
        <div className="text-center py-12 text-gray-400">暂无追踪数据</div>
      )}
    </div>
  );
}

// ============ 瀑布流时间线 ============

function TraceWaterfall({ trace }: { trace: Trace }) {
  const spans = (trace as any).spans || [];
  if (spans.length === 0) return null;

  const totalDuration = trace.duration;
  const startTime = Math.min(...spans.map((s: TraceSpan) => s.startTime));

  return (
    <div className="relative">
      {/* 时间刻度 */}
      <div className="flex justify-between text-xs text-gray-400 mb-2 pl-20">
        <span>0ms</span>
        <span>{Math.floor(totalDuration * 0.25)}ms</span>
        <span>{Math.floor(totalDuration * 0.5)}ms</span>
        <span>{Math.floor(totalDuration * 0.75)}ms</span>
        <span>{totalDuration}ms</span>
      </div>

      {/* Span 条 */}
      <div className="space-y-1">
        {spans.map((span: TraceSpan) => {
          const left = ((span.startTime - startTime) / totalDuration) * 100;
          const width = (span.duration / totalDuration) * 100;

          return (
            <div key={span.spanId} className="flex items-center gap-2 h-6">
              {/* 服务名称 */}
              <div className="w-20 truncate text-xs text-gray-600">
                {span.serviceName}
              </div>

              {/* 时间线条 */}
              <div className="relative flex-1 h-full bg-gray-100 rounded">
                <div
                  className={`absolute h-full rounded ${
                    span.status === 'error'
                      ? 'bg-red-400'
                      : 'bg-blue-400'
                  }`}
                  style={{
                    left: `${Math.max(0, left)}%`,
                    width: `${Math.min(100 - left, width)}%`,
                  }}
                  title={`${span.operationName}: ${span.duration}ms`}
                />
              </div>

              {/* 耗时 */}
              <div className="w-16 text-right text-xs text-gray-500">
                {span.duration}ms
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============ 状态指示器 ============

function DurationBadge({ duration }: { duration: number }) {
  const color =
    duration > 5000 ? 'red' : duration > 2000 ? 'yellow' : 'green';
  const bgClasses = {
    red: 'bg-red-100 text-red-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    green: 'bg-green-100 text-green-700',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs ${bgClasses[color]}`}>
      {duration}ms
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    partial: 'bg-yellow-500',
  };
  return (
    <div
      className={`w-2 h-2 rounded-full ${colors[status as keyof typeof colors]}`}
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    success: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800',
    partial: 'bg-yellow-100 text-yellow-800',
  };
  const labels = {
    success: '成功',
    error: '错误',
    partial: '部分成功',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs ${styles[status as keyof typeof styles]}`}>
      {labels[status as keyof typeof labels]}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const styles = {
    chat: 'bg-purple-100 text-purple-800',
    agent: 'bg-blue-100 text-blue-800',
    rag: 'bg-green-100 text-green-800',
    tool: 'bg-orange-100 text-orange-800',
  };
  const labels = {
    chat: '聊天',
    agent: 'Agent',
    rag: 'RAG',
    tool: '工具',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs ${styles[type as keyof typeof styles]}`}>
      {labels[type as keyof typeof labels]}
    </span>
  );
}

function SpanStatusBadge({ status }: { status: string }) {
  const styles = {
    success: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
    pending: 'bg-yellow-100 text-yellow-700',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs ${styles[status as keyof typeof styles]}`}>
      {status === 'success' ? '成功' : status === 'error' ? '错误' : '进行中'}
    </span>
  );
}
