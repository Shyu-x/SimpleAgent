'use client';

import { useState, useMemo, useCallback } from 'react';
import { useChatStore } from '@/store/chatStore';
import MobileChatArea from './MobileChatArea';
import dynamic from 'next/dynamic';
import {
  MessageSquare,
  Settings as SettingsIcon,
  Plus,
  Search,
  ChevronLeft,
  Bot,
  Users,
  StickyNote,
  Trash2,
  Sun,
  Moon,
  Sparkles,
  Code2,
  FileSearch,
  PenTool,
  ClipboardList,
  Sparkles as SparklesIcon,
  ArrowLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// 动态导入 AgentWorkspace 避免 SSR 问题
const AgentWorkspace = dynamic(
  () => import('@/components/agent/AgentWorkspace').then((m) => m.default),
  { ssr: false }
);

type MobileView = 'chat' | 'conversations' | 'settings' | 'agents' | 'memory';

// 移动端动画变体 - 基于ui-ux-pro-max优化
const mobilePageVariants = {
  enter: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

const mobileSlideVariants = {
  enter: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

export default function MobileLayout() {
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const createConversation = useChatStore((state) => state.createConversation);
  const setActiveConversation = useChatStore((state) => state.setActiveConversation);
  const appMode = useChatStore((state) => state.appMode);
  const setAppMode = useChatStore((state) => state.setAppMode);

  const [currentView, setCurrentView] = useState<MobileView>('chat');

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  const handleNewChat = useCallback(() => {
    createConversation();
    setCurrentView('chat');
  }, [createConversation]);

  return (
    <div className="safe-area-top flex h-[100dvh] w-full flex-col overflow-hidden bg-[hsl(var(--bg-app))]">
      <MobileHeader
        currentView={currentView}
        title={activeConversation?.title || 'AI Nexus'}
        onMenuClick={() => setCurrentView('conversations')}
        onBack={currentView !== 'chat' ? () => setCurrentView('chat') : undefined}
        onNewChat={handleNewChat}
        onSettingsClick={() => setCurrentView('settings')}
      />

      <main className="min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {/* Agent 模式全屏工作区 */}
          {appMode === 'agent' && (
            <motion.section
              key="agent-workspace"
              variants={mobilePageVariants}
              initial="enter"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="h-full"
            >
              <div className="flex h-full flex-col">
                {/* Agent 模式顶部提示条 */}
                <div className="flex items-center justify-between border-b border-primary/20 bg-primary/5 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Bot size={14} className="text-primary" />
                    <span className="text-xs font-medium text-primary">Agent 模式</span>
                  </div>
                  <button
                    onClick={() => setAppMode('chat')}
                    className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                  >
                    <ArrowLeft size={12} />
                    返回聊天
                  </button>
                </div>
                {/* Agent 工作区 */}
                <div className="flex-1 overflow-hidden">
                  <AgentWorkspace className="h-full w-full" />
                </div>
              </div>
            </motion.section>
          )}

          {appMode === 'chat' && currentView === 'chat' && (
            <motion.section
              key="chat"
              variants={mobilePageVariants}
              initial="enter"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="h-full"
            >
              <MobileChatArea />
            </motion.section>
          )}

          {currentView === 'conversations' && (
            <motion.section
              key="conversations"
              variants={mobileSlideVariants}
              initial="enter"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="h-full"
            >
              <MobileConversationList
                onSelectChat={(id) => {
                  setActiveConversation(id);
                  setCurrentView('chat');
                }}
                onNewChat={handleNewChat}
              />
            </motion.section>
          )}

          {currentView === 'settings' && (
            <motion.section
              key="settings"
              variants={mobileSlideVariants}
              initial="enter"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="h-full overflow-y-auto px-3 pb-4 pt-3"
            >
              <MobileSettingsView />
            </motion.section>
          )}

          {currentView === 'agents' && (
            <motion.section
              key="agents"
              variants={mobileSlideVariants}
              initial="enter"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="h-full overflow-y-auto px-3 pb-4 pt-3"
            >
              <MobileAgentsView />
            </motion.section>
          )}

          {currentView === 'memory' && (
            <motion.section
              key="memory"
              variants={mobileSlideVariants}
              initial="enter"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="h-full overflow-y-auto px-3 pb-4 pt-3"
            >
              <MobileMemoryView />
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      <MobileBottomNav
        currentView={currentView}
        onViewChange={setCurrentView}
        appMode={appMode}
        onModeChange={setAppMode}
      />
    </div>
  );
}

function MobileHeader({
  currentView,
  title,
  onMenuClick,
  onBack,
  onNewChat,
  onSettingsClick,
}: {
  currentView: MobileView;
  title: string;
  onMenuClick: () => void;
  onBack?: () => void;
  onNewChat: () => void;
  onSettingsClick: () => void;
}) {
  const viewTitle =
    currentView === 'chat'
      ? title
      : currentView === 'conversations'
        ? '对话'
        : currentView === 'settings'
          ? '设置'
          : currentView === 'agents'
            ? '智能体'
            : '记忆';

  return (
    // 紧凑型移动端Header - 48px高度
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))] px-3 shadow-sm dark:shadow-none">
      <div className="flex min-w-0 items-center gap-1.5">
        {onBack ? (
          <button
            onClick={onBack}
            // 44px 触摸目标
            className="mobile-touch-target mobile-press-scale flex items-center justify-center rounded-lg text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--bg-muted))] hover:text-[hsl(var(--text-main))]"
            aria-label="返回"
          >
            <ChevronLeft size={20} />
          </button>
        ) : (
          <button
            onClick={onMenuClick}
            className="mobile-touch-target mobile-press-scale flex items-center justify-center rounded-lg text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--bg-muted))] hover:text-[hsl(var(--text-main))]"
            aria-label="菜单"
          >
            <MessageSquare size={18} />
          </button>
        )}

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[hsl(var(--text-main))]">{viewTitle}</p>
          <p className="text-[9px] text-[hsl(var(--text-muted))]">
            {currentView === 'chat' ? '移动端会话' : '移动端工作区'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-0.5">
        <button
          onClick={onNewChat}
          className="mobile-touch-target mobile-press-scale flex items-center justify-center rounded-lg text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--bg-muted))] hover:text-[hsl(var(--text-main))]"
          aria-label="新建对话"
        >
          <Plus size={18} />
        </button>
        <button
          onClick={onSettingsClick}
          className="mobile-touch-target mobile-press-scale flex items-center justify-center rounded-lg text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--bg-muted))] hover:text-[hsl(var(--text-main))]"
          aria-label="设置"
        >
          <SettingsIcon size={18} />
        </button>
      </div>
    </header>
  );
}

function MobileBottomNav({
  currentView,
  onViewChange,
  appMode,
  onModeChange,
}: {
  currentView: MobileView;
  onViewChange: (view: MobileView) => void;
  appMode: 'chat' | 'agent';
  onModeChange: (mode: 'chat' | 'agent') => void;
}) {
  // 移动端底部导航 - 符合 ui-ux-pro-max 规则
  // - 最多5个item
  // - 图标+文字标签
  // - 44px+ 触摸目标
  const items: Array<{ id: MobileView | 'agent-mode'; label: string; icon: typeof MessageSquare; isAgentTrigger?: boolean }> = [
    { id: 'chat', label: '聊天', icon: MessageSquare },
    { id: 'agent-mode', label: 'Agent', icon: Bot, isAgentTrigger: true },
    { id: 'memory', label: '记忆', icon: StickyNote },
    { id: 'conversations', label: '历史', icon: Search },
  ];

  return (
    // 紧凑型底部导航 - 52px
    <nav className="safe-area-bottom grid h-13 shrink-0 grid-cols-4 border-t border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))] dark:shadow-none">
      {items.map(({ id, label, icon: Icon, isAgentTrigger }) => {
        const isActive = isAgentTrigger ? appMode === 'agent' : currentView === id;
        const isAgentTab = isAgentTrigger && appMode === 'agent';

        return (
          <button
            key={id}
            onClick={() => {
              if (isAgentTrigger) {
                onModeChange(appMode === 'agent' ? 'chat' : 'agent');
              } else {
                onViewChange(id as MobileView);
              }
            }}
            // 触摸目标优化：确保44px+高度
            className={`mobile-press-scale flex flex-col items-center justify-center gap-0.5 text-[10px] transition-colors ${
              isActive
                ? 'text-primary'
                : 'text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text-main))]'
            }`}
            // 无障碍支持
            aria-current={isActive ? 'page' : undefined}
          >
            {/* 图标容器：26px 符合44px触摸目标要求 */}
            <span className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${isActive ? 'bg-primary/12' : ''}`}>
              <Icon size={18} className={isAgentTab ? 'text-primary' : ''} />
            </span>
            <span className="font-medium leading-tight">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function MobileConversationList({
  onSelectChat,
  onNewChat,
}: {
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
}) {
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const deleteConversation = useChatStore((state) => state.deleteConversation);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return conversations;

    return conversations.filter((conv) => {
      const title = (conv.title || '').toLowerCase();
      const last = (conv.messages[conv.messages.length - 1]?.content || '').toLowerCase();
      return title.includes(search) || last.includes(search);
    });
  }, [conversations, query]);

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))] px-3 py-2.5">
        <button
          onClick={onNewChat}
          className="mobile-button mobile-press-scale inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-md shadow-primary/15"
        >
          <Plus size={14} />
          新建对话
        </button>

        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[hsl(var(--text-muted))]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索对话"
            className="mobile-input w-full rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))] text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
          />
        </div>
      </div>

      <div className="custom-scrollbar flex-1 space-y-1 overflow-y-auto p-1.5">
        {filtered.map((conversation) => {
          const isActive = activeConversationId === conversation.id;
          const lastMessage = conversation.messages[conversation.messages.length - 1]?.content || '开始新的对话';

          return (
            <div
              key={conversation.id}
              onClick={() => onSelectChat(conversation.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectChat(conversation.id);
                }
              }}
              role="button"
              tabIndex={0}
              className={`mobile-press-scale mobile-touch-expand group w-full rounded-xl border px-2.5 py-2 text-left transition-colors ${
                isActive
                  ? 'border-primary/30 bg-[hsl(var(--bg-surface))] shadow-sm ring-1 ring-primary/10'
                  : 'border-transparent hover:border-[hsl(var(--border-subtle))] hover:bg-[hsl(var(--bg-surface))] active:bg-[hsl(var(--bg-surface))]'
              }`}
            >
              <div className="flex items-start gap-2">
                <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                  isActive ? 'bg-primary text-primary-foreground' : 'bg-[hsl(var(--bg-muted))] text-[hsl(var(--text-muted))]'
                }`}>
                  <MessageSquare size={13} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-[hsl(var(--text-main))]">
                      {conversation.title || '新对话'}
                    </span>
                    <span className="text-[9px] text-[hsl(var(--text-muted))]">{formatTime(conversation.updatedAt)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-[hsl(var(--text-muted))]">{lastMessage}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(conversation.id);
                  }}
                  className="mobile-touch-target mobile-press-opacity flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[hsl(var(--text-muted))] opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  aria-label="删除会话"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-[hsl(var(--text-muted))]">
            <Search size={22} className="opacity-25" />
            <p className="text-[11px]">没有匹配到会话</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MobileSettingsView() {
  const settings = useChatStore((state) => state.settings);
  const setSettings = useChatStore((state) => state.setSettings);
  const palette = settings.desktopPalette || 'aurora';
  const palettes = [
    { id: 'aurora', label: '极光', dots: ['hsl(var(--guide-8))', 'hsl(var(--guide-10))', 'hsl(var(--guide-12))'] },
    { id: 'mint', label: '薄荷', dots: ['hsl(var(--guide-5))', 'hsl(var(--guide-6))', 'hsl(var(--guide-8))'] },
    { id: 'sunset', label: '落日', dots: ['hsl(var(--guide-1))', 'hsl(var(--guide-3))', 'hsl(var(--guide-10))'] },
  ] as const;

  return (
    <div className="space-y-2.5">
      <section className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]">
        <h3 className="text-[13px] font-semibold text-[hsl(var(--text-main))]">主题</h3>
        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          {[
            { id: 'light', label: '浅色', icon: Sun },
            { id: 'dark', label: '深色', icon: Moon },
            { id: 'system', label: '系统', icon: Sparkles },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSettings({ theme: id as 'light' | 'dark' | 'system' })}
              className={`mobile-button mobile-press-scale flex items-center justify-center gap-1 rounded-lg border text-[11px] font-medium ${
                settings.theme === id
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-[hsl(var(--border-subtle))] text-[hsl(var(--text-muted))]'
              }`}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]">
        <h3 className="text-[13px] font-semibold text-[hsl(var(--text-main))]">桌面配色</h3>
        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          {palettes.map((item) => (
            <button
              key={item.id}
              onClick={() => setSettings({ desktopPalette: item.id })}
              className={`rounded-lg border p-1.5 text-left ${
                palette === item.id ? 'border-primary/40 bg-primary/10' : 'border-[hsl(var(--border-subtle))]'
              }`}
            >
              <div className="mb-1.5 flex items-center gap-1">
                {item.dots.map((dot, idx) => (
                  <span key={idx} className="h-2 w-2 rounded-full" style={{ backgroundColor: dot }} />
                ))}
              </div>
              <div className="text-[10px] font-medium text-[hsl(var(--text-main))]">{item.label}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-[hsl(var(--text-main))]">动画</h3>
          <button
            onClick={() => setSettings({ animationsEnabled: !settings.animationsEnabled })}
            className={`relative h-6 w-10 rounded-full transition-colors ${
              settings.animationsEnabled ? 'bg-primary' : 'bg-[hsl(var(--border-strong))]'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white dark:bg-zinc-200 shadow-sm transition-transform ${
                settings.animationsEnabled ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </section>
    </div>
  );
}

function MobileAgentsView() {
  // 丰富的智能体配置 - 使用Lucide图标和生动纯色
  const agents = [
    {
      name: '代码助手',
      desc: '代码解释与重构',
      icon: Code2,
      bgColor: 'bg-blue-100',
      iconColor: 'text-blue-600',
      borderColor: 'border-blue-200',
    },
    {
      name: '研究助手',
      desc: '资料汇总与分析',
      icon: FileSearch,
      bgColor: 'bg-violet-100',
      iconColor: 'text-violet-600',
      borderColor: 'border-violet-200',
    },
    {
      name: '写作助手',
      desc: '文案与润色',
      icon: PenTool,
      bgColor: 'bg-amber-100',
      iconColor: 'text-amber-600',
      borderColor: 'border-amber-200',
    },
    {
      name: '规划助手',
      desc: '计划与任务拆解',
      icon: ClipboardList,
      bgColor: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
      borderColor: 'border-emerald-200',
    },
  ];

  // 动画变体
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: 'spring' as const,
        stiffness: 300,
        damping: 20,
      },
    },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 gap-3"
    >
      {agents.map((agent) => (
        <motion.div
          key={agent.name}
          variants={itemVariants}
          whileTap={{ scale: 0.97 }}
          className={`mobile-press-scale group relative rounded-xl border ${agent.borderColor} bg-[hsl(var(--bg-surface))] p-4 shadow-sm transition-all hover:shadow-md`}
        >
          {/* 图标容器 - 纯色背景 */}
          <div className={`relative mb-3 flex h-11 w-11 items-center justify-center rounded-xl ${agent.bgColor} shadow-sm`}>
            <agent.icon size={22} className={agent.iconColor} />
          </div>

          {/* 标题和描述 */}
          <p className="text-[14px] font-semibold text-[hsl(var(--text-main))]">{agent.name}</p>
          <p className="mt-1 text-[11px] text-[hsl(var(--text-muted))]">{agent.desc}</p>
        </motion.div>
      ))}
    </motion.div>
  );
}

function MobileMemoryView() {
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const activeConversation = conversations.find((item) => item.id === activeConversationId);

  return (
    <section className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]">
      <h3 className="text-[13px] font-semibold text-[hsl(var(--text-main))]">会话记忆</h3>
      <div className="mt-2.5 space-y-1.5 text-[11px] text-[hsl(var(--text-muted))]">
        <p>当前会话: {activeConversation?.title || '未选择'}</p>
        <p>消息数量: {activeConversation?.messages.length || 0}</p>
        <p>笔记数量: {activeConversation?.notes.length || 0}</p>
      </div>
    </section>
  );
}

