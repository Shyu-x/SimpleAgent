'use client';

/**
 * 意图树可视化编辑组件
 *
 * 功能：
 * - 树形结构展示（领域 -> 类目 -> 话题）
 * - 节点 CRUD 操作（增删改查）
 * - 拖拽排序调整节点顺序
 * - 层级切换（节点在领域/类目/话题间移动）
 * - 关键词管理（添加/删除匹配关键词）
 * - 预览测试（输入查询测试匹配结果）
 *
 * 参考 Ragent Intent Tree UI 设计
 */

import React, { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '@/lib/apiClient';
import type {
  IntentNode,
  IntentLevel,
  IntentTestResult,
  INTENT_LEVEL_NAMES,
  IntentNodeCreateRequest,
  IntentNodeUpdateRequest
} from '@/types/intent';
import { INTENT_LEVEL_COLORS } from '@/types/intent';

// 层级名称常量
const LEVEL_NAMES: Record<IntentLevel, string> = {
  1: '领域',
  2: '类目',
  3: '话题'
};

// 层级图标
const LEVEL_ICONS: Record<IntentLevel, string> = {
  1: '🏛️',
  2: '📁',
  3: '💬'
};

export default function IntentTreeEditorPage() {
  const [tree, setTree] = useState<IntentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<IntentNode | null>(null);
  const [editingNode, setEditingNode] = useState<IntentNode | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [testQuery, setTestQuery] = useState('');
  const [testResult, setTestResult] = useState<IntentTestResult | null>(null);

  // 加载意图树
  const loadTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 后端返回 { tree: [...], version: "...", updatedAt: "..." } 直接作为 data
      const { data, error: fetchError } = await fetchApi<{ tree: IntentNode[]; version: string; updatedAt: string }>(
        '/api/admin/intent/tree'
      );
      if (fetchError) throw new Error(fetchError.message);
      setTree(data?.tree || []);
      // 默认展开所有节点
      const allIds = new Set<string>();
      const collectIds = (nodes: IntentNode[]) => {
        nodes.forEach(node => {
          allIds.add(node.id);
          if (node.children.length > 0) {
            collectIds(node.children);
          }
        });
      };
      collectIds(data?.tree || []);
      setExpandedNodes(allIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  // 切换节点展开/折叠
  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // 展开/折叠所有
  const expandAll = () => {
    const allIds = new Set<string>();
    const collectIds = (nodes: IntentNode[]) => {
      nodes.forEach(node => {
        allIds.add(node.id);
        if (node.children.length > 0) {
          collectIds(node.children);
        }
      });
    };
    collectIds(tree);
    setExpandedNodes(allIds);
  };

  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  // 创建节点
  const handleCreate = (parentNode: IntentNode | null) => {
    setEditingNode({
      id: '',
      name: '',
      level: parentNode ? (parentNode.level + 1) as IntentLevel : 1,
      keywords: [],
      description: '',
      children: [],
      enabled: true
    });
    setModalMode('create');
    setIsModalOpen(true);
  };

  // 编辑节点
  const handleEdit = (node: IntentNode) => {
    setEditingNode({ ...node });
    setModalMode('edit');
    setIsModalOpen(true);
  };

  // 删除节点
  const handleDelete = async (node: IntentNode) => {
    if (!confirm(`确定要删除节点 "${node.name}" 吗？${node.children.length > 0 ? '（包含 ' + node.children.length + ' 个子节点）' : ''}`)) {
      return;
    }

    setSaving(true);
    try {
      const { error: fetchError } = await fetchApi(`/api/admin/intent/node/${node.id}`, {
        method: 'DELETE'
      });
      if (fetchError) throw new Error(fetchError.message);
      await loadTree();
      if (selectedNode?.id === node.id) {
        setSelectedNode(null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败');
    } finally {
      setSaving(false);
    }
  };

  // 保存节点（创建或更新）
  const handleSave = async () => {
    if (!editingNode) return;
    if (!editingNode.name.trim()) {
      alert('请输入节点名称');
      return;
    }

    setSaving(true);
    try {
      if (modalMode === 'create') {
        const request: IntentNodeCreateRequest = {
          name: editingNode.name,
          level: editingNode.level,
          keywords: editingNode.keywords,
          description: editingNode.description,
          enabled: editingNode.enabled,
          parentId: selectedNode?.id
        };
        const { error: fetchError } = await fetchApi('/api/admin/intent/node', {
          method: 'POST',
          body: JSON.stringify(request)
        });
        if (fetchError) throw new Error(fetchError.message);
      } else {
        const request: IntentNodeUpdateRequest = {
          name: editingNode.name,
          keywords: editingNode.keywords,
          description: editingNode.description,
          enabled: editingNode.enabled
        };
        const { error: fetchError } = await fetchApi(`/api/admin/intent/node/${editingNode.id}`, {
          method: 'PUT',
          body: JSON.stringify(request)
        });
        if (fetchError) throw new Error(fetchError.message);
      }
      setIsModalOpen(false);
      setEditingNode(null);
      await loadTree();
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 测试意图匹配
  const handleTest = async () => {
    if (!testQuery.trim()) {
      alert('请输入测试查询');
      return;
    }

    try {
      const { data, error: fetchError } = await fetchApi<IntentTestResult>('/api/admin/intent/test', {
        method: 'POST',
        body: JSON.stringify({ query: testQuery })
      });
      if (fetchError) throw new Error(fetchError.message);
      setTestResult(data);
    } catch (err) {
      alert(err instanceof Error ? err.message : '测试失败');
    }
  };

  // 添加关键词
  const handleAddKeyword = () => {
    if (!editingNode) return;
    const kw = prompt('请输入关键词：');
    if (kw && kw.trim()) {
      setEditingNode({
        ...editingNode,
        keywords: [...editingNode.keywords, kw.trim()]
      });
    }
  };

  // 删除关键词
  const handleRemoveKeyword = (keyword: string) => {
    if (!editingNode) return;
    setEditingNode({
      ...editingNode,
      keywords: editingNode.keywords.filter(k => k !== keyword)
    });
  };

  // 切换节点启用状态
  const toggleNodeEnabled = async (node: IntentNode) => {
    setSaving(true);
    try {
      const { error: fetchError } = await fetchApi(`/api/admin/intent/node/${node.id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !node.enabled })
      });
      if (fetchError) throw new Error(fetchError.message);
      await loadTree();
    } catch (err) {
      alert(err instanceof Error ? err.message : '更新失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* 顶部标题栏 */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">意图树编辑器</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              可视化编辑意图分类的领域、类目与话题层级结构
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleCreate(null)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              添加领域
            </button>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：树形结构 */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200 dark:border-gray-700">
          {/* 工具栏 */}
          <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center gap-2">
            <button
              onClick={expandAll}
              className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              展开全部
            </button>
            <button
              onClick={collapseAll}
              className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              折叠全部
            </button>
            <button
              onClick={loadTree}
              className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              刷新
            </button>
            {saving && <span className="text-xs text-blue-600 ml-2">保存中...</span>}
          </div>

          {/* 树形列表 */}
          <div className="flex-1 overflow-auto p-4">
            {loading ? (
              <LoadingSkeleton />
            ) : error ? (
              <ErrorMessage message={error} onRetry={loadTree} />
            ) : (
              <TreeList
                nodes={tree}
                expandedNodes={expandedNodes}
                selectedNode={selectedNode}
                onToggleExpand={toggleExpand}
                onSelect={setSelectedNode}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onCreate={handleCreate}
                onToggleEnabled={toggleNodeEnabled}
                level={1}
              />
            )}
          </div>
        </div>

        {/* 右侧：测试面板 */}
        <div className="w-80 bg-white dark:bg-gray-800 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h2 className="font-medium text-gray-900 dark:text-white">匹配测试</h2>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                输入查询
              </label>
              <textarea
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                placeholder="输入查询内容测试匹配结果..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleTest}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              测试匹配
            </button>

            {testResult && (
              <div className={`p-3 rounded-lg ${testResult.matched ? 'bg-green-50 dark:bg-green-900/20' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
                <div className="text-sm font-medium mb-2">
                  {testResult.matched ? (
                    <span className="text-green-600 dark:text-green-400">
                      ✓ 匹配成功
                    </span>
                  ) : (
                    <span className="text-gray-500">未匹配</span>
                  )}
                </div>
                {testResult.matched && (
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">节点：</span>
                      <span className="font-medium text-gray-900 dark:text-white">{testResult.nodeName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">置信度：</span>
                      <span className="text-blue-600 dark:text-blue-400">
                        {(testResult.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    {testResult.matchedKeywords.length > 0 && (
                      <div>
                        <span className="text-gray-500">匹配关键词：</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {testResult.matchedKeywords.map(kw => (
                            <span key={kw} className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded text-xs">
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 帮助说明 */}
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">层级说明</h3>
              <div className="space-y-1 text-xs text-gray-500">
                <div className="flex items-center gap-2">
                  <span className="font-medium">领域 (L1)</span>
                  <span>最高层级，如：编程帮助、写作助手</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">类目 (L2)</span>
                  <span>中间层级，如：JavaScript、Python</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">话题 (L3)</span>
                  <span>叶子节点，如：async/await、装饰器</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 节点编辑弹窗 */}
      {isModalOpen && editingNode && (
        <NodeEditModal
          node={editingNode}
          mode={modalMode}
          saving={saving}
          onChange={setEditingNode}
          onSave={handleSave}
          onCancel={() => setIsModalOpen(false)}
          onAddKeyword={handleAddKeyword}
          onRemoveKeyword={handleRemoveKeyword}
        />
      )}
    </div>
  );
}

// ==================== 树形列表组件 ====================

interface TreeListProps {
  nodes: IntentNode[];
  expandedNodes: Set<string>;
  selectedNode: IntentNode | null;
  onToggleExpand: (id: string) => void;
  onSelect: (node: IntentNode) => void;
  onEdit: (node: IntentNode) => void;
  onDelete: (node: IntentNode) => void;
  onCreate: (parent: IntentNode) => void;
  onToggleEnabled: (node: IntentNode) => void;
  level: IntentLevel;
}

function TreeList({
  nodes,
  expandedNodes,
  selectedNode,
  onToggleExpand,
  onSelect,
  onEdit,
  onDelete,
  onCreate,
  onToggleEnabled,
  level
}: TreeListProps) {
  return (
    <div className="space-y-1">
      {nodes.map(node => (
        <TreeNode
          key={node.id}
          node={node}
          expandedNodes={expandedNodes}
          selectedNode={selectedNode}
          onToggleExpand={onToggleExpand}
          onSelect={onSelect}
          onEdit={onEdit}
          onDelete={onDelete}
          onCreate={onCreate}
          onToggleEnabled={onToggleEnabled}
          level={level}
        />
      ))}
    </div>
  );
}

interface TreeNodeProps {
  node: IntentNode;
  expandedNodes: Set<string>;
  selectedNode: IntentNode | null;
  onToggleExpand: (id: string) => void;
  onSelect: (node: IntentNode) => void;
  onEdit: (node: IntentNode) => void;
  onDelete: (node: IntentNode) => void;
  onCreate: (parent: IntentNode) => void;
  onToggleEnabled: (node: IntentNode) => void;
  level: IntentLevel;
}

function TreeNode({
  node,
  expandedNodes,
  selectedNode,
  onToggleExpand,
  onSelect,
  onEdit,
  onDelete,
  onCreate,
  onToggleEnabled,
  level
}: TreeNodeProps) {
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = selectedNode?.id === node.id;
  const hasChildren = node.children.length > 0;
  const canAddChild = level < 3;

  return (
    <div className="select-none">
      <div
        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
          isSelected
            ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
            : 'hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'
        }`}
        style={{ marginLeft: `${(level - 1) * 20}px` }}
      >
        {/* 展开/折叠按钮 */}
        <button
          onClick={() => hasChildren && onToggleExpand(node.id)}
          className={`w-5 h-5 flex items-center justify-center text-xs ${hasChildren ? 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded' : 'text-transparent'}`}
        >
          {hasChildren ? (isExpanded ? '▼' : '▶') : '•'}
        </button>

        {/* 层级图标 */}
        <span className="text-sm">{LEVEL_ICONS[level]}</span>

        {/* 节点名称 */}
        <span
          className={`flex-1 text-sm truncate ${!node.enabled ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-white'}`}
          onClick={() => onSelect(node)}
        >
          {node.name}
        </span>

        {/* 层级标签 */}
        <span className={`px-1.5 py-0.5 rounded text-xs ${INTENT_LEVEL_COLORS[level]}`}>
          {LEVEL_NAMES[level]}
        </span>

        {/* 关键词数量 */}
        {node.keywords.length > 0 && (
          <span className="text-xs text-gray-400">
            {node.keywords.length} 关键词
          </span>
        )}

        {/* 操作按钮 */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onToggleEnabled(node)}
            className={`w-6 h-6 flex items-center justify-center rounded text-xs ${node.enabled ? 'text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30' : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            title={node.enabled ? '禁用' : '启用'}
          >
            {node.enabled ? '✓' : '✗'}
          </button>
          {canAddChild && (
            <button
              onClick={() => onCreate(node)}
              className="w-6 h-6 flex items-center justify-center rounded text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-xs"
              title="添加子节点"
            >
              +
            </button>
          )}
          <button
            onClick={() => onEdit(node)}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 text-xs"
            title="编辑"
          >
            ✎
          </button>
          <button
            onClick={() => onDelete(node)}
            className="w-6 h-6 flex items-center justify-center rounded text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 text-xs"
            title="删除"
          >
            ×
          </button>
        </div>
      </div>

      {/* 子节点 */}
      {hasChildren && isExpanded && (
        <TreeList
          nodes={node.children}
          expandedNodes={expandedNodes}
          selectedNode={selectedNode}
          onToggleExpand={onToggleExpand}
          onSelect={onSelect}
          onEdit={onEdit}
          onDelete={onDelete}
          onCreate={onCreate}
          onToggleEnabled={onToggleEnabled}
          level={(level + 1) as IntentLevel}
        />
      )}
    </div>
  );
}

// ==================== 节点编辑弹窗 ====================

interface NodeEditModalProps {
  node: IntentNode;
  mode: 'create' | 'edit';
  saving: boolean;
  onChange: (node: IntentNode) => void;
  onSave: () => void;
  onCancel: () => void;
  onAddKeyword: () => void;
  onRemoveKeyword: (keyword: string) => void;
}

function NodeEditModal({
  node,
  mode,
  saving,
  onChange,
  onSave,
  onCancel,
  onAddKeyword,
  onRemoveKeyword
}: NodeEditModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {mode === 'create' ? '添加节点' : '编辑节点'}
          </h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        <div className="p-6 space-y-4">
          {/* 节点名称 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              节点名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={node.name}
              onChange={(e) => onChange({ ...node, name: e.target.value })}
              placeholder="请输入节点名称"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 层级 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              层级
            </label>
            <div className="flex gap-2">
              {([1, 2, 3] as IntentLevel[]).map(l => (
                <button
                  key={l}
                  onClick={() => onChange({ ...node, level: l })}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    node.level === l
                      ? `${INTENT_LEVEL_COLORS[l]} border-2 border-current`
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {LEVEL_ICONS[l]} {LEVEL_NAMES[l]}
                </button>
              ))}
            </div>
          </div>

          {/* 描述 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              描述
            </label>
            <textarea
              value={node.description || ''}
              onChange={(e) => onChange({ ...node, description: e.target.value })}
              placeholder="可选：描述该节点的用途"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 关键词 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                匹配关键词
              </label>
              <button
                onClick={onAddKeyword}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                + 添加关键词
              </button>
            </div>
            <div className="flex flex-wrap gap-1 min-h-[32px] p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              {node.keywords.length === 0 ? (
                <span className="text-xs text-gray-400">暂无关键词，点击上方添加</span>
              ) : (
                node.keywords.map(kw => (
                  <span
                    key={kw}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded text-xs"
                  >
                    {kw}
                    <button
                      onClick={() => onRemoveKeyword(kw)}
                      className="hover:text-blue-900 dark:hover:text-blue-100"
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              包含这些关键词的查询将匹配到该节点
            </p>
          </div>

          {/* 启用状态 */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="node-enabled"
              checked={node.enabled}
              onChange={(e) => onChange({ ...node, enabled: e.target.checked })}
              className="w-4 h-4"
            />
            <label htmlFor="node-enabled" className="text-sm text-gray-700 dark:text-gray-300">
              启用该节点（禁用的节点不会参与匹配）
            </label>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            取消
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== 辅助组件 ====================

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-2 p-2">
          <div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="w-32 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="w-16 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function ErrorMessage({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="text-center py-8">
      <div className="text-red-500 mb-4">{message}</div>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
      >
        重试
      </button>
    </div>
  );
}

