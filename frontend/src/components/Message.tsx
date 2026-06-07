'use client';

import { useState, useCallback, memo, useRef } from 'react';
import { Message as MessageType } from '@/types';
import Typewriter from './Typewriter';
import { MemoizedMarkdownRenderer } from '@/lib/markdown';
import { Bot, User, Copy, Check, Trash2, RefreshCw, Edit2, Quote, Brain } from 'lucide-react';
import { useToast } from './Toast';
import { motion } from 'framer-motion';
import { useChatStore } from '@/store/chatStore';
import { MessageStatusIndicator, formatMessageTime, type MessageStatus } from './MessageStatus';

interface MessageProps {
  message: MessageType;
  isLast: boolean;
  status?: MessageStatus;
  onDelete?: () => void;
  onRegenerate?: () => void;
  onPreviewLink?: (url: string, title?: string) => void;
  onQuote?: (messageId: string) => void;
  onEdit?: (content: string) => void;
}

const Message = memo(function Message({ message, isLast, status = 'complete', onDelete, onRegenerate, onPreviewLink, onQuote, onEdit }: MessageProps) {
  const isUser = message.role === 'user';
  const { showToast } = useToast();
  const [isCopied, setIsCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showActions, setShowActions] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const rippleIdRef = useRef(0);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const isStreaming = !isUser && isLast && status === 'streaming';

  const settings = useChatStore((state) => state.settings);
  const apiConfig = useChatStore((state) => state.apiConfig);
  const animationsEnabled = settings.animationsEnabled;
  const showThinking = apiConfig.showThinking ?? false;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setIsCopied(true);
      showToast('已复制到剪贴板', 'success');
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      showToast('复制失败', 'error');
    }
  }, [message.content, showToast]);

  // 触摸涟漪效果
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isUser) {
      const rect = bubbleRef.current?.getBoundingClientRect();
      if (rect) {
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const id = rippleIdRef.current++;
        setRipples((prev) => [...prev, { id, x, y }]);
        setTimeout(() => {
          setRipples((prev) => prev.filter((r) => r.id !== id));
        }, 600);
      }
    }
    setIsPressed(true);
  }, [isUser]);

  const handlePointerUp = () => setIsPressed(false);
  const handlePointerLeave = () => setIsPressed(false);

  return (
    <motion.div
      initial={animationsEnabled ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`group/message flex w-full gap-3 py-1.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* 头像 */}
      <motion.div
        whileHover={animationsEnabled ? { scale: 1.06, y: -1 } : undefined}
        whileTap={animationsEnabled ? { scale: 0.95 } : undefined}
        className={`
          h-9 w-9 shrink-0 rounded-2xl flex items-center justify-center shadow-md
          ${isUser
            ? 'bg-gradient-to-br from-[hsl(var(--brand-500))] to-[hsl(var(--brand-700))] text-primary-foreground shadow-primary/30'
            : 'bg-[hsl(var(--bg-surface))]/98 backdrop-blur-xl border border-[hsl(var(--border-subtle))] text-[hsl(var(--brand-500))]'
          }
        `}
      >
        {isUser ? <User size={16} /> : <Bot size={18} className={isStreaming ? 'animate-pulse' : ''} />}
      </motion.div>

      <div className={`relative flex flex-col max-w-[82%] sm:max-w-[72%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* 元信息行 */}
        <div className={`mb-0.5 flex items-center gap-2 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] ${isUser ? 'flex-row-reverse text-[hsl(var(--brand-500))]' : 'text-[hsl(var(--guide-8))]'}`}>
          <span>{isUser ? 'User' : 'Assistant'}</span>
          <div className="h-1 w-1 rounded-full bg-current opacity-35" />
          <span className="opacity-60">{formatMessageTime(message.createdAt)}</span>
          {/* 状态指示器 - 仅 AI 消息显示 */}
          {!isUser && status !== 'complete' && (
            <>
              <div className="h-1 w-1 rounded-full bg-current opacity-35" />
              <MessageStatusIndicator status={status} onRegenerate={onRegenerate} />
            </>
          )}
        </div>

        {/* 气泡主体 */}
        <div
          ref={bubbleRef}
          onClick={() => setShowActions(!showActions)}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          className={`
            relative rounded-3xl px-4 py-1 transition-all duration-200 cursor-pointer select-none
            ${isPressed ? 'scale-[0.98]' : 'scale-100'}
            ${isUser
              ? 'rounded-tr-none bg-gradient-to-br from-[hsl(var(--brand-500))] to-[hsl(var(--brand-600))] text-primary-foreground shadow-lg shadow-primary/20 ring-1 ring-[hsl(var(--primary-foreground))/0.25]'
              : 'rounded-tl-none bg-[hsl(var(--bg-surface))]/98 backdrop-blur-xl border border-[hsl(var(--border-subtle))] shadow-md hover:border-[hsl(var(--border-strong))] hover:shadow-lg'
            }
          `}
        >
          {/* 触摸涟漪效果 */}
          {ripples.map((ripple) => (
            <motion.span
              key={ripple.id}
              className="absolute rounded-full bg-white/30 pointer-events-none"
              initial={{ width: 0, height: 0, opacity: 0.6 }}
              animate={{ width: 200, height: 200, opacity: 0, x: ripple.x - 100, y: ripple.y - 100 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          ))}

          {/* 内容 */}
          {isEditing ? (
            <div className="space-y-3 min-w-[300px]">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full resize-none rounded-xl bg-black/10 p-3 text-sm outline-none focus:ring-2 focus:ring-white/20"
                rows={3}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setIsEditing(false)} className="rounded-lg bg-background/10 px-3 py-1.5 text-xs hover:bg-background/20">取消</button>
                <button onClick={() => { if (onEdit) { onEdit(editContent); setIsEditing(false); } }} className="rounded-lg bg-background px-3 py-1.5 text-xs font-bold text-brand-600" disabled={!editContent.trim()}>保存</button>
              </div>
            </div>
          ) : (
            <div className={`markdown-content text-[15px] leading-relaxed font-normal selection:bg-brand-100 selection:text-brand-600 ${isUser ? 'text-primary-foreground' : 'text-[hsl(var(--text-main))]'}`}>
              {/* 思维链显示 */}
              {!isUser && message.thinking && showThinking && (
                <div className="mb-2 rounded-xl bg-[hsl(var(--bg-muted))]/80 border border-[hsl(var(--border-subtle))] p-3 text-xs">
                  <div className="flex items-center gap-1.5 mb-1.5 text-[hsl(var(--guide-8))] font-semibold uppercase tracking-wide">
                    <Brain size={12} />
                    <span>思考过程</span>
                  </div>
                  <div className="text-[hsl(var(--text-muted))] whitespace-pre-wrap font-mono leading-relaxed">
                    {message.thinking}
                  </div>
                </div>
              )}
              {isStreaming ? (
                <Typewriter
                  text={message.content}
                  isComplete={message.isComplete ?? false}
                  onPreviewLink={onPreviewLink}
                />
              ) : (
                <MemoizedMarkdownRenderer content={message.content} onPreviewLink={onPreviewLink} />
              )}
            </div>
          )}
        </div>

        {/* 操作菜单 - 移出气泡 div, 作为兄弟元素 (修 axe nested-interactive) */}
        <div className={`
          absolute -top-2 z-10 flex items-center gap-1 rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/99 p-1 shadow-xl backdrop-blur-xl
          opacity-0 translate-y-1 transition-all duration-150
          ${showActions ? 'opacity-100 translate-y-0' : ''}
          sm:opacity-0 sm:translate-y-1 sm:group-hover/message:opacity-100 sm:group-hover/message:translate-y-0 sm:group-focus-within/message:opacity-100 sm:group-focus-within/message:translate-y-0
          ${isUser ? 'right-2' : 'left-2'}
        `}>
          {/* 引用按钮 */}
          {onQuote && (
            <button onClick={() => onQuote(message.id)} className="rounded-lg p-1.5 text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--bg-muted))] hover:text-primary">
              <Quote size={14} />
            </button>
          )}
          <button onClick={() => handleCopy()} className="rounded-lg p-1.5 text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--bg-muted))] hover:text-primary">
            {isCopied ? <Check size={14} className="text-[hsl(var(--success-500))]" /> : <Copy size={14} />}
          </button>
          {isUser ? (
            <button onClick={() => setIsEditing(true)} className="rounded-lg p-1.5 text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--bg-muted))]">
              <Edit2 size={14} />
            </button>
          ) : (
            <button onClick={() => onRegenerate?.()} className="rounded-lg p-1.5 text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--bg-muted))]">
              <RefreshCw size={14} />
            </button>
          )}
          <button onClick={() => onDelete?.()} className="rounded-lg p-1.5 text-destructive transition-colors hover:bg-destructive/10">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  );
});

export default Message;
