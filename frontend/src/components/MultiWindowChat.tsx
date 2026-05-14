'use client';

import { useChatStore } from '@/store/chatStore';
import ChatArea from '@/components/ChatArea';
import { X, Columns, Rows, LayoutGrid, Maximize2 } from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useMemo, useState, useCallback } from 'react';
import MultiWindowDropZone from './MultiWindowDropZone';

interface MultiWindowChatProps {
  layout: 'single' | 'horizontal' | 'vertical' | 'grid';
  onOpenSidebar?: () => void;
}

export default function MultiWindowChat({ layout, onOpenSidebar }: MultiWindowChatProps) {
  const { addActiveWindow, removeActiveWindow, activeConversationIds, conversations, activeConversationId } = useChatStore();

  // 拖拽高亮状态
  const [highlightedWindow, setHighlightedWindow] = useState<string | null>(null);

  // 生成窗口 ID 列表（支持最多4个窗口）
  const windowIds = useMemo(() => {
    const baseIds = activeConversationIds.length > 0 ? activeConversationIds : (activeConversationId ? [activeConversationId] : []);
    // 如果是 grid 布局，确保有 4 个位置
    if (layout === 'grid') {
      const ids = [...baseIds];
      while (ids.length < 4) {
        ids.push(`empty-${ids.length}`);
      }
      return ids;
    }
    return baseIds;
  }, [activeConversationIds, activeConversationId, layout]);

  // 处理拖拽放置
  const handleDrop = useCallback((conversationId: string, windowId: string) => {
    // 将对话分配到指定窗口
    useChatStore.getState().assignConversationToWindow(conversationId, windowId);
  }, []);

  // 计算窗口样式类名
  const getWindowClassName = (layout: string, windowCount: number, isEmpty: boolean) => {
    const base = 'relative flex flex-col overflow-hidden rounded-3xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/92 shadow-lg backdrop-blur-xl';

    if (layout === 'single') {
      return `${base} flex-1 w-full h-full`;
    }

    if (layout === 'grid' && windowCount === 1) {
      return `${base} col-span-2 row-span-2`;
    }

    if (layout === 'grid' && isEmpty) {
      return `${base} border-dashed border-primary/30`;
    }

    return base;
  };

  const getContainerStyles = () => {
    if (layout === 'single' || windowIds.length === 0) return 'flex h-full w-full flex-col';

    switch (layout) {
      case 'horizontal':
        return 'grid h-full w-full grid-cols-2 gap-3 p-3 lg:gap-4 lg:p-4';
      case 'vertical':
        return 'grid h-full w-full grid-rows-2 gap-3 p-3 lg:gap-4 lg:p-4';
      case 'grid':
        return 'grid h-full w-full grid-cols-2 grid-rows-2 gap-3 p-3 lg:gap-4 lg:p-4';
      default:
        return 'grid h-full w-full grid-cols-2 gap-3 p-3 lg:gap-4 lg:p-4';
    }
  };

  return (
    <div className={`h-full w-full bg-transparent overflow-hidden ${getContainerStyles()}`}>
      <LayoutGroup>
        <AnimatePresence mode="popLayout">
          {windowIds.length === 0 ? (
            <motion.div
              key="empty"
              layout
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="flex flex-1 items-center justify-center text-sm text-[hsl(var(--text-muted))]"
            >
              请选择一个对话开始
            </motion.div>
          ) : (
            windowIds.map((convId, index) => {
              const conversation = conversations.find(c => c.id === convId);
              const isEmptyWindow = convId.startsWith('empty-') || (!conversation && layout !== 'single');
              const isHighlighted = highlightedWindow === convId;

              const shouldHide = layout === 'single' && index > 0;

              return shouldHide ? null : (
                <motion.div
                  key={convId}
                  layout
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className={getWindowClassName(layout, windowIds.length, isEmptyWindow)}
                >
                  {/* 窗口 Header (非单窗口模式下显示) */}
                  {layout !== 'single' && (
                    <div className="flex h-11 shrink-0 items-center justify-between border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/88 px-4 backdrop-blur">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                        <span className="max-w-[220px] truncate text-[11px] font-semibold tracking-wide text-[hsl(var(--text-muted))]">
                          {conversation?.title || (isEmptyWindow ? '空窗口' : '正在加载')}
                        </span>
                      </div>
                      {!isEmptyWindow && (
                        <button
                          onClick={() => removeActiveWindow(convId)}
                          className="rounded-lg p-1.5 text-[hsl(var(--text-muted))] transition-all hover:bg-destructive/10 hover:text-destructive active:scale-95"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex-1 overflow-hidden relative">
                    <MultiWindowDropZone
                      windowId={convId}
                      isHighlighted={isHighlighted}
                      onHighlightChange={(highlighted) => setHighlightedWindow(highlighted ? convId : null)}
                      onDrop={handleDrop}
                    >
                      {isEmptyWindow ? (
                        <div className="flex h-full items-center justify-center text-sm text-[hsl(var(--text-muted))]">
                          <div className="flex flex-col items-center gap-3 opacity-60">
                            <svg
                              className="h-12 w-12"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={1}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 4.5v15m7.5-7.5h-15"
                              />
                            </svg>
                            <span>从侧边栏拖拽对话到此处</span>
                          </div>
                        </div>
                      ) : (
                        <ChatArea conversationId={convId} onOpenSidebar={onOpenSidebar} />
                      )}
                    </MultiWindowDropZone>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  );
}

export function LayoutSwitcher() {
  const { settings, setSettings } = useChatStore();
  const currentLayout = settings.windowLayout || 'single';

  const layouts = [
    { id: 'single', icon: Maximize2, label: '单窗口', colorVar: '--guide-9' },
    { id: 'horizontal', icon: Columns, label: '并排', colorVar: '--guide-7' },
    { id: 'vertical', icon: Rows, label: '堆叠', colorVar: '--guide-5' },
    { id: 'grid', icon: LayoutGrid, label: '网格', colorVar: '--guide-11' },
  ] as const;

  return (
    <div className="flex items-center rounded-2xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-muted))]/60 p-1">
      {layouts.map(({ id, icon: Icon, label, colorVar }) => {
        const isActive = currentLayout === id;
        const accentColor = `hsl(var(${colorVar}))`;
        const accentBg = `hsl(var(${colorVar}) / ${isActive ? '0.24' : '0.12'})`;

        return (
          <motion.button
            key={id}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSettings({ windowLayout: id })}
            className={`
            relative rounded-xl p-2.5 transition-all duration-500 group
            ${isActive ? 'text-primary' : 'text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--bg-surface))]/80 hover:text-[hsl(var(--text-main))]'}
          `}
            title={label}
          >
            <span
              className="relative z-10 flex h-6 w-6 items-center justify-center rounded-md"
              style={{ backgroundColor: accentBg, color: accentColor }}
            >
              <Icon size={16} />
            </span>
            {isActive && (
              <motion.div
                layoutId="layout-active-bg"
                className="absolute inset-0 rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))] shadow-sm"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
