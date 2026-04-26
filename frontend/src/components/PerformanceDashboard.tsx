/**
 * 性能监控面板组件
 * 展示系统性能指标和实时数据
 */

'use client';

import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

export default function PerformanceDashboard() {
  const [metrics, setMetrics] = useState({
    uptime: 0,
    requests: { total: 0, lastHour: 0, avgResponseTime: 0, p95ResponseTime: 0 },
    errors: { total: 0, lastHour: 0, rate: '0%' },
    memory: { heapUsed: 0, heapTotal: 0, rss: 0 },
    history: []
  });
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/metrics/realtime');
      const data = await response.json();
      if (data.success) {
        setMetrics(prev => ({
          ...prev,
          ...data,
          history: [...prev.history.slice(-29), { time: new Date().toLocaleTimeString(), ...data }]
        }));
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    if (autoRefresh) {
      const interval = setInterval(fetchMetrics, 5000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const formatBytes = (mb) => `${mb} MB`;
  const formatUptime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
  };

  return (
    <div className="fixed bottom-4 right-4 w-[500px] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-green-600 to-teal-600">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span className="font-semibold text-white">性能监控</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`p-1.5 rounded-md transition-colors ${
              autoRefresh ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            <svg className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={fetchMetrics}
            disabled={loading}
            className="p-1.5 rounded-md bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-2 p-3 bg-gray-50 dark:bg-gray-900">
        <div className="text-center p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
          <div className="text-xl font-bold text-blue-600">{formatUptime(metrics.uptime)}</div>
          <div className="text-xs text-gray-500">运行时间</div>
        </div>
        <div className="text-center p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
          <div className="text-xl font-bold text-green-600">{metrics.requests.total}</div>
          <div className="text-xs text-gray-500">总请求</div>
        </div>
        <div className="text-center p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
          <div className="text-xl font-bold text-purple-600">{metrics.requests.avgResponseTime}ms</div>
          <div className="text-xs text-gray-500">平均响应</div>
        </div>
        <div className="text-center p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
          <div className={`text-xl font-bold ${parseFloat(metrics.errors.rate) > 5 ? 'text-red-600' : 'text-gray-600'}`}>
            {metrics.errors.rate}
          </div>
          <div className="text-xs text-gray-500">错误率</div>
        </div>
      </div>

      {/* 内存使用 */}
      <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">内存使用</span>
          <span className="text-xs text-gray-500">
            {metrics.memory.heapUsed} / {metrics.memory.heapTotal} MB
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${(metrics.memory.heapUsed / metrics.memory.heapTotal) * 100}%` }}
          />
        </div>
      </div>

      {/* 响应时间图表 */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">响应时间趋势</div>
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={metrics.history}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#9CA3AF" />
            <YAxis tick={{ fontSize: 10 }} stroke="#9CA3AF" />
            <Tooltip
              contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px' }}
              labelStyle={{ color: '#9CA3AF' }}
            />
            <Area type="monotone" dataKey="requests.avgResponseTime" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.3} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 底部信息 */}
      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>自动刷新: {autoRefresh ? '开启' : '关闭'}</span>
          <span>P95: {metrics.requests.p95ResponseTime}ms</span>
        </div>
      </div>
    </div>
  );
}
