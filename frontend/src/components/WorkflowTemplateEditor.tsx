'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Edit2,
  Save,
  Download,
  Upload,
  Copy,
  Check,
  X,
  ChevronRight,
  ChevronDown,
  Settings,
  Users,
  ListTodo,
  Play,
  Pause,
  RotateCcw,
  Zap,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useAgentWorkflowStore, type AgentConfig, type TaskConfig, type WorkflowDefinition } from '@/store/agentWorkflowStore';
import { AGENT_TEMPLATES, WORKFLOW_TEMPLATES } from '@/hooks/useMultiAgent';
import { agentWorkflowAPI } from '@/lib/agentWorkflowAPI';

// Agent模板图标映射
const AGENT_ICONS: Record<string, string> = {
  researcher: '🔍',
  writer: '✍️',
  editor: '📝',
  coder: '💻',
  reviewer: '🔍',
  planner: '📋',
  executor: '⚡',
  coordinator: '🎯',
};

// ==================== 类型定义 ====================

interface CustomWorkflowTemplate {
  id: string;
  name: string;
  description: string;
  process: 'sequential' | 'parallel' | 'hierarchical';
  agents: AgentConfig[];
  tasks: TaskConfig[];
  createdAt: number;
  updatedAt: number;
  isBuiltIn: boolean;
  usageCount: number;
  lastUsedAt?: number;
}

interface ValidationError {
  field: string;
  message: string;
}

// ==================== 主组件 ====================

export default function WorkflowTemplateEditor() {
  // 状态
  const [templates, setTemplates] = useState<CustomWorkflowTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<CustomWorkflowTemplate | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editMode, setEditMode] = useState<'create' | 'edit'>('create');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProcess, setFilterProcess] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // 表单状态
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    process: 'sequential' as 'sequential' | 'parallel' | 'hierarchical',
    agents: [] as AgentConfig[],
    tasks: [] as TaskConfig[],
  });

  // 加载模板
  const loadTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      // 从本地存储加载自定义模板
      const stored = localStorage.getItem('custom-workflow-templates');
      const customTemplates: CustomWorkflowTemplate[] = stored ? JSON.parse(stored) : [];

      // 合并预设模板
      const builtInTemplates: CustomWorkflowTemplate[] = WORKFLOW_TEMPLATES.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        process: t.process as 'sequential' | 'parallel' | 'hierarchical',
        agents: t.agents.map((agentId, index) => {
          const template = AGENT_TEMPLATES.find((a) => a.id === agentId);
          return {
            id: `agent-${index}`,
            name: template?.role || agentId,
            role: template?.role || agentId,
            goal: template?.goal || '',
            backstory: template?.backstory || '',
            tools: [],
            status: 'idle' as const,
          };
        }),
        tasks: t.agents.map((_, index) => ({
          id: `task-${index}`,
          name: `任务 ${index + 1}`,
          description: '',
          agentId: `agent-${index}`,
          status: 'pending' as const,
          dependencies: index > 0 ? [`task-${index - 1}`] : [],
        })),
        createdAt: 0,
        updatedAt: 0,
        isBuiltIn: true,
        usageCount: 0,
      }));

      setTemplates([...builtInTemplates, ...customTemplates]);
    } catch (error) {
      console.error('加载模板失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 保存模板到本地存储
  const saveTemplatesToStorage = useCallback((customTemplates: CustomWorkflowTemplate[]) => {
    localStorage.setItem('custom-workflow-templates', JSON.stringify(customTemplates));
  }, []);

  // 初始化加载
  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // 过滤模板
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      const matchSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchProcess = filterProcess === 'all' || t.process === filterProcess;
      return matchSearch && matchProcess;
    });
  }, [templates, searchQuery, filterProcess]);

  // 按类型分组
  const groupedTemplates = useMemo(() => {
    const builtIn = filteredTemplates.filter((t) => t.isBuiltIn);
    const custom = filteredTemplates.filter((t) => !t.isBuiltIn);
    return { builtIn, custom };
  }, [filteredTemplates]);

  // 验证表单
  const validateForm = useCallback((): boolean => {
    const errors: ValidationError[] = [];

    if (!formData.name.trim()) {
      errors.push({ field: 'name', message: '模板名称不能为空' });
    } else if (formData.name.length > 50) {
      errors.push({ field: 'name', message: '模板名称不能超过50个字符' });
    }

    if (formData.agents.length === 0) {
      errors.push({ field: 'agents', message: '至少需要添加一个Agent' });
    }

    if (formData.tasks.length === 0) {
      errors.push({ field: 'tasks', message: '至少需要添加一个任务' });
    }

    // 检查任务是否都有对应的Agent
    const agentIds = formData.agents.map((a) => a.id);
    for (const task of formData.tasks) {
      if (!agentIds.includes(task.agentId)) {
        errors.push({ field: 'tasks', message: `任务"${task.name}"没有分配Agent` });
      }
    }

    setValidationErrors(errors);
    return errors.length === 0;
  }, [formData]);

  // 创建新模板
  const handleCreate = useCallback(() => {
    setEditMode('create');
    setFormData({
      name: '',
      description: '',
      process: 'sequential',
      agents: [],
      tasks: [],
    });
    setValidationErrors([]);
    setIsEditing(true);
  }, []);

  // 编辑模板
  const handleEdit = useCallback((template: CustomWorkflowTemplate) => {
    setEditMode('edit');
    setFormData({
      name: template.name,
      description: template.description,
      process: template.process,
      agents: [...template.agents],
      tasks: [...template.tasks],
    });
    setValidationErrors([]);
    setIsEditing(true);
  }, []);

  // 保存模板
  const handleSave = useCallback(() => {
    if (!validateForm()) return;

    const now = Date.now();
    const customTemplates = templates.filter((t) => !t.isBuiltIn);

    if (editMode === 'create') {
      const newTemplate: CustomWorkflowTemplate = {
        id: `custom-${now}`,
        name: formData.name,
        description: formData.description,
        process: formData.process,
        agents: formData.agents,
        tasks: formData.tasks,
        createdAt: now,
        updatedAt: now,
        isBuiltIn: false,
        usageCount: 0,
      };

      const updated = [...customTemplates, newTemplate];
      setTemplates((prev) => [...prev.filter((t) => t.isBuiltIn), ...updated]);
      saveTemplatesToStorage(updated);
      setSelectedTemplate(newTemplate);
    } else if (selectedTemplate && !selectedTemplate.isBuiltIn) {
      const updated = customTemplates.map((t) =>
        t.id === selectedTemplate.id
          ? { ...t, ...formData, updatedAt: now }
          : t
      );
      setTemplates((prev) => [...prev.filter((t) => t.isBuiltIn), ...updated]);
      saveTemplatesToStorage(updated);
      setSelectedTemplate({ ...selectedTemplate, ...formData, updatedAt: now });
    }

    setIsEditing(false);
  }, [editMode, formData, selectedTemplate, templates, validateForm, saveTemplatesToStorage]);

  // 删除模板
  const handleDelete = useCallback((templateId: string) => {
    const customTemplates = templates.filter((t) => !t.isBuiltIn && t.id !== templateId);
    setTemplates((prev) => [...prev.filter((t) => t.isBuiltIn), ...customTemplates]);
    saveTemplatesToStorage(customTemplates);
    if (selectedTemplate?.id === templateId) {
      setSelectedTemplate(null);
    }
    setShowDeleteConfirm(null);
  }, [selectedTemplate, templates, saveTemplatesToStorage]);

  // 复制模板
  const handleDuplicate = useCallback((template: CustomWorkflowTemplate) => {
    const now = Date.now();
    const newTemplate: CustomWorkflowTemplate = {
      ...template,
      id: `custom-${now}`,
      name: `${template.name} (副本)`,
      createdAt: now,
      updatedAt: now,
      isBuiltIn: false,
      usageCount: 0,
    };

    const customTemplates = templates.filter((t) => !t.isBuiltIn);
    const updated = [...customTemplates, newTemplate];
    setTemplates((prev) => [...prev.filter((t) => t.isBuiltIn), ...updated]);
    saveTemplatesToStorage(updated);
    setSelectedTemplate(newTemplate);
  }, [templates, saveTemplatesToStorage]);

  // 导出模板
  const handleExport = useCallback((template: CustomWorkflowTemplate) => {
    const exportData = {
      name: template.name,
      description: template.description,
      process: template.process,
      agents: template.agents.map(({ name, role, goal, backstory, tools }) => ({
        name,
        role,
        goal,
        backstory,
        tools,
      })),
      tasks: template.tasks.map(({ name, description, agentId, dependencies }) => ({
        name,
        description,
        agentId,
        dependencies,
      })),
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow-${template.name.replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // 导入模板
  const handleImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);

        // 验证导入数据
        if (!data.name || !data.agents || !data.tasks) {
          throw new Error('无效的模板文件格式');
        }

        const now = Date.now();
        const newTemplate: CustomWorkflowTemplate = {
          id: `custom-${now}`,
          name: data.name,
          description: data.description || '',
          process: data.process || 'sequential',
          agents: data.agents.map((a: any, i: number) => ({
            id: `agent-${i}`,
            name: a.name || a.role || `Agent ${i + 1}`,
            role: a.role || a.name || `Agent ${i + 1}`,
            goal: a.goal || '',
            backstory: a.backstory || '',
            tools: a.tools || [],
            status: 'idle' as const,
          })),
          tasks: data.tasks.map((t: any, i: number) => ({
            id: `task-${i}`,
            name: t.name || `任务 ${i + 1}`,
            description: t.description || '',
            agentId: t.agentId || `agent-${0}`,
            status: 'pending' as const,
            dependencies: t.dependencies || [],
          })),
          createdAt: now,
          updatedAt: now,
          isBuiltIn: false,
          usageCount: 0,
        };

        const customTemplates = templates.filter((t) => !t.isBuiltIn);
        const updated = [...customTemplates, newTemplate];
        setTemplates((prev) => [...prev.filter((t) => t.isBuiltIn), ...updated]);
        saveTemplatesToStorage(updated);
        setSelectedTemplate(newTemplate);
      } catch (error) {
        setImportError(error instanceof Error ? error.message : '导入失败');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }, [templates, saveTemplatesToStorage]);

  // 添加Agent
  const handleAddAgent = useCallback((template?: typeof AGENT_TEMPLATES[0]) => {
    const newAgent: AgentConfig = {
      id: `agent-${Date.now()}`,
      name: template?.role || `Agent ${formData.agents.length + 1}`,
      role: template?.role || `Agent ${formData.agents.length + 1}`,
      goal: template?.goal || '',
      backstory: template?.backstory || '',
      tools: [],
      status: 'idle',
    };
    setFormData((prev) => ({
      ...prev,
      agents: [...prev.agents, newAgent],
    }));
  }, [formData.agents.length]);

  // 移除Agent
  const handleRemoveAgent = useCallback((agentId: string) => {
    setFormData((prev) => ({
      ...prev,
      agents: prev.agents.filter((a) => a.id !== agentId),
      tasks: prev.tasks
        .filter((t) => t.agentId !== agentId)
        .map((t) => ({
          ...t,
          agentId: t.agentId === agentId ? prev.agents[0]?.id || '' : t.agentId,
        })),
    }));
  }, []);

  // 更新Agent
  const handleUpdateAgent = useCallback((agentId: string, updates: Partial<AgentConfig>) => {
    setFormData((prev) => ({
      ...prev,
      agents: prev.agents.map((a) =>
        a.id === agentId ? { ...a, ...updates } : a
      ),
    }));
  }, []);

  // 添加任务
  const handleAddTask = useCallback(() => {
    const newTask: TaskConfig = {
      id: `task-${Date.now()}`,
      name: `任务 ${formData.tasks.length + 1}`,
      description: '',
      agentId: formData.agents[0]?.id || '',
      status: 'pending',
      dependencies: [],
    };
    setFormData((prev) => ({
      ...prev,
      tasks: [...prev.tasks, newTask],
    }));
  }, [formData.tasks.length, formData.agents]);

  // 移除任务
  const handleRemoveTask = useCallback((taskId: string) => {
    setFormData((prev) => ({
      ...prev,
      tasks: prev.tasks
        .filter((t) => t.id !== taskId)
        .map((t) => ({
          ...t,
          dependencies: t.dependencies.filter((d) => d !== taskId),
        })),
    }));
  }, []);

  // 更新任务
  const handleUpdateTask = useCallback((taskId: string, updates: Partial<TaskConfig>) => {
    setFormData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) =>
        t.id === taskId ? { ...t, ...updates } : t
      ),
    }));
  }, []);

  // 从预设创建
  const handleCreateFromPreset = useCallback((presetId: string) => {
    const preset = WORKFLOW_TEMPLATES.find((t) => t.id === presetId);
    if (!preset) return;

    const now = Date.now();
    setFormData({
      name: preset.name,
      description: preset.description,
      process: preset.process as 'sequential' | 'parallel' | 'hierarchical',
      agents: preset.agents.map((agentId, index) => {
        const template = AGENT_TEMPLATES.find((a) => a.id === agentId);
        return {
          id: `agent-${index}`,
          name: template?.role || agentId,
          role: template?.role || agentId,
          goal: template?.goal || '',
          backstory: template?.backstory || '',
          tools: [],
          status: 'idle' as const,
        };
      }),
      tasks: preset.agents.map((_, index) => ({
        id: `task-${index}`,
        name: `任务 ${index + 1}`,
        description: '',
        agentId: `agent-${index}`,
        status: 'pending' as const,
        dependencies: index > 0 ? [`task-${index - 1}`] : [],
      })),
    });
    setEditMode('create');
    setIsEditing(true);
    setValidationErrors([]);
  }, []);

  // 使用模板执行
  const handleUseTemplate = useCallback(async (template: CustomWorkflowTemplate) => {
    setSelectedTemplate(template);

    // 更新使用统计
    if (!template.isBuiltIn) {
      const customTemplates = templates.filter((t) => !t.isBuiltIn);
      const updated = customTemplates.map((t) =>
        t.id === template.id
          ? { ...t, usageCount: t.usageCount + 1, lastUsedAt: Date.now() }
          : t
      );
      setTemplates((prev) => [...prev.filter((t) => t.isBuiltIn), ...updated]);
      saveTemplatesToStorage(updated);
    }

    // 触发自定义事件，让MultiAgentPanel使用此模板
    window.dispatchEvent(new CustomEvent('use-workflow-template', { detail: template }));
  }, [templates, saveTemplatesToStorage]);

  // 取消编辑
  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setValidationErrors([]);
  }, []);

  return (
    <div className="flex h-full flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* 头部 */}
      <div className="shrink-0 border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-sm">
        <div className="flex items-center justify-between p-4">
          <div>
            <h2 className="text-lg font-semibold text-white">工作流模板管理</h2>
            <p className="text-sm text-slate-400">创建和管理自定义Agent工作流</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-300 transition-all hover:bg-slate-700">
              <Upload className="mr-1.5 inline h-4 w-4" />
              导入
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
            </label>
            <button
              onClick={handleCreate}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-3 py-1.5 text-sm font-medium text-white transition-all hover:from-cyan-400 hover:to-blue-400"
            >
              <Plus className="h-4 w-4" />
              新建模板
            </button>
          </div>
        </div>

        {/* 搜索和过滤 */}
        <div className="flex gap-3 px-4 pb-4">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="搜索模板..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-2 pl-10 text-sm text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
            <Zap className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          </div>
          <select
            value={filterProcess}
            onChange={(e) => setFilterProcess(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none"
          >
            <option value="all">全部类型</option>
            <option value="sequential">顺序执行</option>
            <option value="parallel">并行执行</option>
            <option value="hierarchical">层级执行</option>
          </select>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 模板列表 */}
        <div className="w-80 shrink-0 overflow-y-auto border-r border-slate-700/50 p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Zap className="h-12 w-12 text-slate-600" />
              <p className="mt-2 text-sm text-slate-400">暂无模板</p>
              <button
                onClick={handleCreate}
                className="mt-3 text-sm text-cyan-400 hover:text-cyan-300"
              >
                创建第一个模板
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 内置模板 */}
              {groupedTemplates.builtIn.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                    预设模板
                  </h3>
                  <div className="space-y-2">
                    {groupedTemplates.builtIn.map((template) => (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        isSelected={selectedTemplate?.id === template.id}
                        isExpanded={expandedTemplate === template.id}
                        onSelect={() => setSelectedTemplate(template)}
                        onExpand={() => setExpandedTemplate(
                          expandedTemplate === template.id ? null : template.id
                        )}
                        onEdit={() => handleEdit(template)}
                        onDuplicate={() => handleDuplicate(template)}
                        onExport={() => handleExport(template)}
                        onUse={() => handleUseTemplate(template)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* 自定义模板 */}
              {groupedTemplates.custom.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                    自定义模板 ({groupedTemplates.custom.length})
                  </h3>
                  <div className="space-y-2">
                    {groupedTemplates.custom.map((template) => (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        isSelected={selectedTemplate?.id === template.id}
                        isExpanded={expandedTemplate === template.id}
                        onSelect={() => setSelectedTemplate(template)}
                        onExpand={() => setExpandedTemplate(
                          expandedTemplate === template.id ? null : template.id
                        )}
                        onEdit={() => handleEdit(template)}
                        onDuplicate={() => handleDuplicate(template)}
                        onExport={() => handleExport(template)}
                        onUse={() => handleUseTemplate(template)}
                        onDelete={() => setShowDeleteConfirm(template.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 详情/编辑区 */}
        <div className="flex-1 overflow-y-auto p-6">
          {isEditing ? (
            <TemplateEditor
              formData={formData}
              setFormData={setFormData}
              editMode={editMode}
              validationErrors={validationErrors}
              onAddAgent={handleAddAgent}
              onRemoveAgent={handleRemoveAgent}
              onUpdateAgent={handleUpdateAgent}
              onAddTask={handleAddTask}
              onRemoveTask={handleRemoveTask}
              onUpdateTask={handleUpdateTask}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          ) : selectedTemplate ? (
            <TemplateDetail
              template={selectedTemplate}
              onEdit={() => handleEdit(selectedTemplate)}
              onDuplicate={() => handleDuplicate(selectedTemplate)}
              onExport={() => handleExport(selectedTemplate)}
              onUse={() => handleUseTemplate(selectedTemplate)}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="rounded-full bg-slate-800/50 p-6">
                <Zap className="h-16 w-16 text-slate-600" />
              </div>
              <h3 className="mt-4 text-lg font-medium text-slate-300">选择一个模板</h3>
              <p className="mt-1 text-sm text-slate-500">
                从左侧列表选择模板查看详情，或创建新模板
              </p>
              <div className="mt-6">
                <p className="mb-3 text-xs text-slate-500">快速开始</p>
                <div className="flex gap-2">
                  {WORKFLOW_TEMPLATES.slice(0, 3).map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => handleCreateFromPreset(preset.id)}
                      className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-400 transition-all hover:border-cyan-500/50 hover:bg-slate-800 hover:text-cyan-400"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle className="h-6 w-6" />
              <h3 className="text-lg font-semibold">确认删除</h3>
            </div>
            <p className="mt-3 text-sm text-slate-400">
              确定要删除此模板吗？此操作无法撤销。
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 transition-all hover:bg-slate-800"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                className="rounded-lg bg-red-500/20 px-4 py-2 text-sm text-red-400 transition-all hover:bg-red-500/30"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 导入错误提示 */}
      {importError && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{importError}</span>
            <button
              onClick={() => setImportError(null)}
              className="ml-2 text-red-400 hover:text-red-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== 模板卡片组件 ====================

interface TemplateCardProps {
  template: CustomWorkflowTemplate;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onExpand: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onUse: () => void;
  onDelete?: () => void;
}

function TemplateCard({
  template,
  isSelected,
  isExpanded,
  onSelect,
  onExpand,
  onEdit,
  onDuplicate,
  onExport,
  onUse,
  onDelete,
}: TemplateCardProps) {
  const processLabels = {
    sequential: { text: '顺序', color: 'text-blue-400 bg-blue-400/10' },
    parallel: { text: '并行', color: 'text-green-400 bg-green-400/10' },
    hierarchical: { text: '层级', color: 'text-purple-400 bg-purple-400/10' },
  };

  const process = processLabels[template.process];

  return (
    <div
      className={`rounded-xl border transition-all ${
        isSelected
          ? 'border-cyan-500/50 bg-cyan-500/10'
          : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600 hover:bg-slate-800/50'
      }`}
    >
      <div className="p-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onExpand}
              className="text-slate-500 transition-transform duration-200 hover:text-slate-300"
              style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div>
              <h4 className="font-medium text-white">{template.name}</h4>
              <p className="mt-0.5 text-xs text-slate-400">{template.description}</p>
            </div>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-xs ${process.color}`}>
            {process.text}
          </span>
        </div>

        {/* 展开的详细信息 */}
        {isExpanded && (
          <div className="mt-3 space-y-2 border-t border-slate-700/50 pt-3">
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {template.agents.length} Agent
              </span>
              <span className="flex items-center gap-1">
                <ListTodo className="h-3 w-3" />
                {template.tasks.length} 任务
              </span>
              {template.usageCount > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  使用 {template.usageCount} 次
                </span>
              )}
            </div>

            {/* Agent列表 */}
            <div className="flex flex-wrap gap-1">
              {template.agents.map((agent, index) => (
                <span
                  key={agent.id}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-700/50 px-2 py-0.5 text-xs text-slate-300"
                >
                  <span>{AGENT_ICONS[agent.role.toLowerCase()] || '🤖'}</span>
                  {agent.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={onUse}
            className="flex items-center gap-1 rounded-lg bg-cyan-500/20 px-3 py-1 text-xs font-medium text-cyan-400 transition-all hover:bg-cyan-500/30"
          >
            <Play className="h-3 w-3" />
            使用
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={onDuplicate}
              className="rounded-lg p-1.5 text-slate-500 transition-all hover:bg-slate-700 hover:text-slate-300"
              title="复制"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onExport}
              className="rounded-lg p-1.5 text-slate-500 transition-all hover:bg-slate-700 hover:text-slate-300"
              title="导出"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            {!template.isBuiltIn && (
              <>
                <button
                  onClick={onEdit}
                  className="rounded-lg p-1.5 text-slate-500 transition-all hover:bg-slate-700 hover:text-slate-300"
                  title="编辑"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                {onDelete && (
                  <button
                    onClick={onDelete}
                    className="rounded-lg p-1.5 text-slate-500 transition-all hover:bg-red-500/20 hover:text-red-400"
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== 模板详情组件 ====================

interface TemplateDetailProps {
  template: CustomWorkflowTemplate;
  onEdit: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onUse: () => void;
}

function TemplateDetail({ template, onEdit, onDuplicate, onExport, onUse }: TemplateDetailProps) {
  const processDescriptions = {
    sequential: '任务按顺序执行，每个任务完成后才启动下一个',
    parallel: '多个任务可以同时执行，提高效率',
    hierarchical: '存在主从Agent关系，主Agent协调其他Agent',
  };

  return (
    <div className="max-w-2xl">
      {/* 头部信息 */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-white">{template.name}</h2>
              {template.isBuiltIn && (
                <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-400">
                  预设
                </span>
              )}
            </div>
            <p className="mt-1 text-slate-400">{template.description}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onUse}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 text-sm font-medium text-white transition-all hover:from-cyan-400 hover:to-blue-400"
            >
              <Play className="h-4 w-4" />
              立即使用
            </button>
          </div>
        </div>

        {/* 统计信息 */}
        <div className="mt-4 flex gap-4">
          <div className="rounded-lg bg-slate-800/50 p-3">
            <div className="text-2xl font-bold text-cyan-400">{template.agents.length}</div>
            <div className="text-xs text-slate-500">Agent</div>
          </div>
          <div className="rounded-lg bg-slate-800/50 p-3">
            <div className="text-2xl font-bold text-green-400">{template.tasks.length}</div>
            <div className="text-xs text-slate-500">任务</div>
          </div>
          <div className="rounded-lg bg-slate-800/50 p-3">
            <div className="text-2xl font-bold text-purple-400">{template.usageCount}</div>
            <div className="text-xs text-slate-500">使用次数</div>
          </div>
        </div>
      </div>

      {/* 执行模式 */}
      <div className="mb-6 rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
        <h3 className="mb-2 text-sm font-medium text-slate-300">执行模式</h3>
        <p className="text-sm text-slate-400">{processDescriptions[template.process]}</p>
      </div>

      {/* Agent列表 */}
      <div className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-slate-300">Agent 配置</h3>
        <div className="space-y-3">
          {template.agents.map((agent, index) => (
            <div
              key={agent.id}
              className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500/20 text-lg">
                  {AGENT_ICONS[agent.role.toLowerCase()] || '🤖'}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-white">{agent.name}</div>
                  <div className="text-xs text-slate-500">{agent.role}</div>
                </div>
              </div>
              {agent.goal && (
                <p className="mt-2 text-sm text-slate-400">
                  <span className="text-slate-500">目标:</span> {agent.goal}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 任务列表 */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-slate-300">任务流程</h3>
        <div className="space-y-3">
          {template.tasks.map((task, index) => {
            const agent = template.agents.find((a) => a.id === task.agentId);
            return (
              <div
                key={task.id}
                className="flex items-start gap-3 rounded-xl border border-slate-700/50 bg-slate-800/30 p-4"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-medium text-slate-400">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-white">{task.name}</div>
                  {task.description && (
                    <p className="mt-1 text-sm text-slate-400">{task.description}</p>
                  )}
                  {agent && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                      <span>由</span>
                      <span className="text-cyan-400">{agent.name}</span>
                      <span>执行</span>
                    </div>
                  )}
                  {task.dependencies.length > 0 && (
                    <div className="mt-1 text-xs text-slate-500">
                      依赖: {task.dependencies.map((d) => {
                        const depTask = template.tasks.find((t) => t.id === d);
                        return depTask?.name || d;
                      }).join(', ')}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ==================== 模板编辑器组件 ====================

interface TemplateFormData {
  name: string;
  description: string;
  process: 'sequential' | 'parallel' | 'hierarchical';
  agents: AgentConfig[];
  tasks: TaskConfig[];
}

interface TemplateEditorProps {
  formData: TemplateFormData;
  setFormData: React.Dispatch<React.SetStateAction<TemplateFormData>>;
  editMode: 'create' | 'edit';
  validationErrors: ValidationError[];
  onAddAgent: (template?: typeof AGENT_TEMPLATES[0]) => void;
  onRemoveAgent: (agentId: string) => void;
  onUpdateAgent: (agentId: string, updates: Partial<AgentConfig>) => void;
  onAddTask: () => void;
  onRemoveTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, updates: Partial<TaskConfig>) => void;
  onSave: () => void;
  onCancel: () => void;
}

function TemplateEditor({
  formData,
  setFormData,
  editMode,
  validationErrors,
  onAddAgent,
  onRemoveAgent,
  onUpdateAgent,
  onAddTask,
  onRemoveTask,
  onUpdateTask,
  onSave,
  onCancel,
}: TemplateEditorProps) {
  const [showAgentPicker, setShowAgentPicker] = useState(false);

  const getFieldError = (field: string) =>
    validationErrors.find((e) => e.field === field)?.message;

  return (
    <div className="max-w-3xl">
      {/* 头部 */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">
          {editMode === 'create' ? '创建新模板' : '编辑模板'}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 transition-all hover:bg-slate-800"
          >
            取消
          </button>
          <button
            onClick={onSave}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 text-sm font-medium text-white transition-all hover:from-cyan-400 hover:to-blue-400"
          >
            <Save className="h-4 w-4" />
            保存
          </button>
        </div>
      </div>

      {/* 基本信息 */}
      <div className="mb-6 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">
            模板名称 *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="例如：技术博客写作流程"
            className={`w-full rounded-lg border bg-slate-800/50 px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-1 ${
              getFieldError('name')
                ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                : 'border-slate-700 focus:border-cyan-500 focus:ring-cyan-500'
            }`}
          />
          {getFieldError('name') && (
            <p className="mt-1 text-xs text-red-400">{getFieldError('name')}</p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">
            描述
          </label>
          <input
            type="text"
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="简短描述此工作流的用途"
            className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">
            执行模式
          </label>
          <div className="grid grid-cols-3 gap-3">
            {(['sequential', 'parallel', 'hierarchical'] as const).map((process) => (
              <button
                key={process}
                onClick={() => setFormData((prev) => ({ ...prev, process }))}
                className={`rounded-lg border p-3 text-left transition-all ${
                  formData.process === process
                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                    : 'border-slate-700 bg-slate-800/30 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="text-sm font-medium">
                  {process === 'sequential' ? '顺序执行' : process === 'parallel' ? '并行执行' : '层级执行'}
                </div>
                <div className="mt-0.5 text-xs opacity-60">
                  {process === 'sequential' ? '依次完成任务' : process === 'parallel' ? '同时执行' : '主Agent协调'}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Agent配置 */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <label className="text-sm font-medium text-slate-300">
            Agent 配置 * ({formData.agents.length})
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAgentPicker(!showAgentPicker)}
              className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-400 transition-all hover:bg-slate-800"
            >
              <Plus className="h-3 w-3" />
              从预设添加
            </button>
            <button
              onClick={() => onAddAgent()}
              className="flex items-center gap-1 rounded-lg border border-cyan-500/50 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-400 transition-all hover:bg-cyan-500/20"
            >
              <Plus className="h-3 w-3" />
              自定义Agent
            </button>
          </div>
        </div>

        {/* 预设Agent选择器 */}
        {showAgentPicker && (
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-slate-700 bg-slate-800/50 p-3">
            {AGENT_TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => {
                  onAddAgent(template);
                  setShowAgentPicker(false);
                }}
                className="flex items-center gap-2 rounded-lg bg-slate-700/50 p-2 text-left transition-all hover:bg-slate-700"
              >
                <span className="text-lg">{AGENT_ICONS[template.id] || '🤖'}</span>
                <div>
                  <div className="text-sm text-white">{template.role}</div>
                  <div className="text-xs text-slate-500">{template.goal.slice(0, 30)}...</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Agent列表 */}
        {formData.agents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 bg-slate-800/20 p-6 text-center">
            <Users className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-2 text-sm text-slate-500">至少添加一个Agent</p>
          </div>
        ) : (
          <div className="space-y-3">
            {formData.agents.map((agent, index) => (
              <div
                key={agent.id}
                className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-xl">
                    {AGENT_ICONS[agent.role.toLowerCase()] || '🤖'}
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs text-slate-500">名称</label>
                        <input
                          type="text"
                          value={agent.name}
                          onChange={(e) => onUpdateAgent(agent.id, { name: e.target.value, role: e.target.value })}
                          className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-slate-500">角色</label>
                        <input
                          type="text"
                          value={agent.role}
                          onChange={(e) => onUpdateAgent(agent.id, { role: e.target.value })}
                          className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-500">目标</label>
                      <input
                        type="text"
                        value={agent.goal}
                        onChange={(e) => onUpdateAgent(agent.id, { goal: e.target.value })}
                        placeholder="描述Agent的目标..."
                        className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-500">背景</label>
                      <textarea
                        value={agent.backstory}
                        onChange={(e) => onUpdateAgent(agent.id, { backstory: e.target.value })}
                        placeholder="描述Agent的背景..."
                        rows={2}
                        className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none resize-none"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => onRemoveAgent(agent.id)}
                    className="rounded-lg p-1.5 text-slate-500 transition-all hover:bg-red-500/20 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 任务配置 */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <label className="text-sm font-medium text-slate-300">
            任务配置 * ({formData.tasks.length})
          </label>
          <button
            onClick={onAddTask}
            className="flex items-center gap-1 rounded-lg border border-green-500/50 bg-green-500/10 px-3 py-1.5 text-xs text-green-400 transition-all hover:bg-green-500/20"
          >
            <Plus className="h-3 w-3" />
            添加任务
          </button>
        </div>

        {getFieldError('tasks') && (
          <p className="mb-3 text-xs text-red-400">{getFieldError('tasks')}</p>
        )}

        {/* 任务列表 */}
        {formData.tasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 bg-slate-800/20 p-6 text-center">
            <ListTodo className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-2 text-sm text-slate-500">至少添加一个任务</p>
          </div>
        ) : (
          <div className="space-y-3">
            {formData.tasks.map((task, index) => (
              <div
                key={task.id}
                className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4"
              >
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-xs font-medium text-slate-400">
                    {index + 1}
                  </div>
                  <input
                    type="text"
                    value={task.name}
                    onChange={(e) => onUpdateTask(task.id, { name: e.target.value })}
                    placeholder="任务名称"
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                  />
                  <select
                    value={task.agentId}
                    onChange={(e) => onUpdateTask(task.id, { agentId: e.target.value })}
                    className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="">选择Agent</option>
                    {formData.agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => onRemoveTask(task.id)}
                    className="rounded-lg p-1.5 text-slate-500 transition-all hover:bg-red-500/20 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <textarea
                  value={task.description}
                  onChange={(e) => onUpdateTask(task.id, { description: e.target.value })}
                  placeholder="任务详细描述..."
                  rows={2}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none resize-none"
                />

                {/* 依赖关系 */}
                <div className="mt-2">
                  <label className="mb-1 block text-xs text-slate-500">依赖任务</label>
                  <div className="flex flex-wrap gap-1">
                    {formData.tasks
                      .filter((t) => t.id !== task.id)
                      .map((depTask) => (
                        <label
                          key={depTask.id}
                          className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-all ${
                            task.dependencies.includes(depTask.id)
                              ? 'bg-cyan-500/20 text-cyan-400'
                              : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={task.dependencies.includes(depTask.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                onUpdateTask(task.id, {
                                  dependencies: [...task.dependencies, depTask.id],
                                });
                              } else {
                                onUpdateTask(task.id, {
                                  dependencies: task.dependencies.filter((d) => d !== depTask.id),
                                });
                              }
                            }}
                            className="hidden"
                          />
                          {depTask.name}
                        </label>
                      ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
