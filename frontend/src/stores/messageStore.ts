// stores/messageStore.ts - 消息操作领域 Store
import { create } from 'zustand';
import type { Message, Note, Conversation } from '@/types';
import type { MemoryType, MemoryImportance } from '@/types';

interface MessageState {
  // 同步消息到指定对话（由 conversationStore 驱动，messageStore 提供操作函数）
  addMessage: (conversationId: string, conversations: Conversation[], message: Message) => Conversation[];
  updateLastMessage: (conversationId: string, conversations: Conversation[], content: string) => Conversation[];
  updateLastMessageThinking: (conversationId: string, conversations: Conversation[], thinking: string) => Conversation[];
  deleteMessage: (conversationId: string, conversations: Conversation[], messageId: string) => Conversation[];
  updateMessageContent: (conversationId: string, conversations: Conversation[], messageId: string, newContent: string) => Conversation[];
  finalizeMessage: (conversationId: string, conversations: Conversation[], messageId: string) => Conversation[];

  // 备注操作
  addNote: (
    conversationId: string,
    conversations: Conversation[],
    content: string,
    metadata?: Partial<Pick<Note, 'type' | 'importance' | 'tags' | 'embedding'>>
  ) => Conversation[];
  updateNote: (
    conversationId: string,
    conversations: Conversation[],
    noteId: string,
    updates: string | Partial<Omit<Note, 'id' | 'createdAt'>>
  ) => Conversation[];
  deleteNote: (conversationId: string, conversations: Conversation[], noteId: string) => Conversation[];
}

export const useMessageStore = create<MessageState>()(() => ({
  addMessage: (conversationId, conversations, message) =>
    conversations.map((conv) =>
      conv.id === conversationId
        ? {
            ...conv,
            messages: [...conv.messages, message],
            updatedAt: Date.now(),
            title:
              conv.messages.length === 0 && message.role === 'user'
                ? message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '')
                : conv.title,
          }
        : conv
    ),

  updateLastMessage: (conversationId, conversations, content) =>
    conversations.map((conv) => {
      if (conv.id !== conversationId) return conv;
      const messages = [...conv.messages];
      if (messages.length > 0) {
        messages[messages.length - 1] = { ...messages[messages.length - 1], content };
      }
      return { ...conv, messages, updatedAt: Date.now() };
    }),

  updateLastMessageThinking: (conversationId, conversations, thinking) =>
    conversations.map((conv) => {
      if (conv.id !== conversationId) return conv;
      const messages = [...conv.messages];
      if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
        messages[messages.length - 1] = { ...messages[messages.length - 1], thinking };
      }
      return { ...conv, messages, updatedAt: Date.now() };
    }),

  deleteMessage: (conversationId, conversations, messageId) =>
    conversations.map((conv) =>
      conv.id === conversationId
        ? { ...conv, messages: conv.messages.filter((m) => m.id !== messageId) }
        : conv
    ),

  updateMessageContent: (conversationId, conversations, messageId, newContent) =>
    conversations.map((conv) =>
      conv.id === conversationId
        ? {
            ...conv,
            messages: conv.messages.map((m) =>
              m.id === messageId ? { ...m, content: newContent } : m
            ),
          }
        : conv
    ),

  finalizeMessage: (conversationId, conversations, messageId) =>
    conversations.map((conv) =>
      conv.id === conversationId
        ? {
            ...conv,
            messages: conv.messages.map((m) =>
              m.id === messageId ? { ...m, isComplete: true } : m
            ),
            updatedAt: Date.now(),
          }
        : conv
    ),

  addNote: (conversationId, conversations, content, metadata) => {
    const note: Note = {
      id: `note_${Date.now()}`,
      content,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...(metadata || {}),
    };
    return conversations.map((conv) =>
      conv.id === conversationId
        ? { ...conv, notes: [...conv.notes, note], updatedAt: Date.now() }
        : conv
    );
  },

  updateNote: (conversationId, conversations, noteId, updates) => {
    const normalized = typeof updates === 'string' ? { content: updates } : updates;
    return conversations.map((conv) => {
      if (conv.id !== conversationId) return conv;
      const notes = conv.notes.map((n) =>
        n.id === noteId ? { ...n, ...normalized, updatedAt: Date.now() } : n
      );
      return { ...conv, notes, updatedAt: Date.now() };
    });
  },

  deleteNote: (conversationId, conversations, noteId) =>
    conversations.map((conv) =>
      conv.id === conversationId
        ? { ...conv, notes: conv.notes.filter((n) => n.id !== noteId), updatedAt: Date.now() }
        : conv
    ),
}));
