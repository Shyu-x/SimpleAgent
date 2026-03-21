'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useChatStore } from '@/store/chatStore';
import { sendSSEChatMessage } from '@/lib/sse';
import Message from './Message';
import ChatInput, { ChatInputRef } from './ChatInput';
import ContentPreview, { useContentPreview } from './ContentPreview';
import {
  Bot,
  Zap,
  MessageSquare,
  Shield,
  Globe,
  Code2,
  ArrowDown,
  AlertTriangle,
  X,
  Maximize2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Attachment } from '@/types';

// 快速开始提示词
const QUICK_START_ITEMS = [
  { icon: Code2, label: '代码协作', text: '帮我重构这段 TypeScript 代码并说明原因' },
  { icon: Globe, label: '信息整理', text: '总结一下最近一周 AI 行业的重要进展' },
  { icon: MessageSquare, label: '产品文案', text: '给这个功能写 3 个不同风格的发布文案' },
  { icon: Shield, label: '方案评审', text: '审查这个系统设计，列出风险与优化建议' },
  { icon: Zap, label: '效率提升', text: '给我一个 30 分钟高效学习计划模板' },
];

export default function FocusModeChat() {
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const addMessage = useChatStore((state) => state.addMessage);
  const updateLastMessage = useChatStore((state) => state.updateLastMessage);
  const finalizeMessage = useChatStore((state) => state.finalizeMessage);
  const setFocusMode = useChatStore((state) => state.setFocusMode);
  const apiConfig = useChatStore((state) => state.apiConfig);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatInputRef = useRef<ChatInputRef>(null);
  const userScrolledRef = useRef(false);

  const { previewConfig, triggerPreview, closePreview } = useContentPreview();

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId),
    [conversations, activeConversationId]
  );

  // 检测用户滚动
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distanceToBottom < 140;
    userScrolledRef.current = !isAtBottom;
    setShowScrollToBottom(!isAtBottom);
  }, []);

  // 自动滚动到底部
  const scrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'auto') => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior,
      });
    }
  }, []);

  // 消息更新时自动滚动
  useEffect(() => {
    if (!userScrolledRef.current) {
      scrollToBottom(isLoading ? 'smooth' : 'auto');
    }
  }, [activeConversation?.messages.length, isLoading, scrollToBottom]);

  // 切换对话时重置滚动状态
  useEffect(() => {
    userScrolledRef.current = false;
    setShowScrollToBottom(false);
    requestAnimationFrame(() => scrollToBottom('auto'));
  }, [activeConversationId, scrollToBottom]);

  // 清理 AbortController
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // 发送消息
  const handleSendMessage = async (content: string, attachments?: Attachment[]) => {
    if (!activeConversationId) return;
    if (abortControllerRef.current) abortControllerRef.current.abort();

    if (!apiConfig.model) {
      setError('请先在设置中选择一个模型');
      return;
    }

    setError(null);
    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    const userMessage = {
      id: `msg_${Date.now()}`,
      role: 'user' as const,
      content,
      createdAt: Date.now(),
      attachments,
    };
    addMessage(activeConversationId, userMessage);

    const assistantMessage = {
      id: `msg_${Date.now() + 1}`,
      role: 'assistant' as const,
      content: '',
      createdAt: Date.now(),
      isComplete: false,
    };
    addMessage(activeConversationId, assistantMessage);

    const messages = [
      ...(activeConversation?.messages || []).map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: 'user' as const, content },
    ];

    try {
      const assistantMessageId = assistantMessage.id;
      await sendSSEChatMessage(
        apiConfig.apiKey,
        apiConfig.baseURL,
        apiConfig.model,
        messages,
        {
          signal: abortControllerRef.current.signal,
          onMessage: (chunk) => {
            const conv = useChatStore.getState().conversations.find((c) => c.id === activeConversationId);
            if (conv && conv.messages.length > 0) {
              updateLastMessage(activeConversationId, conv.messages[conv.messages.length - 1].content + chunk);
            }
          },
          onError: (err) => {
            setError(err.message);
            setIsLoading(false);
          },
          onComplete: () => {
            finalizeMessage(activeConversationId, assistantMessageId);
            setIsLoading(false);
          },
        }
      );
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        setError(err instanceof Error ? err.message : '消息发送失败');
      }
      setIsLoading(false);
    }
  };

  // 回到底部
  const handleBackToBottom = () => {
    userScrolledRef.current = false;
    setShowScrollToBottom(false);
    scrollToBottom('smooth');
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[hsl(var(--bg-app))]">
      {/* 顶部留白和退出按钮 */}
      <div className="shrink-0 px-8 pt-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[hsl(var(--brand-700))] shadow-lg shadow-primary/20">
              <Maximize2 size={18} className="text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[hsl(var(--text-main))]">专注模式</h1>
              <p className="text-xs text-[hsl(var(--text-muted))]">
                {activeConversation?.title || '新对话'}
              </p>
            </div>
          </div>

          {/* 退出按钮 */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setFocusMode(false)}
            className="flex items-center gap-2 rounded-2xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/90 px-4 py-2 text-sm font-medium text-[hsl(var(--text-muted))] backdrop-blur-xl shadow-sm transition-all hover:border-primary/40 hover:text-primary"
          >
            <X size={16} />
            退出专注
          </motion.button>
        </div>
      </div>

      {/* 消息区域 - 最大化展示 */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="custom-scrollbar flex-1 overflow-y-auto px-8 py-6"
      >
        <div className="mx-auto max-w-3xl">
          {!activeConversation?.messages.length ? (
            // 欢迎界面
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex min-h-[60vh] flex-col items-center justify-center text-center"
            >
              <motion.div
                initial={{ scale: 0.88, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative mb-10"
              >
                <div className="absolute inset-0 rounded-full bg-primary/20 blur-[72px]" />
                <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-[hsl(var(--brand-700))] shadow-2xl shadow-primary/25">
                  <Bot size={56} className="text-primary-foreground" />
                </div>
              </motion.div>

              <div className="max-w-xl space-y-3">
                <h2 className="text-4xl font-semibold tracking-tight text-[hsl(var(--text-main))]">
                  专注此刻
                </h2>
                <p className="text-base text-[hsl(var(--text-muted))]">
                  减少干扰，沉浸思考。支持代码协作、方案评审、信息整合与创作。
                </p>
              </div>

              <div className="mt-10 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
                {QUICK_START_ITEMS.map(({ icon: Icon, label, text }, index) => (
                  <motion.button
                    key={label}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + index * 0.06 }}
                    onClick={() => chatInputRef.current?.setInputValue(text)}
                    className="group flex flex-col items-start gap-3 rounded-2xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/80 p-5 text-left transition-all hover:border-primary/30 hover:bg-[hsl(var(--bg-surface))] hover:shadow-lg"
                  >
                    <div className="rounded-xl bg-primary/10 p-2.5 text-primary transition-colors group-hover:bg-primary/15">
                      <Icon size={18} />
                    </div>
                    <span className="text-sm font-semibold text-[hsl(var(--text-main))]">{label}</span>
                    <span className="line-clamp-2 text-sm text-[hsl(var(--text-muted))]">{text}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ) : (
            // 消息列表
            <div className="space-y-6">
              {activeConversation.messages.map((message, index) => {
                const isLast = index === activeConversation.messages.length - 1;
                const getMessageStatus = () => {
                  if (message.role === 'user') return 'complete' as const;
                  if (isLast && !message.isComplete) return 'streaming' as const;
                  return 'complete' as const;
                };

                return (
                  <Message
                    key={message.id}
                    message={message}
                    isLast={isLast}
                    status={getMessageStatus()}
                    onPreviewLink={triggerPreview}
                  />
                );
              })}

              {/* AI 思考中动画 */}
              <AnimatePresence>
                {isLoading && activeConversation.messages.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-start gap-4 py-4"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/98 backdrop-blur-xl">
                      <Bot size={20} className="text-[hsl(var(--brand-500))]" />
                    </div>
                    <div className="flex items-center gap-3 rounded-3xl rounded-tl-none border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/98 px-5 py-3.5 shadow-md backdrop-blur-xl">
                      <div className="flex gap-1.5">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--brand-500))]"
                            animate={{
                              scale: [1, 1.4, 1],
                              opacity: [0.5, 1, 0.5],
                            }}
                            transition={{
                              duration: 0.8,
                              repeat: Infinity,
                              delay: i * 0.15,
                            }}
                          />
                        ))}
                      </div>
                      <span className="text-sm text-[hsl(var(--text-muted))]">正在思考...</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* 回到底部按钮 */}
      <AnimatePresence>
        {showScrollToBottom && (activeConversation?.messages.length ?? 0) > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            onClick={handleBackToBottom}
            className="absolute bottom-32 right-12 z-20 inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/95 px-4 py-2 text-sm font-medium text-[hsl(var(--text-main))] shadow-lg backdrop-blur transition-all hover:bg-[hsl(var(--bg-surface))]"
          >
            <ArrowDown size={14} />
            回到底部
          </motion.button>
        )}
      </AnimatePresence>

      {/* 错误提示 */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="absolute bottom-32 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-destructive px-5 py-2.5 text-sm font-medium text-destructive-foreground shadow-xl"
          >
            <AlertTriangle size={14} />
            {error}
            <button onClick={() => setError(null)} className="ml-1 opacity-90 transition-opacity hover:opacity-70">
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 底部输入框 - 磨砂玻璃效果 */}
      <div className="shrink-0 px-8 pb-8">
        <div className="mx-auto max-w-3xl">
          <div className="relative rounded-3xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/90 shadow-xl backdrop-blur-xl">
            <div className="px-4 pb-4 pt-4">
              <ChatInput ref={chatInputRef} onSend={handleSendMessage} disabled={isLoading} />
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-[hsl(var(--text-muted))]">
            按 <kbd className="rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/80 px-1.5 py-0.5 font-mono">ESC</kbd> 退出专注模式
          </p>
        </div>
      </div>

      <ContentPreview config={previewConfig} onClose={closePreview} />
    </div>
  );
}
