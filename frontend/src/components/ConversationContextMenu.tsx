'use client';

import { useState, useEffect, useRef } from 'react';
import { Trash2, Edit3, Download, Check, X, FileJson, FileText, FileCode, Maximize2 } from 'lucide-react';
import { Conversation } from '@/types';
import { exportConversation, downloadExport, ExportFormat } from '@/lib/export';
import { useToast } from './Toast';

interface ConversationContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  conversation: {
    id: string;
    title: string;
    messages: Array<{ role: string; content: string; createdAt: number }>;
    notes?: Array<{ id: string; content: string; createdAt: number; updatedAt: number }>;
  };
  onRename: (newTitle: string) => void;
  onDelete: () => void;
  onExport?: () => void;
  onOpenInNewWindow?: () => void;
}

export default function ConversationContextMenu({
  isOpen,
  position,
  onClose,
  conversation,
  onRename,
  onDelete,
  onExport,
  onOpenInNewWindow,
}: ConversationContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState(conversation.title);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  // Convert to proper Conversation type for export
  const convForExport: Conversation = {
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messages.map((m) => ({
      id: m.role,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      createdAt: m.createdAt,
    })),
    notes: conversation.notes || [],
    createdAt: conversation.messages[0]?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  const handleExport = (format: ExportFormat) => {
    const data = exportConversation(convForExport, format);
    downloadExport(data, format);
    showToast(`已导出为 ${format.toUpperCase()} 格式`, 'success');
    setShowExportMenu(false);
    onClose();
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isRenaming) {
          setIsRenaming(false);
        } else if (showExportMenu) {
          setShowExportMenu(false);
        } else {
          onClose();
        }
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
  }, [isOpen, onClose, isRenaming, showExportMenu]);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  useEffect(() => {
    setNewTitle(conversation.title);
  }, [conversation.title]);

  if (!isOpen) return null;

  const handleRename = () => {
    if (newTitle.trim()) {
      onRename(newTitle.trim());
    }
    setIsRenaming(false);
    onClose();
  };

  // Adjust position to keep menu in viewport
  const adjustedPosition = {
    x: Math.min(position.x, window.innerWidth - 180),
    y: Math.min(position.y, window.innerHeight - 200),
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[110] min-w-[170px] overflow-hidden rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/98 shadow-2xl backdrop-blur-xl animate-scaleIn"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
    >
      {isRenaming ? (
        <div className="flex items-center gap-1 p-2">
          <input
            ref={inputRef}
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
            }}
            className="flex-1 rounded border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary"
            placeholder="输入新名称"
          />
          <button
            onClick={handleRename}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
          >
            <Check size={14} />
          </button>
          <button
            onClick={() => setIsRenaming(false)}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
          >
            <X size={14} />
          </button>
        </div>
      ) : showExportMenu ? (
        <div className="py-1">
          <button
            onClick={() => handleExport('markdown')}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
          >
            <FileText size={14} />
            Markdown (.md)
          </button>
          <button
            onClick={() => handleExport('json')}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
          >
            <FileJson size={14} />
            JSON (.json)
          </button>
          <button
            onClick={() => handleExport('html')}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
          >
            <FileCode size={14} />
            HTML (.html)
          </button>
          <button
            onClick={() => handleExport('text')}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
          >
            <FileText size={14} />
            纯文本 (.txt)
          </button>
          <div className="border-t my-1" />
          <button
            onClick={() => setShowExportMenu(false)}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            <X size={14} />
            返回
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={() => setIsRenaming(true)}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
          >
            <Edit3 size={14} />
            重命名
          </button>

          <button
            onClick={() => setShowExportMenu(true)}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
          >
            <Download size={14} />
            导出对话
          </button>

          {onOpenInNewWindow && (
            <button
              onClick={() => {
                onOpenInNewWindow();
                onClose();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
            >
              <Maximize2 size={14} />
              新窗口打开
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
        </>
      )}
    </div>
  );
}
