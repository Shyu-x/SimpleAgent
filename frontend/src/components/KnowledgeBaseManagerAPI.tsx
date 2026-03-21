'use client';

import { memo, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database,
  Upload,
  File,
  FileText,
  Trash2,
  Search,
  RefreshCw,
  Plus,
  FolderOpen,
  Check,
  X,
  AlertCircle,
  Eye,
  ChevronDown,
  Tag,
  Clock,
  HardDrive,
  Zap,
  Play,
  Loader2,
} from 'lucide-react';
import { useToast } from './Toast';
import { useKnowledgeBase } from '@/lib/hooks';

// 文件类型图标映射
const fileTypeIcons: Record<string, React.ReactNode> = {
  pdf: <FileText size={16} className="text-destructive" />,
  markdown: <FileText size={16} className="text-primary" />,
  text: <File size={16} className="text-muted-foreground" />,
  code: <File size={16} className="text-[hsl(var(--success-500))]" />,
  html: <File size={16} className="text-[hsl(var(--warning-500))]" />,
  json: <File size={16} className="text-[hsl(var(--warning-500))]" />,
  csv: <FileText size={16} className="text-[hsl(var(--accent-500))]" />,
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

// 检索测试组件
interface SearchTestProps {
  kbId: string;
  onRetrieve: (kbId: string, query: string) => Promise<{ text: string; score: number; source: string }[]>;
}

const SearchTest = memo(function SearchTest({ kbId, onRetrieve }: SearchTestProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ text: string; score: number; source: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { showToast } = useToast();

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    setIsSearching(true);
    const searchResults = await onRetrieve(kbId, query);
    setResults(searchResults);
    setIsSearching(false);

    if (searchResults.length > 0) {
      showToast(`找到 ${searchResults.length} 个相关结果`, 'success');
    } else {
      showToast('未找到相关内容', 'info');
    }
  }, [query, kbId, onRetrieve, showToast]);

  return (
    <div className="p-4 rounded-lg border bg-card">
      <div className="flex items-center gap-2 mb-3">
        <Search size={16} className="text-primary" />
        <span className="font-medium text-sm">检索测试</span>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="输入查询内容测试检索效果..."
          className="flex-1 h-10 px-3 border rounded-lg bg-background"
        />
        <motion.button
          onClick={handleSearch}
          disabled={isSearching || !query.trim()}
          className="flex items-center gap-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {isSearching ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <Play size={14} />
          )}
          检索
        </motion.button>
      </div>

      {/* 检索结果 */}
      <AnimatePresence>
        {results.length > 0 && (
          <motion.div
            className="mt-3 space-y-2"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {results.map((result, index) => (
              <div
                key={index}
                className="p-3 rounded-lg bg-muted/30 border"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">{result.source}</span>
                  <span className="text-xs font-medium text-primary">
                    {(result.score * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-sm">{result.text}</p>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// 主组件 - 使用 API 集成
interface KnowledgeBaseManagerProps {
  className?: string;
}

export const KnowledgeBaseManager = memo(function KnowledgeBaseManager({
  className='',
}: KnowledgeBaseManagerProps) {
  const {
    knowledgeBases,
    activeBase,
    loading,
    uploading,
    createKnowledgeBase,
    deleteKnowledgeBase,
    getKnowledgeBase,
    setActiveBase,
    uploadFile,
    retrieve,
  } = useKnowledgeBase();

  const [showCreateBase, setShowCreateBase] = useState(false);
  const [newBaseName, setNewBaseName] = useState('');
  const [newBaseDesc, setNewBaseDesc] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  // 创建知识库
  const handleCreateBase = useCallback(async () => {
    if (!newBaseName.trim()) {
      showToast('请输入知识库名称', 'error');
      return;
    }

    const kb = await createKnowledgeBase(newBaseName, newBaseDesc);
    if (kb) {
      setShowCreateBase(false);
      setNewBaseName('');
      setNewBaseDesc('');
    }
  }, [newBaseName, newBaseDesc, createKnowledgeBase, showToast]);

  // 删除知识库
  const handleDeleteBase = useCallback(async (id: string) => {
    await deleteKnowledgeBase(id);
  }, [deleteKnowledgeBase]);

  // 选择知识库
  const handleSelectBase = useCallback(async (id: string) => {
    await getKnowledgeBase(id);
  }, [getKnowledgeBase]);

  // 文件上传
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeBase) return;

    for (const file of Array.from(files)) {
      await uploadFile(activeBase.id, file);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [activeBase, uploadFile]);

  // 检索
  const handleRetrieve = useCallback(async (kbId: string, query: string) => {
    return await retrieve(kbId, query, 5);
  }, [retrieve]);

  return (
    <motion.div
      className={`flex flex-col bg-background border rounded-xl overflow-hidden ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Database size={20} className="text-primary" />
          <span className="font-medium">知识库管理</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {knowledgeBases.length} 个知识库
          </span>
          <motion.button
            onClick={() => setShowCreateBase(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Plus size={14} />
            新建知识库
          </motion.button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 知识库列表 */}
        <div className="w-64 border-r bg-muted/10 overflow-y-auto">
          {loading && knowledgeBases.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {knowledgeBases.map((kb) => (
                <motion.button
                  key={kb.id}
                  onClick={() => handleSelectBase(kb.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    activeBase?.id === kb.id
                      ? 'bg-primary/10 border border-primary/20'
                      : 'hover:bg-muted'
                  }`}
                  whileHover={{ x: 2 }}
                >
                  <div className="flex items-center gap-2">
                    <FolderOpen size={16} className="text-primary" />
                    <span className="font-medium text-sm truncate">{kb.name}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{kb.documentCount} 文档</span>
                    <span>{formatSize(kb.totalChunks * 500)}</span>
                  </div>
                </motion.button>
              ))}

              {knowledgeBases.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Database size={24} className="mx-auto mb-2 opacity-50" />
                  <p>暂无知识库</p>
                  <p className="text-xs mt-1">点击"新建知识库"开始</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeBase ? (
            <div className="space-y-4">
              {/* 知识库信息 */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{activeBase.name}</h3>
                  {activeBase.description && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {activeBase.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <HardDrive size={14} />
                    {formatSize(activeBase.totalChunks * 500)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Zap size={14} />
                    {activeBase.totalChunks} chunks
                  </span>
                  <button
                    onClick={() => handleDeleteBase(activeBase.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* 上传区域 */}
              <div className="relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.md,.txt,.json,.csv,.html,.htm"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <motion.button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full p-6 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30 transition-colors"
                  whileHover={{ scale: 1.005 }}
                >
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    {uploading ? (
                      <Loader2 size={24} className="animate-spin" />
                    ) : (
                      <Upload size={24} />
                    )}
                    <span className="text-sm">
                      {uploading ? '上传中...' : '点击或拖拽上传文档'}
                    </span>
                    <span className="text-xs">
                      支持 PDF、Markdown、文本、JSON、CSV 等格式
                    </span>
                  </div>
                </motion.button>
              </div>

              {/* 检索测试 */}
              <SearchTest kbId={activeBase.id} onRetrieve={handleRetrieve} />

              {/* 文档列表 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">文档列表</span>
                  <span className="text-xs text-muted-foreground">
                    {activeBase.documentCount} 个文档
                  </span>
                </div>

                {activeBase.documents && activeBase.documents.length > 0 ? (
                  <div className="space-y-2">
                    {activeBase.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted">
                          {fileTypeIcons[doc.type] || <File size={16} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm truncate">{doc.title}</span>
                          <div className="text-xs text-muted-foreground">
                            {doc.chunks} chunks · {formatTime(doc.createdAt)}
                          </div>
                        </div>
                        <span className="flex items-center gap-1 text-xs text-[hsl(var(--success-500))]">
                          <Check size={12} />
                          已索引
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <File size={24} className="mx-auto mb-2 opacity-50" />
                    <p>暂无文档</p>
                    <p className="text-xs mt-1">上传文档开始构建知识库</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Database size={48} className="mb-3 opacity-50" />
              <p className="text-lg font-medium">选择或创建知识库</p>
              <p className="text-sm mt-1">从左侧选择一个知识库，或创建新的知识库</p>
            </div>
          )}
        </div>
      </div>

      {/* 创建知识库对话框 */}
      <AnimatePresence>
        {showCreateBase && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCreateBase(false)}
          >
            <motion.div
              className="bg-background rounded-xl p-6 shadow-xl max-w-md mx-4 w-full"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-semibold mb-4">创建知识库</h3>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">名称</label>
                  <input
                    type="text"
                    value={newBaseName}
                    onChange={(e) => setNewBaseName(e.target.value)}
                    className="w-full h-10 px-3 border rounded-lg bg-background"
                    placeholder="输入知识库名称"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">描述（可选）</label>
                  <textarea
                    value={newBaseDesc}
                    onChange={(e) => setNewBaseDesc(e.target.value)}
                    className="w-full h-20 px-3 py-2 border rounded-lg bg-background resize-none"
                    placeholder="描述这个知识库的用途..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setShowCreateBase(false)}
                  className="px-4 py-2 rounded-lg hover:bg-muted"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateBase}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : '创建'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

export default KnowledgeBaseManager;
