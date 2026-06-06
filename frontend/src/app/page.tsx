'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useChatStore } from '@/store/chatStore';
import {
  Menu,
  X,
  Settings as SettingsIcon,
  PanelRight,
  Bot,
  Wrench,
  BookOpen,
  Clock3,
  Maximize2,
  Minimize2,
  Shield,
} from 'lucide-react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useTranslations } from 'next-intl';
import ConversationList from '@/components/ConversationList';
import MultiWindowChat, { LayoutSwitcher } from '@/components/MultiWindowChat';
import FocusModeChat from '@/components/FocusModeChat';
import PromptSelector from '@/components/PromptSelector';
import { MemoryPanel } from '@/components/MemoryPanel';
import MultiAgentPanel from '@/components/MultiAgentPanel';
import KeyboardShortcuts from '@/components/KeyboardShortcuts';
import dynamic from 'next/dynamic';
const ToolMarketplace = dynamic(
  () => import('@/components/agent/ToolMarketplace'),
  { ssr: false }
);
import { ToastProvider } from '@/components/Toast';
import { MobileExperienceProvider, MobileLayout } from '@/components/mobile';
import KnowledgeBaseManager from '@/components/KnowledgeBaseManager';
import Settings from '@/components/Settings';
import { useHITLSSE } from '@/hooks/useHITLSSE';
import { useWindowHotkeys } from '@/hooks/useWindowHotkeys';
import HumanConfirmationDialog, { type ConfirmationRequest, type ConfirmationResponse } from '@/components/agent/HumanConfirmationDialog';

type SidePanelContent = 'none' | 'memory' | 'agents' | 'tools' | 'kb' | 'settings';
type PanelTab = {
  id: Exclude<SidePanelContent, 'none'>;
  key: 'settings' | 'memory' | 'agents' | 'tools' | 'knowledgeBase';
  icon: LucideIcon;
  colorVar: string;
};

const SIDE_PANEL_TABS: PanelTab[] = [
  { id: 'settings', key: 'settings', icon: SettingsIcon, colorVar: '--guide-10' },
  { id: 'memory', key: 'memory', icon: PanelRight, colorVar: '--guide-8' },
  { id: 'agents', key: 'agents', icon: Bot, colorVar: '--guide-5' },
  { id: 'tools', key: 'tools', icon: Wrench, colorVar: '--guide-3' },
  { id: 'kb', key: 'knowledgeBase', icon: BookOpen, colorVar: '--guide-7' },
];

// 禁用 SSR 防止 WelcomeGuide hydration mismatch
const WelcomeGuide = dynamic(
  () => import('@/components/WelcomeGuide').then((m) => m.WelcomeGuide),
  { ssr: false }
);

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);
  return matches;
}

export default function Home() {
  const t = useTranslations('page');
  const tConv = useTranslations('conversation');
  const tCommon = useTranslations('common');
  const tHitl = useTranslations('hitl');
  const {
    settings,
    conversations,
    activeConversationId,
    hasHydrated,
    showWelcomeGuide,
    createConversation,
    setActiveConversation,
    setShowWelcomeGuide,
    rehydrate,
    appMode,
    focusMode,
    setFocusMode,
  } = useChatStore();

  // 触发 Zustand 状态恢复（使用 useRef 追踪初始状态，防止无限循环）
  const initRef = useRef(false);
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      rehydrate();
    }
  }, []);

  // 响应式断点 - 使用 Tailwind 默认断点 640px
  const isMobile = useMediaQuery('(max-width: 640px)');
  const isTablet = useMediaQuery('(min-width: 641px) and (max-width: 1024px)');
  const isTabletEnabled = process.env.NEXT_PUBLIC_TABLET_LAYOUT === 'true';
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidePanelContent, setSidePanelContent] = useState<SidePanelContent>('none');

  const [promptSelectorOpen, setPromptSelectorOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // 人机协作确认 Hook
  const hitlOptions = useMemo(() => ({
    autoConnect: true,
    enabled: true,
    onConnected: () => {},
    onError: (error) => console.error('[Page] HITL SSE error:', error),
    onConfirmation: () => {},
    onApproved: () => {},
    onRejected: () => {},
    onTimeout: () => {}
  }), []);

  // 窗口快捷键
  useWindowHotkeys();

  const {
    pendingConfirmations,
    currentConfirmation,
    isConnected,
    approve,
    reject,
    connect
  } = useHITLSSE(hitlOptions);

  // 尝试连接 SSE（如果未连接）
  const stableConnect = useCallback(() => {
    if (!isConnected) {
      connect();
    }
  }, [isConnected, connect]);

  useEffect(() => {
    stableConnect();
  }, [stableConnect]);

  // ESC 键关闭侧面板或退出专注模式，Ctrl+/ 打开快捷键帮助，Ctrl+K 打开知识库
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + / 打开快捷键帮助
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      // Ctrl + K 打开知识库
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        setSidePanelContent((prev) => (prev === 'kb' ? 'none' : 'kb'));
        return;
      }
      if (e.key === 'Escape') {
        if (shortcutsOpen) {
          setShortcutsOpen(false);
        } else if (focusMode) {
          setFocusMode(false);
        } else if (sidePanelContent !== 'none') {
          setSidePanelContent('none');
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [sidePanelContent, focusMode, shortcutsOpen, setFocusMode, setShortcutsOpen]);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );
  const desktopPalette = settings.desktopPalette || 'aurora';

  // 移动端初始化sidebar关闭
  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  // 统一管理主题 - 在根元素上应用主题
  useEffect(() => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolvedTheme = settings.theme === 'system'
      ? (prefersDark ? 'dark' : 'light')
      : settings.theme;

    root.dataset.theme = settings.theme;
    root.dataset.themeResolved = resolvedTheme;
    root.dataset.palette = desktopPalette;

    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.theme, desktopPalette]);

  useEffect(() => {
    if (!hasHydrated) return;

    if (conversations.length === 0) {
      createConversation();
      return;
    }

    const hasActiveConversation = activeConversationId
      ? conversations.some((item) => item.id === activeConversationId)
      : false;

    if (!hasActiveConversation) {
      setActiveConversation(conversations[0].id);
    }
  }, [
    activeConversationId,
    conversations,
    createConversation,
    hasHydrated,
    setActiveConversation,
  ]);

  // 监听系统主题变化
  useEffect(() => {
    if (settings.theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const root = document.documentElement;
      root.dataset.themeResolved = mediaQuery.matches ? 'dark' : 'light';
      if (mediaQuery.matches) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [settings.theme]);

  // ===== 移动端专用布局 =====
  if (isMobile) {
    return (
      <ToastProvider>
        <MobileExperienceProvider>
          <MobileLayout />
          <PromptSelector isOpen={promptSelectorOpen} onClose={() => setPromptSelectorOpen(false)} />
          {hasHydrated && showWelcomeGuide && <WelcomeGuide onComplete={() => setShowWelcomeGuide(false)} />}
        </MobileExperienceProvider>
      </ToastProvider>
    );
  }

  // ===== 平板端专用布局 (iPad 768-1024px, feature flag 控制) =====
  if (isTablet && isTabletEnabled) {
    const TabletLayout = require('@/components/TabletLayout').default;
    return <TabletLayout />;
  }

  // ===== 桌面端布局 =====
  // Focus Mode - 全屏沉浸式聊天
  if (focusMode) {
    return (
      <ToastProvider>
        <FocusModeChat />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <MobileExperienceProvider>
        <div className={`desktop-shell desktop-theme-${desktopPalette} relative flex h-screen w-full max-w-[100vw] overflow-hidden bg-[hsl(var(--bg-app))] transition-colors duration-500`}>
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-[hsl(var(--brand-500))]/10 blur-3xl" />
            <div className="absolute -right-28 bottom-0 h-80 w-80 rounded-full bg-[hsl(var(--accent-500))]/10 blur-3xl" />
          </div>

          <LayoutGroup>
            {/* 1. 侧边栏 - 仅桌面端显示 */}
            <AnimatePresence initial={false}>
              {sidebarOpen && (
                <motion.aside
                  layout
                  initial={{ x: -24, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -24, opacity: 0 }}
                  transition={{ type: 'spring', damping: 28, stiffness: 260 }}
                  className="relative z-30 my-3 ml-3 w-[292px] shrink-0 overflow-hidden rounded-3xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/94 shadow-xl backdrop-blur-xl"
                >
                  <ConversationList onCloseSidebar={() => setSidebarOpen(false)} />
                </motion.aside>
              )}
            </AnimatePresence>

            {/* 2. 主内容区域 - 桌面端 */}
            <motion.main layout className="relative z-20 flex min-w-0 min-h-0 flex-1 flex-col">
              {/* 桌面端 Header */}
              <header className="mx-3 mt-3 flex h-16 shrink-0 items-center justify-between rounded-3xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/92 px-5 shadow-sm backdrop-blur-xl">
                <div className="flex items-center gap-4">
                  {!sidebarOpen && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setSidebarOpen(true)}
                      className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/96 p-2 text-[hsl(var(--text-muted))] transition-all hover:border-[hsl(var(--border-strong))] hover:text-primary active:scale-95"
                    >
                      <Menu size={20} />
                    </motion.button>
                  )}

                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[hsl(var(--text-main))]">
                      {activeConversation?.title || t('newChat')}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-[hsl(var(--text-muted))]">
                      <Clock3 size={12} />
                      {activeConversation
                        ? new Date(activeConversation.updatedAt).toLocaleString('zh-CN', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : t('justNow')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <LayoutSwitcher />
                  <div className="h-6 w-px bg-[hsl(var(--border-subtle))]" />

                  {/* Agent 专属入口 - 高亮醒目按钮 */}
                  <Link
                    href="/agent"
                    className="relative flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all border border-primary/50 bg-primary/8 text-primary hover:bg-primary/16 hover:border-primary/70"
                    title={t('agentModeTitle')}
                  >
                    <Bot size={14} />
                    <span className="relative">{t('agentMode')}</span>
                  </Link>

                  <div className="h-6 w-px bg-[hsl(var(--border-subtle))]" />

                  {/* Focus Mode 专注模式按钮 */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setFocusMode(!focusMode)}
                    className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                      focusMode
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'border border-[hsl(var(--border-subtle))] text-[hsl(var(--text-muted))] hover:border-primary/40 hover:text-primary'
                    }`}
                    title={focusMode ? t('exitFocusModeTitle') : t('focusModeTitle')}
                  >
                    {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    {focusMode ? t('exitFocusMode') : t('focusMode')}
                  </motion.button>

                  <div className="h-6 w-px bg-[hsl(var(--border-subtle))]" />

                  {/* 管理后台入口 */}
                  <Link
                    href="/admin"
                    className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium border border-[hsl(var(--border-subtle))] text-[hsl(var(--text-muted))] hover:border-primary/40 hover:text-primary transition-all"
                    title={t('adminTitle')}
                  >
                    <Shield size={14} />
                    <span className="hidden xl:inline">{t('admin')}</span>
                  </Link>

                  <div className="h-6 w-px bg-[hsl(var(--border-subtle))]" />

                  <div className="flex items-center gap-1 rounded-2xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/90 p-1 backdrop-blur">
                    {SIDE_PANEL_TABS.map(({ id, icon: Icon, key, colorVar }) => {
                      const isActive = sidePanelContent === id;
                      const accentColor = `hsl(var(${colorVar}))`;
                      const accentBg = `hsl(var(${colorVar}) / ${isActive ? '0.24' : '0.12'})`;
                      const isKb = id === 'kb';
                      const label = tCommon(key);

                      return (
                        <motion.button
                          key={id}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setSidePanelContent(isActive ? 'none' : id)}
                          className={`relative rounded-xl p-1.5 transition-all duration-300 ${
                            isActive
                              ? 'bg-[hsl(var(--bg-surface))] shadow-sm ring-1 ring-primary/20'
                              : 'text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--bg-surface))]/96'
                          }`}
                          title={isKb ? `${label} (Ctrl+K)` : label}
                        >
                          {/* 快捷键提示徽章 */}
                          {isKb && !isActive && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 opacity-75" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                            </span>
                          )}
                          <span
                            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
                            style={{ backgroundColor: accentBg, color: accentColor }}
                          >
                            <Icon size={16} />
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              </header>

              {/* 桌面端聊天视窗 / 专注模式 */}
                  <div className="flex-1 overflow-hidden px-3 pb-3 pt-2">
                    <div className="h-full overflow-hidden rounded-3xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/82 shadow-xl backdrop-blur">
                      <AnimatePresence mode="wait">
                        {focusMode ? (
                          <motion.div
                            key="focus-mode"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                            className="h-full w-full"
                          >
                            <FocusModeChat />
                          </motion.div>
                        ) : (
                          <motion.div
                            key="multi-window-chat"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                            className="h-full w-full"
                          >
                            <MultiWindowChat
                              layout={settings.windowLayout || 'single'}
                              onOpenSidebar={() => setSidebarOpen(true)}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
            </motion.main>

          </LayoutGroup>

          {sidePanelContent === 'settings' && <Settings hideTrigger autoOpen />}
          {sidePanelContent === 'memory' && activeConversationId && (
            <MemoryPanel
              conversationId={activeConversationId}
              isOpen={true}
              layout="modal"
              onClose={() => setSidePanelContent('none')}
            />
          )}
          {sidePanelContent === 'agents' && <MultiAgentPanel isOpen={true} onClose={() => setSidePanelContent('none')} />}
          {sidePanelContent === 'tools' && <ToolMarketplace isOpen={true} onClose={() => setSidePanelContent('none')} />}

          <AnimatePresence>
            {sidePanelContent === 'kb' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
                onClick={() => setSidePanelContent('none')}
              >
                <motion.div
                  initial={{ y: 18, opacity: 0, scale: 0.985 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={{ y: 18, opacity: 0, scale: 0.985 }}
                  transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                  className="relative flex h-[92vh] w-full max-w-[1240px] overflow-hidden rounded-3xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/98 shadow-2xl backdrop-blur-xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    onClick={() => setSidePanelContent('none')}
                    className="absolute right-4 top-4 z-20 rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/95 p-2 text-[hsl(var(--text-muted))] transition-colors hover:text-[hsl(var(--text-main))]"
                    aria-label="关闭知识库面板"
                  >
                    <X size={18} />
                  </button>
                  <KnowledgeBaseManager className="h-full w-full rounded-none border-0 shadow-none" />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <KeyboardShortcuts isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        <PromptSelector isOpen={promptSelectorOpen} onClose={() => setPromptSelectorOpen(false)} />
        {showWelcomeGuide && <WelcomeGuide onComplete={() => setShowWelcomeGuide(false)} />}

        {/* 人机协作确认对话框 */}
        {currentConfirmation && (
          <HITLConfirmationDialogWrapper
            checkpoint={currentConfirmation}
            onApprove={approve}
            onReject={reject}
          />
        )}
      </MobileExperienceProvider>
    </ToastProvider>
  );
}

// 人机协作确认对话框包装器
interface HITLConfirmationDialogWrapperProps {
  checkpoint: {
    id: string;
    type: string;
    title: string;
    description?: string;
    context?: Record<string, unknown>;
    createdAt: number;
  };
  onApprove: (checkpointId: string, option?: string, comment?: string) => Promise<{ success: boolean }>;
  onReject: (checkpointId: string, reason?: string) => Promise<{ success: boolean }>;
}

function HITLConfirmationDialogWrapper({ checkpoint, onApprove, onReject }: HITLConfirmationDialogWrapperProps) {
  const tHitl = useTranslations('hitl');
  const typeMap: Record<string, 'action' | 'permission' | 'data_access' | 'external_call' | 'file_operation' | 'code_execution' | 'cost_warning' | 'sensitive_data'> = {
    high_risk: 'action',
    decision: 'action',
    action: 'action',
    data_access: 'data_access',
    external_call: 'external_call',
    file_operation: 'file_operation',
    code_execution: 'code_execution',
    cost_limit: 'cost_warning',
    sensitive_data: 'sensitive_data'
  };

  const request: ConfirmationRequest = {
    id: checkpoint.id,
    type: typeMap[checkpoint.type] || 'action',
    title: checkpoint.title,
    message: checkpoint.description || tHitl('defaultMessage'),
    details: checkpoint.context?.reason as string | undefined,
    dataPreview: checkpoint.context?.input ? JSON.stringify(checkpoint.context.input, null, 2) : undefined,
    options: [
      { id: 'confirm', label: tHitl('confirm'), description: tHitl('confirmDesc'), style: 'primary' as const, value: 'confirm' },
      { id: 'cancel', label: tHitl('cancelOp'), description: tHitl('cancelDesc'), style: 'danger' as const, value: 'cancel' }
    ],
    timeout: 60,
    allowSkip: false
  };

  const handleConfirm = async (response: ConfirmationResponse) => {
    if (response.selectedOption === 'confirm') {
      await onApprove(checkpoint.id, 'confirm');
    } else {
      await onReject(checkpoint.id, tHitl('userCancel'));
    }
  };

  const handleDismiss = async () => {
    await onReject(checkpoint.id, tHitl('userDismiss'));
  };

  return (
    <HumanConfirmationDialog
      request={request}
      onConfirm={handleConfirm}
      onDismiss={handleDismiss}
    />
  );
}
