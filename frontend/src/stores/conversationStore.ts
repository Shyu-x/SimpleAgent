// stores/conversationStore.ts - 对话 CRUD 领域 Store
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Conversation } from '@/types';
import { useSettingsStore } from './settingsStore';
import { sessionStorageAdapter } from './storage';

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
  updateConversationTitle: (id: string, title: string) => void;

  // 打开对话（支持多窗口）
  openConversation: (id: string, options?: { targetWindow?: number }) => void;

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

      updateConversationTitle: (id: string, title: string) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === id ? { ...conv, title } : conv
          ),
        }));
      },

      openConversation: (id: string, options?: { targetWindow?: number }) => {
        const state = get();
        const { windowLayout } = useSettingsStore.getState().settings;
        // 单窗口模式：直接切换
        if (windowLayout === 'single') {
          set({ activeConversationId: id, activeConversationIds: [id] });
          return;
        }
        // 多窗口模式
        if (options?.targetWindow !== undefined) {
          const windowId = state.activeConversationIds[options.targetWindow];
          if (windowId) {
            get().assignConversationToWindow(id, windowId);
          }
        } else {
          const maxWindows = windowLayout === 'grid' ? 4 : 2;
          const hasEmptyWindow = state.activeConversationIds.length < maxWindows;
          if (hasEmptyWindow) {
            get().addActiveWindow(id);
          } else {
            const firstWindow = state.activeConversationIds[0];
            if (firstWindow) {
              get().assignConversationToWindow(id, firstWindow);
            }
          }
        }
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
