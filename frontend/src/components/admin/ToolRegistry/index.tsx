'use client';

/**
 * 工具注册与管理完整界面
 *
 * 功能：
 * - 工具列表（分类、筛选、搜索）
 * - 工具注册表单（自定义工具、MCP工具）
 * - 工具详情（参数说明、使用统计）
 * - 工具测试面板（SSE执行、实时输出）
 * - 工具统计（成功率、延迟分布）
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { fetchApi, fetchStream } from '@/lib/apiClient';
import { useAdminPolling } from '@/hooks/useAdminSSE';
import { ErrorBoundary } from '@/utils/ErrorBoundary';
import { FallbackUI } from '@/components/FallbackUI';

// ============ 类型定义 ============

interface ToolInfo {
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  parameters?: ToolParameter[];
  returnSchema?: Record<string, unknown>;
  timeout: number;
  retryable: boolean;
  stats: ToolStats;
}

interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
}

interface ToolStats {
  callCount: number;
  successCount: number;
  failureCount: number;
  totalLatency: number;
  avgLatency: number;
  lastCalled?: string;
  lastSuccess?: string;
  lastFailure?: string;
}

interface TestResult {
  success: boolean;
  output?: string;
  error?: string;
  latency: number;
  timestamp: string;
}

function safeStats(stats: ToolStats | null): ToolStats {
  return stats || { callCount: 0, successCount: 0, failureCount: 0, totalLatency: 0, avgLatency: 0 };
}

interface ToolCategory {
  id: string;
  name: string;
  icon: string;
  count: number;
}

type TabType = 'list' | 'register' | 'detail' | 'test' | 'stats';

// ============ 主组件 ============

export default function ToolRegistryPage() {
  const [activeTab, setActiveTab] = useState<TabType>('list');

  // SSE 订阅 categories 数据
  const { data: categoriesData, loading, refresh } = useAdminPolling<ToolCategory[]>({
    endpoint: '/api/admin/tools/categories',
    parser: (res) => res?.data?.data?.categories || [],
    interval: 30000,
  });

  const categories = categoriesData || [];
  const fetchCategories = refresh;

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'list', label: '工具列表', icon: '🛠️' },
    { id: 'register', label: '注册工具', icon: '➕' },
    { id: 'detail', label: '工具详情', icon: '🔎' },
    { id: 'test', label: '工具测试', icon: '⚡' },
    { id: 'stats', label: '统计分析', icon: '📊' },
  ];

  return (
    <ErrorBoundary moduleName="ToolRegistryPage" fallback={<FallbackUI moduleName="工具管理" error="组件加载失败" style="detailed" showRetry={true} onRetry={() => window.location.reload()} />}>
      <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
        {/* 顶部标题栏 */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">工具管理</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                注册、配置、测试与监控所有 Agent 工具
              </p>
            </div>
            <button
              onClick={() => setActiveTab('register')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              注册新工具
            </button>
          </div>
        </div>

        {/* 标签页导航 */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <span className="mr-1.5">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <LoadingSkeleton />
          ) : (
            <>
              {activeTab === 'list' && <ToolList categories={categories} onRefresh={fetchCategories} />}
              {activeTab === 'register' && <ToolRegister onSuccess={() => { setActiveTab('list'); fetchCategories(); }} />}
              {activeTab === 'test' && <ToolTester />}
              {activeTab === 'stats' && <ToolStatsPanel categories={categories} />}
            </>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}

// ============ 工具列表 ============

function ToolList({ categories, onRefresh }: { categories: ToolCategory[]; onRefresh: () => void }) {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterEnabled, setFilterEnabled] = useState<string>('all');
  const [selectedTool, setSelectedTool] = useState<ToolInfo | null>(null);

  useEffect(() => {
    fetchTools();
  }, [search, filterCategory, filterEnabled]);

  const fetchTools = async () => {
    setLoading(true);
    const { data } = await fetchApi<{ data: { tools: ToolInfo[] } }>(
      `/api/admin/tools?keyword=${search}&category=${filterCategory}&enabled=${filterEnabled}`
    );
    if (data?.data) setTools(data.data.tools || []);
    setLoading(false);
  };

  const toggleTool = async (name: string, enabled: boolean) => {
    await fetchApi(`/api/admin/tools/${name}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    fetchTools();
  };

  const deleteTool = async (name: string) => {
    if (!confirm(`确定要删除工具 "${name}" 吗？`)) return;
    await fetchApi(`/api/admin/tools/${name}`, { method: 'DELETE' });
    fetchTools();
    onRefresh();
  };

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索工具名称..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
        >
          <option value="all">全部分类</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
          ))}
        </select>
        <select
          value={filterEnabled}
          onChange={(e) => setFilterEnabled(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
        >
          <option value="all">全部状态</option>
          <option value="enabled">已启用</option>
          <option value="disabled">已禁用</option>
        </select>
        <button
          onClick={fetchTools}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          刷新
        </button>
      </div>

      {/* 统计概览 */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-center">
          <div className="text-xl font-bold text-gray-900 dark:text-white">{tools.length}</div>
          <div className="text-xs text-gray-500">总工具数</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-center">
          <div className="text-xl font-bold text-green-600">{tools.filter(t => t.enabled).length}</div>
          <div className="text-xs text-gray-500">已启用</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-center">
          <div className="text-xl font-bold text-blue-600">
            {tools.reduce((sum, t) => sum + safeStats(t.stats).callCount, 0)}
          </div>
          <div className="text-xs text-gray-500">总调用次数</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-center">
          <div className="text-xl font-bold text-purple-600">
            {(tools.reduce((sum, t) => sum + safeStats(t.stats).avgLatency, 0) / Math.max(tools.length, 1)).toFixed(0)}ms
          </div>
          <div className="text-xs text-gray-500">平均延迟</div>
        </div>
      </div>

      {/* 工具卡片列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full text-center py-8 text-gray-500">加载中...</div>
        ) : tools.length === 0 ? (
          <div className="col-span-full text-center py-8 text-gray-500">未找到工具</div>
        ) : (
          tools.map((tool, idx) => (
            <div
              key={`tool-card-${tool.name}-${idx}`}
              onClick={() => setSelectedTool(tool)}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">{tool.name}</h3>
                  <span className="text-xs text-gray-500">{tool.category}</span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                    tool.enabled
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  }`}
                >
                  {tool.enabled ? '启用' : '禁用'}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-3">
                {tool.description}
              </p>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>调用 {tool.stats.callCount} 次</span>
                <span>平均 {tool.stats.avgLatency.toFixed(0)}ms</span>
                <span
                  className={
                    tool.stats.successCount / Math.max(tool.stats.callCount, 1) > 0.9
                      ? 'text-green-600'
                      : tool.stats.successCount / Math.max(tool.stats.callCount, 1) > 0.7
                      ? 'text-yellow-600'
                      : 'text-red-600'
                  }
                >
                  成功率 {(tool.stats.successCount / Math.max(tool.stats.callCount, 1) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleTool(tool.name, !tool.enabled); }}
                  className={`flex-1 px-3 py-1.5 rounded text-xs font-medium ${
                    tool.enabled
                      ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300'
                      : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300'
                  }`}
                >
                  {tool.enabled ? '禁用' : '启用'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedTool(tool); }}
                  className="flex-1 px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 rounded text-xs font-medium"
                >
                  查看详情
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 详情侧边面板 */}
      {selectedTool && (
        <ToolDetailPanel tool={selectedTool} onClose={() => setSelectedTool(null)} />
      )}
    </div>
  );
}

// ============ 工具详情面板 ============

function ToolDetailPanel({ tool, onClose }: { tool: ToolInfo; onClose: () => void }) {
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 shadow-xl z-50 flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">{tool.name}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* 基本信息 */}
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-2">基本信息</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">分类</span>
              <span className="text-gray-900 dark:text-white">{tool.category}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">超时时间</span>
              <span className="text-gray-900 dark:text-white">{tool.timeout}ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">支持重试</span>
              <span className="text-gray-900 dark:text-white">{tool.retryable ? '是' : '否'}</span>
            </div>
          </div>
        </div>

        {/* 描述 */}
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-2">功能描述</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300">{tool.description}</p>
        </div>

        {/* 参数 */}
        {tool.parameters && tool.parameters.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">参数定义</h3>
            <div className="space-y-2">
              {tool.parameters.map((param, pIdx) => (
                <div key={`param-${param.name}-${pIdx}`} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <code className="text-sm font-medium text-blue-600 dark:text-blue-400">{param.name}</code>
                    <span className="text-xs text-gray-500">{param.type}</span>
                    {param.required && (
                      <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">必填</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{param.description}</p>
                  {param.enum && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {param.enum.map((val) => (
                        <span key={val} className="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 rounded">{val}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 调用统计 */}
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-2">调用统计</h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2">
              <div className="text-lg font-bold text-blue-600">{tool.stats.callCount}</div>
              <div className="text-xs text-gray-500">总调用</div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-2">
              <div className="text-lg font-bold text-green-600">{tool.stats.successCount}</div>
              <div className="text-xs text-gray-500">成功</div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-2">
              <div className="text-lg font-bold text-red-600">{tool.stats.failureCount}</div>
              <div className="text-xs text-gray-500">失败</div>
            </div>
          </div>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">平均延迟</span>
              <span className="text-gray-900 dark:text-white">{tool.stats.avgLatency.toFixed(0)}ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">最后调用</span>
              <span className="text-gray-900 dark:text-white">
                {tool.stats.lastCalled ? formatDate(tool.stats.lastCalled) : '从未'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ 工具注册 ============

function ToolRegister({ onSuccess }: { onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'custom',
    timeout: 30000,
    retryable: true,
    parameters: [] as ToolParameter[],
  });
  const [submitting, setSubmitting] = useState(false);

  const addParameter = () => {
    setFormData(prev => ({
      ...prev,
      parameters: [...prev.parameters, { name: '', type: 'string', description: '', required: false }],
    }));
  };

  const updateParameter = (index: number, field: keyof ToolParameter, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      parameters: prev.parameters.map((p, i) => i === index ? { ...p, [field]: value } : p),
    }));
  };

  const removeParameter = (index: number) => {
    setFormData(prev => ({
      ...prev,
      parameters: prev.parameters.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.description.trim()) {
      alert('请填写名称和描述');
      return;
    }
    setSubmitting(true);
    await fetchApi('/api/admin/tools/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    setSubmitting(false);
    onSuccess();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 基本信息 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="font-medium text-gray-900 dark:text-white mb-4">基本信息</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              工具名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例如：search_web"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              功能描述 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="描述工具的功能和使用场景..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">分类</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              >
                <option value="custom">自定义</option>
                <option value="search">搜索</option>
                <option value="compute">计算</option>
                <option value="browser">浏览器</option>
                <option value="file">文件</option>
                <option value="api">API调用</option>
                <option value="mcp">MCP工具</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">超时时间</label>
              <input
                type="number"
                value={formData.timeout}
                onChange={(e) => setFormData(prev => ({ ...prev, timeout: parseInt(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="retryable"
              checked={formData.retryable}
              onChange={(e) => setFormData(prev => ({ ...prev, retryable: e.target.checked }))}
              className="w-4 h-4"
            />
            <label htmlFor="retryable" className="text-sm text-gray-700 dark:text-gray-300">
              失败时支持重试
            </label>
          </div>
        </div>
      </div>

      {/* 参数定义 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-gray-900 dark:text-white">参数定义</h3>
          <button
            onClick={addParameter}
            className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded text-sm hover:bg-blue-200"
          >
            + 添加参数
          </button>
        </div>
        {formData.parameters.length === 0 ? (
          <div className="text-center py-6 text-gray-500 text-sm">
            暂无参数定义，点击上方按钮添加
          </div>
        ) : (
          <div className="space-y-3">
            {formData.parameters.map((param, index) => (
              <div key={index} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={param.name}
                    onChange={(e) => updateParameter(index, 'name', e.target.value)}
                    placeholder="参数名"
                    className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700"
                  />
                  <select
                    value={param.type}
                    onChange={(e) => updateParameter(index, 'type', e.target.value)}
                    className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700"
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                    <option value="object">object</option>
                    <option value="array">array</option>
                  </select>
                  <input
                    type="checkbox"
                    checked={param.required}
                    onChange={(e) => updateParameter(index, 'required', e.target.checked)}
                    title="必填"
                    className="w-5 h-5"
                  />
                  <button
                    onClick={() => removeParameter(index)}
                    className="px-2 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-sm"
                  >
                    删除
                  </button>
                </div>
                <input
                  type="text"
                  value={param.description}
                  onChange={(e) => updateParameter(index, 'description', e.target.value)}
                  placeholder="参数描述"
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 提交按钮 */}
      <div className="flex justify-end gap-3">
        <button
          onClick={onSuccess as () => void}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          取消
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? '注册中...' : '注册工具'}
        </button>
      </div>
    </div>
  );
}

// ============ 工具测试 ============

function ToolTester() {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [selectedTool, setSelectedTool] = useState<string>('');
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [results, setResults] = useState<TestResult[]>([]);
  const [testing, setTesting] = useState(false);
  const [streaming, setStreaming] = useState('');
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.log('[ToolRegistry] Fetching tools from /api/admin/tools');
    fetchApi<{ success: boolean; data: { tools: ToolInfo[] } }>('/api/admin/tools').then(({ data, error }) => {
      console.log('[ToolRegistry] API response:', { data, error });
      if (error) {
        console.error('[ToolRegistry] API error:', error);
      }
      if (data?.data) {
        console.log('[ToolRegistry] Setting tools, count:', data.data.tools.length);
        setTools(data.data.tools);
      }
    });
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [streaming]);

  const handleTest = async () => {
    if (!selectedTool) return;
    setTesting(true);
    setStreaming('');
    setResults(prev => [...prev, { success: false, output: '', latency: 0, timestamp: new Date().toISOString() }]);
    const resultIndex = results.length;

    try {
      const params = Object.fromEntries(
        Object.entries(paramValues).filter(([_, v]) => v.trim() !== '')
      );

      await fetchStream(`/api/admin/tools/${selectedTool}/test`, {
        parameters: params,
      }, {
        onChunk: (content) => setStreaming(prev => prev + content),
        onThinking: (thinking) => setStreaming(prev => prev + `\n[思考] ${thinking}`),
        onDone: () => {
          setResults(prev => prev.map((r, i) =>
            i === resultIndex
              ? { ...r, success: true, output: streaming, latency: 0 }
              : r
          ));
          setTesting(false);
        },
        onError: (error) => {
          setStreaming(prev => prev + `\n[错误] ${error.message}`);
          setResults(prev => prev.map((r, i) =>
            i === resultIndex ? { ...r, success: false, error: error.message } : r
          ));
          setTesting(false);
        },
      });
    } catch (err) {
      setStreaming(prev => prev + `\n[错误] ${err instanceof Error ? err.message : '未知错误'}`);
      setTesting(false);
    }
  };

  const currentTool = tools.find(t => t.name === selectedTool);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
      {/* 左侧：工具选择与参数 */}
      <div className="lg:col-span-1 space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="font-medium text-gray-900 dark:text-white mb-3">选择工具</h3>
          <select
            value={selectedTool}
            onChange={(e) => {
              setSelectedTool(e.target.value);
              setParamValues({});
            }}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
          >
            {tools.map((t, idx) => (
              <option key={`select-tool-${t.name}-${idx}`} value={t.name}>{t.name}</option>
            ))}
          </select>
        </div>

        {currentTool && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="font-medium text-gray-900 dark:text-white mb-3">输入参数</h3>
            <div className="space-y-3">
              {currentTool.parameters?.map((param, pIdx) => (
                <div key={`test-param-${param.name}-${pIdx}`}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {param.name}
                    {param.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  {param.type === 'boolean' ? (
                    <select
                      value={paramValues[param.name] || 'false'}
                      onChange={(e) => setParamValues(prev => ({ ...prev, [param.name]: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : param.enum ? (
                    <select
                      value={paramValues[param.name] || ''}
                      onChange={(e) => setParamValues(prev => ({ ...prev, [param.name]: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                    >
                      <option value="">请选择</option>
                      {param.enum.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <textarea
                      value={paramValues[param.name] || ''}
                      onChange={(e) => setParamValues(prev => ({ ...prev, [param.name]: e.target.value }))}
                      placeholder={param.description}
                      rows={param.type === 'object' || param.type === 'array' ? 4 : 2}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm font-mono"
                    />
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={handleTest}
              disabled={testing || !selectedTool}
              className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {testing ? '执行中...' : '执行测试'}
            </button>
          </div>
        )}
      </div>

      {/* 右侧：执行输出 */}
      <div className="lg:col-span-2">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 h-full flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 className="font-medium text-gray-900 dark:text-white">执行输出</h3>
            {testing && (
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                执行中...
              </div>
            )}
          </div>
          <div
            ref={outputRef}
            className="flex-1 overflow-auto p-4 font-mono text-sm text-gray-800 dark:text-gray-300 whitespace-pre-wrap"
          >
            {streaming || '等待执行...'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ 统计面板 ============

function ToolStatsPanel({ categories }: { categories: ToolCategory[] }) {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi<{ data: { tools: ToolInfo[] } }>('/api/admin/tools').then(({ data }) => {
      if (data?.data) setTools(data.data.tools);
      setLoading(false);
    });
  }, []);

  const totalCalls = tools.reduce((sum, t) => sum + safeStats(t.stats).callCount, 0);
  const totalSuccess = tools.reduce((sum, t) => sum + safeStats(t.stats).successCount, 0);
  const totalFailure = tools.reduce((sum, t) => sum + safeStats(t.stats).failureCount, 0);
  const avgLatency = tools.length > 0
    ? tools.reduce((sum, t) => sum + safeStats(t.stats).avgLatency * safeStats(t.stats).callCount, 0) / Math.max(totalCalls, 1)
    : 0;

  // Top 10 工具
  const topTools = [...tools]
    .sort((a, b) => b.stats.callCount - a.stats.callCount)
    .slice(0, 10);

  // 按分类统计
  const byCategory = categories.map(cat => ({
    ...cat,
    count: tools.filter(t => t.category === cat.id && t.enabled).length,
    calls: tools.filter(t => t.category === cat.id).reduce((sum, t) => sum + safeStats(t.stats).callCount, 0),
  }));

  return (
    <div className="space-y-6">
      {/* 全局统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="总调用次数" value={totalCalls.toLocaleString()} icon="📈" color="blue" />
        <StatCard title="成功次数" value={totalSuccess.toLocaleString()} icon="✅" color="green" />
        <StatCard title="失败次数" value={totalFailure.toLocaleString()} icon="❌" color="red" />
        <StatCard title="平均延迟" value={`${avgLatency.toFixed(0)}ms`} icon="⚡" color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 10 调用排行 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="font-medium text-gray-900 dark:text-white mb-4">调用次数 Top 10</h3>
          <div className="space-y-2">
            {loading ? (
              <div className="text-center py-4 text-gray-500">加载中...</div>
            ) : topTools.length === 0 ? (
              <div className="text-center py-4 text-gray-500">暂无数据</div>
            ) : (
              topTools.map((tool, index) => (
                <div key={`top-tool-${tool.name}-${index}`} className="flex items-center gap-3">
                  <span className={`w-6 h-6 flex items-center justify-center rounded text-xs font-bold ${
                    index === 0 ? 'bg-yellow-100 text-yellow-800' :
                    index === 1 ? 'bg-gray-200 text-gray-700' :
                    index === 2 ? 'bg-orange-100 text-orange-800' :
                    'bg-gray-50 text-gray-500'
                  }`}>
                    {index + 1}
                  </span>
                  <span className="flex-1 text-sm text-gray-900 dark:text-white truncate">{tool.name}</span>
                  <div className="w-24 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${(tool.stats.callCount / Math.max(topTools[0].stats.callCount, 1)) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-500 w-16 text-right">{tool.stats.callCount}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 分类统计 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="font-medium text-gray-900 dark:text-white mb-4">分类统计</h3>
          <div className="space-y-3">
            {byCategory.map(cat => (
              <div key={cat.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>{cat.icon}</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{cat.name}</span>
                </div>
                <div className="flex gap-4 text-sm">
                  <span className="text-gray-500">{cat.count} 个工具</span>
                  <span className="text-blue-600">{cat.calls.toLocaleString()} 次调用</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 成功率分布 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-medium text-gray-900 dark:text-white mb-4">成功率分布</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-600">
              {tools.filter(t => safeStats(t.stats).callCount > 0 && safeStats(t.stats).successCount / safeStats(t.stats).callCount >= 0.9).length}
            </div>
            <div className="text-sm text-gray-500 mt-1">优秀 (≥90%)</div>
          </div>
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {tools.filter(t => safeStats(t.stats).callCount > 0 && safeStats(t.stats).successCount / safeStats(t.stats).callCount >= 0.7 && safeStats(t.stats).successCount / safeStats(t.stats).callCount < 0.9).length}
            </div>
            <div className="text-sm text-gray-500 mt-1">良好 (70-90%)</div>
          </div>
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
            <div className="text-2xl font-bold text-red-600">
              {tools.filter(t => safeStats(t.stats).callCount > 0 && safeStats(t.stats).successCount / safeStats(t.stats).callCount < 0.7).length}
            </div>
            <div className="text-sm text-gray-500 mt-1">需改进 (&lt;70%)</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ 通用组件 ============

function StatCard({ title, value, icon, color }: {
  title: string; value: string | number; icon: string; color: string;
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-600',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600',
    gray: 'bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400',
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{icon}</span>
        <span className="text-sm text-gray-500">{title}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white dark:bg-gray-800 rounded-lg border p-4 animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}

// ============ 工具函数 ============

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}
