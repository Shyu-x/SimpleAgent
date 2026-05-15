'use client';

/**
 * 链路追踪查看器
 *
 * 功能：
 * - 查看完整调用链
 * - 各环节耗时统计
 * - 事件详情
 * - 慢请求标识
 */

import React, { useState, useEffect, useRef } from 'react';

interface Trace {
  id: string;
  timestamp: number;
  duration: number;
  status: 'success' | 'error' | 'partial' | 'running';
  serviceName: string;
  operationName: string;
  steps: TraceStep[];
}

interface TraceStep {
  name: string;
  duration: number;
  status: 'pending' | 'running' | 'success' | 'error';
  events: TraceEvent[];
  children?: TraceStep[];
}

interface TraceEvent {
  name: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export default function TraceViewer() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);
  const [filter, setFilter] = useState<'all' | 'slow' | 'error'>('all');
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // 初始加载
    fetchTraces();

    // 建立 SSE 连接
    const connectSSE = () => {
      const eventSource = new EventSource('/api/admin/traces/subscribe');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('Trace SSE 连接已建立');
        setLoading(false);
      };

      eventSource.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'traces_update') {
            // 转换后端数据格式为前端格式
            const transformedTraces: Trace[] = (message.data || []).map((t: Record<string, unknown>) => ({
              id: t.traceId as string,
              timestamp: t.startTime as number,
              duration: t.duration as number,
              status: t.status as 'success' | 'error' | 'partial' | 'running',
              serviceName: t.serviceName as string,
              operationName: t.operationName as string,
              steps: []
            }));
            setTraces(transformedTraces);
          }
        } catch (err) {
          console.error('解析 SSE 消息失败:', err);
        }
      };

      eventSource.onerror = (err) => {
        console.error('Trace SSE 连接错误:', err);
        eventSource.close();
        eventSourceRef.current = null;
        setLoading(false);

        // 5秒后尝试重连
        setTimeout(connectSSE, 5000);
      };
    };

    connectSSE();

    // 清理函数：组件卸载时关闭 SSE 连接
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const fetchTraces = async () => {
    try {
      const res = await fetch('/api/admin/traces');
      const data = await res.json();
      if (data.success && data.data) {
        // 转换后端数据格式为前端格式
        const transformedTraces: Trace[] = (data.data.traces || []).map((t: Record<string, unknown>) => ({
          id: t.traceId as string,
          timestamp: t.startTime as number,
          duration: t.duration as number,
          status: t.status as 'success' | 'error' | 'partial' | 'running',
          serviceName: t.serviceName as string,
          operationName: t.operationName as string,
          steps: []
        }));
        setTraces(transformedTraces);
      }
    } catch (err) {
      console.error('Failed to fetch traces:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredTraces = traces.filter((t) => {
    if (filter === 'slow') return t.duration > 5000;
    if (filter === 'error') return t.status === 'error';
    return true;
  });

  if (loading) {
    return <div className="p-4">加载中...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">链路追踪</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded ${
              filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100'
            }`}
          >
            全部
          </button>
          <button
            onClick={() => setFilter('slow')}
            className={`px-3 py-1 rounded ${
              filter === 'slow' ? 'bg-yellow-600 text-white' : 'bg-gray-100'
            }`}
          >
            慢请求
          </button>
          <button
            onClick={() => setFilter('error')}
            className={`px-3 py-1 rounded ${
              filter === 'error' ? 'bg-red-600 text-white' : 'bg-gray-100'
            }`}
          >
            错误
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* 追踪列表 */}
        <div className="col-span-1 bg-white border rounded-lg max-h-[calc(100vh-200px)] overflow-y-auto">
          {filteredTraces.map((trace) => (
            <div
              key={trace.id}
              onClick={() => setSelectedTrace(trace)}
              className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${
                selectedTrace?.id === trace.id ? 'bg-blue-50' : ''
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-mono">{trace.id.slice(0, 8)}...</span>
                <DurationBadge duration={trace.duration} />
              </div>
              <div className="text-sm text-gray-600">{trace.operationName}</div>
              <div className="text-xs text-gray-400">{trace.serviceName}</div>
              <div className="text-sm text-gray-500">
                {new Date(trace.timestamp).toLocaleTimeString()}
              </div>
              <StatusDot status={trace.status} />
            </div>
          ))}
        </div>

        {/* 追踪详情 */}
        <div className="col-span-2 bg-white border rounded-lg p-4 max-h-[calc(100vh-200px)] overflow-y-auto">
          {selectedTrace ? (
            <TraceDetail trace={selectedTrace} />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              选择一个追踪查看详情
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TraceDetail({ trace }: { trace: Trace }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-mono text-lg">{trace.id}</h2>
        <span className="text-sm text-gray-500">
          {new Date(trace.timestamp).toLocaleString()}
        </span>
      </div>

      {/* 概览 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-50 rounded p-3">
          <div className="text-sm text-gray-500">总耗时</div>
          <div className="text-xl font-bold">{trace.duration}ms</div>
        </div>
        <div className="bg-gray-50 rounded p-3">
          <div className="text-sm text-gray-500">步骤数</div>
          <div className="text-xl font-bold">{trace.steps.length}</div>
        </div>
        <div className="bg-gray-50 rounded p-3">
          <div className="text-sm text-gray-500">状态</div>
          <div className="text-xl font-bold">
            {trace.status === 'success' ? '✓' : trace.status === 'error' ? '✗' : '⚠'}
          </div>
        </div>
      </div>

      {/* 步骤时间线 */}
      <div className="space-y-4">
        {trace.steps.map((step, idx) => (
          <div key={idx} className="flex gap-4">
            {/* 时间线 */}
            <div className="flex flex-col items-center">
              <div
                className={`w-3 h-3 rounded-full ${
                  step.status === 'success'
                    ? 'bg-green-500'
                    : step.status === 'error'
                    ? 'bg-red-500'
                    : step.status === 'running'
                    ? 'bg-blue-500 animate-pulse'
                    : 'bg-gray-300'
                }`}
              />
              {idx < trace.steps.length - 1 && <div className="w-0.5 h-full bg-gray-200" />}
            </div>

            {/* 步骤内容 */}
            <div className="flex-1 pb-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-medium">{step.name}</span>
                  <span className="ml-2 text-sm text-gray-500">{step.duration}ms</span>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    step.status === 'success'
                      ? 'bg-green-100 text-green-700'
                      : step.status === 'error'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {step.status}
                </span>
              </div>

              {/* 事件 */}
              {step.events.length > 0 && (
                <div className="mt-2 ml-4 space-y-1">
                  {step.events.map((event, eIdx) => (
                    <div key={eIdx} className="text-sm text-gray-600 flex gap-2">
                      <span className="text-gray-400">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                      <span>{event.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DurationBadge({ duration }: { duration: number }) {
  const color = duration > 5000 ? 'red' : duration > 2000 ? 'yellow' : 'green';
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded bg-${color}-100 text-${color}-700`}
    >
      {duration}ms
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    partial: 'bg-yellow-500',
    running: 'bg-blue-500'
  };
  return <div className={`w-2 h-2 rounded-full ${colors[status] || 'bg-gray-400'}`} />;
}
