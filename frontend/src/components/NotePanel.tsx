'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '@/store/chatStore';

interface NotePanelProps {
  conversationId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function NotePanel({ conversationId, isOpen, onClose }: NotePanelProps) {
  const [newNote, setNewNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const conversations = useChatStore((state) => state.conversations);
  const addNote = useChatStore((state) => state.addNote);
  const updateNote = useChatStore((state) => state.updateNote);
  const deleteNote = useChatStore((state) => state.deleteNote);

  const conversation = conversations.find((c) => c.id === conversationId);
  const notes = conversation?.notes || [];

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    addNote(conversationId, newNote.trim());
    setNewNote('');
  };

  const handleStartEdit = (noteId: string, content: string) => {
    setEditingId(noteId);
    setEditContent(content);
  };

  const handleSaveEdit = () => {
    if (!editingId || !editContent.trim()) return;
    updateNote(conversationId, editingId, editContent.trim());
    setEditingId(null);
    setEditContent('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const handleDeleteNote = (noteId: string) => {
    deleteNote(conversationId, noteId);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop - 始终显示背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-[95]"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full sm:w-80 bg-background shadow-xl z-[100] flex flex-col border-l border-border"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                会话笔记
              </h2>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-muted/80 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Add Note */}
            <div className="p-4 border-b border-border">
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="添加笔记..."
                  className="flex-1 px-3 py-2 text-sm border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      handleAddNote();
                    }
                  }}
                />
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-xs text-muted-foreground">
                  Ctrl/Cmd + Enter 快速添加
                </span>
                <button
                  onClick={handleAddNote}
                  disabled={!newNote.trim()}
                  className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  添加
                </button>
              </div>
            </div>

            {/* Notes List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {notes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm">暂无笔记</p>
                  <p className="text-xs mt-1">添加笔记记录重要信息</p>
                </div>
              ) : (
                notes.map((note) => (
                  <motion.div
                    key={note.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="group p-3 bg-muted rounded-lg border border-border"
                  >
                    {editingId === note.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-primary/30 rounded resize-none focus:outline-none bg-background"
                          rows={3}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveEdit}
                            className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
                          >
                            保存
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="px-2 py-1 text-xs bg-muted bg-[hsl(var(--text-muted))/0.45] text-muted-foreground rounded hover:bg-muted/80"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                          {note.content}
                        </p>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                          <span className="text-xs text-muted-foreground">{formatDate(note.createdAt)}</span>
                          <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                            <button
                              onClick={() => handleStartEdit(note.id, note.content)}
                              className="p-1 text-muted-foreground hover:text-primary transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteNote(note.id)}
                              className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </motion.div>
                ))
              )}
            </div>

            {/* Footer Stats */}
            <div className="p-4 border-t border-border bg-muted">
              <p className="text-xs text-muted-foreground text-center">
                共 {notes.length} 条笔记
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
