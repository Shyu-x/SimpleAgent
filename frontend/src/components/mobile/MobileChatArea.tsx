'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useChatStore } from '@/store/chatStore';
import { sendSSEChatMessage } from '@/lib/sse';
import Message from '@/components/Message';
import ChatInput, { ChatInputRef } from '@/components/ChatInput';
import ContentPreview, { useContentPreview } from '@/components/ContentPreview';
import { Bot, Zap, Globe, MessageSquare, Shield, ArrowDown, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Attachment } from '@/types';
import { useKeyboardHeight } from './LayoutAdapter';

const QUICK_PROMPTS = [
  { icon: Zap, label: '快速查询', text: '用三句话解释量子计算' },
  { icon: Globe, label: '信息整理', text: '整理今天的工作优先级，按紧急程度排序' },
  { icon: MessageSquare, label: '写作支持', text: '写一段产品更新公告，语气专业友好' },
  { icon: Shield, label: '方案评审', text: '帮我评审这个功能方案的潜在风险' },
];

export default function MobileChatArea() {
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const addMessage = useChatStore((state) => state.addMessage);
  const updateLastMessage = useChatStore((state) => state.updateLastMessage);
  const apiConfig = useChatStore((state) => state.apiConfig);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<ChatInputRef>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const userScrolledRef = useRef(false);

  // 键盘高度 - 用于在键盘弹出时调整输入区域位置
  const keyboardHeight = useKeyboardHeight();

  const { previewConfig, triggerPreview, closePreview } = useContentPreview();

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  const scrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'auto') => {
    if (!containerRef.current) return;
    containerRef.current.scrollTo({ top: containerRef.current.scrollHeight, behavior });
  }, []);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distance = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distance < 120;
    userScrolledRef.current = !isAtBottom;
    setShowScrollToBottom(!isAtBottom);
  }, []);

  useEffect(() => {
    if (!userScrolledRef.current) {
      scrollToBottom(isLoading ? 'smooth' : 'auto');
    }
  }, [activeConversation?.messages.length, isLoading, scrollToBottom]);

  useEffect(() => {
    userScrolledRef.current = false;
    setShowScrollToBottom(false);
    requestAnimationFrame(() => scrollToBottom('auto'));
  }, [activeConversationId, scrollToBottom]);

  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  const handleSendMessage = async (content: string, attachments?: Attachment[]) => {
    if (!activeConversationId) return;
    if (abortControllerRef.current) abortControllerRef.current.abort();

    if (!apiConfig.model) {
      setError('请先在设置中选择模型');
      return;
    }

    setError(null);
    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    addMessage(activeConversationId, {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
      createdAt: Date.now(),
      attachments,
    });

    addMessage(activeConversationId, {
      id: `msg_${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
    });

    const messages = [
      ...(activeConversation?.messages || []).map((message) => ({
        role: message.role,
        content: message.content,
      })),
      { role: 'user' as const, content },
    ];

    try {
      await sendSSEChatMessage(
        apiConfig.apiKey,
        apiConfig.baseURL,
        apiConfig.model,
        messages,
        {
          signal: abortControllerRef.current.signal,
          onMessage: (chunk) => {
            const conv = useChatStore.getState().conversations.find((item) => item.id === activeConversationId);
            if (!conv || conv.messages.length === 0) return;
            const prev = conv.messages[conv.messages.length - 1].content;
            updateLastMessage(activeConversationId, prev + chunk);
          },
          onError: (err) => {
            setError(err.message);
            setIsLoading(false);
          },
          onComplete: () => setIsLoading(false),
        }
      );
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        setError(err instanceof Error ? err.message : '消息发送失败');
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex h-full flex-col bg-transparent">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="custom-scrollbar flex-1 overflow-y-auto px-3 pb-2"
      >
        {!activeConversation?.messages.length ? (
          <div className="flex min-h-full flex-col items-center justify-center py-10 text-center">
            <motion.div
              initial={{ scale: 0.86, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative"
            >
              <div className="absolute inset-0 rounded-full bg-primary/20 blur-[54px]" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[hsl(var(--brand-700))] text-primary-foreground shadow-xl shadow-primary/25">
                <Bot size={26} />
              </div>
            </motion.div>

            <h2 className="mt-5 text-lg font-semibold text-[hsl(var(--text-main))]">开始新对话</h2>
            <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">选择一个提示词，或者直接输入你的问题</p>

            <div className="mt-5 w-full space-y-2">
              {QUICK_PROMPTS.map(({ icon: Icon, label, text }) => (
                <button
                  key={label}
                  onClick={() => chatInputRef.current?.setInputValue(text)}
                  className="flex w-full items-center gap-3 rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))] px-3 py-2.5 text-left shadow-sm transition-all active:scale-[0.99]"
                >
                  <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
                    <Icon size={15} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[hsl(var(--text-main))]">{label}</p>
                    <p className="truncate text-[11px] text-[hsl(var(--text-muted))]">{text}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-4">
            {activeConversation.messages.map((message, index) => (
              <Message
                key={message.id}
                message={message}
                isLast={index === activeConversation.messages.length - 1}
                onPreviewLink={triggerPreview}
              />
            ))}

            {isLoading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 flex gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[hsl(var(--bg-muted))]">
                  <Bot size={13} className="animate-pulse text-[hsl(var(--text-muted))]" />
                </div>
                <div className="mt-1 h-2 w-14 animate-pulse rounded-full bg-[hsl(var(--bg-muted))]" />
              </motion.div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showScrollToBottom && (activeConversation?.messages.length ?? 0) > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            onClick={() => {
              userScrolledRef.current = false;
              setShowScrollToBottom(false);
              scrollToBottom('smooth');
            }}
            className="absolute bottom-[104px] right-3 z-20 flex items-center gap-1 rounded-full border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))] px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--text-main))] shadow-lg"
          >
            <ArrowDown size={12} />
            底部
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute left-3 right-3 z-20 flex items-center justify-center gap-1 rounded-full border border-destructive/30 bg-destructive px-3 py-1.5 text-[11px] font-medium text-destructive-foreground shadow-xl"
            style={{
              bottom: keyboardHeight > 0 ? `calc(130px + ${keyboardHeight}px)` : '106px',
            }}
          >
            <AlertTriangle size={12} />
            {error}
            <button onClick={() => setError(null)} className="ml-1 opacity-80 hover:opacity-100">x</button>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="shrink-0 border-t border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))] px-2 pb-2 pt-2 shadow-[0_-8px_20px_hsl(var(--text-main)/0.06)] transition-all"
        style={{
          paddingBottom: keyboardHeight > 0 ? `calc(8px + ${keyboardHeight}px)` : undefined,
        }}
      >
        <ChatInput ref={chatInputRef} onSend={handleSendMessage} disabled={isLoading} compact={true} />
      </div>

      <ContentPreview config={previewConfig} onClose={closePreview} />
    </div>
  );
}

