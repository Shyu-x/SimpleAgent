/**
 * 前端追踪面板组件
 * 用于展示请求追踪信息和性能指标
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Activity, Clock, AlertCircle, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

// Trace 数据接口
interface Trace {
  traceId: string;
  operationName: string;
  status: 'ok' | 'error' | 'started';
  duration?: number;
  tags?: Record<string, unknown>;
}

export default function TraceViewer() {
  const [traces] = useState<Trace[]>([]); // Reserved for future trace list API
  const [selectedTrace, setSelectedTrace] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{
    total?: number;
    completed?: number;
    avgDuration?: string;
    errorRate?: number;
  } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // 获取追踪数据
  const fetchTraces = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/traces/stats');
      const json = await response.json();
      if (json.success && json.data) {
        const overview = json.data.overview || {};
        const performance = json.data.performance || {};
        // 映射后端数据到前端期望的格式
        setStats({
          total: overview.totalTraces || 0,
          completed: overview.totalTraces ? overview.totalTraces - (overview.errorCount || 0) : 0,
          avgDuration: performance.avgDuration || '0ms',
          errorRate: parseFloat((overview.errorRate || '0%').replace('%', '')) / 100,
        });
      }
    } catch (error) {
      console.error('Failed to fetch traces:', error);
    } finally {
      setLoading(false);
    }
  };

  // 自动刷新
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchTraces, 3000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  // 初始加载
  useEffect(() => {
    fetchTraces();
  }, []);

  // 格式化时间
  const formatTime = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // 获取状态颜色
  const getStatusColor = (status) => {
    switch (status) {
      case 'ok':
        return 'text-green-500';
      case 'error':
        return 'text-red-500';
      case 'started':
        return 'text-yellow-500';
      default:
        return 'text-gray-500';
    }
  };

  // 获取状态图标
  const getStatusIcon = (status) => {
    switch (status) {
      case 'ok':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'started':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      default:
        return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-white" />
          <span className="font-semibold text-white">追踪面板</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`p-1.5 rounded-md transition-colors ${
              autoRefresh ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
            title={autoRefresh ? '关闭自动刷新' : '开启自动刷新'}
          >
            <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={fetchTraces}
            disabled={loading}
            className="p-1.5 rounded-md bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
            title="刷新"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 统计信息 */}
      {stats && (
        <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {stats.total || 0}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">总请求</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {stats.completed || 0}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">已完成</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {formatTime(stats.avgDuration || 0)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">平均耗时</div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold ${
              (stats.errorRate || 0) > 0.1 ? 'text-red-600' : 'text-gray-600 dark:text-gray-400'
            }`}>
              {((stats.errorRate || 0) * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">错误率</div>
          </div>
        </div>
      )}

      {/* Trace ID 显示 */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            当前追踪
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            点击查看详情
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={selectedTrace || '无活动追踪'}
            readOnly
            className="flex-1 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300"
          />
          <button
            onClick={() => navigator.clipboard.writeText(selectedTrace || '')}
            className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
          >
            复制
          </button>
        </div>
      </div>

      {/* 请求列表 */}
      <div className="max-h-64 overflow-y-auto">
        {traces.length === 0 ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">暂无追踪数据</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {traces.map((trace, index) => (
              <div
                key={index}
                onClick={() => setSelectedTrace(trace.traceId)}
                className={`p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                  selectedTrace === trace.traceId ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(trace.status)}
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      {trace.operationName}
                    </span>
                  </div>
                  <span className={`text-xs font-mono ${getStatusColor(trace.status)}`}>
                    {trace.duration ? formatTime(trace.duration) : '...'}
                  </span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {trace.traceId}
                </div>
                {trace.tags && Object.keys(trace.tags).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {Object.entries(trace.tags).slice(0, 3).map(([key, value]) => (
                      <span
                        key={key}
                        className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded"
                      >
                        {key}: {String(value)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部信息 */}
      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>自动刷新: {autoRefresh ? '开启' : '关闭'}</span>
          <span>更新时间: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
}
