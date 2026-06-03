'use client';

/**
 * TabletLayout - iPad 768-1024px 中间布局
 *
 * 简化版本: 占位实现, 通过 CSS 提供平板特定样式
 * 实际桌面布局的所有逻辑在 page.tsx isTablet 分支
 * Feature flag: NEXT_PUBLIC_TABLET_LAYOUT=true 启用
 *
 * 此组件作为可独立渲染的最小可用版本存在
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ConversationList from '@/components/ConversationList';
import { useUIStore } from '@/stores/uiStore';

const ChatArea = require('@/components/ChatArea').default;
const ChatInput = require('@/components/ChatInput').default;
const WelcomeGuide = require('@/components/WelcomeGuide').WelcomeGuide;

export default function TabletLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const settings = useUIStore((s) => s.settings);
  const animationsEnabled = settings.animationsEnabled;
  const showWelcomeGuide = useUIStore((s) => s.showWelcomeGuide);
  const setShowWelcomeGuide = useUIStore((s) => s.setShowWelcomeGuide);
  // messageStore 没 hasHydrated, 简单替代: 假设总是 hydrated
  const hasHydrated = true;

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            key="sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 240, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: animationsEnabled ? 0.2 : 0 }}
            className="flex-shrink-0 border-r border-border overflow-hidden"
          >
            <ConversationList />
          </motion.aside>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col min-w-0" style={{ fontSize: '1.05rem' }}>
        <div className="flex-1 overflow-hidden">
          <ChatArea />
        </div>
        <ChatInput />
      </main>

      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed top-1/2 left-2 -translate-y-1/2 z-30 p-2 rounded-r-md bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
          title="打开侧栏"
          aria-label="打开侧栏"
        >
          <span className="block w-1 h-8 rounded-full bg-current" />
        </button>
      )}

      <div className="fixed bottom-2 right-2 px-2 py-1 text-[10px] rounded bg-zinc-800/80 text-zinc-200 pointer-events-none z-50">
        Tablet 768-1024
      </div>

      {hasHydrated && showWelcomeGuide && (
        <WelcomeGuide onComplete={() => setShowWelcomeGuide(false)} />
      )}
    </div>
  );
}
