'use client';

/**
 * 工具管理组件
 *
 * 功能：
 * - 查看所有注册工具
 * - 启用/禁用工具
 * - 配置工具参数
 * - 查看工具调用统计
 */

import React, { useState, useEffect } from 'react';

interface Tool {
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  callCount: number;
  avgLatency: number;
  config: Record<string, unknown>;
}

export default function ToolManagement() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);

  useEffect(() => {
    fetchTools();
  }, []);

  const fetchTools = async () => {
    try {
      const res = await fetch('/api/admin/tools');
      const data = await res.json();
      setTools(data.tools || []);
    } catch (err) {
      console.error('Failed to fetch tools:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleTool = async (toolName: string, enabled: boolean) => {
    try {
      await fetch(`/api/admin/tools/${toolName}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      fetchTools();
    } catch (err) {
      console.error('Failed to toggle tool:', err);
    }
  };

  if (loading) {
    return <div className="p-4">加载中...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">工具管理</h1>
        <span className="text-gray-500">{tools.length} 个工具</span>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">工具</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">分类</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">调用次数</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">平均延迟</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">状态</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tools.map((tool, idx) => (
              <tr key={`tool-${tool.name}-${idx}`} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium">{tool.name}</div>
                  <div className="text-sm text-gray-500 truncate max-w-xs">{tool.description}</div>
                </td>
                <td className="px-4 py-3 text-sm">{tool.category}</td>
                <td className="px-4 py-3 text-sm">{tool.callCount.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm">{tool.avgLatency.toFixed(0)}ms</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      tool.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {tool.enabled ? '启用' : '禁用'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleTool(tool.name, !tool.enabled)}
                    className={`px-3 py-1 rounded text-sm ${
                      tool.enabled
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    {tool.enabled ? '禁用' : '启用'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
