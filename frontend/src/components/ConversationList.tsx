'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useChatStore } from '@/store/chatStore';
import { Plus, Trash2, MessageSquare, AlertTriangle, Search, MoreHorizontal, X, GripVertical } from 'lucide-react';
import type { Conversation } from '@/types';
import ConversationContextMenu from './ConversationContextMenu';
import { useToast } from './Toast';
import { motion, AnimatePresence } from 'framer-motion';
import DraggableConversationItem from './DraggableConversationItem';
import { useTranslations } from 'next-intl';

interface ConversationListProps {
  onCloseSidebar?: () => void;
}

interface ConversationGroup {
  id: string;
  label: string;
  items: Conversation[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const GUIDE_COLOR_VARS = [
  '--guide-1',
  '--guide-2',
  '--guide-3',
  '--guide-4',
  '--guide-5',
  '--guide-6',
  '--guide-7',
  '--guide-8',
  '--guide-9',
  '--guide-10',
  '--guide-11',
  '--guide-12',
] as const;

function getTimeBucket(updatedAt: number, t: ReturnType<typeof useTranslations<'conversation'>>): { id: string; label: string } {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const messageDay = new Date(updatedAt);
  const messageDayStart = new Date(
    messageDay.getFullYear(),
    messageDay.getMonth(),
    messageDay.getDate()
  ).getTime();
  const diffDays = Math.floor((todayStart - messageDayStart) / DAY_MS);

  if (diffDays <= 0) return { id: 'today', label: t('time.today') };
  if (diffDays === 1) return { id: 'yesterday', label: t('time.yesterday') };
  if (diffDays <= 7) return { id: 'week', label: t('time.lastWeek') };
  if (diffDays <= 30) return { id: 'month', label: t('time.lastMonth') };

  const monthId = `${messageDay.getFullYear()}-${String(messageDay.getMonth() + 1).padStart(2, '0')}`;
  const monthLabel = t('time.monthYear', { year: messageDay.getFullYear(), month: messageDay.getMonth() + 1 });
  return { id: monthId, label: monthLabel };
}

export default function ConversationList({ onCloseSidebar }: ConversationListProps) {
  const t = useTranslations('conversation');
  const tCommon = useTranslations('common');
  const {
    conversations,
    activeConversationId,
    createConversation,
    deleteConversation,
    restoreConversation,
    setActiveConversation,
    updateConversationTitle,
    addActiveWindow,
    hasHydrated,
  } = useChatStore();
  const { showToast } = useToast();

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [draggedConversationId, setDraggedConversationId] = useState<string | null>(null);

  // 防抖搜索
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    conversationId: string;
    conversation: Conversation;
  } | null>(null);

  const normalizedQuery = debouncedQuery.trim().toLowerCase();

  const filteredConversations = useMemo(() => {
    if (!hasHydrated) return [];
    if (!normalizedQuery) return conversations;

    return conversations.filter((conversation) => {
      const title = conversation.title?.toLowerCase() ?? '';
      if (title.includes(normalizedQuery)) return true;

      const latestMessage = conversation.messages[conversation.messages.length - 1]?.content?.toLowerCase() ?? '';
      if (latestMessage.includes(normalizedQuery)) return true;

      return conversation.messages
        .slice(-6)
        .some((message) => message.content.toLowerCase().includes(normalizedQuery));
    });
  }, [conversations, hasHydrated, normalizedQuery]);

  const groupedConversations = useMemo<ConversationGroup[]>(() => {
    const orderedGroups: ConversationGroup[] = [
      { id: 'today', label: t('time.today'), items: [] },
      { id: 'yesterday', label: t('time.yesterday'), items: [] },
      { id: 'week', label: t('time.lastWeek'), items: [] },
      { id: 'month', label: t('time.lastMonth'), items: [] },
    ];
    const dynamicGroups = new Map<string, ConversationGroup>();

    filteredConversations.forEach((conversation) => {
      const bucket = getTimeBucket(conversation.updatedAt, t);
      const staticGroup = orderedGroups.find((item) => item.id === bucket.id);

      if (staticGroup) {
        staticGroup.items.push(conversation);
        return;
      }

      if (!dynamicGroups.has(bucket.id)) {
        dynamicGroups.set(bucket.id, { id: bucket.id, label: bucket.label, items: [] });
      }
      dynamicGroups.get(bucket.id)!.items.push(conversation);
    });

    const monthGroups = Array.from(dynamicGroups.values()).sort((a, b) =>
      a.id < b.id ? 1 : -1
    );

    return [...orderedGroups, ...monthGroups].filter((group) => group.items.length > 0);
  }, [filteredConversations, t]);

  const formatTime = useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    return isToday
      ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  }, []);

  const getConversationPreview = useCallback((conversation: Conversation) => {
    if (conversation.messages.length === 0) return t('newConversation');

    const lastMessage = conversation.messages[conversation.messages.length - 1].content
      .replace(/\s+/g, ' ')
      .trim();

    if (!lastMessage) return t('continue');
    return lastMessage.length > 64 ? `${lastMessage.slice(0, 64)}...` : lastMessage;
  }, [t]);

  const openConversationMenu = useCallback(
    (position: { x: number; y: number }, conversation: Conversation) => {
      setContextMenu({
        isOpen: true,
        position,
        conversationId: conversation.id,
        conversation,
      });
    },
    []
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, conversation: Conversation) => {
      e.preventDefault();
      openConversationMenu({ x: e.clientX, y: e.clientY }, conversation);
    },
    [openConversationMenu]
  );

  const handleActionMenu = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, conversation: Conversation) => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      openConversationMenu({ x: rect.left, y: rect.bottom + 8 }, conversation);
    },
    [openConversationMenu]
  );

  const handleConfirmDelete = useCallback(() => {
    if (deleteConfirmId) {
      const index = conversations.findIndex((c) => c.id === deleteConfirmId);
      const conv = conversations.find((c) => c.id === deleteConfirmId);
      if (conv && index !== -1) {
        deleteConversation(deleteConfirmId);
        showToast(t('deleted'), 'info', tCommon('cancel'), () => {
          restoreConversation(conv, index);
        });
      }
      setDeleteConfirmId(null);
    }
  }, [conversations, deleteConfirmId, deleteConversation, restoreConversation, showToast, t, tCommon]);

  // 拖拽事件处理
  const handleDragStart = useCallback((conversationId: string) => {
    setDraggedConversationId(conversationId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedConversationId(null);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent">
      {/* 1. Header & Search */}
      <div className="shrink-0 space-y-4 border-b border-[hsl(var(--border-subtle))] p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-[hsl(var(--text-main))]">{t('title')}</h2>
            <p className="mt-0.5 text-xs text-[hsl(var(--text-muted))]">{t('count', { count: conversations.length })}</p>
          </div>

          <div className="flex items-center gap-2">
            {onCloseSidebar && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onCloseSidebar}
                className="rounded-xl p-2 text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--bg-muted))] hover:text-[hsl(var(--text-main))]"
                title={t('closeSidebar')}
              >
                <X size={18} />
              </motion.button>
            )}
            <motion.button
              whileHover={{ scale: 1.05, rotate: 90 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => createConversation()}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:shadow-primary/40"
            >
              <Plus size={14} />
              {t('newButton')}
            </motion.button>
            <span className="hidden text-[10px] text-[hsl(var(--text-muted))] opacity-60 lg:inline">
              {t('dragHint')}
            </span>
          </div>
        </div>

        <div className="group relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--text-muted))] transition-colors group-focus-within:text-primary"
            size={16}
          />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-muted))]/45 py-2 pl-10 pr-3 text-sm text-[hsl(var(--text-main))] outline-none transition-all placeholder:text-[hsl(var(--text-muted))]/70 focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* 2. List Content */}
      <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto p-3">
        <AnimatePresence mode="popLayout">
          {groupedConversations.map((group, groupIndex) => {
            const groupColorVar = GUIDE_COLOR_VARS[groupIndex % GUIDE_COLOR_VARS.length];
            const groupColor = `hsl(var(${groupColorVar}))`;
            const groupBg = `hsl(var(${groupColorVar}) / 0.18)`;

            return (
            <motion.section
              key={group.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="space-y-1.5"
            >
              <div className="flex items-center gap-2 px-2 pb-1 pt-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: groupColor }} />
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: groupColor, backgroundColor: groupBg }}
                >
                  {group.label}
                </span>
              </div>

              {group.items.map((conversation, itemIndex) => {
                const isActive = activeConversationId === conversation.id;
                const itemColorVar = GUIDE_COLOR_VARS[(groupIndex * 3 + itemIndex) % GUIDE_COLOR_VARS.length];
                const itemColor = `hsl(var(${itemColorVar}))`;
                const itemTint = `hsl(var(${itemColorVar}) / 0.16)`;
                const itemActiveOutline = `inset 0 0 0 1px hsl(var(${itemColorVar}) / 0.35)`;

                return (
                  <DraggableConversationItem
                    key={conversation.id}
                    conversation={conversation}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  >
                    <motion.div
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: draggedConversationId === conversation.id ? 0.5 : 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      onContextMenu={(e) => handleContextMenu(e, conversation)}
                      onClick={() => {
                        setActiveConversation(conversation.id);
                        addActiveWindow(conversation.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setActiveConversation(conversation.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className={`group relative flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-all duration-200 ${
                        isActive
                          ? 'border-transparent bg-[hsl(var(--bg-surface))]/97 shadow-md'
                          : 'border-transparent hover:-translate-y-[1px] hover:border-[hsl(var(--border-subtle))] hover:bg-[hsl(var(--bg-surface))]/94 hover:shadow-sm active:translate-y-0 active:bg-[hsl(var(--bg-surface))]/98'
                      }`}
                      style={isActive ? { boxShadow: itemActiveOutline } : undefined}
                    >
                      {/* 拖拽手柄 */}
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                        <GripVertical size={14} className="text-[hsl(var(--text-muted))]" />
                      </div>

                      <div
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                          isActive
                            ? 'text-primary-foreground'
                            : 'bg-[hsl(var(--bg-muted))] text-[hsl(var(--text-muted))] group-hover:bg-[hsl(var(--bg-surface))] group-hover:text-[hsl(var(--text-main))]'
                        }`}
                        style={isActive ? { backgroundColor: itemColor } : { backgroundColor: itemTint, color: itemColor }}
                      >
                        <MessageSquare size={16} />
                      </div>

                      <div className="min-w-0 flex-1 pr-6">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-[hsl(var(--text-main))]">
                            {conversation.title || t('new')}
                          </span>
                          {isActive && (
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                              style={{ backgroundColor: itemTint, color: itemColor }}
                            >
                              {t('active')}
                            </span>
                          )}
                        </div>

                        <p className="mt-1 truncate text-xs text-[hsl(var(--text-muted))]">
                          {getConversationPreview(conversation)}
                        </p>

                        <p className="mt-1 text-[11px] text-[hsl(var(--text-muted))]/90">
                          {formatTime(conversation.updatedAt)} · {t('messageCount', { count: conversation.messages.length })}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 translate-x-1">
                        <button
                          onClick={(e) => handleActionMenu(e, conversation)}
                          className="rounded-lg p-1.5 text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--text-main))]"
                          aria-label="更多操作"
                        >
                          <MoreHorizontal size={14} />
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(conversation.id);
                          }}
                          className="rounded-lg p-1.5 text-[hsl(var(--text-muted))] transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label="删除会话"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </motion.div>
                  </DraggableConversationItem>
                );
              })}
            </motion.section>
          )})}
        </AnimatePresence>

        {groupedConversations.length === 0 && (
          <div className="flex h-44 flex-col items-center justify-center gap-2 text-[hsl(var(--text-muted))]">
            <Search size={32} className="opacity-20" />
            <p className="text-xs">{t('empty')}</p>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="w-full max-w-xs rounded-2xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))] p-6 shadow-2xl"
            >
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-[hsl(var(--text-main))]">{t('deleteConfirm')}</h3>
                  <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">{t('deleteHint')}</p>
                </div>
                <div className="mt-2 flex w-full gap-2">
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    className="flex-1 rounded-xl bg-[hsl(var(--bg-muted))] px-4 py-2 text-sm font-medium text-[hsl(var(--text-main))] transition-colors hover:bg-[hsl(var(--bg-muted))]/80"
                  >
                    {tCommon('cancel')}
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    className="flex-1 rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
                  >
                    {tCommon('delete')}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <ConversationContextMenu
            isOpen={contextMenu.isOpen}
            position={contextMenu.position}
            onClose={() => setContextMenu(null)}
            conversation={contextMenu.conversation}
            onRename={(title) => updateConversationTitle(contextMenu.conversationId, title)}
            onDelete={() => setDeleteConfirmId(contextMenu.conversationId)}
            onExport={() => {
              if (!contextMenu?.conversation) return;
              const { conversation } = contextMenu;
              const exportData = {
                title: conversation.title,
                messages: conversation.messages,
                createdAt: new Date(conversation.createdAt).toISOString(),
                exportedAt: new Date().toISOString(),
              };
              const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${conversation.title || t('new')}_${Date.now()}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            onOpenInNewWindow={() => addActiveWindow(contextMenu.conversationId)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

