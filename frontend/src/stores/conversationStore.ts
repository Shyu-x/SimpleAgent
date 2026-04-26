// stores/conversationStore.ts - 对话 CRUD 领域 Store
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Conversation } from '@/types';

// SessionStorage 适配器
const sessionStorageAdapter = {
  getItem: (name: string): string | null => {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(name);
  },
  setItem: (name: string, value: string): void => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(name, value);
  },
  removeItem: (name: string): void => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(name);
  },
};

export interface ConversationState {
  conversations: Conversation[];
  activeConversationId: string | null;
  activeConversationIds: string[];
  windowConfigs: Record<string, { conversationId: string | null; gridArea?: { col: number; row: number } }>;
  hasHydrated: boolean;

  // 对话 CRUD
  createConversation: () => string;
  deleteConversation: (id: string) => void;
  restoreConversation: (conversation: Conversation, index?: number) => void;
  setActiveConversation: (id: string) => void;

  // 多窗口
  addActiveWindow: (id: string) => void;
  removeActiveWindow: (id: string) => void;
  assignConversationToWindow: (conversationId: string, windowId: string) => void;
  removeConversationFromWindow: (windowId: string) => void;

  // 排序 & 重命名
  reorderConversations: (draggedId: string, targetId: string) => void;
  updateConversationTitle: (id: string, title: string) => void;

  // 水合
  setHasHydrated: (hasHydrated: boolean) => void;
  rehydrate: () => void;
}

export const useConversationStore = create<ConversationState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      activeConversationIds: [],
      windowConfigs: {},
      hasHydrated: false,

      createConversation: () => {
        const id = `conv_${Date.now()}`;
        const newConversation: Conversation = {
          id,
          title: '新对话',
          messages: [],
          notes: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({
          conversations: [newConversation, ...state.conversations],
          activeConversationId: id,
        }));
        return id;
      },

      deleteConversation: (id: string) => {
        set((state) => {
          const newConversations = state.conversations.filter((c) => c.id !== id);
          let newActiveId = state.activeConversationId;
          if (state.activeConversationId === id) {
            newActiveId = newConversations[0]?.id || null;
          }
          return { conversations: newConversations, activeConversationId: newActiveId };
        });
      },

      restoreConversation: (conversation: Conversation, index?: number) => {
        set((state) => {
          const newConversations = [...state.conversations];
          const insertIndex =
            index !== undefined && index >= 0 && index <= newConversations.length ? index : 0;
          newConversations.splice(insertIndex, 0, conversation);
          return { conversations: newConversations, activeConversationId: conversation.id };
        });
      },

      setActiveConversation: (id: string) => set({ activeConversationId: id }),

      addActiveWindow: (id: string) => {
        set((state) => {
          if (state.activeConversationIds.includes(id)) return state;
          const newIds = [...state.activeConversationIds, id].slice(-4);
          return { activeConversationIds: newIds };
        });
      },

      removeActiveWindow: (id: string) => {
        set((state) => ({
          activeConversationIds: state.activeConversationIds.filter((cid) => cid !== id),
        }));
      },

      assignConversationToWindow: (conversationId: string, windowId: string) => {
        set((state) => ({
          windowConfigs: {
            ...state.windowConfigs,
            [windowId]: {
              ...state.windowConfigs[windowId],
              conversationId,
              gridArea: state.windowConfigs[windowId]?.gridArea,
            },
          },
          activeConversationIds: state.activeConversationIds.includes(windowId)
            ? state.activeConversationIds
            : [...state.activeConversationIds, windowId].slice(-4),
        }));
      },

      removeConversationFromWindow: (windowId: string) => {
        set((state) => {
          const newConfigs = { ...state.windowConfigs };
          if (newConfigs[windowId]) {
            newConfigs[windowId] = { ...newConfigs[windowId], conversationId: null };
          }
          return { windowConfigs: newConfigs };
        });
      },

      reorderConversations: (draggedId: string, targetId: string) => {
        set((state) => {
          const newConversations = [...state.conversations];
          const draggedIndex = newConversations.findIndex((c) => c.id === draggedId);
          const targetIndex = newConversations.findIndex((c) => c.id === targetId);
          if (draggedIndex !== -1 && targetIndex !== -1) {
            const [draggedConv] = newConversations.splice(draggedIndex, 1);
            newConversations.splice(targetIndex, 0, draggedConv);
          }
          return { conversations: newConversations };
        });
      },

      updateConversationTitle: (id: string, title: string) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === id ? { ...conv, title } : conv
          ),
        }));
      },

      setHasHydrated: (hasHydrated: boolean) => set({ hasHydrated }),

      rehydrate: () => {
        if (typeof window !== 'undefined') {
          const data = window.sessionStorage.getItem('ai-chat-conversations');
          if (data) {
            try {
              const parsed = JSON.parse(data);
              if (parsed.state) {
                set((state) => ({
                  ...state,
                  ...parsed.state,
                  hasHydrated: true,
                }));
              }
            } catch (e) {
              console.error('[conversationStore] Failed to rehydrate:', e);
            }
          }
          set({ hasHydrated: true });
        }
      },
    }),
    {
      name: 'ai-chat-conversations',
      storage: createJSONStorage(() => sessionStorageAdapter),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.error('[conversationStore] Hydration error:', error);
        state?.setHasHydrated(true);
      },
      partialize: (state) => ({
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
        activeConversationIds: state.activeConversationIds,
        windowConfigs: state.windowConfigs,
      }),
      skipHydration: true,
    }
  )
);
