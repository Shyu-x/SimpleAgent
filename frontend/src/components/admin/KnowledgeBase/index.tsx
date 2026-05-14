'use client';

/**
 * 知识库管理完整界面
 *
 * 功能：
 * - 文档列表（支持搜索、筛选、分页）
 * - 文档上传（拖拽上传、进度显示）
 * - 索引管理（创建、重建、状态监控）
 * - 检索测试（输入查询、查看结果）
 * - 统计面板（文档数、分块数、调用量）
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { fetchApi } from '@/lib/apiClient';
import { useAdminPolling } from '@/hooks/useAdminSSE';

// ============ 类型定义 ============

interface DocumentInfo {
  id: string;
  name: string;
  kbId?: string;
  size?: number;
  type: string;
  chunks: number;
  status: 'pending' | 'processing' | 'indexed' | 'error';
  indexedAt?: string;
  createdAt: string;
  error?: string;
}

interface IndexStats {
  totalDocuments: number;
  totalChunks: number;
  indexSize: number;
  lastIndexTime?: string;
  status: 'idle' | 'building' | 'error';
}

interface SearchResult {
  chunkId: string;
  content: string;
  score: number;
  documentId: string;
  documentName: string;
}

type TabType = 'documents' | 'upload' | 'index' | 'search' | 'stats';

// ============ 主组件 ============

export default function KnowledgeBasePage() {
  const [activeTab, setActiveTab] = useState<TabType>('documents');

  // SSE 订阅 stats 数据
  const { data: statsData, loading, refresh } = useAdminPolling<IndexStats | null>({
    endpoint: '/api/admin/knowledge/stats',
    parser: (res) => res?.data?.data || null,
    interval: 30000,
  });

  const stats = statsData;
  const fetchStats = refresh;

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'documents', label: '文档列表', icon: '📄' },
    { id: 'upload', label: '上传文档', icon: '⬆️' },
    { id: 'index', label: '索引管理', icon: '🔧' },
    { id: 'search', label: '检索测试', icon: '🔍' },
    { id: 'stats', label: '数据统计', icon: '📊' },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* 顶部标题栏 */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">知识库管理</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              管理文档、索引配置与检索测试
            </p>
          </div>
          {stats && (
            <div className="flex gap-4 text-sm">
              <div className="text-center px-3 py-1 bg-blue-50 dark:bg-blue-900/30 rounded">
                <div className="text-lg font-bold text-blue-600">{stats.totalDocuments}</div>
                <div className="text-gray-500">文档</div>
              </div>
              <div className="text-center px-3 py-1 bg-green-50 dark:bg-green-900/30 rounded">
                <div className="text-lg font-bold text-green-600">{stats.totalChunks}</div>
                <div className="text-gray-500">分块</div>
              </div>
              <div className="text-center px-3 py-1 bg-purple-50 dark:bg-purple-900/30 rounded">
                <div className="text-lg font-bold text-purple-600">
                  {formatBytes(stats.indexSize)}
                </div>
                <div className="text-gray-500">索引大小</div>
              </div>
            </div>
          )}
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
            {activeTab === 'documents' && <DocumentList onRefresh={fetchStats} />}
            {activeTab === 'upload' && <DocumentUpload onSuccess={fetchStats} />}
            {activeTab === 'index' && <IndexManager stats={stats} onRefresh={fetchStats} />}
            {activeTab === 'search' && <SearchPanel />}
            {activeTab === 'stats' && <StatsPanel stats={stats} />}
          </>
        )}
      </div>
    </div>
  );
}

// ============ 文档列表 ============

function DocumentList({ onRefresh }: { onRefresh: () => void }) {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    fetchDocuments();
  }, [search, filterStatus, page]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const { data, error } = await fetchApi<{ success: boolean; data: { documents: DocumentInfo[]; total: number; page: number; pageSize: number } }>(
        `/api/admin/knowledge/docs?search=${search}&status=${filterStatus}&page=${page}&pageSize=${pageSize}`
      );
      if (error) {
        console.error('Failed to fetch documents:', error);
        setDocuments([]);
      } else if (data?.data?.documents) {
        setDocuments(data.data.documents);
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const deleteDocument = async (id: string, kbId: string) => {
    if (!confirm('确定要删除该文档吗？')) return;
    await fetchApi(`/api/admin/knowledge/docs/${id}?kbId=${encodeURIComponent(kbId)}`, { method: 'DELETE' });
    fetchDocuments();
    onRefresh();
  };

  const reindexDocument = async (kbId: string) => {
    await fetchApi('/api/admin/knowledge/reindex', {
      method: 'POST',
      body: JSON.stringify({ kbId })
    });
    fetchDocuments();
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
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="搜索文档名称..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        </div>
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
        >
          <option value="all">全部状态</option>
          <option value="indexed">已索引</option>
          <option value="processing">处理中</option>
          <option value="pending">等待中</option>
          <option value="error">错误</option>
        </select>
        <button
          onClick={fetchDocuments}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          刷新
        </button>
      </div>

      {/* 表格 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">文档名称</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">大小</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">分块数</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">状态</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">创建时间</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">加载中...</td>
                </tr>
              ) : documents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">暂无文档</td>
                </tr>
              ) : (
                documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">📄</span>
                        <span className="font-medium text-gray-900 dark:text-white">{doc.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{formatBytes(doc.size)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{doc.chunks}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={doc.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{formatDate(doc.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => reindexDocument(doc.kbId)}
                          className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200"
                        >
                          重建索引
                        </button>
                        <button
                          onClick={() => deleteDocument(doc.id, doc.kbId)}
                          className="px-2 py-1 text-xs bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded hover:bg-red-200"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {documents.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-500">
              第 {page} 页，共 ~{documents.length} 条
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                上一页
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={documents.length < pageSize}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ 文档上传 ============

function DocumentUpload({ onSuccess }: { onSuccess: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptedTypes = ['.txt', '.md', '.pdf', '.docx', '.html', '.json', '.csv'];

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const newFiles = Array.from(fileList).filter(f =>
      acceptedTypes.some(ext => f.name.toLowerCase().endsWith(ext))
    );
    setFiles(prev => [...prev, ...newFiles]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);

    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      const fileId = `${file.name}-${file.size}`;

      try {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setProgress(prev => ({ ...prev, [fileId]: (e.loaded / e.total) * 100 }));
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error('上传失败'));
          };
          xhr.onerror = () => reject(new Error('网络错误'));
          xhr.open('POST', '/api/admin/knowledge/docs');
          xhr.send(formData);
        });
      } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err);
      }
    }

    setUploading(false);
    setFiles([]);
    setProgress({});
    onSuccess();
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 拖拽区域 */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedTypes.join(',')}
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        <div className="text-4xl mb-3">📤</div>
        <div className="text-lg font-medium text-gray-700 dark:text-gray-300">
          拖拽文件到此处，或点击选择
        </div>
        <div className="text-sm text-gray-500 mt-2">
          支持格式：{acceptedTypes.join(' ')}
        </div>
      </div>

      {/* 文件列表 */}
      {files.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
          {files.map((file, index) => {
            const fileId = `${file.name}-${file.size}`;
            const prog = progress[fileId] || 0;
            return (
              <div key={fileId} className="p-4 flex items-center gap-3">
                <span className="text-2xl">📄</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white truncate">{file.name}</div>
                  <div className="text-xs text-gray-500">{formatBytes(file.size)}</div>
                  {uploading && prog > 0 && (
                    <div className="mt-2 w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${prog}%` }}
                      />
                    </div>
                  )}
                </div>
                {!uploading && (
                  <button
                    onClick={() => removeFile(index)}
                    className="px-2 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-sm"
                  >
                    移除
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 上传按钮 */}
      {files.length > 0 && (
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => setFiles([])}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            清空
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {uploading ? '上传中...' : `上传 ${files.length} 个文件`}
          </button>
        </div>
      )}

      {/* 配置选项 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-medium text-gray-900 dark:text-white mb-3">上传配置</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">分块大小</label>
            <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm">
              <option value="256">256 tokens</option>
              <option value="512" selected>512 tokens</option>
              <option value="1024">1024 tokens</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">重叠大小</label>
            <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm">
              <option value="0">无重叠</option>
              <option value="32">32 tokens</option>
              <option value="64" selected>64 tokens</option>
              <option value="128">128 tokens</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ 索引管理 ============

function IndexManager({ stats, onRefresh }: { stats: IndexStats | null; onRefresh: () => void }) {
  const [rebuilding, setRebuilding] = useState(false);
  const [buildingProgress, setBuildingProgress] = useState(0);

  const rebuildIndex = async () => {
    if (!confirm('确定要重建所有索引吗？这可能需要几分钟。')) return;
    setRebuilding(true);
    setBuildingProgress(0);

    try {
      const { error } = await fetchApi('/api/admin/knowledge/reindex', { method: 'POST' });
      if (error) {
        alert('重建索引失败: ' + error.message);
      }
    } finally {
      setRebuilding(false);
      setBuildingProgress(0);
      onRefresh();
    }
  };

  const clearIndex = async () => {
    if (!confirm('确定要清空所有索引吗？此操作不可恢复。')) return;
    alert('清空索引功能暂不可用，请联系管理员。');
    onRefresh();
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* 当前状态 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="font-medium text-gray-900 dark:text-white mb-4">索引状态</h3>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats?.totalDocuments ?? 0}
            </div>
            <div className="text-sm text-gray-500 mt-1">文档总数</div>
          </div>
          <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats?.totalChunks ?? 0}
            </div>
            <div className="text-sm text-gray-500 mt-1">分块总数</div>
          </div>
          <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats?.status === 'idle' ? '就绪' : stats?.status === 'building' ? '构建中' : '错误'}
            </div>
            <div className="text-sm text-gray-500 mt-1">索引状态</div>
          </div>
        </div>

        {rebuilding && (
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1">
              <span>索引构建中...</span>
              <span>{buildingProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${buildingProgress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={rebuildIndex}
            disabled={rebuilding}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            重建索引
          </button>
          <button
            onClick={clearIndex}
            disabled={rebuilding}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            清空索引
          </button>
        </div>
      </div>

      {/* 索引配置 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="font-medium text-gray-900 dark:text-white mb-4">索引配置</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-700 dark:text-gray-300">启用向量检索</div>
              <div className="text-sm text-gray-500">使用嵌入向量进行语义检索</div>
            </div>
            <ToggleSwitch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-700 dark:text-gray-300">启用关键词检索</div>
              <div className="text-sm text-gray-500">BM25 关键词精确匹配</div>
            </div>
            <ToggleSwitch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-700 dark:text-gray-300">启用重排序</div>
              <div className="text-sm text-gray-500">对检索结果进行相关性重排序</div>
            </div>
            <ToggleSwitch defaultChecked />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              检索 Top-K
            </label>
            <input
              type="number"
              defaultValue={10}
              min={1}
              max={100}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ 检索测试 ============

function SearchPanel() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTime, setSearchTime] = useState(0);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    const start = Date.now();

    const { data } = await fetchApi<{ data: { results: SearchResult[] } }>(
      `/api/admin/knowledge/search?q=${encodeURIComponent(query)}`
    );

    if (data?.data) {
      setResults(data.data.results || []);
      setSearchTime(Date.now() - start);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      {/* 搜索框 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="输入检索内容..."
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '检索中...' : '检索'}
          </button>
        </div>
      </div>

      {/* 搜索结果 */}
      {results.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
          <div className="px-4 py-2 text-sm text-gray-500">
            找到 {results.length} 条结果，耗时 {searchTime}ms
          </div>
          {results.map((result, index) => (
            <div key={result.chunkId} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">#{index + 1}</span>
                  <span className="font-medium text-gray-900 dark:text-white text-sm">{result.documentName}</span>
                </div>
                <span className="text-sm text-gray-500">{(result.score * 100).toFixed(1)}%</span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">{result.content}</p>
            </div>
          ))}
        </div>
      )}

      {query && !loading && results.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500">
          未找到相关结果
        </div>
      )}
    </div>
  );
}

// ============ 统计面板 ============

function StatsPanel({ stats }: { stats: IndexStats | null }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <StatCard
        title="文档总数"
        value={stats?.totalDocuments ?? 0}
        icon="📄"
        color="blue"
      />
      <StatCard
        title="分块总数"
        value={stats?.totalChunks ?? 0}
        icon="🧩"
        color="green"
      />
      <StatCard
        title="索引大小"
        value={stats?.indexSize ? formatBytes(stats.indexSize) : '0 B'}
        icon="💾"
        color="purple"
      />
      <StatCard
        title="索引状态"
        value={stats?.status === 'idle' ? '就绪' : stats?.status === 'building' ? '构建中' : '错误'}
        icon="🔧"
        color={stats?.status === 'idle' ? 'green' : stats?.status === 'building' ? 'yellow' : 'red'}
      />
      <StatCard
        title="最后索引时间"
        value={stats?.lastIndexTime ? formatDate(stats.lastIndexTime) : '从未'}
        icon="⏰"
        color="gray"
      />
    </div>
  );
}

// ============ 通用子组件 ============

function StatusBadge({ status }: { status: DocumentInfo['status'] }) {
  const config = {
    indexed: { label: '已索引', class: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' },
    processing: { label: '处理中', class: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300' },
    pending: { label: '等待中', class: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
    error: { label: '错误', class: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
  };
  const c = config[status] || { label: status, class: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.class}`}>{c.label}</span>
  );
}

function ToggleSwitch({ defaultChecked }: { defaultChecked?: boolean }) {
  const [checked, setChecked] = useState(defaultChecked ?? false);
  return (
    <button
      onClick={() => setChecked(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        checked ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}

function StatCard({ title, value, icon, color }: {
  title: string; value: string | number; icon: string; color: string;
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-600',
    gray: 'bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400',
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{icon}</span>
        <span className="text-sm text-gray-500">{title}</span>
      </div>
      <div className={`text-2xl font-bold ${colors[color].split(' ')[1].replace('/20', '')}`}>
        {value}
      </div>
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}
