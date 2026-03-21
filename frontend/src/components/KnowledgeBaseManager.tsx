'use client';

import { memo, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import {
  Database,
  Upload,
  File,
  FileText,
  FileCode,
  Trash2,
  Search,
  RefreshCw,
  Plus,
  FolderOpen,
  Check,
  X,
  AlertCircle,
  Download,
  Eye,
  ChevronDown,
  ChevronRight,
  Tag,
  Clock,
  HardDrive,
  Zap,
  Settings,
  Play,
  Loader2,
  Keyboard,
} from 'lucide-react';
import { useToast } from './Toast';
import { useKnowledgeBase } from '@/lib/hooks';

// 文档类型
export type DocumentType = 'pdf' | 'markdown' | 'text' | 'code' | 'html' | 'json' | 'csv';

// 文档状态
export type DocumentStatus = 'pending' | 'processing' | 'indexed' | 'error';

// 知识库文档
export interface KnowledgeDocument {
  id: string;
  name: string;
  type: DocumentType;
  size: number;
  status: DocumentStatus;
  uploadedAt: number;
  processedAt?: number;
  chunkCount?: number;
  tags: string[];
  error?: string;
  metadata?: {
    source?: string;
    author?: string;
    createdAt?: string;
  };
}

// 知识库
export interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  documents: KnowledgeDocument[];
  totalSize: number;
  totalChunks: number;
  createdAt: number;
  updatedAt: number;
  embeddingModel?: string;
  chunkSize?: number;
  chunkOverlap?: number;
}

// 文件类型图标
const fileTypeIcons: Record<DocumentType, React.ReactNode> = {
  pdf: <FileText size={16} className="text-destructive" />,
  markdown: <FileText size={16} className="text-primary" />,
  text: <File size={16} className="text-muted-foreground" />,
  code: <FileCode size={16} className="text-[hsl(var(--success-500))]" />,
  html: <FileCode size={16} className="text-[hsl(var(--warning-500))]" />,
  json: <FileCode size={16} className="text-[hsl(var(--warning-500))]" />,
  csv: <FileText size={16} className="text-[hsl(var(--accent-500))]" />,
};

// 文件类型名称
const fileTypeNames: Record<DocumentType, string> = {
  pdf: 'PDF',
  markdown: 'Markdown',
  text: '文本',
  code: '代码',
  html: 'HTML',
  json: 'JSON',
  csv: 'CSV',
};

// 状态样式
const statusStyles: Record<DocumentStatus, { color: string; icon: React.ReactNode; label: string }> = {
  pending: { color: 'text-[hsl(var(--warning-500))]', icon: <Clock size={12} />, label: '待处理' },
  processing: { color: 'text-primary', icon: <RefreshCw size={12} className="animate-spin" />, label: '处理中' },
  indexed: { color: 'text-[hsl(var(--success-500))]', icon: <Check size={12} />, label: '已索引' },
  error: { color: 'text-destructive', icon: <AlertCircle size={12} />, label: '错误' },
};

// 动画变体
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -20, y: 10 },
  visible: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: {
      duration: 0.2,
      ease: [0.25, 0.46, 0.45, 0.94] as const
    },
  },
  hover: {
    y: -2,
    boxShadow: '0 10px 30px hsl(var(--text-main) / 0.1)',
    transition: { duration: 0.2 }
  }
};

const floatAnimation: Variants = {
  initial: { y: 0 },
  animate: {
    y: [0, -5, 0],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
};

// 格式化文件大小
const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// 格式化时间
const formatTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// 文档项组件
interface DocumentItemProps {
  document: KnowledgeDocument;
  onDelete: (id: string) => void;
  onView: (doc: KnowledgeDocument) => void;
  onRetag: (id: string, tags: string[]) => void;
}

const DocumentItem = memo(function DocumentItem({
  document,
  onDelete,
  onView,
  onRetag,
}: DocumentItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [newTag, setNewTag] = useState('');
  const status = statusStyles[document.status];

  return (
    <motion.div
      className="rounded-xl border bg-gradient-to-br from-card to-card/80 backdrop-blur-sm overflow-hidden shadow-sm"
      variants={itemVariants}
      whileHover="hover"
      layout
    >
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* 文件图标 */}
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-muted/80 to-muted shadow-sm">
          {fileTypeIcons[document.type]}
        </div>

        {/* 文件信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{document.name}</span>
            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${status.color} bg-current/10 font-medium`}>
              {status.icon}
              {status.label}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
            <span className="flex items-center gap-1">
              <HardDrive size={10} />
              {formatSize(document.size)}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {formatTime(document.uploadedAt)}
            </span>
            {document.chunkCount && (
              <span className="flex items-center gap-1">
                <Zap size={10} />
                {document.chunkCount} chunks
              </span>
            )}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1">
          <motion.button
            onClick={(e) => { e.stopPropagation(); onView(document); }}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="查看"
          >
            <Eye size={16} />
          </motion.button>
          <motion.button
            onClick={(e) => { e.stopPropagation(); onDelete(document.id); }}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="删除"
          >
            <Trash2 size={16} />
          </motion.button>
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            className="w-8 h-8 flex items-center justify-center text-muted-foreground"
          >
            <ChevronDown size={16} />
          </motion.div>
        </div>
      </div>

      {/* 展开详情 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t"
          >
            <div className="p-3 space-y-3 bg-muted/20">
              {/* 错误信息 */}
              {document.error && (
                <div className="p-2 rounded-lg bg-destructive/10 text-destructive text-xs flex items-start gap-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  {document.error}
                </div>
              )}

              {/* 标签 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">标签</span>
                  <button
                    onClick={() => setIsEditingTags(!isEditingTags)}
                    className="text-xs text-primary hover:underline"
                  >
                    {isEditingTags ? '完成' : '编辑'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {document.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-full bg-muted text-xs flex items-center gap-1"
                    >
                      <Tag size={10} />
                      {tag}
                      {isEditingTags && (
                        <button
                          onClick={() => onRetag(document.id, document.tags.filter(t => t !== tag))}
                          className="hover:text-destructive"
                        >
                          <X size={10} />
                        </button>
                      )}
                    </span>
                  ))}
                  {isEditingTags && (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newTag.trim()) {
                            onRetag(document.id, [...document.tags, newTag.trim()]);
                            setNewTag('');
                          }
                        }}
                        placeholder="添加标签"
                        className="w-20 h-5 px-1 text-xs border rounded bg-background"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 元数据 */}
              {document.metadata && (
                <div className="text-xs text-muted-foreground">
                  {document.metadata.source && <div>来源: {document.metadata.source}</div>}
                  {document.metadata.author && <div>作者: {document.metadata.author}</div>}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

// 检索测试组件
interface SearchTestProps {
  knowledgeBaseId: string;
}

const SearchTest = memo(function SearchTest({ knowledgeBaseId }: SearchTestProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ text: string; score: number; source: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { showToast } = useToast();

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    setIsSearching(true);
    // 模拟检索
    await new Promise((resolve) => setTimeout(resolve, 500));
    setResults([
      { text: '这是第一个相关的文档片段...', score: 0.95, source: 'document1.pdf' },
      { text: '这是第二个相关的文档片段...', score: 0.87, source: 'document2.md' },
      { text: '这是第三个相关的文档片段...', score: 0.72, source: 'document3.txt' },
    ]);
    setIsSearching(false);
    showToast('检索完成', 'success');
  }, [query, showToast]);

  return (
    <div className="p-5 rounded-xl border bg-gradient-to-br from-card to-card/80 backdrop-blur-sm shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Search size={16} className="text-primary" />
        </div>
        <span className="font-medium">检索测试</span>
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="输入查询内容测试检索效果..."
          className="flex-1 h-11 px-4 border rounded-xl bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
        />
        <motion.button
          onClick={handleSearch}
          disabled={isSearching || !query.trim()}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary to-primary/90 text-primary-foreground rounded-xl disabled:opacity-50 shadow-sm"
          whileHover={{ scale: 1.02, boxShadow: '0 4px 12px hsl(var(--primary) / 0.24)' }}
          whileTap={{ scale: 0.98 }}
        >
          {isSearching ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : (
            <Play size={16} />
          )}
          检索
        </motion.button>
      </div>

      {/* 检索结果 */}
      <AnimatePresence>
        {results.length > 0 && (
          <motion.div
            className="mt-4 space-y-3"
            initial={{ opacity: 0, height: 0, y: -10 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {results.map((result, index) => (
              <motion.div
                key={index}
                className="p-4 rounded-xl bg-gradient-to-r from-muted/30 to-muted/10 border shadow-sm"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <FileText size={12} />
                    {result.source}
                  </span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {(result.score * 100).toFixed(0)}% 匹配
                  </span>
                </div>
                <p className="text-sm">{result.text}</p>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// 主组件
interface KnowledgeBaseManagerProps {
  className?: string;
}

export const KnowledgeBaseManager = memo(function KnowledgeBaseManager({
  className='',
}: KnowledgeBaseManagerProps) {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [activeBaseId, setActiveBaseId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showCreateBase, setShowCreateBase] = useState(false);
  const [newBaseName, setNewBaseName] = useState('');
  const [newBaseDesc, setNewBaseDesc] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  // 当前活跃的知识库
  const activeBase = useMemo(() => {
    return knowledgeBases.find((kb) => kb.id === activeBaseId);
  }, [knowledgeBases, activeBaseId]);

  // 创建知识库
  const handleCreateBase = useCallback(() => {
    if (!newBaseName.trim()) {
      showToast('请输入知识库名称', 'error');
      return;
    }

    const newBase: KnowledgeBase = {
      id: `kb_${Date.now()}`,
      name: newBaseName,
      description: newBaseDesc,
      documents: [],
      totalSize: 0,
      totalChunks: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setKnowledgeBases((prev) => [...prev, newBase]);
    setActiveBaseId(newBase.id);
    setShowCreateBase(false);
    setNewBaseName('');
    setNewBaseDesc('');
    showToast('知识库创建成功', 'success');
  }, [newBaseName, newBaseDesc, showToast]);

  // 删除知识库
  const handleDeleteBase = useCallback((id: string) => {
    setKnowledgeBases((prev) => prev.filter((kb) => kb.id !== id));
    if (activeBaseId === id) {
      setActiveBaseId(null);
    }
    showToast('知识库已删除', 'success');
  }, [activeBaseId, showToast]);

  // 文件上传处理
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeBaseId) return;

    setIsUploading(true);

    for (const file of Array.from(files)) {
      // 获取文件类型
      const ext = file.name.split('.').pop()?.toLowerCase() || 'text';
      const docType: DocumentType =
        ext === 'pdf' ? 'pdf' :
        ext === 'md' ? 'markdown' :
        ext === 'json' ? 'json' :
        ext === 'csv' ? 'csv' :
        ext === 'html' || ext === 'htm' ? 'html' :
        ['js', 'ts', 'py', 'java', 'go', 'rs'].includes(ext) ? 'code' : 'text';

      const newDoc: KnowledgeDocument = {
        id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        type: docType,
        size: file.size,
        status: 'pending',
        uploadedAt: Date.now(),
        tags: [],
      };

      setKnowledgeBases((prev) =>
        prev.map((kb) =>
          kb.id === activeBaseId
            ? {
                ...kb,
                documents: [...kb.documents, newDoc],
                totalSize: kb.totalSize + file.size,
                updatedAt: Date.now(),
              }
            : kb
        )
      );

      // 模拟处理过程
      setTimeout(() => {
        setKnowledgeBases((prev) =>
          prev.map((kb) =>
            kb.id === activeBaseId
              ? {
                  ...kb,
                  documents: kb.documents.map((d) =>
                    d.id === newDoc.id
                      ? { ...d, status: 'processing' as DocumentStatus }
                      : d
                  ),
                }
              : kb
          )
        );

        // 模拟完成处理
        setTimeout(() => {
          setKnowledgeBases((prev) =>
            prev.map((kb) =>
              kb.id === activeBaseId
                ? {
                    ...kb,
                    documents: kb.documents.map((d) =>
                      d.id === newDoc.id
                        ? {
                            ...d,
                            status: 'indexed' as DocumentStatus,
                            processedAt: Date.now(),
                            chunkCount: Math.ceil(file.size / 500),
                          }
                        : d
                    ),
                    totalChunks: kb.totalChunks + Math.ceil(file.size / 500),
                  }
                : kb
            )
          );
        }, 2000);
      }, 500);
    }

    setIsUploading(false);
    showToast(`已上传 ${files.length} 个文档`, 'success');

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [activeBaseId, showToast]);

  // 删除文档
  const handleDeleteDocument = useCallback((docId: string) => {
    if (!activeBaseId) return;

    setKnowledgeBases((prev) =>
      prev.map((kb) => {
        if (kb.id !== activeBaseId) return kb;
        const doc = kb.documents.find((d) => d.id === docId);
        if (!doc) return kb;
        return {
          ...kb,
          documents: kb.documents.filter((d) => d.id !== docId),
          totalSize: kb.totalSize - doc.size,
          totalChunks: kb.totalChunks - (doc.chunkCount || 0),
          updatedAt: Date.now(),
        };
      })
    );
    showToast('文档已删除', 'success');
  }, [activeBaseId, showToast]);

  // 更新文档标签
  const handleRetag = useCallback((docId: string, tags: string[]) => {
    if (!activeBaseId) return;

    setKnowledgeBases((prev) =>
      prev.map((kb) =>
        kb.id === activeBaseId
          ? {
              ...kb,
              documents: kb.documents.map((d) =>
                d.id === docId ? { ...d, tags } : d
              ),
              updatedAt: Date.now(),
            }
          : kb
      )
    );
  }, [activeBaseId]);

  return (
    <motion.div
      className={`flex flex-col bg-gradient-to-br from-background to-background/95 backdrop-blur-sm border rounded-2xl overflow-hidden shadow-lg ${className}`}
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as const }}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between p-5 border-b bg-gradient-to-r from-muted/30 to-muted/10 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <motion.div
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary flex items-center justify-center shadow-lg shadow-primary/20"
            {...floatAnimation}
          >
            <Database size={20} className="text-primary-foreground" />
          </motion.div>
          <div>
            <h2 className="font-semibold text-lg">知识库管理</h2>
            <p className="text-xs text-muted-foreground mt-0.5">管理您的私有知识库，增强AI回答准确性</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* 快捷键提示 */}
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground/70 bg-muted/60 px-3 py-1.5 rounded-full border border-[hsl(var(--border-subtle))]">
            <Keyboard size={12} />
            <kbd className="font-mono text-[10px] px-1 py-0.5 rounded bg-muted border border-[hsl(var(--border-subtle))]">Ctrl</kbd>
            <span>+</span>
            <kbd className="font-mono text-[10px] px-1 py-0.5 rounded bg-muted border border-[hsl(var(--border-subtle))]">K</kbd>
            <span className="ml-1">打开</span>
          </span>
          <span className="text-xs text-muted-foreground px-3 py-1.5 bg-muted rounded-full">
            {knowledgeBases.length} 个知识库
          </span>
          <motion.button
            onClick={() => setShowCreateBase(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary to-primary/90 text-primary-foreground rounded-xl text-sm font-medium shadow-sm shadow-primary/20"
            whileHover={{ scale: 1.03, boxShadow: '0 8px 20px hsl(var(--primary) / 0.28)' }}
            whileTap={{ scale: 0.97 }}
          >
            <Plus size={16} />
            新建知识库
          </motion.button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 知识库列表 */}
        <div className="w-72 border-r bg-gradient-to-b from-muted/10 to-muted/5 backdrop-blur-sm overflow-y-auto p-3">
          <div className="space-y-2">
            {knowledgeBases.map((kb) => (
              <motion.button
                key={kb.id}
                onClick={() => setActiveBaseId(kb.id)}
                className={`w-full text-left p-4 rounded-xl transition-all ${
                  activeBaseId === kb.id
                    ? 'bg-gradient-to-r from-primary/15 to-primary/5 border border-primary/20 shadow-sm shadow-primary/10'
                    : 'hover:bg-muted/50 border border-transparent'
                }`}
                whileHover={{ x: 3 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    activeBaseId === kb.id ? 'bg-primary/20' : 'bg-muted'
                  }`}>
                    <FolderOpen size={16} className={activeBaseId === kb.id ? 'text-primary' : 'text-muted-foreground'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm truncate block">{kb.name}</span>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <File size={10} />
                        {kb.documents.length}
                      </span>
                      <span className="flex items-center gap-1">
                        <HardDrive size={10} />
                        {formatSize(kb.totalSize)}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.button>
            ))}

            {knowledgeBases.length === 0 && (
              <motion.div
                className="text-center py-12 text-muted-foreground text-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <motion.div {...floatAnimation}>
                  <Database size={32} className="mx-auto mb-3 opacity-30" />
                </motion.div>
                <p className="font-medium">暂无知识库</p>
                <p className="text-xs mt-2 opacity-70">点击"新建知识库"开始</p>
              </motion.div>
            )}
          </div>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeBase ? (
            <div className="space-y-5">
              {/* 知识库信息 */}
              <motion.div
                className="p-5 rounded-xl bg-gradient-to-r from-muted/20 to-muted/5 border backdrop-blur-sm"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h3 className="font-semibold text-xl">{activeBase.name}</h3>
                    {activeBase.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {activeBase.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-background rounded-full">
                      <HardDrive size={14} className="text-primary" />
                      <span className="font-medium">{formatSize(activeBase.totalSize)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-background rounded-full">
                      <Zap size={14} className="text-[hsl(var(--warning-500))]" />
                      <span className="font-medium">{activeBase.totalChunks} chunks</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-background rounded-full">
                      <File size={14} className="text-primary" />
                      <span className="font-medium">{activeBase.documents.length} 文档</span>
                    </div>
                    <motion.button
                      onClick={() => handleDeleteBase(activeBase.id)}
                      className="p-2.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      title="删除知识库"
                    >
                      <Trash2 size={18} />
                    </motion.button>
                  </div>
                </div>
              </motion.div>

              {/* 上传区域 */}
              <motion.div
                className="relative"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.md,.txt,.json,.csv,.html,.htm,.js,.ts,.py,.java,.go,.rs"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <motion.button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="w-full p-8 rounded-xl border-2 border-dashed border-muted-foreground/20 hover:border-primary/50 hover:bg-gradient-to-br hover:from-primary/5 hover:to-muted/30 transition-all group"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <motion.div
                        className={`w-14 h-14 rounded-full flex items-center justify-center ${
                          isUploading ? 'bg-primary/10' : 'bg-primary/10 group-hover:bg-primary/20'
                        } transition-colors`}
                        animate={isUploading ? { rotate: 360 } : {}}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      >
                        {isUploading ? (
                          <RefreshCw size={28} className="text-primary" />
                        ) : (
                          <Upload size={28} className="text-primary group-hover:scale-110 transition-transform" />
                        )}
                      </motion.div>
                      <div>
                        <p className="text-lg font-medium text-foreground">
                          {isUploading ? '上传处理中...' : '点击或拖拽上传文档'}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          支持 PDF、Markdown、文本、代码、JSON、CSV 等格式
                        </p>
                      </div>
                    </div>
                  </motion.button>
                </motion.div>
              </motion.div>

              {/* 检索测试 */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <SearchTest knowledgeBaseId={activeBase.id} />
              </motion.div>

              {/* 文档列表 */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText size={16} className="text-primary" />
                    </div>
                    <span className="font-medium">文档列表</span>
                  </div>
                  <span className="text-xs text-muted-foreground px-3 py-1.5 bg-muted rounded-full">
                    {activeBase.documents.length} 个文档
                  </span>
                </div>

                {activeBase.documents.length > 0 ? (
                  <motion.div
                    className="space-y-3"
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    {activeBase.documents.map((doc) => (
                      <DocumentItem
                        key={doc.id}
                        document={doc}
                        onDelete={handleDeleteDocument}
                        onView={(doc) => showToast(`查看文档: ${doc.name}`, 'info')}
                        onRetag={handleRetag}
                      />
                    ))}
                  </motion.div>
                ) : (
                  <motion.div
                    className="text-center py-16 text-muted-foreground rounded-xl bg-muted/20 border border-dashed"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <motion.div {...floatAnimation}>
                      <File size={40} className="mx-auto mb-3 opacity-30" />
                    </motion.div>
                    <p className="text-lg font-medium">暂无文档</p>
                    <p className="text-sm mt-2 opacity-70">上传文档开始构建您的私有知识库</p>
                  </motion.div>
                )}
              </motion.div>
            </div>
          ) : (
            <motion.div
              className="flex flex-col items-center justify-center h-full text-muted-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <motion.div
                className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/10 to-muted mb-4 flex items-center justify-center"
                {...floatAnimation}
              >
                <Database size={40} className="text-primary opacity-70" />
              </motion.div>
              <p className="text-xl font-semibold mb-2">选择或创建知识库</p>
              <p className="text-sm opacity-70">从左侧选择一个知识库，或点击右上角"新建知识库"开始</p>
            </motion.div>
          )}
        </div>
      </div>

      {/* 创建知识库对话框 */}
      <AnimatePresence>
        {showCreateBase && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCreateBase(false)}
          >
            <motion.div
              className="bg-gradient-to-br from-background to-background/95 backdrop-blur-xl rounded-2xl p-6 shadow-2xl max-w-md mx-4 w-full border"
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary flex items-center justify-center">
                  <Database size={20} className="text-primary-foreground" />
                </div>
                <h3 className="font-semibold text-xl">创建知识库</h3>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="text-sm font-medium mb-2 block">知识库名称</label>
                  <input
                    type="text"
                    value={newBaseName}
                    onChange={(e) => setNewBaseName(e.target.value)}
                    className="w-full h-12 px-4 border rounded-xl bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    placeholder="例如：产品文档库、代码知识库"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">描述（可选）</label>
                  <textarea
                    value={newBaseDesc}
                    onChange={(e) => setNewBaseDesc(e.target.value)}
                    className="w-full h-28 px-4 py-3 border rounded-xl bg-background resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    placeholder="描述这个知识库的用途和包含的内容类型..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <motion.button
                  onClick={() => setShowCreateBase(false)}
                  className="px-5 py-2.5 rounded-xl hover:bg-muted transition-colors font-medium"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  取消
                </motion.button>
                <motion.button
                  onClick={handleCreateBase}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary/90 text-primary-foreground font-medium shadow-sm shadow-primary/20"
                  whileHover={{ scale: 1.02, boxShadow: '0 8px 20px hsl(var(--primary) / 0.28)' }}
                  whileTap={{ scale: 0.98 }}
                >
                  创建知识库
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

export default KnowledgeBaseManager;
