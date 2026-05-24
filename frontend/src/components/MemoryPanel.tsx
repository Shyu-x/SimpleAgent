'use client';

import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMemorySystem, MEMORY_TYPE_CONFIG, IMPORTANCE_CONFIG } from '@/hooks/useMemorySystem';
import { useChatStore } from '@/store/chatStore';
import { MemoryType, MemoryImportance, Note, GlobalMemory } from '@/types';
import { FileText, Search, Brain, Sparkles } from 'lucide-react';

interface MemoryPanelProps {
  conversationId: string;
  isOpen: boolean;
  onClose: () => void;
  layout?: 'drawer' | 'modal';
}

type TabType = 'session' | 'global' | 'search';

export function MemoryPanel({ conversationId, isOpen, onClose, layout = 'drawer' }: MemoryPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('session');
  const [searchQuery, setSearchQuery] = useState('');
  const [sessionDraft, setSessionDraft] = useState('');
  const [globalDraft, setGlobalDraft] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [newType, setNewType] = useState<MemoryType>('general');
  const [newImportance, setNewImportance] = useState<MemoryImportance>('medium');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const {
    getSessionMemories,
    addSessionMemory,
    updateSessionMemory,
    deleteSessionMemory,
    globalMemories,
    addGlobalMemory,
    updateGlobalMemory,
    deleteGlobalMemory,
    searchMemories,
  } = useMemorySystem();

  const conversationTitle = useChatStore((state) =>
    state.conversations.find((item) => item.id === conversationId)?.title ?? '未命名会话'
  );

  const sessionNotes = getSessionMemories(conversationId);
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchMemories(searchQuery, 10);
  }, [searchMemories, searchQuery]);

  const tabs: Array<{ id: TabType; label: string; icon: ReactNode }> = [
    { id: 'session', label: '会话笔记', icon: <FileText size={16} /> },
    { id: 'global', label: '全局记忆', icon: <Brain size={16} /> },
    { id: 'search', label: '记忆搜索', icon: <Search size={16} /> },
  ];
  const isModal = layout === 'modal';

  const publishStatus = (message: string) => {
    setStatusMessage(message);
  };

  const resetEditingState = () => {
    setEditingId(null);
    setEditContent('');
  };

  const handleAddSessionNote = () => {
    if (!sessionDraft.trim()) return;
    addSessionMemory(conversationId, sessionDraft.trim());
    setSessionDraft('');
    publishStatus('会话笔记已添加');
  };

  const handleAddGlobalMemory = () => {
    if (!globalDraft.trim()) return;
    addGlobalMemory(globalDraft.trim(), newType, newImportance);
    setGlobalDraft('');
    publishStatus('全局记忆已添加');
  };

  const handleStartEdit = (id: string, content: string) => {
    setEditingId(id);
    setEditContent(content);
  };

  const handleSaveSessionEdit = () => {
    if (!editingId || !editContent.trim()) return;
    updateSessionMemory(conversationId, editingId, editContent.trim());
    resetEditingState();
    publishStatus('会话笔记已更新');
  };

  const handleSaveGlobalEdit = () => {
    if (!editingId || !editContent.trim()) return;
    updateGlobalMemory(editingId, { content: editContent.trim() });
    resetEditingState();
    publishStatus('全局记忆已更新');
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setStatusMessage('');
      resetEditingState();
      return;
    }
    setActiveTab('session');
    setStatusMessage('');
    resetEditingState();
  }, [conversationId, isOpen]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(''), 2400);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[95] bg-black/20 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={isModal ? { opacity: 0, y: 24, scale: 0.985 } : { x: '100%' }}
            animate={isModal ? { opacity: 1, y: 0, scale: 1 } : { x: 0 }}
            exit={isModal ? { opacity: 0, y: 24, scale: 0.985 } : { x: '100%' }}
            transition={isModal ? { type: 'spring', damping: 30, stiffness: 320 } : { type: 'spring', damping: 25, stiffness: 300 }}
            className={
              isModal
                ? 'fixed left-4 right-4 top-4 bottom-4 z-[100] flex flex-col overflow-hidden rounded-3xl border border-border bg-muted/98 shadow-2xl backdrop-blur-xl mx-auto my-auto'
                : 'fixed right-0 top-0 z-[100] flex h-full w-full flex-col border-l border-border bg-background shadow-xl sm:w-96'
            }
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                  <Brain className="h-5 w-5" />
                  记忆系统
                </h2>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  当前会话: {conversationTitle}
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 transition-colors hover:bg-muted/80"
                aria-label="关闭记忆面板"
              >
                <svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid gap-2 border-b border-border bg-muted/72 px-4 py-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-muted/92 px-3 py-2">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">会话记忆</div>
                <div className="mt-1 text-lg font-semibold text-foreground" data-testid="session-memory-count">
                  {sessionNotes.length}
                </div>
              </div>
              <div className="rounded-2xl bg-muted/92 px-3 py-2">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">全局记忆</div>
                <div className="mt-1 text-lg font-semibold text-foreground" data-testid="global-memory-count">
                  {globalMemories.length}
                </div>
              </div>
              <div className="rounded-2xl bg-muted/92 px-3 py-2">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">回归状态</div>
                <div
                  className="mt-1 flex min-h-7 items-center gap-2 text-sm text-foreground"
                  aria-live="polite"
                  data-testid="memory-status"
                >
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span>{statusMessage || '等待操作'}</span>
                </div>
              </div>
            </div>

            <div className="flex border-b border-border">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex-1 py-3 text-sm font-medium transition-colors ${
                    activeTab === tab.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="flex items-center justify-center gap-1">
                    <span>{tab.icon}</span>
                    <span className="hidden sm:inline">{tab.label}</span>
                  </span>
                  {activeTab === tab.id && (
                    <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              {activeTab === 'session' && (
                <div className="space-y-4 p-4">
                  <div className="space-y-2 rounded-2xl border border-border bg-muted/72 p-3">
                    <textarea
                      value={sessionDraft}
                      onChange={(e) => setSessionDraft(e.target.value)}
                      placeholder="添加会话笔记..."
                      className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      rows={3}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          handleAddSessionNote();
                        }
                      }}
                    />
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">Ctrl+Enter 快速添加到当前会话</span>
                      <button
                        onClick={handleAddSessionNote}
                        disabled={!sessionDraft.trim()}
                        className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        添加笔记
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2" data-testid="session-memory-list" aria-label="会话笔记列表">
                    {sessionNotes.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-muted-foreground">
                        <p className="text-sm">暂无会话笔记</p>
                        <p className="mt-1 text-xs">新增后会绑定到当前会话并随当前会话恢复</p>
                      </div>
                    ) : (
                      sessionNotes.map((note) => (
                        <NoteCard
                          key={note.id}
                          note={note}
                          isEditing={editingId === note.id}
                          editContent={editContent}
                          onStartEdit={() => handleStartEdit(note.id, note.content)}
                          onSaveEdit={handleSaveSessionEdit}
                          onCancelEdit={resetEditingState}
                          onEditContentChange={setEditContent}
                          onDelete={() => {
                            deleteSessionMemory(conversationId, note.id);
                            publishStatus('会话笔记已删除');
                          }}
                          formatDate={formatDate}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'global' && (
                <div className="space-y-4 p-4">
                  <div className="space-y-3 rounded-2xl border border-border bg-[hsl(var(--bg-elevated))]/72 p-3">
                    <textarea
                      value={globalDraft}
                      onChange={(e) => setGlobalDraft(e.target.value)}
                      placeholder="添加全局记忆（跨会话共享）..."
                      className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      rows={3}
                    />

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <select
                        value={newType}
                        onChange={(e) => setNewType(e.target.value as MemoryType)}
                        className="rounded-lg border border-border bg-background px-2 py-2 text-sm"
                      >
                        <option value="general">一般</option>
                        <option value="user_pref">用户偏好</option>
                        <option value="context">上下文</option>
                        <option value="knowledge">知识</option>
                        <option value="task">任务</option>
                      </select>

                      <select
                        value={newImportance}
                        onChange={(e) => setNewImportance(e.target.value as MemoryImportance)}
                        className="rounded-lg border border-border bg-background px-2 py-2 text-sm"
                      >
                        <option value="low">低</option>
                        <option value="medium">一般</option>
                        <option value="high">重要</option>
                      </select>

                      <button
                        onClick={handleAddGlobalMemory}
                        disabled={!globalDraft.trim()}
                        className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        添加到全局记忆
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2" data-testid="global-memory-list" aria-label="全局记忆列表">
                    {globalMemories.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-muted-foreground">
                        <p className="text-sm">暂无全局记忆</p>
                        <p className="mt-1 text-xs">添加后将在所有会话中共享</p>
                      </div>
                    ) : (
                      globalMemories.map((memory) => (
                        <GlobalMemoryCard
                          key={memory.id}
                          memory={memory}
                          isEditing={editingId === memory.id}
                          editContent={editContent}
                          onStartEdit={() => handleStartEdit(memory.id, memory.content)}
                          onSaveEdit={handleSaveGlobalEdit}
                          onCancelEdit={resetEditingState}
                          onEditContentChange={setEditContent}
                          onDelete={() => {
                            deleteGlobalMemory(memory.id);
                            publishStatus('全局记忆已删除');
                          }}
                          formatDate={formatDate}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'search' && (
                <div className="space-y-4 p-4">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="搜索记忆..."
                      className="w-full rounded-lg border border-border bg-background px-4 py-2 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  </div>

                  <div className="space-y-2" data-testid="memory-search-results">
                    {!searchQuery.trim() ? (
                      <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-muted-foreground">
                        <p className="text-sm">输入关键词搜索记忆</p>
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-muted-foreground">
                        <p className="text-sm">未找到相关记忆</p>
                      </div>
                    ) : (
                      searchResults.map((memory) => (
                        <GlobalMemoryCard
                          key={memory.id}
                          memory={memory}
                          isEditing={false}
                          formatDate={formatDate}
                          compact
                        />
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-border bg-muted/72 p-4">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>会话笔记: {sessionNotes.length}</span>
                <span>全局记忆: {globalMemories.length}</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function NoteCard({
  note,
  isEditing,
  editContent,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditContentChange,
  onDelete,
  formatDate,
}: {
  note: Note;
  isEditing: boolean;
  editContent: string;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditContentChange: (v: string) => void;
  onDelete: () => void;
  formatDate: (t: number) => string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="group rounded-2xl border border-border bg-muted/70 p-3"
      data-testid="session-memory-card"
      aria-label={`会话笔记 ${note.content}`}
    >
      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editContent}
            onChange={(e) => onEditContentChange(e.target.value)}
            className="w-full resize-none rounded-lg border border-primary/30 bg-background px-2 py-1 text-sm"
            rows={3}
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={onSaveEdit} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground">
              保存
            </button>
            <button onClick={onCancelEdit} className="rounded bg-muted/0.18 px-2 py-1 text-xs text-muted-foreground">
              取消
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{note.content}</p>
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <span className="text-xs text-muted-foreground">{formatDate(note.createdAt)}</span>
            <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button onClick={onStartEdit} className="p-1 text-muted-foreground hover:text-primary" aria-label="编辑会话笔记">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button onClick={onDelete} className="p-1 text-muted-foreground hover:text-destructive" aria-label="删除会话笔记">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}

function GlobalMemoryCard({
  memory,
  isEditing,
  editContent,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditContentChange,
  onDelete,
  formatDate,
  compact = false,
}: {
  memory: GlobalMemory;
  isEditing?: boolean;
  editContent?: string;
  onStartEdit?: () => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  onEditContentChange?: (v: string) => void;
  onDelete?: () => void;
  formatDate: (t: number) => string;
  compact?: boolean;
}) {
  const typeConfig = MEMORY_TYPE_CONFIG[memory.type];
  const importanceConfig = IMPORTANCE_CONFIG[memory.importance];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`group rounded-2xl border bg-muted/70 p-3 ${
        memory.importance === 'high' ? 'border-destructive/30' : 'border-border'
      }`}
      data-testid="global-memory-card"
      aria-label={`全局记忆 ${memory.content}`}
    >
      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editContent}
            onChange={(e) => onEditContentChange?.(e.target.value)}
            className="w-full resize-none rounded-lg border border-primary/30 bg-background px-2 py-1 text-sm"
            rows={3}
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={onSaveEdit} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground">
              保存
            </button>
            <button onClick={onCancelEdit} className="rounded bg-muted/0.18 px-2 py-1 text-xs text-muted-foreground">
              取消
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs">{typeConfig.icon}</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
              {typeConfig.label}
            </span>
            {memory.importance === 'high' && (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                {importanceConfig.label}
              </span>
            )}
          </div>

          <p className={`whitespace-pre-wrap text-sm text-muted-foreground ${compact ? 'line-clamp-2' : ''}`}>
            {memory.content}
          </p>

          {!compact && (
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>{formatDate(memory.createdAt)}</span>
                <span>访问: {memory.accessCount}</span>
              </div>
              <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button onClick={onStartEdit} className="p-1 text-muted-foreground hover:text-primary" aria-label="编辑全局记忆">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button onClick={onDelete} className="p-1 text-muted-foreground hover:text-destructive" aria-label="删除全局记忆">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
