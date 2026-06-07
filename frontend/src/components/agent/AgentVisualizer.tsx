'use client';

/**
 * Agent 执行可视化组件
 * 实时展示 Agent 执行全流程
 */

import React, { useState, useEffect, useCallback } from 'react';
import ResponsiveModal from '@/components/ui/ResponsiveModal';
import { BACKEND_URL } from '@/lib/config';

/**
 * API返回的Span结构
 */
interface Span {
  spanId: string;
  name: string;
  traceId: string;
  parentSpanId: string | null;
  startTime: number;
  endTime: number | null;
  duration: number | null;
  status: string;
  tags: Record<string, string>;
  events: Array<{ name: string; timestamp: number; data: Record<string, unknown> }>;
  childCount: number;
}

/**
 * API返回的Trace结构
 */
interface ApiTraceData {
  traceId: string;
  operationName: string;
  serviceName: string;
  startTime: number;
  endTime: number | null;
  duration: number | null;
  status: string;
  spans: Span[];
}

/**
 * 将API的Span转换为组件期望的TimelineItem
 */
function spanToTimelineItem(span: Span, children: Span[], depth: number): TimelineItem {
  // 从span.name提取类型 (如 "intent_classify" -> "intent_detection")
  const typeMap: Record<string, string> = {
    'intent_classify': 'intent_detection',
    'intent_classification': 'intent_detection',
    'query_rewrite': 'query_rewrite',
    'query_decompose': 'query_decompose',
    'tool_selection': 'tool_selection',
    'tool_execution': 'tool_execution',
    'model_call': 'model_call',
    'model_request': 'model_call',
    'result_aggregation': 'result_aggregation',
    'rag_query': 'tool_execution',
    'search': 'tool_execution'
  };

  const type = typeMap[span.name] || span.name || 'unknown';

  // 转换状态
  const statusMap: Record<string, TimelineItem['status']> = {
    'ok': 'success',
    'OK': 'success',
    'success': 'success',
    'error': 'error',
    'ERROR': 'error',
    'timeout': 'error',
    'running': 'running'
  };
  const status = statusMap[span.status] || 'pending';

  // 从tags提取metadata
  const metadata: Record<string, unknown> = {};
  if (span.tags) {
    if (span.tags.intent) metadata.intent = span.tags.intent;
    if (span.tags.tool) metadata.tool = span.tags.tool;
    if (span.tags.model) metadata.model = span.tags.model;
    if (span.tags.error) metadata.error = span.tags.error;
    if (span.tags.query) metadata.query = span.tags.query;
  }

  return {
    id: span.spanId,
    type,
    name: span.name,
    status,
    duration: span.duration || 0,
    depth,
    startTime: span.startTime,
    endTime: span.endTime || Date.now(),
    metadata
  };
}

/**
 * 将API返回的Trace转换为组件期望的TraceData
 */
function transformTraceData(apiTrace: ApiTraceData): TraceData {
  // 建立parent-child映射
  const spanMap = new Map<string, Span>();
  const childrenMap = new Map<string, Span[]>();

  for (const span of apiTrace.spans) {
    spanMap.set(span.spanId, span);
    const parentId = span.parentSpanId || '';
    if (!childrenMap.has(parentId)) {
      childrenMap.set(parentId, []);
    }
    childrenMap.get(parentId)!.push(span);
  }

  // 递归构建timeline
  const buildTimeline = (parentId: string, depth: number): TimelineItem[] => {
    const children = childrenMap.get(parentId) || [];
    const items: TimelineItem[] = [];

    for (const span of children) {
      items.push(spanToTimelineItem(span, [], depth));
      // 添加子span
      const childItems = buildTimeline(span.spanId, depth + 1);
      items.push(...childItems);
    }

    return items;
  };

  // 从根span开始构建
  const rootSpan = apiTrace.spans.find(s => !s.parentSpanId);
  const steps = rootSpan ? buildTimeline(rootSpan.parentSpanId || '', 0) : [];

  // 计算统计信息
  const byType: Record<string, { count: number; totalDuration: number; errors: number }> = {};
  for (const span of apiTrace.spans) {
    const type = span.name || 'unknown';
    if (!byType[type]) {
      byType[type] = { count: 0, totalDuration: 0, errors: 0 };
    }
    byType[type].count++;
    byType[type].totalDuration += span.duration || 0;
    if (span.status === 'error' || span.status === 'ERROR') {
      byType[type].errors++;
    }
  }

  return {
    traceId: apiTrace.traceId,
    query: apiTrace.operationName, // operationName 作为 query
    intent: null,
    status: apiTrace.status === 'ok' || apiTrace.status === 'OK' ? 'success' : apiTrace.status,
    totalDuration: apiTrace.duration || 0,
    startTime: apiTrace.startTime,
    steps,
    stats: {
      totalDuration: apiTrace.duration || 0,
      stepCount: apiTrace.spans.length,
      byType
    }
  };
}

// 步骤类型颜色映射
const STEP_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  intent_detection: { bg: 'bg-indigo-100', border: 'border-indigo-500', text: 'text-indigo-700' },
  query_rewrite: { bg: 'bg-violet-100', border: 'border-violet-500', text: 'text-violet-700' },
  query_decompose: { bg: 'bg-purple-100', border: 'border-purple-500', text: 'text-purple-700' },
  tool_selection: { bg: 'bg-pink-100', border: 'border-pink-500', text: 'text-pink-700' },
  tool_execution: { bg: 'bg-orange-100', border: 'border-orange-500', text: 'text-orange-700' },
  model_call: { bg: 'bg-teal-100', border: 'border-teal-500', text: 'text-teal-700' },
  result_aggregation: { bg: 'bg-green-100', border: 'border-green-500', text: 'text-green-700' },
  error: { bg: 'bg-red-100', border: 'border-red-500', text: 'text-red-700' }
};

// 步骤类型中文名
const STEP_NAMES: Record<string, string> = {
  intent_detection: '意图识别',
  query_rewrite: '问题改写',
  query_decompose: '问题拆分',
  tool_selection: '工具选择',
  tool_execution: '工具执行',
  model_call: '模型调用',
  result_aggregation: '结果聚合',
  error: '错误'
};

interface TimelineItem {
  id: string;
  type: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
  duration: number;
  depth: number;
  startTime: number;
  endTime: number;
  metadata?: Record<string, unknown>;
}

interface TraceData {
  traceId: string;
  query: string;
  intent: string | null;
  status: string;
  totalDuration: number;
  startTime: number;
  steps: TimelineItem[];
  stats: {
    totalDuration: number;
    stepCount: number;
    byType: Record<string, { count: number; totalDuration: number; errors: number }>;
  };
}

interface AgentVisualizerProps {
  traceId?: string;
  isOpen?: boolean;
  onClose?: () => void;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

/**
 * SSE 订阅 hook - 实时获取 trace 更新
 */
function useTraceSubscription(traceId?: string) {
  const [steps, setSteps] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!traceId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setSteps([]);

    // 使用后端代理地址（与 MissionControl 保持一致）
    const eventSource = new EventSource(`${BACKEND_URL}/api/admin/traces/subscribe/live?traceId=${traceId}`);

    eventSource.onopen = () => {
      setLoading(false);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // 跳过心跳和连接消息
        if (data.type === 'heartbeat' || data.type === 'connected') return;

        if (data.type === 'span_update') {
          const span = data.data;
          // 只处理当前 traceId 的更新
          if (span.traceId && span.traceId !== traceId) return;

          const timelineItem: TimelineItem = {
            id: span.spanId || `span-${Date.now()}`,
            type: span.name || 'unknown',
            name: span.name || span.type || 'unknown',
            status: span.status === 'ok' || span.status === 'OK' || span.status === 'success' ? 'success' :
                    span.status === 'error' || span.status === 'ERROR' ? 'error' : 'running',
            duration: span.duration || 0,
            depth: 0,
            startTime: span.startTime,
            endTime: span.endTime || Date.now(),
            metadata: span.tags || {}
          };
          setSteps(prev => [...prev, timelineItem]);
        }
      } catch (e) {
        // 忽略解析错误
      }
    };

    eventSource.onerror = () => {
      setError('SSE 连接失败');
      setLoading(false);
    };

    return () => {
      eventSource.close();
    };
  }, [traceId]);

  return { steps, loading, error };
}

// 单个执行步骤组件
const ExecutionStepItem: React.FC<{
  item: TimelineItem;
  isLast: boolean;
}> = ({ item, isLast }) => {
  const colors = STEP_COLORS[item.type] || { bg: 'bg-gray-100', border: 'border-gray-500', text: 'text-gray-700' };

  const statusIcon = {
    pending: '⏳',
    running: '🔄',
    success: '✅',
    error: '❌',
    skipped: '⏭️'
  }[item.status];

  const indentPx = item.depth * 24;

  return (
    <div
      className="relative flex items-start py-2 px-3"
      style={{ marginLeft: `${indentPx}px` }}
    >
      {/* 连接线 */}
      {!isLast && (
        <div
          className="absolute left-6 top-12 bottom-0 w-0.5 bg-gray-200"
          style={{ left: `${indentPx + 11}px` }}
        />
      )}

      {/* 状态图标 */}
      <div className={`flex-shrink-0 w-6 h-6 rounded-full ${colors.bg} flex items-center justify-center text-xs mr-3`}>
        {statusIcon}
      </div>

      {/* 步骤内容 */}
      <div className={`flex-1 min-w-0 p-3 rounded-lg border-l-4 ${colors.border} ${colors.bg}`}>
        <div className="flex items-center justify-between">
          <span className={`font-medium ${colors.text}`}>
            {STEP_NAMES[item.type] || item.type}
          </span>
          <span className="text-sm text-gray-500">
            {item.duration}ms
          </span>
        </div>

        {/* 元数据展示 */}
        {item.metadata && Object.keys(item.metadata).length > 0 && (
          <div className="mt-2 text-sm text-gray-600">
            {item.metadata.intent ? (
              <div>意图: <span className="font-medium">{String(item.metadata.intent as string)}</span></div>
            ) : null}
            {item.metadata.tool ? (
              <div>工具: <span className="font-medium">{String(item.metadata.tool as string)}</span></div>
            ) : null}
            {item.metadata.model ? (
              <div>模型: <span className="font-medium">{String(item.metadata.model as string)}</span></div>
            ) : null}
            {item.metadata.error ? (
              <div className="text-red-600">错误: {String(item.metadata.error as string)}</div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

// 性能统计组件
const PerformanceStats: React.FC<{
  stats: TraceData['stats'];
}> = ({ stats }) => {
  return (
    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
      <h3 className="text-lg font-medium text-gray-800 mb-3">性能统计</h3>

      {/* 总体统计 */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <div className="text-2xl font-bold text-indigo-600">{stats.totalDuration}</div>
          <div className="text-sm text-gray-500">总耗时 (ms)</div>
        </div>
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <div className="text-2xl font-bold text-teal-600">{stats.stepCount}</div>
          <div className="text-sm text-gray-500">执行步骤</div>
        </div>
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <div className="text-2xl font-bold text-green-600">
            {stats.totalDuration / Math.max(1, stats.stepCount)}
          </div>
          <div className="text-sm text-gray-500">平均步长 (ms)</div>
        </div>
      </div>

      {/* 分类型统计 */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-700">各阶段耗时</h4>
        {Object.entries(stats.byType).map(([type, data]) => {
          const colors = STEP_COLORS[type] || { bg: 'bg-gray-100', border: 'border-gray-500', text: 'text-gray-700' };
          const percentage = (data.totalDuration / stats.totalDuration) * 100;

          return (
            <div key={type} className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${colors.bg} border-2 ${colors.border}`} />
              <span className={`text-sm ${colors.text} w-24`}>
                {STEP_NAMES[type] || type}
              </span>
              <div className="flex-1 bg-gray-100 rounded-full h-2">
                <div
                  className={`${colors.bg} rounded-full h-2 transition-all duration-300`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="text-sm text-gray-600 w-20 text-right">
                {data.totalDuration}ms
              </span>
              {data.errors > 0 && (
                <span className="text-xs text-red-500">({data.errors}错误)</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// 实时时间线组件
const ExecutionTimeline: React.FC<{
  steps: TimelineItem[];
}> = ({ steps }) => {
  return (
    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 max-h-96 overflow-y-auto">
      <h3 className="text-lg font-medium text-gray-800 mb-3">执行时间线</h3>

      {steps.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          暂无执行记录
        </div>
      ) : (
        <div className="space-y-1">
          {steps.map((item, index) => (
            <ExecutionStepItem
              key={item.id}
              item={item}
              isLast={index === steps.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// 主组件
const AgentVisualizer: React.FC<AgentVisualizerProps> = ({
  traceId,
  isOpen = false,
  onClose,
  autoRefresh = true,
  refreshInterval = 500
}) => {
  const [trace, setTrace] = useState<TraceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SSE 订阅 - 实时获取 trace 更新
  const { steps: sseSteps, loading: sseLoading, error: sseError } = useTraceSubscription(traceId);

  // 获取轨迹数据 (初始加载 + SSE fallback 时使用)
  const fetchTrace = useCallback(async () => {
    if (!traceId) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/admin/traces/${traceId}`);
      if (!response.ok) throw new Error('获取轨迹失败');

      const json = await response.json();
      const data = json.data;
      if (data) {
        setTrace(transformTraceData(data));
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    }
  }, [traceId]);

  // 初始加载 - 获取完整 trace 数据用于统计
  useEffect(() => {
    if (!traceId) return;

    setLoading(true);
    fetchTrace()
      .catch(err => console.warn('初始 trace 加载失败:', err))
      .finally(() => setLoading(false));
  }, [traceId, fetchTrace]);

  // 轮询获取最新数据 (SSE 不可用时的 fallback)
  useEffect(() => {
    if (!autoRefresh || !traceId) return;

    const interval = setInterval(fetchTrace, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, traceId, fetchTrace, refreshInterval]);

  // 基于 SSE 数据计算统计信息
  const sseStats: TraceData['stats'] | null = React.useMemo(() => {
    if (sseSteps.length === 0) return null;

    const byType: TraceData['stats']['byType'] = {};
    for (const step of sseSteps) {
      if (!byType[step.type]) {
        byType[step.type] = { count: 0, totalDuration: 0, errors: 0 };
      }
      byType[step.type].count++;
      byType[step.type].totalDuration += step.duration;
      if (step.status === 'error') {
        byType[step.type].errors++;
      }
    }

    const totalDuration = sseSteps.reduce((sum, s) => sum + s.duration, 0);
    return {
      totalDuration,
      stepCount: sseSteps.length,
      byType
    };
  }, [sseSteps]);

  // 优先使用 SSE 数据实时更新，否则使用轮询数据
  const displaySteps = sseSteps.length > 0 ? sseSteps : (trace?.steps || []);
  const displayLoading = sseLoading || loading;
  const displayError = sseError || error;
  // SSE 有数据时用 SSE stats，否则用 HTTP API 的 stats
  const displayStats = sseStats || trace?.stats || null;

  if (!traceId) {
    return (
      <div className="text-center py-8 text-gray-400">
        暂无轨迹 ID
      </div>
    );
  }

  if (displayLoading) {
    return (
      <ResponsiveModal isOpen={isOpen} onClose={onClose || (() => {})} title="Agent 执行轨迹" size="xl">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      </ResponsiveModal>
    );
  }

  if (displayError) {
    return (
      <ResponsiveModal isOpen={isOpen} onClose={onClose || (() => {})} title="Agent 执行轨迹" size="xl">
        <div className="text-center py-8 text-red-500">
          错误: {displayError}
        </div>
      </ResponsiveModal>
    );
  }

  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose || (() => {})} title="Agent 执行轨迹" size="xl">
      <div className="agent-visualizer">
        {/* 头部信息 */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-4 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Agent 执行轨迹</h2>
              <p className="text-sm text-indigo-100 mt-1">
                Trace ID: {traceId.substring(0, 8)}...
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{displayStats?.totalDuration || trace?.totalDuration || 0}</div>
              <div className="text-sm text-indigo-100">ms</div>
            </div>
          </div>

          {/* 查询信息 - 优先使用 HTTP API 数据 */}
          <div className="mt-3 bg-white/10 rounded-lg p-3">
            <div className="text-xs text-indigo-200 mb-1">查询内容</div>
            <div className="text-sm">{trace?.query || '实时更新中...'}</div>
          </div>

          {/* 意图标签 */}
          {trace?.intent && (
            <div className="mt-2 inline-block px-3 py-1 bg-white/20 rounded-full text-sm">
              意图: {trace.intent}
            </div>
          )}
        </div>

        {/* 执行状态 */}
        <div className="bg-gray-50 px-4 py-2 flex items-center justify-between border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${
              trace?.status === 'success' ? 'bg-green-500' :
              trace?.status === 'error' ? 'bg-red-500' : 'bg-yellow-500'
            }`} />
            <span className="text-sm font-medium capitalize">{trace?.status || 'running'}</span>
          </div>
          <span className="text-sm text-gray-500">
            {trace?.startTime ? new Date(trace.startTime).toLocaleTimeString() : new Date().toLocaleTimeString()}
          </span>
        </div>

        {/* 内容区域 */}
        <div className="p-4 space-y-4">
          {/* 执行时间线 */}
          <ExecutionTimeline steps={displaySteps} />

          {/* 性能统计 - SSE 和 HTTP 共享显示逻辑 */}
          {displayStats && (
            <PerformanceStats stats={displayStats} />
          )}
        </div>

        {/* 关闭按钮 */}
        {onClose && (
          <div className="px-4 py-3 bg-gray-50 rounded-b-lg border-t border-gray-200">
            <button
              onClick={onClose}
              className="w-full py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
            >
              关闭
            </button>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
};

export default AgentVisualizer;
