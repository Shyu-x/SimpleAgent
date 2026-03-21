'use client';

import { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Workflow,
  Plus,
  Pause,
  Trash2,
  Settings,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Save,
  Download,
  Circle,
  Square,
  Diamond,
  FileText,
  Code,
  BarChart3,
  PenTool,
  Layers,
  X,
  Search,
  Tag,
  Layout,
  BookOpen,
  GitPullRequest,
  Database,
  Feather,
} from 'lucide-react';

// ============ 类型定义 ============

export type NodeType = 'start' | 'end' | 'agent' | 'tool' | 'condition' | 'parallel' | 'delay';

export interface WorkflowNode {
  id: string;
  type: NodeType;
  name: string;
  x: number;
  y: number;
  config?: Record<string, unknown>;
  connections?: string[];
}

export interface WorkflowConnection {
  id: string;
  from: string;
  to: string;
  label?: string;
  condition?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
  createdAt: number;
  updatedAt: number;
}

// ============ 模板相关类型 ============

/** 模板分类 */
export type TemplateCategory = 'research' | 'development' | 'data' | 'writing' | 'custom';

/** 工作流模板 */
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
  isBuiltIn: boolean;
}

// ============ 预设模板 ============

const PRESET_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'template_paper_reader',
    name: '论文阅读助手',
    description: '读取论文 → 自动总结 → 翻译关键内容 → 保存到知识库',
    category: 'research',
    tags: ['论文', '阅读', '翻译', 'RAG'],
    isBuiltIn: true,
    nodes: [
      { id: 'start_1', type: 'start', name: '开始', x: 60, y: 200 },
      { id: 'tool_read', type: 'tool', name: '读取文档', x: 200, y: 200 },
      { id: 'agent_summary', type: 'agent', name: '生成摘要', x: 360, y: 200 },
      { id: 'condition_need_trans', type: 'condition', name: '需要翻译?', x: 520, y: 200 },
      { id: 'agent_translate', type: 'agent', name: '翻译节点', x: 680, y: 140 },
      { id: 'tool_save', type: 'tool', name: '保存知识库', x: 680, y: 280 },
      { id: 'end_1', type: 'end', name: '结束', x: 840, y: 200 },
    ],
    connections: [
      { id: 'c1', from: 'start_1', to: 'tool_read' },
      { id: 'c2', from: 'tool_read', to: 'agent_summary' },
      { id: 'c3', from: 'agent_summary', to: 'condition_need_trans' },
      { id: 'c4a', from: 'condition_need_trans', to: 'agent_translate', condition: '是' },
      { id: 'c4b', from: 'condition_need_trans', to: 'tool_save', condition: '否' },
      { id: 'c5', from: 'agent_translate', to: 'tool_save' },
      { id: 'c6', from: 'tool_save', to: 'end_1' },
    ],
  },
  {
    id: 'template_code_review',
    name: '代码审查流程',
    description: '拉取代码 → 静态分析 → 生成审查意见 → 自动评论 PR',
    category: 'development',
    tags: ['代码审查', 'Git', 'PR', 'CI'],
    isBuiltIn: true,
    nodes: [
      { id: 'start_1', type: 'start', name: '开始', x: 60, y: 200 },
      { id: 'tool_pull', type: 'tool', name: '拉取代码', x: 200, y: 200 },
      { id: 'agent_static', type: 'agent', name: '静态分析', x: 360, y: 200 },
      { id: 'parallel_review', type: 'parallel', name: '并行审查', x: 520, y: 200 },
      { id: 'agent_security', type: 'agent', name: '安全检查', x: 440, y: 120 },
      { id: 'agent_style', type: 'agent', name: '风格检查', x: 600, y: 120 },
      { id: 'agent_perf', type: 'agent', name: '性能分析', x: 440, y: 300 },
      { id: 'agent_comment', type: 'agent', name: '生成评论', x: 680, y: 200 },
      { id: 'tool_merge', type: 'tool', name: '合并 PR', x: 840, y: 200 },
      { id: 'end_1', type: 'end', name: '结束', x: 980, y: 200 },
    ],
    connections: [
      { id: 'c1', from: 'start_1', to: 'tool_pull' },
      { id: 'c2', from: 'tool_pull', to: 'agent_static' },
      { id: 'c3', from: 'agent_static', to: 'parallel_review' },
      { id: 'c3a', from: 'parallel_review', to: 'agent_security' },
      { id: 'c3b', from: 'parallel_review', to: 'agent_style' },
      { id: 'c3c', from: 'parallel_review', to: 'agent_perf' },
      { id: 'c4', from: 'agent_security', to: 'agent_comment' },
      { id: 'c5', from: 'agent_style', to: 'agent_comment' },
      { id: 'c6', from: 'agent_perf', to: 'agent_comment' },
      { id: 'c7', from: 'agent_comment', to: 'tool_merge' },
      { id: 'c8', from: 'tool_merge', to: 'end_1' },
    ],
  },
  {
    id: 'template_data_analysis',
    name: '数据分析流程',
    description: '加载数据 → 数据清洗 → 统计分析 → 生成可视化图表',
    category: 'data',
    tags: ['数据', '分析', '可视化', '图表'],
    isBuiltIn: true,
    nodes: [
      { id: 'start_1', type: 'start', name: '开始', x: 60, y: 200 },
      { id: 'tool_load', type: 'tool', name: '加载数据', x: 200, y: 200 },
      { id: 'agent_clean', type: 'agent', name: '数据清洗', x: 360, y: 200 },
      { id: 'agent_analyze', type: 'agent', name: '统计分析', x: 520, y: 200 },
      { id: 'tool_viz', type: 'tool', name: '生成图表', x: 680, y: 200 },
      { id: 'agent_report', type: 'agent', name: '生成报告', x: 840, y: 200 },
      { id: 'end_1', type: 'end', name: '结束', x: 980, y: 200 },
    ],
    connections: [
      { id: 'c1', from: 'start_1', to: 'tool_load' },
      { id: 'c2', from: 'tool_load', to: 'agent_clean' },
      { id: 'c3', from: 'agent_clean', to: 'agent_analyze' },
      { id: 'c4', from: 'agent_analyze', to: 'tool_viz' },
      { id: 'c5', from: 'tool_viz', to: 'agent_report' },
      { id: 'c6', from: 'agent_report', to: 'end_1' },
    ],
  },
  {
    id: 'template_writing_assistant',
    name: '写作助手流程',
    description: '构思大纲 → 扩展撰写 → 语法检查 → 风格润色 → 导出保存',
    category: 'writing',
    tags: ['写作', '文案', '润色', '导出'],
    isBuiltIn: true,
    nodes: [
      { id: 'start_1', type: 'start', name: '开始', x: 60, y: 200 },
      { id: 'agent_outline', type: 'agent', name: '构思大纲', x: 200, y: 200 },
      { id: 'condition_complex', type: 'condition', name: '结构复杂?', x: 360, y: 200 },
      { id: 'agent_refine', type: 'agent', name: '细化大纲', x: 360, y: 320 },
      { id: 'agent_write', type: 'agent', name: '扩展撰写', x: 520, y: 200 },
      { id: 'agent_grammar', type: 'agent', name: '语法检查', x: 680, y: 200 },
      { id: 'agent_polish', type: 'agent', name: '风格润色', x: 840, y: 200 },
      { id: 'tool_export', type: 'tool', name: '导出保存', x: 980, y: 200 },
      { id: 'end_1', type: 'end', name: '结束', x: 1120, y: 200 },
    ],
    connections: [
      { id: 'c1', from: 'start_1', to: 'agent_outline' },
      { id: 'c2', from: 'agent_outline', to: 'condition_complex' },
      { id: 'c3a', from: 'condition_complex', to: 'agent_refine', condition: '是' },
      { id: 'c3b', from: 'condition_complex', to: 'agent_write', condition: '否' },
      { id: 'c4', from: 'agent_refine', to: 'agent_write' },
      { id: 'c5', from: 'agent_write', to: 'agent_grammar' },
      { id: 'c6', from: 'agent_grammar', to: 'agent_polish' },
      { id: 'c7', from: 'agent_polish', to: 'tool_export' },
      { id: 'c8', from: 'tool_export', to: 'end_1' },
    ],
  },
];

// 分类配置
const CATEGORY_CONFIG: Record<TemplateCategory, {
  icon: React.ReactNode;
  label: string;
  color: string;
}> = {
  research: { icon: <BookOpen size={14} />, label: '研究', color: 'text-blue-500 bg-blue-500/10' },
  development: { icon: <Code size={14} />, label: '开发', color: 'text-green-500 bg-green-500/10' },
  data: { icon: <BarChart3 size={14} />, label: '数据', color: 'text-purple-500 bg-purple-500/10' },
  writing: { icon: <Feather size={14} />, label: '写作', color: 'text-orange-500 bg-orange-500/10' },
  custom: { icon: <Tag size={14} />, label: '自定义', color: 'text-pink-500 bg-pink-500/10' },
};

// ============ 本地存储工具 ============

const STORAGE_KEY = 'ai_chat_workflow_templates';

function loadCustomTemplates(): WorkflowTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomTemplates(templates: WorkflowTemplate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch (e) {
    console.error('保存自定义模板失败:', e);
  }
}

// ============ 节点类型配置 ============

const nodeTypeConfig: Record<NodeType, { icon: React.ReactNode; color: string; label: string }> = {
  start: { icon: <Circle size={16} />, color: 'bg-[hsl(var(--success-500))]', label: '开始' },
  end: { icon: <Square size={16} />, color: 'bg-destructive', label: '结束' },
  agent: { icon: <Workflow size={16} />, color: 'bg-primary', label: 'Agent' },
  tool: { icon: <Settings size={16} />, color: 'bg-[hsl(var(--accent-500))]', label: '工具' },
  condition: { icon: <Diamond size={16} />, color: 'bg-[hsl(var(--warning-500))]', label: '条件' },
  parallel: { icon: <Plus size={16} />, color: 'bg-[hsl(var(--info-500))]', label: '并行' },
  delay: { icon: <Pause size={16} />, color: 'bg-[hsl(var(--text-muted))/0.45]', label: '延迟' },
};

// ============ 模板预览缩略图组件 ============

interface TemplatePreviewProps {
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
}

const TemplatePreview = memo(function TemplatePreview({ nodes, connections }: TemplatePreviewProps) {
  if (nodes.length === 0) return null;

  // 计算归一化坐标
  const xs = nodes.map(n => n.x);
  const ys = nodes.map(n => n.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  const width = maxX - minX + 120;
  const height = maxY - minY + 80;
  const scaleX = 160 / width;
  const scaleY = 80 / height;
  const scale = Math.min(scaleX, scaleY, 1);

  const offsetX = (160 - width * scale) / 2 - minX * scale;
  const offsetY = (80 - height * scale) / 2 - minY * scale;

  return (
    <svg width="160" height="80" viewBox="0 0 160 80" className="rounded">
      {/* 连接线 */}
      {connections.map(conn => {
        const from = nodes.find(n => n.id === conn.from);
        const to = nodes.find(n => n.id === conn.to);
        if (!from || !to) return null;
        const x1 = from.x * scale + offsetX + 6;
        const y1 = from.y * scale + offsetY + 4;
        const x2 = to.x * scale + offsetX;
        const y2 = to.y * scale + offsetY + 4;
        const mx = (x1 + x2) / 2;
        return (
          <path
            key={conn.id}
            d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth={0.8}
            strokeDasharray={conn.condition ? '2,1' : 'none'}
            opacity={0.5}
          />
        );
      })}
      {/* 节点 */}
      {nodes.map(node => {
        const config = nodeTypeConfig[node.type];
        const x = node.x * scale + offsetX;
        const y = node.y * scale + offsetY;
        const w = 12 * scale + 8;
        const h = 8;
        return (
          <g key={node.id}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              rx={2}
              className={config.color}
              opacity={0.85}
            />
          </g>
        );
      })}
    </svg>
  );
});

// ============ 模板卡片组件 ============

interface TemplateCardProps {
  template: WorkflowTemplate;
  onSelect: (template: WorkflowTemplate) => void;
}

const TemplateCard = memo(function TemplateCard({ template, onSelect }: TemplateCardProps) {
  const cat = CATEGORY_CONFIG[template.category];

  return (
    <motion.div
      className="border rounded-xl overflow-hidden hover:border-primary/50 transition-colors cursor-pointer group"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(template)}
    >
      {/* 预览区 */}
      <div className="h-20 bg-muted/20 flex items-center justify-center border-b">
        <TemplatePreview nodes={template.nodes} connections={template.connections} />
      </div>

      {/* 信息区 */}
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold leading-tight">{template.name}</h4>
          <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${cat.color}`}>
            {cat.icon}
            {cat.label}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
          {template.description}
        </p>
        <div className="flex flex-wrap gap-1">
          {template.tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="px-1.5 py-0.5 bg-muted rounded text-[10px] text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
        <button className="w-full py-1 text-xs bg-primary/10 text-primary rounded font-medium opacity-0 group-hover:opacity-100 transition-opacity">
          加载此模板
        </button>
      </div>
    </motion.div>
  );
});

// ============ 模板选择器弹窗 ============

interface TemplateSelectorProps {
  customTemplates: WorkflowTemplate[];
  onSelect: (template: WorkflowTemplate) => void;
  onClose: () => void;
}

const TemplateSelector = memo(function TemplateSelector({
  customTemplates,
  onSelect,
  onClose,
}: TemplateSelectorProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>('all');

  const allTemplates = useMemo(
    () => [...PRESET_TEMPLATES, ...customTemplates],
    [customTemplates]
  );

  const filteredTemplates = useMemo(() => {
    return allTemplates.filter(t => {
      const matchCategory = activeCategory === 'all' || t.category === activeCategory;
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some(tag => tag.toLowerCase().includes(q));
      return matchCategory && matchSearch;
    });
  }, [allTemplates, activeCategory, search]);

  const categories: (TemplateCategory | 'all')[] = [
    'all', 'research', 'development', 'data', 'writing', 'custom',
  ];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* 弹窗 */}
      <motion.div
        className="relative bg-background border rounded-2xl shadow-2xl w-[800px] max-h-[80vh] flex flex-col overflow-hidden"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <Layout size={20} className="text-primary" />
            <h3 className="text-lg font-semibold">选择工作流模板</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* 搜索和分类 */}
        <div className="px-6 py-3 border-b space-y-3">
          {/* 搜索框 */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="搜索模板名称、描述或标签..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 text-sm border rounded-lg bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* 分类标签 */}
          <div className="flex items-center gap-2 flex-wrap">
            {categories.map(cat => {
              const isAll = cat === 'all';
              const cfg = isAll
                ? { icon: <Layers size={12} />, label: '全部', color: 'text-foreground bg-muted border-muted' }
                : CATEGORY_CONFIG[cat as TemplateCategory];
              const count = isAll
                ? allTemplates.length
                : allTemplates.filter(t => t.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    activeCategory === cat
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-transparent bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {cfg.icon}
                  {cfg.label}
                  <span className="ml-1 opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 模板网格 */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Layout size={40} className="mb-3 opacity-20" />
              <p className="text-sm">未找到匹配的模板</p>
              <p className="text-xs mt-1">尝试调整搜索条件</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {filteredTemplates.map(template => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onSelect={onSelect}
                />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
});

// ============ 保存为模板弹窗 ============

interface SaveTemplateDialogProps {
  onSave: (name: string, description: string, category: TemplateCategory, tags: string[]) => void;
  onClose: () => void;
}

const SaveTemplateDialog = memo(function SaveTemplateDialog({ onSave, onClose }: SaveTemplateDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('custom');
  const [tagsInput, setTagsInput] = useState('');

  const handleSave = () => {
    if (!name.trim()) return;
    const tags = tagsInput
      .split(/[,，]/)
      .map(t => t.trim())
      .filter(Boolean);
    onSave(name.trim(), description.trim(), category, tags);
  };

  const categories = (Object.keys(CATEGORY_CONFIG) as TemplateCategory[]).filter(c => c !== 'custom');

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <motion.div
        className="relative bg-background border rounded-2xl shadow-2xl w-[440px] overflow-hidden"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <FileText size={18} className="text-primary" />
            <h3 className="text-base font-semibold">保存为模板</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* 名称 */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">模板名称 *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例如：我的数据分析流程"
              className="w-full h-9 mt-1 px-3 text-sm border rounded-lg bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
          </div>

          {/* 描述 */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">描述</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="简要描述此模板的用途..."
              className="w-full h-20 mt-1 px-3 py-2 text-sm border rounded-lg bg-muted/30 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* 分类 */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">分类</label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {categories.map(cat => {
                const cfg = CATEGORY_CONFIG[cat];
                return (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      category === cat
                        ? `${cfg.color} border-current`
                        : 'border-muted text-muted-foreground hover:text-foreground hover:border-foreground/20'
                    }`}
                  >
                    {cfg.icon}
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 标签 */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">标签（用逗号分隔）</label>
            <input
              type="text"
              value={tagsInput}
              onChange={e => setTagsInput(e.target.value)}
              placeholder="例如：自动化, 定时任务, 数据处理"
              className="w-full h-9 mt-1 px-3 text-sm border rounded-lg bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/20">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            保存模板
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
});

// ============ 节点组件 ============

interface NodeProps {
  node: WorkflowNode;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDragStart: (id: string, e: React.MouseEvent) => void;
  onConnectionStart: (id: string) => void;
}

const WorkflowNodeComponent = memo(function WorkflowNodeComponent({
  node,
  isSelected,
  onSelect,
  onDragStart,
  onConnectionStart,
}: NodeProps) {
  const config = nodeTypeConfig[node.type];

  return (
    <motion.div
      className={`absolute flex flex-col items-center cursor-move ${isSelected ? 'z-10' : 'z-0'}`}
      style={{ left: node.x, top: node.y }}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      whileHover={{ scale: 1.05 }}
      onMouseDown={(e) => onDragStart(node.id, e)}
      onClick={() => onSelect(node.id)}
    >
      <div
        className={`flex items-center justify-center w-12 h-12 rounded-lg text-primary-foreground shadow-lg ${config.color} ${
          isSelected ? 'ring-2 ring-primary ring-offset-2' : ''
        }`}
      >
        {config.icon}
      </div>
      <div className="mt-1 px-2 py-0.5 bg-background rounded text-xs font-medium shadow whitespace-nowrap">
        {node.name}
      </div>
      <div
        className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-muted border-2 border-primary cursor-crosshair hover:scale-125 transition-transform"
        onMouseDown={(e) => {
          e.stopPropagation();
          onConnectionStart(node.id);
        }}
      />
      <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-muted border-2 border-primary" />
    </motion.div>
  );
});

// ============ 工具面板 ============

interface ToolPanelProps {
  onAddNode: (type: NodeType) => void;
}

const ToolPanel = memo(function ToolPanel({ onAddNode }: ToolPanelProps) {
  return (
    <div className="w-48 border-r bg-muted/30 p-3 space-y-2">
      <div className="text-sm font-medium mb-3">添加节点</div>
      {(Object.keys(nodeTypeConfig) as NodeType[]).map((type) => {
        const config = nodeTypeConfig[type];
        return (
          <motion.button
            key={type}
            onClick={() => onAddNode(type)}
            className="w-full flex items-center gap-2 p-2 rounded-lg border bg-background hover:bg-muted transition-colors text-left"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className={`flex items-center justify-center w-8 h-8 rounded ${config.color} text-primary-foreground`}>
              {config.icon}
            </div>
            <span className="text-sm">{config.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
});

// ============ 属性面板 ============

interface PropertyPanelProps {
  node: WorkflowNode | null;
  onUpdate: (id: string, updates: Partial<WorkflowNode>) => void;
  onDelete: (id: string) => void;
}

const PropertyPanel = memo(function PropertyPanel({
  node,
  onUpdate,
  onDelete,
}: PropertyPanelProps) {
  if (!node) {
    return (
      <div className="w-64 border-l bg-muted/30 p-4 text-center text-muted-foreground text-sm">
        选择节点查看属性
      </div>
    );
  }

  const config = nodeTypeConfig[node.type];

  return (
    <div className="w-64 border-l bg-muted/30 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded ${config.color} text-primary-foreground flex items-center justify-center`}>
            {config.icon}
          </div>
          <span className="font-medium">{node.name}</span>
        </div>
        <button
          onClick={() => onDelete(node.id)}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">名称</label>
          <input
            type="text"
            value={node.name}
            onChange={(e) => onUpdate(node.id, { name: e.target.value })}
            className="w-full h-8 px-2 mt-1 text-sm border rounded bg-background"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground">类型</label>
          <select
            value={node.type}
            onChange={(e) => onUpdate(node.id, { type: e.target.value as NodeType })}
            className="w-full h-8 px-2 mt-1 text-sm border rounded bg-background"
          >
            {(Object.keys(nodeTypeConfig) as NodeType[]).map((type) => (
              <option key={type} value={type}>{nodeTypeConfig[type].label}</option>
            ))}
          </select>
        </div>

        {node.type === 'agent' && (
          <div>
            <label className="text-xs text-muted-foreground">Agent 模型</label>
            <select className="w-full h-8 px-2 mt-1 text-sm border rounded bg-background">
              <option>claude-sonnet-4-6</option>
              <option>claude-opus-4-6</option>
              <option>gpt-4o</option>
            </select>
          </div>
        )}

        {node.type === 'condition' && (
          <div>
            <label className="text-xs text-muted-foreground">条件表达式</label>
            <textarea
              className="w-full h-20 px-2 py-1 mt-1 text-sm border rounded bg-background resize-none"
              placeholder="输入条件表达式..."
            />
          </div>
        )}
      </div>
    </div>
  );
});

// ============ 主组件 ============

interface WorkflowEditorProps {
  workflow?: WorkflowDefinition;
  onSave?: (workflow: WorkflowDefinition) => void;
  className?: string;
}

function createEmptyWorkflow(): WorkflowDefinition {
  return {
    id: `wf_${Date.now()}`,
    name: '新工作流',
    description: '',
    nodes: [
      { id: 'start_1', type: 'start', name: '开始', x: 100, y: 200 },
      { id: 'end_1', type: 'end', name: '结束', x: 600, y: 200 },
    ],
    connections: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export const WorkflowEditor = memo(function WorkflowEditor({
  workflow: initialWorkflow,
  onSave,
  className = '',
}: WorkflowEditorProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [workflow, setWorkflow] = useState<WorkflowDefinition>(
    initialWorkflow || createEmptyWorkflow()
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);

  // 模板相关状态
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<WorkflowTemplate[]>(() =>
    loadCustomTemplates()
  );

  // 从 localStorage 加载自定义模板
  useEffect(() => {
    setCustomTemplates(loadCustomTemplates());
  }, []);

  const dragStateRef = useRef({
    isDragging: false,
    selectedNodeId: null as string | null,
    dragStartX: 0,
    dragStartY: 0,
    nodeStartX: 0,
    nodeStartY: 0,
  });

  // 添加节点
  const handleAddNode = useCallback((type: NodeType) => {
    const newNode: WorkflowNode = {
      id: `node_${Date.now()}`,
      type,
      name: nodeTypeConfig[type].label,
      x: 300 + Math.random() * 100,
      y: 150 + Math.random() * 100,
    };
    setWorkflow(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
      updatedAt: Date.now(),
    }));
  }, []);

  // 更新节点
  const handleUpdateNode = useCallback((id: string, updates: Partial<WorkflowNode>) => {
    setWorkflow(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === id ? { ...n, ...updates } : n),
      updatedAt: Date.now(),
    }));
  }, []);

  // 删除节点
  const handleDeleteNode = useCallback((id: string) => {
    setWorkflow(prev => ({
      ...prev,
      nodes: prev.nodes.filter(n => n.id !== id),
      connections: prev.connections.filter(c => c.from !== id && c.to !== id),
      updatedAt: Date.now(),
    }));
    setSelectedNodeId(null);
  }, []);

  // 节点拖拽
  const handleNodeDragStart = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNodeId(id);
    const node = workflow.nodes.find(n => n.id === id);
    dragStateRef.current = {
      isDragging: true,
      selectedNodeId: id,
      dragStartX: e.clientX,
      dragStartY: e.clientY,
      nodeStartX: node?.x ?? 0,
      nodeStartY: node?.y ?? 0,
    };
  }, [workflow.nodes]);

  const lastMouseMoveTimeRef = useRef(0);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastMouseMoveTimeRef.current < 16) return;
      lastMouseMoveTimeRef.current = now;

      const { isDragging, selectedNodeId: dragId, dragStartX, dragStartY, nodeStartX, nodeStartY } = dragStateRef.current;
      if (!isDragging || !dragId) return;

      const newX = nodeStartX + (e.clientX - dragStartX);
      const newY = nodeStartY + (e.clientY - dragStartY);

      setWorkflow(prev => ({
        ...prev,
        nodes: prev.nodes.map(n =>
          n.id === dragId ? { ...n, x: newX, y: newY } : n
        ),
      }));
    };

    const handleMouseUp = () => {
      dragStateRef.current.isDragging = false;
      dragStateRef.current.selectedNodeId = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // 连接
  const handleConnectionStart = useCallback((id: string) => {
    setConnectingFrom(id);
  }, []);

  const handleConnectionEnd = useCallback((toId: string) => {
    setConnectingFrom(prevFrom => {
      if (prevFrom && prevFrom !== toId) {
        const newConnection: WorkflowConnection = {
          id: `conn_${Date.now()}`,
          from: prevFrom,
          to: toId,
        };
        setWorkflow(prev => ({
          ...prev,
          connections: [...prev.connections, newConnection],
          updatedAt: Date.now(),
        }));
      }
      return null;
    });
  }, []);

  // 缩放
  const handleZoomIn = useCallback(() => setZoom(prev => Math.min(prev + 0.1, 2)), []);
  const handleZoomOut = useCallback(() => setZoom(prev => Math.max(prev - 0.1, 0.5)), []);
  const handleResetZoom = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  // 保存工作流
  const handleSave = useCallback(() => {
    if (onSave) onSave(workflow);
  }, [workflow, onSave]);

  // 导出工作流
  const handleExport = useCallback(() => {
    const data = JSON.stringify(workflow, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow.name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [workflow]);

  // 加载模板
  const handleLoadTemplate = useCallback((template: WorkflowTemplate) => {
    setWorkflow({
      id: `wf_${Date.now()}`,
      name: template.name,
      description: template.description,
      nodes: template.nodes.map(n => ({ ...n, id: `${n.id}_${Date.now()}` })),
      connections: template.connections.map(c => ({ ...c, id: `c_${Date.now()}_${c.id}` })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setShowTemplateSelector(false);
  }, []);

  // 保存为模板
  const handleSaveAsTemplate = useCallback(
    (name: string, description: string, category: TemplateCategory, tags: string[]) => {
      const newTemplate: WorkflowTemplate = {
        id: `custom_${Date.now()}`,
        name,
        description,
        category,
        tags,
        nodes: workflow.nodes,
        connections: workflow.connections,
        isBuiltIn: false,
      };
      const updated = [...customTemplates, newTemplate];
      saveCustomTemplates(updated);
      setCustomTemplates(updated);
      setShowSaveDialog(false);
    },
    [workflow, customTemplates]
  );

  // 删除自定义模板
  const handleDeleteCustomTemplate = useCallback((id: string) => {
    const updated = customTemplates.filter(t => t.id !== id);
    saveCustomTemplates(updated);
    setCustomTemplates(updated);
  }, [customTemplates]);

  // 画布点击（完成连接）
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (connectingFrom) {
      // 查找点击的节点
      const target = e.target as HTMLElement;
      const nodeEl = target.closest('[data-node-id]');
      if (nodeEl) {
        const toId = (nodeEl as HTMLElement).dataset.nodeId;
        if (toId && toId !== connectingFrom) {
          handleConnectionEnd(toId);
          return;
        }
      }
    }
    setConnectingFrom(null);
    setSelectedNodeId(null);
    setSelectedConnectionId(null);
  }, [connectingFrom, handleConnectionEnd]);

  const selectedNode = useMemo(
    () => workflow.nodes.find(n => n.id === selectedNodeId) || null,
    [workflow.nodes, selectedNodeId]
  );

  const connectionPaths = useMemo(() => {
    const nodeMap = new Map(workflow.nodes.map(n => [n.id, n]));
    return workflow.connections.map(conn => {
      const fromNode = nodeMap.get(conn.from);
      const toNode = nodeMap.get(conn.to);
      if (!fromNode || !toNode) return null;
      const x1 = fromNode.x + 56;
      const y1 = fromNode.y + 24;
      const x2 = toNode.x;
      const y2 = toNode.y + 24;
      const midX = (x1 + x2) / 2;
      return {
        conn,
        d: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`,
        cx: x2,
        cy: y2,
      };
    }).filter(Boolean);
  }, [workflow.connections, workflow.nodes]);

  const svgViewport = useMemo(() => {
    if (workflow.nodes.length === 0) return { width: 2000, height: 2000, minX: 0, minY: 0 };
    const padding = 100;
    const minX = Math.min(...workflow.nodes.map(n => n.x)) - padding;
    const minY = Math.min(...workflow.nodes.map(n => n.y)) - padding;
    const maxX = Math.max(...workflow.nodes.map(n => n.x)) + padding * 3;
    const maxY = Math.max(...workflow.nodes.map(n => n.y)) + padding * 3;
    return { width: maxX - minX, height: maxY - minY, minX, minY };
  }, [workflow.nodes]);

  return (
    <>
      <motion.div
        className={`flex h-full bg-background border rounded-xl overflow-hidden ${className}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* 左侧工具面板 */}
        <ToolPanel onAddNode={handleAddNode} />

        {/* 中间画布 */}
        <div className="flex-1 flex flex-col">
          {/* 工具栏 */}
          <div className="flex items-center justify-between p-2 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <button
                onClick={handleZoomIn}
                className="p-1.5 rounded hover:bg-muted"
                title="放大"
              >
                <ZoomIn size={16} />
              </button>
              <button
                onClick={handleZoomOut}
                className="p-1.5 rounded hover:bg-muted"
                title="缩小"
              >
                <ZoomOut size={16} />
              </button>
              <button
                onClick={handleResetZoom}
                className="p-1.5 rounded hover:bg-muted"
                title="重置"
              >
                <RotateCcw size={16} />
              </button>
              <span className="text-xs text-muted-foreground ml-2">{(zoom * 100).toFixed(0)}%</span>
            </div>

            <div className="flex items-center gap-2">
              {/* 模板按钮 */}
              <button
                onClick={() => setShowTemplateSelector(true)}
                className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-muted"
                title="从模板创建"
              >
                <Layout size={12} />
                模板
              </button>
              <button
                onClick={() => setShowSaveDialog(true)}
                className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-muted"
                title="保存为模板"
              >
                <FileText size={12} />
                另存
              </button>

              <button
                onClick={handleExport}
                className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-muted"
              >
                <Download size={12} />
                导出
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-1 px-3 py-1 text-xs bg-primary text-primary-foreground rounded"
              >
                <Save size={12} />
                保存
              </button>
            </div>
          </div>

          {/* 画布 */}
          <div
            ref={canvasRef}
            className="flex-1 relative overflow-hidden bg-muted/10"
            onClick={handleCanvasClick}
            style={{
              backgroundImage: 'radial-gradient(circle, var(--muted) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
                transformOrigin: '0 0',
              }}
            >
              {/* 连接线 SVG */}
              <svg
                className="absolute pointer-events-none"
                style={{
                  width: svgViewport.width,
                  height: svgViewport.height,
                  left: svgViewport.minX,
                  top: svgViewport.minY,
                }}
              >
                {connectionPaths.map((item) => item && (
                  <g
                    key={item.conn.id}
                    onClick={(e) => { e.stopPropagation(); setSelectedConnectionId(item.conn.id); }}
                    className="cursor-pointer pointer-events-auto"
                  >
                    <path
                      d={item.d}
                      fill="none"
                      stroke={item.conn.id === selectedConnectionId ? 'var(--primary)' : 'var(--muted-foreground)'}
                      strokeWidth={item.conn.id === selectedConnectionId ? 2 : 1}
                      strokeDasharray={item.conn.id === selectedConnectionId ? 'none' : '4,4'}
                      className="transition-all"
                    />
                    <circle cx={item.cx} cy={item.cy} r={4} fill="var(--primary)" />
                  </g>
                ))}
              </svg>

              {/* 节点 */}
              {workflow.nodes.map(node => (
                <div key={node.id} data-node-id={node.id}>
                  <WorkflowNodeComponent
                    node={node}
                    isSelected={node.id === selectedNodeId}
                    onSelect={setSelectedNodeId}
                    onDragStart={handleNodeDragStart}
                    onConnectionStart={handleConnectionStart}
                  />
                </div>
              ))}
            </div>

            {/* 状态指示 */}
            {connectingFrom && (
              <div className="absolute bottom-4 left-4 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm">
                点击目标节点完成连接
              </div>
            )}
          </div>
        </div>

        {/* 右侧属性面板 */}
        <PropertyPanel
          node={selectedNode}
          onUpdate={handleUpdateNode}
          onDelete={handleDeleteNode}
        />
      </motion.div>

      {/* 模板选择器 */}
      <AnimatePresence>
        {showTemplateSelector && (
          <TemplateSelector
            customTemplates={customTemplates}
            onSelect={handleLoadTemplate}
            onClose={() => setShowTemplateSelector(false)}
          />
        )}
      </AnimatePresence>

      {/* 保存为模板弹窗 */}
      <AnimatePresence>
        {showSaveDialog && (
          <SaveTemplateDialog
            onSave={handleSaveAsTemplate}
            onClose={() => setShowSaveDialog(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
});

export default WorkflowEditor;
