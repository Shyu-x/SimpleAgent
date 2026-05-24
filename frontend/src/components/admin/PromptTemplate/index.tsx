'use client';

/**
 * Prompt 模板管理页面
 *
 * 功能：
 * - 模板列表与分类
 * - 可视化模板编辑
 * - 版本历史管理
 * - 模板变量高亮
 * - 模板预览与测试
 */

import React, { useState, useCallback, useEffect } from 'react';
import { fetchApi } from '@/lib/apiClient';
import { useAdminPolling } from '@/hooks/useAdminSSE';
import { ErrorBoundary } from '@/utils/ErrorBoundary';
import { FallbackUI } from '@/components/FallbackUI';
import type { PromptTemplate as SharedPromptTemplate } from '@/types/prompts';
import ConfirmDialog from '@/components/agent/MissionControl/ConfirmDialog';
import AlertDialog from '@/components/agent/MissionControl/AlertDialog';

// 扩展共享类型以支持后端返回的额外字段
type PromptTemplate = SharedPromptTemplate & {
  version?: number;
  variables?: TemplateVariable[];
  createdBy?: string;
  isActive?: boolean;
};

interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  defaultValue?: string;
  description?: string;
}

interface TemplateVersion {
  version: number;
  content: string;
  changedAt: string;
  changedBy: string;
  changeNote: string;
}

interface TemplateTestResult {
  rendered: string;
  tokenCount: number;
  issues: { type: 'warning' | 'error'; message: string }[];
}

// ============ 主组件 ============

export default function PromptTemplatePage() {
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // SSE 订阅 templates 数据
  const { data: templatesData, loading, refresh: refreshTemplates } = useAdminPolling<PromptTemplate[]>({
    endpoint: '/api/admin/prompts',
    parser: (res) => {
      const rawTemplates = res?.data?.data?.templates || res?.data?.templates || [];
      return rawTemplates.map((t: any) => ({
        ...t,
        content: t.template,
      }));
    },
    interval: 30000,
  });

  const templates = templatesData || [];

  const fetchTemplates = refreshTemplates;

  const createTemplate = async (template: Partial<PromptTemplate>) => {
    try {
      // 映射 content -> template 以匹配后端接口
      const backendTemplate = {
        ...template,
        template: template.content,
      };
      delete backendTemplate.content;
      const { error } = await fetchApi('/api/admin/prompts', {
        method: 'POST',
        body: JSON.stringify(backendTemplate),
      });
      if (error) throw new Error(error.message);
      fetchTemplates();
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to create template:', err);
    }
  };

  const updateTemplate = async (id: string, template: Partial<PromptTemplate>) => {
    try {
      // 映射 content -> template 以匹配后端接口
      const backendTemplate = {
        ...template,
        template: template.content,
      };
      delete backendTemplate.content;
      const { error } = await fetchApi(`/api/admin/prompts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(backendTemplate),
      });
      if (error) throw new Error(error.message);
      fetchTemplates();
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update template:', err);
    }
  };

  // 删除确认对话框状态
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; templateId?: string }>({
    isOpen: false,
  });

  const deleteTemplate = async (id: string) => {
    setDeleteDialog({ isOpen: true, templateId: id });
  };

  const handleDeleteConfirm = async () => {
    const { templateId } = deleteDialog;
    if (!templateId) return;
    setDeleteDialog({ isOpen: false });
    try {
      const { error } = await fetchApi(`/api/admin/prompts/${templateId}`, { method: 'DELETE' });
      if (error) throw new Error(error.message);
      if (selectedTemplate?.id === templateId) setSelectedTemplate(null);
      fetchTemplates();
    } catch (err) {
      console.error('Failed to delete template:', err);
    }
  };

  const categories = ['all', ...new Set(templates.map((t) => t.category))];

  const filteredTemplates = templates.filter((t) => {
    const matchesSearch =
      searchQuery === '' ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <ErrorBoundary moduleName="PromptTemplatePage" fallback={<FallbackUI moduleName="Prompt模板" error="组件加载失败" style="detailed" showRetry={true} onRetry={() => window.location.reload()} />}>
      <>
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title="删除模板"
        message="确定要删除这个模板吗？此操作不可恢复。"
        confirmLabel="删除"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteDialog({ isOpen: false })}
      />
      <div className="p-6 space-y-6">
        {/* 页面标题 */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Prompt 模板</h1>
          <button
            onClick={() => {
              setSelectedTemplate(null);
              setIsEditing(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            新建模板
          </button>
        </div>

        {/* 筛选器 */}
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-64">
            <input
              type="text"
              placeholder="搜索模板..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === 'all' ? '全部分类' : cat}
              </option>
            ))}
          </select>
        </div>

        {/* 模板列表 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：模板列表 */}
          <div className="lg:col-span-1 space-y-3">
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                isSelected={selectedTemplate?.id === template.id}
                onSelect={() => {
                  setSelectedTemplate(template);
                  setIsEditing(false);
                  setShowVersionHistory(false);
                }}
              />
            ))}
            {filteredTemplates.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                {searchQuery || categoryFilter !== 'all'
                  ? '没有找到匹配的模板'
                  : '暂无模板，点击新建模板开始'}
              </div>
            )}
          </div>

          {/* 右侧：详情/编辑面板 */}
          <div className="lg:col-span-2 bg-white border rounded-lg">
            {isEditing ? (
              <TemplateEditor
                template={selectedTemplate}
                onSave={(id, data) => selectedTemplate ? updateTemplate(selectedTemplate.id, data) : createTemplate(data)}
                onCancel={() => {
                  setIsEditing(false);
                  if (!selectedTemplate) setSelectedTemplate(null);
                }}
              />
            ) : selectedTemplate ? (
              showVersionHistory ? (
                <VersionHistoryPanel
                  templateId={selectedTemplate.id}
                  onBack={() => setShowVersionHistory(false)}
                />
              ) : (
                <TemplateDetail
                  template={selectedTemplate}
                  onEdit={() => setIsEditing(true)}
                  onDelete={() => deleteTemplate(selectedTemplate.id)}
                  onShowHistory={() => setShowVersionHistory(true)}
                />
              )
            ) : (
              <div className="flex items-center justify-center h-96 text-gray-400">
                选择一个模板查看详情
              </div>
            )}
          </div>
        </div>
      </div>
      </>
    </ErrorBoundary>
  );
}

// ============ 模板卡片 ============

function TemplateCard({
  template,
  isSelected,
  onSelect,
}: {
  template: PromptTemplate;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`bg-white border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'border-blue-500 ring-2 ring-blue-100' : 'hover:border-gray-300'
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="font-medium">{template.name}</h3>
          <span className="text-xs text-gray-500">{template.category}</span>
        </div>
        {template.isActive ? (
          <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs">
            启用
          </span>
        ) : (
          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
            禁用
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 line-clamp-2">{template.description}</p>
      <div className="mt-2 flex justify-between text-xs text-gray-400">
        <span>v{template.version}</span>
        <span>{new Date(template.updatedAt).toLocaleDateString()}</span>
      </div>
    </div>
  );
}

// ============ 模板详情 ============

function TemplateDetail({
  template,
  onEdit,
  onDelete,
  onShowHistory,
}: {
  template: PromptTemplate;
  onEdit: () => void;
  onDelete: () => void;
  onShowHistory: () => void;
}) {
  const [testValues, setTestValues] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<TemplateTestResult | null>(null);

  const handleTest = async () => {
    try {
      const { data, error } = await fetchApi<{ data?: { rendered?: string } }>(`/api/admin/prompts/${template.id}/test`, {
        method: 'POST',
        body: JSON.stringify({ variables: testValues }),
      });
      if (error) throw new Error(error.message);
      // 后端返回 { success: true, data: { rendered, unfilledVariables, ... } }
      setTestResult({
        rendered: data?.data?.rendered || '',
        tokenCount: data?.data?.rendered?.length || 0,
        issues: []
      });
    } catch (err) {
      console.error('Failed to test template:', err);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* 头部操作 */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">{template.name}</h2>
          <p className="text-sm text-gray-500">{template.description}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onShowHistory}
            className="px-3 py-2 text-sm bg-gray-100 rounded hover:bg-gray-200"
          >
            版本历史
          </button>
          <button
            onClick={onEdit}
            className="px-3 py-2 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
          >
            编辑
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-2 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
          >
            删除
          </button>
        </div>
      </div>

      {/* 元信息 */}
      <div className="flex gap-4 text-sm text-gray-500">
        <span>版本 v{template.version}</span>
        <span>•</span>
        <span>分类: {template.category}</span>
        <span>•</span>
        <span>创建者: {template.createdBy}</span>
        <span>•</span>
        <span>更新于 {new Date(template.updatedAt).toLocaleDateString()}</span>
      </div>

      {/* 模板变量 */}
      {template.variables && template.variables.length > 0 && (
        <div>
          <h3 className="font-medium mb-2">模板变量</h3>
          <div className="flex flex-wrap gap-2">
            {template.variables.map((v, idx) => (
              <span
                key={`var-${v.name}-${idx}`}
                className={`px-2 py-1 rounded text-sm ${
                  v.required
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-700'
                }`}
                title={v.description}
              >
                {`{{${v.name}}}`}
                {v.required && <span className="ml-1">*</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 模板内容 */}
      <div>
        <h3 className="font-medium mb-2">模板内容</h3>
        <div className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-sm overflow-x-auto">
          <TemplateHighlighter content={template.content} variables={template.variables} />
        </div>
      </div>

      {/* 模板测试 */}
      <div>
        <h3 className="font-medium mb-2">模板测试</h3>
        <div className="space-y-4">
          {/* 变量输入 */}
          {template.variables && template.variables.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              {template.variables.map((v, idx) => (
                <div key={`test-var-${v.name}-${idx}`}>
                  <label className="block text-sm font-medium mb-1">
                    {v.name}
                    {v.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  <input
                    type="text"
                    value={testValues[v.name] || v.defaultValue || ''}
                    onChange={(e) =>
                      setTestValues((prev) => ({ ...prev, [v.name]: e.target.value }))
                    }
                    placeholder={v.description || v.name}
                    className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
          )}
          <button
            onClick={handleTest}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            测试渲染
          </button>

          {/* 测试结果 */}
          {testResult && (
            <div className="space-y-3">
              <div className="flex gap-4 text-sm">
                <span className="text-gray-500">
                  Token 预估: {testResult.tokenCount}
                </span>
                {testResult.issues.length > 0 && (
                  <span className="text-yellow-600">
                    {testResult.issues.length} 个问题
                  </span>
                )}
              </div>
              {testResult.issues.length > 0 && (
                <div className="space-y-1">
                  {testResult.issues.map((issue, idx) => (
                    <div
                      key={idx}
                      className={`text-sm px-3 py-2 rounded ${
                        issue.type === 'error'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-yellow-50 text-yellow-700'
                      }`}
                    >
                      {issue.message}
                    </div>
                  ))}
                </div>
              )}
              <div className="bg-gray-100 rounded p-4 font-mono text-sm whitespace-pre-wrap">
                {testResult.rendered}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ 模板编辑器 ============

function TemplateEditor({
  template,
  onSave,
  onCancel,
}: {
  template: PromptTemplate | null;
  onSave: (id: string | null, data: Partial<PromptTemplate>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [category, setCategory] = useState<string>(template?.category || 'general');
  const [content, setContent] = useState(template?.content || '');
  const [variables, setVariables] = useState<TemplateVariable[]>(
    template?.variables || []
  );
  const [newVarName, setNewVarName] = useState('');

  // 提示对话框状态
  const [alertDialog, setAlertDialog] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: '',
  });

  const handleSave = () => {
    if (!name.trim() || !content.trim()) {
      setAlertDialog({ isOpen: true, title: '输入验证', message: '请填写名称和内容' });
      return;
    }
    const templateData = {
      name,
      description,
      category: category as 'general' | 'coding' | 'writing' | 'analysis' | 'custom',
      content,
      variables,
      isActive: true,
    };
    if (template?.id) {
      // Editing existing template
      onSave(template.id, templateData);
    } else {
      // Creating new template
      onSave(null, templateData);
    }
  };

  const addVariable = () => {
    if (!newVarName.trim()) return;
    if (variables.some((v) => v.name === newVarName)) {
      setAlertDialog({ isOpen: true, title: '变量已存在', message: '变量名不能重复' });
      return;
    }
    setVariables([...variables, { name: newVarName, type: 'string', required: false }]);
    setNewVarName('');
  };

  const removeVariable = (name: string) => {
    setVariables(variables.filter((v) => v.name !== name));
  };

  return (
    <>
      <AlertDialog
        isOpen={alertDialog.isOpen}
        title={alertDialog.title}
        message={alertDialog.message}
        variant="info"
        onClose={() => setAlertDialog({ isOpen: false, title: '', message: '' })}
      />
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">{template ? '编辑模板' : '新建模板'}</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">名称 *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="输入模板名称"
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">分类</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="general"
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">描述</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="输入模板描述"
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* 模板变量 */}
        <div>
          <label className="block text-sm font-medium mb-2">模板变量</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {variables.map((v, idx) => (
              <span
                key={`edit-var-${v.name}-${idx}`}
                className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm flex items-center gap-1"
              >
                {`{{${v.name}}}`}
                <button
                  onClick={() => removeVariable(v.name)}
                  className="text-blue-600 hover:text-blue-800"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newVarName}
              onChange={(e) => setNewVarName(e.target.value)}
              placeholder="输入变量名"
              className="flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && addVariable()}
            />
            <button
              onClick={addVariable}
              className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200"
            >
              添加变量
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            使用 {'{{变量名}}'} 格式引用变量，点击内容区域的变量可快速插入
          </p>
        </div>

        {/* 模板内容 */}
        <div>
          <label className="block text-sm font-medium mb-1">模板内容 *</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={16}
            placeholder="输入模板内容..."
            className="w-full px-3 py-2 border rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
        >
          取消
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          保存
        </button>
      </div>
    </div>
    </>
  );
}

// ============ 版本历史 ============

function VersionHistoryPanel({
  templateId,
  onBack,
}: {
  templateId: string;
  onBack: () => void;
}) {
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [loading, setLoading] = useState(true);

  // 对话框状态
  const [rollbackDialog, setRollbackDialog] = useState<{ isOpen: boolean; version?: number }>({
    isOpen: false,
  });
  const [alertDialog, setAlertDialog] = useState<{ isOpen: boolean; title: string; message: string; variant?: 'info' | 'success' | 'error' }>({
    isOpen: false,
    title: '',
    message: '',
  });

  useEffect(() => {
    const fetchVersions = async () => {
      try {
        const { data, error } = await fetchApi<{ data?: { versions: any[] } }>(`/api/admin/prompts/${templateId}/versions`);
        if (error) throw new Error(error.message);
        // 映射 createdAt -> changedAt 以匹配前端接口
        const mappedVersions: TemplateVersion[] = (data?.data?.versions || []).map((v) => ({
          ...v,
          changedAt: v.createdAt,
        }));
        setVersions(mappedVersions);
      } catch (err) {
        console.error('Failed to fetch versions:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchVersions();
  }, [templateId]);

  const handleRollbackClick = (version: number) => {
    setRollbackDialog({ isOpen: true, version });
  };

  const rollbackToVersion = async () => {
    const { version } = rollbackDialog;
    if (version === undefined) return;
    setRollbackDialog({ isOpen: false });
    try {
      const { error } = await fetchApi(`/api/admin/prompts/${templateId}/rollback`, {
        method: 'POST',
        body: JSON.stringify({ version }),
      });
      if (error) throw new Error(error.message);
      setAlertDialog({ isOpen: true, title: '回滚成功', message: `已回滚到 v${version}`, variant: 'success' });
      onBack();
    } catch (err) {
      console.error('Failed to rollback:', err);
    }
  };

  return (
    <>
      <ConfirmDialog
        isOpen={rollbackDialog.isOpen}
        title="回滚模板"
        message={rollbackDialog.version !== undefined ? `确定要回滚到 v${rollbackDialog.version} 吗？` : '确定要回滚吗？'}
        confirmLabel="回滚"
        variant="warning"
        onConfirm={rollbackToVersion}
        onCancel={() => setRollbackDialog({ isOpen: false })}
      />
      <AlertDialog
        isOpen={alertDialog.isOpen}
        title={alertDialog.title}
        message={alertDialog.message}
        variant={alertDialog.variant}
        onClose={() => setAlertDialog({ isOpen: false, title: '', message: '' })}
      />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">版本历史</h2>
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600">
          ✕
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">加载中...</div>
      ) : (
        <div className="space-y-3">
          {versions.map((v) => (
            <div
              key={v.version}
              className="border rounded-lg p-4 hover:bg-gray-50"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="font-medium">v{v.version}</span>
                  <span className="ml-2 text-sm text-gray-500">
                    {new Date(v.changedAt).toLocaleString()}
                  </span>
                </div>
                <button
                  onClick={() => handleRollbackClick(v.version)}
                  className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                  回滚到此版本
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-2">{v.changeNote}</p>
              <p className="text-xs text-gray-400">修改者: {v.changedBy}</p>
            </div>
          ))}
          {versions.length === 0 && (
            <div className="text-center py-8 text-gray-400">暂无版本历史</div>
          )}
        </div>
      )}
    </div>
    </>
  );
}

// ============ 模板高亮器 ============

function TemplateHighlighter({
  content,
  variables,
}: {
  content: string;
  variables?: TemplateVariable[];
}) {
  // 简单的变量高亮处理
  const variableNames = new Set((variables || []).map((v) => v.name));

  const parts = content.split(/(\{\{[^}]+\}\})/g);

  return (
    <pre className="whitespace-pre-wrap">
      {parts.map((part, idx) => {
        if (part.match(/^\{\{[^}]+\}\}$/)) {
          const varName = part.slice(2, -2);
          const isKnown = variableNames.has(varName);
          return (
            <span
              key={idx}
              className={
                isKnown
                  ? 'bg-blue-200 text-blue-900 px-1 rounded'
                  : 'bg-yellow-200 text-yellow-900 px-1 rounded'
              }
            >
              {part}
            </span>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </pre>
  );
}
