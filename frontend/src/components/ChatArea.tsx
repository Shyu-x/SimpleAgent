'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useChatStore } from '@/store/chatStore';
import { sendSSEChatMessage } from '@/lib/sse';
import { detectImageIntent, cleanImagePrompt } from '@/hooks/useImageIntent';
import { useSearchEnhanced } from '@/hooks/useSearchEnhanced';
import { ErrorBoundary } from '@/utils/ErrorBoundary';
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
  Image,
  Brain,
  Download,
  ExternalLink,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Attachment } from '@/types';
import { BACKEND_URL } from '@/lib/config';

// 简单的 ID 生成函数
function generateId(): string {
  return `id_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

interface ChatAreaProps {
  conversationId?: string;
  onOpenSidebar?: () => void;
}

const QUICK_START_ITEMS = [
  { icon: Code2, label: '代码协作', text: '帮我重构这段 TypeScript 代码并说明原因' },
  { icon: Globe, label: '信息整理', text: '总结一下最近一周 AI 行业的重要进展' },
  { icon: MessageSquare, label: '产品文案', text: '给这个功能写 3 个不同风格的发布文案' },
  { icon: Shield, label: '方案评审', text: '审查这个系统设计，列出风险与优化建议' },
  { icon: Zap, label: '效率提升', text: '给我一个 30 分钟高效学习计划模板' },
];

export default function ChatArea({ conversationId }: ChatAreaProps) {
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationIdGlobal = useChatStore((state) => state.activeConversationId);
  const addMessage = useChatStore((state) => state.addMessage);
  const updateLastMessage = useChatStore((state) => state.updateLastMessage);
  const updateLastMessageThinking = useChatStore((state) => state.updateLastMessageThinking);
  const finalizeMessage = useChatStore((state) => state.finalizeMessage);
  const apiConfig = useChatStore((state) => state.apiConfig);
  const enabledFeatures = useChatStore((state) => state.enabledFeatures);
  const setEnabledFeature = useChatStore((state) => state.setEnabledFeature);

  const activeConversationId = conversationId || activeConversationIdGlobal;
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatInputRef = useRef<ChatInputRef>(null);
  const userScrolledRef = useRef(false);

  const { previewConfig, triggerPreview, closePreview } = useContentPreview();
  const { search: performSearch, results: searchResults, isLoading: isSearching } = useSearchEnhanced();

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId),
    [conversations, activeConversationId]
  );


  // 检测用户滚动，优先用户控制
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distanceToBottom < 140;
    userScrolledRef.current = !isAtBottom;
    setShowScrollToBottom(!isAtBottom);
  }, []);

  // 自动滚动逻辑
  const scrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'auto') => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior,
      });
    }
  }, []);

  // 获取当前最后一条消息的内容长度，用于检测流式更新
  const lastMessageContentLength = activeConversation?.messages.length && activeConversation.messages.length > 0
    ? activeConversation.messages[activeConversation.messages.length - 1].content.length
    : 0;

  // 消息或内容更新时，如果用户没有主动上滑，保持贴底
  // 注意：这里不依赖 messages.length，而是依赖 lastMessageContentLength 来检测流式内容更新
  useEffect(() => {
    if (!userScrolledRef.current && activeConversationId) {
      // 使用 requestAnimationFrame 确保 DOM 更新后再滚动
      requestAnimationFrame(() => {
        scrollToBottom(isLoading ? 'smooth' : 'auto');
      });
    }
  }, [lastMessageContentLength, activeConversationId, isLoading, scrollToBottom]);

  // 切换对话时重置滚动状态
  useEffect(() => {
    userScrolledRef.current = false;
    setShowScrollToBottom(false);
    requestAnimationFrame(() => scrollToBottom('auto'));
  }, [activeConversationId, scrollToBottom]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleSendMessage = async (content: string, attachments?: Attachment[]) => {
    if (!activeConversationId) return;
    if (abortControllerRef.current) abortControllerRef.current.abort();

    if (!apiConfig.model) {
      setError('请先在设置中选择一个模型');
      return;
    }

    setError(null);
    abortControllerRef.current = new AbortController();

    const userMessage = {
      id: `msg_${Date.now()}`,
      role: 'user' as const,
      content,
      createdAt: Date.now(),
      attachments,
    };
    addMessage(activeConversationId, userMessage);

    // 检测图片生成意图
    const { isImageRequest, prompt } = detectImageIntent(content);

    // 根据 enabledFeatures 决定处理方式
    if (enabledFeatures.imageGeneration && isImageRequest) {
      // 图片生成模式
      setIsGeneratingImage(true);

      const assistantMessageId = `msg_${Date.now() + 1}`;
      const assistantMessage = {
        id: assistantMessageId,
        role: 'assistant' as const,
        content: '🎨 正在为您生成图片...',
        createdAt: Date.now(),
        isComplete: false,
      };
      addMessage(activeConversationId, assistantMessage);

      try {
        const response = await fetch(`${BACKEND_URL}/api/minimax/image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: cleanImagePrompt(prompt),
            aspect_ratio: '1:1',
            response_format: 'url'
          }),
          signal: abortControllerRef.current.signal,
        });

        const data = await response.json();

        // 检查 MiniMax API 返回的错误（例如 usage limit exceeded）
        if (data.base_resp?.status_code && data.base_resp.status_code !== 0) {
          throw new Error(data.base_resp.status_msg || '图片生成失败');
        }

        if (!response.ok && !data.success) {
          throw new Error(data.error?.message || '图片生成失败');
        }

        // 支持多种返回格式
        const imageUrl = data.image_url || data.data?.image_urls?.[0] || data.data?.[0]?.url;

        if (imageUrl) {
          // 生成唯一文件名
          const fileName = `AI生成图片_${Date.now()}.png`;

          // 更新消息内容为生成的图片，添加下载按钮
          const imageContent = `![AI生成图片](${imageUrl})

📥 **[下载原图](${imageUrl})**`;

          updateLastMessage(activeConversationId, imageContent);

          // 使用 immutable 方式添加图片附件
          useChatStore.setState((state) => ({
            conversations: state.conversations.map((conv) =>
              conv.id === activeConversationId
                ? {
                    ...conv,
                    messages: conv.messages.map((m, idx, msgs) =>
                      idx === msgs.length - 1
                        ? {
                            ...m,
                            attachments: [{
                              id: generateId(),
                              type: 'image' as const,
                              url: imageUrl,
                              name: fileName,
                              size: 0,
                            }],
                          }
                        : m
                    ),
                  }
                : conv
            ),
          }));
          finalizeMessage(activeConversationId, assistantMessageId);
        } else {
          throw new Error('图片生成结果无效，请稍后重试');
        }
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          const errorMsg = err instanceof Error ? err.message : '图片生成失败';
          const errorMessage = errorMsg.includes('usage limit')
            ? '图片生成配额已用完，请稍后再试或使用其他模型'
            : `图片生成失败: ${errorMsg}`;
          updateLastMessage(activeConversationId, `❌ ${errorMessage}\n\n💡 建议：您可以尝试用文字描述您想要的图片，我会帮您详细描述。`);
          setError(errorMessage);
        }
        setIsLoading(false);
      } finally {
        setIsGeneratingImage(false);
      }
      return;
    }

    // 普通聊天模式
    setIsLoading(true);

    const assistantMessage = {
      id: `msg_${Date.now() + 1}`,
      role: 'assistant' as const,
      content: '',
      createdAt: Date.now(),
      isComplete: false,
    };
    addMessage(activeConversationId, assistantMessage);

    // 构建消息列表
    let messages = [
      ...(activeConversation?.messages || []).map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: 'user' as const, content },
    ];

    // 联网搜索增强
    let searchContext = '';
    if (enabledFeatures.webSearch) {
      try {
        updateLastMessage(activeConversationId, '🔍 正在联网搜索相关信息...');

        const searchResponse = await fetch(`${BACKEND_URL}/api/search/enhanced`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: content,
            sources: ['web'],
            count: 5
          }),
          signal: abortControllerRef.current.signal,
        });

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          if (searchData.success && searchData.results?.length > 0) {
            // 构建搜索上下文
            searchContext = '\n\n[联网搜索结果]\n' +
              searchData.results.slice(0, 3).map((r: { title: string; url: string; snippet?: string }, i: number) =>
                `${i + 1}. **${r.title}**\n   ${r.snippet || ''}\n   来源: ${r.url}`
              ).join('\n\n');

            // 将搜索结果添加到用户消息中
            messages = [
              ...(activeConversation?.messages || []).map((m) => ({
                role: m.role,
                content: m.content,
              })),
              { role: 'user' as const, content: `${content}\n\n请参考以下搜索结果回答：${searchContext}` },
            ];
          }
        }
      } catch (searchError) {
        console.warn('联网搜索失败，将使用普通模式回答:', searchError);
      }
    }

    try {
      // 调试日志：检查发送的消息内容
      console.log('[ChatArea] 发送消息:', {
        contentLength: content.length,
        contentPreview: content.substring(0, 50),
        contentBytes: new TextEncoder().encode(content.slice(0, 10)).toString()
      });

      const assistantMessageId = assistantMessage.id;

      await sendSSEChatMessage(
        apiConfig.apiKey,
        apiConfig.baseURL,
        apiConfig.model,
        messages,
        {
          signal: abortControllerRef.current.signal,
          onMessage: (chunk: string) => {
            console.log('[ChatArea] onMessage:', {
              chunkLength: chunk.length,
              chunkPreview: chunk.substring(0, 50),
            });
            const conv = useChatStore.getState().conversations.find((c) => c.id === activeConversationId);
            if (conv && conv.messages.length > 0) {
              const currentContent = conv.messages[conv.messages.length - 1].content;
              console.log('[ChatArea] 更新前内容长度:', currentContent.length);
              updateLastMessage(activeConversationId, currentContent + chunk);
              console.log('[ChatArea] 更新后（期望）长度:', currentContent.length + chunk.length);
            }
          },
          onThinking: (thinkingChunk: string, isEnd: boolean) => {
            if (enabledFeatures.deepThinking) {
              const conv = useChatStore.getState().conversations.find((c) => c.id === activeConversationId);
              if (conv && conv.messages.length > 0) {
                const currentThinking = conv.messages[conv.messages.length - 1].thinking || '';
                updateLastMessageThinking(activeConversationId, currentThinking + thinkingChunk);
              }
            }
          },
          onError: (err: Error) => {
            setError(err.message);
            setIsLoading(false);
          },
          onComplete: () => {
            // 标记消息已完成
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

  const handleBackToBottom = () => {
    userScrolledRef.current = false;
    setShowScrollToBottom(false);
    scrollToBottom('smooth');
  };

  return (
    <ErrorBoundary moduleName="ChatArea" showStack>
      <div className="relative flex h-full flex-col bg-transparent">
      {/* Messages Area */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="custom-scrollbar flex-1 overflow-y-auto bg-transparent"
        style={{ backgroundColor: 'transparent' }}
      >
        {!activeConversation?.messages.length ? (
          <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col items-center justify-center px-6 py-16 text-center">
            <motion.div
              initial={{ scale: 0.88, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative mb-8"
            >
              <div className="absolute inset-0 rounded-full bg-primary/20 blur-[72px]" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-[hsl(var(--brand-700))] shadow-2xl shadow-primary/25">
                <Bot size={48} className="text-primary-foreground" />
              </div>
            </motion.div>

            <div className="max-w-xl space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight text-[hsl(var(--text-main))]">
                从一个问题开始
              </h2>
              <p className="text-sm text-[hsl(var(--text-muted))]">
                支持代码协作、方案评审、信息整合与创作。你可以先选择一个起步提示，也可以直接输入需求。
              </p>
            </div>

            <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
              {QUICK_START_ITEMS.map(({ icon: Icon, label, text }, index) => (
                <motion.button
                  key={label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 + index * 0.06 }}
                  onClick={() => chatInputRef.current?.setInputValue(text)}
                  className="group flex flex-col items-start gap-2 rounded-2xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/85 p-4 text-left transition-all hover:border-primary/30 hover:bg-[hsl(var(--bg-surface))] hover:shadow-md"
                >
                  <div className="rounded-xl bg-primary/10 p-2 text-primary transition-colors group-hover:bg-primary/15">
                    <Icon size={16} />
                  </div>
                  <span className="text-xs font-semibold text-[hsl(var(--text-main))]">{label}</span>
                  <span className="line-clamp-2 text-xs text-[hsl(var(--text-muted))]">{text}</span>
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-5xl px-4 pb-3 pt-4 sm:px-6 lg:px-8">
            <>
            {activeConversation.messages.map((message, index) => {
              const isLast = index === activeConversation.messages.length - 1;
              // 根据消息状态确定显示状态
              const getMessageStatus = () => {
                if (message.role === 'user') return 'complete' as const;
                // 只有当消息是最后一条、是AI消息、并且还没有完成时才显示streaming
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
                  onEdit={(content) => activeConversationId && useChatStore.getState().updateMessageContent(activeConversationId, message.id, content)}
                />
              );
            })}
            {/* AI thinking animation */}
            <AnimatePresence>
              {isLoading && activeConversation.messages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-start gap-3 py-2"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--bg-surface))]/98 backdrop-blur-xl border border-[hsl(var(--border-subtle))]">
                    <Bot size={18} className="text-[hsl(var(--brand-500))]" />
                  </div>
                  <div className="flex items-center gap-2 rounded-3xl rounded-tl-none bg-[hsl(var(--bg-surface))]/98 backdrop-blur-xl border border-[hsl(var(--border-subtle))] px-4 py-3 shadow-md">
                    {isGeneratingImage ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        >
                          <Image size={16} className="text-[hsl(var(--brand-500))]" />
                        </motion.div>
                        <span className="text-sm text-[hsl(var(--text-muted))]">正在生成图片...</span>
                      </>
                    ) : (
                      <>
                        <div className="flex gap-1">
                          {[0, 1, 2].map((i) => (
                            <motion.div
                              key={i}
                              className="w-2 h-2 rounded-full bg-[hsl(var(--brand-500))]"
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
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            </>
          </div>
        )}
      </div>

      {/* 回到底部按钮 */}
      <AnimatePresence>
        {showScrollToBottom && (activeConversation?.messages.length ?? 0) > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            onClick={handleBackToBottom}
            className="absolute bottom-[122px] right-6 z-20 inline-flex items-center gap-1 rounded-full border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/95 px-3 py-1.5 text-xs font-medium text-[hsl(var(--text-main))] shadow-lg backdrop-blur"
          >
            <ArrowDown size={14} />
            回到底部
          </motion.button>
        )}
      </AnimatePresence>

      {/* Error Banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="absolute bottom-28 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-destructive px-4 py-2 text-xs font-medium text-destructive-foreground shadow-xl"
          >
            <AlertTriangle size={14} />
            {error}
            <button onClick={() => setError(null)} className="ml-1 opacity-90 transition-opacity hover:opacity-70">
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 功能切换卡片 */}
      <div className="shrink-0 border-t border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-muted))]/50">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2 sm:px-6">
          <span className="mr-1 text-xs text-[hsl(var(--text-muted))]">工具:</span>

          <button
            onClick={() => setEnabledFeature('webSearch', !enabledFeatures.webSearch)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
              enabledFeatures.webSearch
                ? 'bg-blue-500/20 text-blue-500 border border-blue-500/40'
                : 'bg-[hsl(var(--bg-surface))] text-[hsl(var(--text-muted))] border border-[hsl(var(--border-subtle))]'
            }`}
          >
            <Globe size={12} />
            联网搜索
          </button>

          <button
            onClick={() => setEnabledFeature('deepThinking', !enabledFeatures.deepThinking)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
              enabledFeatures.deepThinking
                ? 'bg-purple-500/20 text-purple-500 border border-purple-500/40'
                : 'bg-[hsl(var(--bg-surface))] text-[hsl(var(--text-muted))] border border-[hsl(var(--border-subtle))]'
            }`}
          >
            <Brain size={12} />
            深度思考
          </button>

          <button
            onClick={() => setEnabledFeature('imageGeneration', !enabledFeatures.imageGeneration)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
              enabledFeatures.imageGeneration
                ? 'bg-green-500/20 text-green-500 border border-green-500/40'
                : 'bg-[hsl(var(--bg-surface))] text-[hsl(var(--text-muted))] border border-[hsl(var(--border-subtle))]'
            }`}
          >
            <Image size={12} />
            图片生成
          </button>
        </div>
      </div>

      {/* Input Area */}
      <div className="shrink-0">
        <div className="mx-auto w-full max-w-5xl px-4 pb-2 pt-1.5 sm:px-6 sm:pb-3">
          <ChatInput ref={chatInputRef} onSend={handleSendMessage} disabled={isLoading || isGeneratingImage} />
        </div>
      </div>

      <ContentPreview config={previewConfig} onClose={closePreview} />
      </div>
    </ErrorBoundary>
  );
}

