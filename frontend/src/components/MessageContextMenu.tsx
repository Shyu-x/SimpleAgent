'use client';

import { useState, useEffect, useRef } from 'react';
import { Copy, Trash2, RefreshCw, Check, FileText, Hash } from 'lucide-react';
import { getWordCount, getCharCount } from '@/lib/export';

interface MessageContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  message: {
    id: string;
    content: string;
    role: 'user' | 'assistant' | 'system';
  };
  onCopy: () => void;
  onDelete: () => void;
  onRegenerate?: () => void;
}

export default function MessageContextMenu({
  isOpen,
  position,
  onClose,
  message,
  onCopy,
  onDelete,
  onRegenerate,
}: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isCopied, setIsCopied] = useState(false);

  const wordCount = getWordCount(message.content);
  const charCount = getCharCount(message.content);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopy = () => {
    onCopy();
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    onClose();
  };

  const isAssistant = message.role === 'assistant';

  // Adjust position to keep menu in viewport
  const adjustedPosition = {
    x: Math.min(position.x, window.innerWidth - 180),
    y: Math.min(position.y, window.innerHeight - 180),
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[110] min-w-[170px] overflow-hidden rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/98 shadow-2xl backdrop-blur-xl animate-scaleIn"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
    >
      {/* Text info */}
      <div className="flex items-center gap-3 px-3 py-2 text-xs text-muted-foreground border-b">
        <span className="flex items-center gap-1">
          <FileText size={12} />
          {wordCount} 词
        </span>
        <span className="flex items-center gap-1">
          <Hash size={12} />
          {charCount} 字
        </span>
      </div>

      <button
        onClick={handleCopy}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
      >
        {isCopied ? <Check size={14} className="text-[hsl(var(--success-500))]" /> : <Copy size={14} />}
        {isCopied ? '已复制' : '复制消息'}
      </button>

      {isAssistant && onRegenerate && (
        <button
          onClick={() => {
            onRegenerate();
            onClose();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
        >
          <RefreshCw size={14} />
          重新生成
        </button>
      )}

      <button
        onClick={() => {
          onDelete();
          onClose();
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
      >
        <Trash2 size={14} />
        删除
      </button>
    </div>
  );
}

