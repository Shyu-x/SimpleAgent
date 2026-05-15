// stores/unifiedStore.ts - 统一 Store (向后兼容)
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Message, Conversation, APIConfig, ConfiguredModel, Note, GlobalMemory, MemoryType, MemoryImportance } from '@/types';
import { PromptTemplate } from '@/types/prompts';
import { getBaseURLForModel } from '@/lib/modelConfig';

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

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  desktopPalette: 'aurora' | 'mint' | 'sunset';
  typingSpeed: number;
  fontSize: number;
  windowLayout: 'single' | 'horizontal' | 'vertical' | 'grid';
  animationsEnabled: boolean;
  soundEnabled: boolean;
  autoTitle: boolean;
}

export interface EnabledFeatures {
  webSearch: boolean;
  deepThinking: boolean;
  imageGeneration: boolean;
}

export interface WindowConfig {
  conversationId: string | null;
  gridArea?: { col: number; row: number };
}

interface UnifiedState {
  // 对话状态
  conversations: Conversation[];
  activeConversationId: string | null;
  activeConversationIds: string[];
  windowConfigs: Record<string, WindowConfig>;

  // 消息状态
  globalMemories: GlobalMemory[];
  customPrompts: PromptTemplate[];

  // 设置状态
  settings: Settings;
  apiConfig: APIConfig;
  configuredModels: ConfiguredModel[];

  // UI 状态
  appMode: 'chat' | 'agent';
  focusMode: boolean;
  sidePanelContent: 'none' | 'settings' | 'memory' | 'agents' | 'tools' | 'kb';
  showWelcomeGuide: boolean;
  enabledFeatures: EnabledFeatures;
  hasHydrated: boolean;

  // 对话 CRUD
  createConversation: () => string;
  deleteConversation: (id: string) => void;
  restoreConversation: (conversation: Conversation, index?: number) => void;
  setActiveConversation: (id: string) => void;
  reorderConversations: (draggedId: string, targetId: string) => void;
  updateConversationTitle: (id: string, title: string) => void;

  // 多窗口
  addActiveWindow: (id: string) => void;
  removeActiveWindow: (id: string) => void;
  assignConversationToWindow: (conversationId: string, windowId: string) => void;
  removeConversationFromWindow: (windowId: string) => void;

  // 消息操作
  addMessage: (conversationId: string, message: Message) => void;
  updateLastMessage: (conversationId: string, content: string) => void;
  updateLastMessageThinking: (conversationId: string, thinking: string) => void;
  finalizeMessage: (conversationId: string, messageId: string) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  updateMessageContent: (conversationId: string, messageId: string, newContent: string) => void;

  // 备注操作
  addNote: (
    conversationId: string,
    content: string,
    metadata?: Partial<Pick<Note, 'type' | 'importance' | 'tags' | 'embedding'>>
  ) => void;
  updateNote: (
    conversationId: string,
    noteId: string,
    updates: string | Partial<Omit<Note, 'id' | 'createdAt'>>
  ) => void;
  deleteNote: (conversationId: string, noteId: string) => void;

  // 自定义提示词
  addCustomPrompt: (
    template: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ) => PromptTemplate;
  updateCustomPrompt: (
    id: string,
    updates: Partial<Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>>
  ) => void;
  deleteCustomPrompt: (id: string) => void;

  // 全局记忆
  addGlobalMemory: (
    content: string,
    type?: MemoryType,
    importance?: MemoryImportance,
    tags?: string[]
  ) => GlobalMemory;
  updateGlobalMemory: (
    id: string,
    updates: Partial<Omit<GlobalMemory, 'id' | 'userId'>>
  ) => void;
  deleteGlobalMemory: (id: string) => void;
  bumpGlobalMemoryAccess: (id: string) => void;
  hydrateGlobalMemories: (memories: GlobalMemory[]) => void;

  // 设置
  setApiConfig: (config: Partial<APIConfig>) => void;
  addConfiguredModel: (config: Omit<ConfiguredModel, 'id' | 'createdAt'>) => void;
  removeConfiguredModel: (id: string) => void;
  setSettings: (settings: Partial<Settings>) => void;
  setShowWelcomeGuide: (show: boolean) => void;

  // UI 状态
  setFocusMode: (focus: boolean) => void;
  setSidePanelContent: (content: 'none' | 'settings' | 'memory' | 'agents' | 'tools' | 'kb') => void;
  toggleFocusMode: () => void;
  setEnabledFeature: (feature: 'webSearch' | 'deepThinking' | 'imageGeneration', enabled: boolean) => void;
  setAppMode: (mode: 'chat' | 'agent') => void;

  // 水合
  setHasHydrated: (hasHydrated: boolean) => void;
  rehydrate: () => void;
}

export const useUnifiedStore = create<UnifiedState>()(
  persist(
    (set, get) => ({
      // 初始状态
      conversations: [],
      activeConversationId: null,
      activeConversationIds: [],
      windowConfigs: {},
      globalMemories: [],
      customPrompts: [],
      appMode: 'chat',
      focusMode: false,
      sidePanelContent: 'none',
      showWelcomeGuide: true,
      enabledFeatures: {
        webSearch: false,
        deepThinking: false,
        imageGeneration: true,
      },
      hasHydrated: false,
      apiConfig: {
        apiKey: '',
        baseURL: getBaseURLForModel('MiniMax-M2.7'),
        model: 'MiniMax-M2.7',
      },
      configuredModels: [],
      settings: {
        theme: 'system',
        desktopPalette: 'aurora',
        typingSpeed: 30,
        fontSize: 14,
        windowLayout: 'single',
        animationsEnabled: true,
        soundEnabled: false,
        autoTitle: true,
      },

      // 对话 CRUD
      createConversation: () => {
        const id = `conv_${Date.now()}`;
        const newConversation: Conversation = {
          id, title: '新对话', messages: [], notes: [], createdAt: Date.now(), updatedAt: Date.now(),
        };
        set((state) => ({
          conversations: [newConversation, ...state.conversations],
          activeConversationId: id,
          activeConversationIds: [...state.activeConversationIds, id].slice(-4),
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
          const insertIndex = index !== undefined && index >= 0 && index <= newConversations.length ? index : 0;
          newConversations.splice(insertIndex, 0, conversation);
          return { conversations: newConversations, activeConversationId: conversation.id };
        });
      },

      setActiveConversation: (id: string) => set({ activeConversationId: id }),

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

      // 多窗口
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

      // 消息操作
      addMessage: (conversationId: string, message: Message) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  messages: [...conv.messages, message],
                  updatedAt: Date.now(),
                  title: conv.messages.length === 0 && message.role === 'user'
                    ? message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '')
                    : conv.title,
                }
              : conv
          ),
        }));
      },

      updateLastMessage: (conversationId: string, content: string) => {
        set((state) => ({
          conversations: state.conversations.map((conv) => {
            if (conv.id !== conversationId) return conv;
            const messages = [...conv.messages];
            if (messages.length > 0) {
              messages[messages.length - 1] = { ...messages[messages.length - 1], content };
            }
            return { ...conv, messages, updatedAt: Date.now() };
          }),
        }));
      },

      updateLastMessageThinking: (conversationId: string, thinking: string) => {
        set((state) => ({
          conversations: state.conversations.map((conv) => {
            if (conv.id !== conversationId) return conv;
            const messages = [...conv.messages];
            if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
              messages[messages.length - 1] = { ...messages[messages.length - 1], thinking };
            }
            return { ...conv, messages, updatedAt: Date.now() };
          }),
        }));
      },

      finalizeMessage: (conversationId: string, messageId: string) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
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
        }));
      },

      deleteMessage: (conversationId: string, messageId: string) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? { ...conv, messages: conv.messages.filter((m) => m.id !== messageId) }
              : conv
          ),
        }));
      },

      updateMessageContent: (conversationId: string, messageId: string, newContent: string) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  messages: conv.messages.map((m) =>
                    m.id === messageId ? { ...m, content: newContent } : m
                  )
                }
              : conv
          ),
        }));
      },

      // 备注操作
      addNote: (
        conversationId: string,
        content: string,
        metadata?: Partial<Pick<Note, 'type' | 'importance' | 'tags' | 'embedding'>>
      ) => {
        const note: Note = {
          id: `note_${Date.now()}`,
          content,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          ...(metadata || {}),
        };
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? { ...conv, notes: [...conv.notes, note], updatedAt: Date.now() }
              : conv
          ),
        }));
      },

      updateNote: (
        conversationId: string,
        noteId: string,
        updates: string | Partial<Omit<Note, 'id' | 'createdAt'>>
      ) => {
        const normalized = typeof updates === 'string' ? { content: updates } : updates;
        set((state) => ({
          conversations: state.conversations.map((conv) => {
            if (conv.id !== conversationId) return conv;
            const notes = conv.notes.map((n) =>
              n.id === noteId ? { ...n, ...normalized, updatedAt: Date.now() } : n
            );
            return { ...conv, notes, updatedAt: Date.now() };
          }),
        }));
      },

      deleteNote: (conversationId: string, noteId: string) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? { ...conv, notes: conv.notes.filter((n) => n.id !== noteId), updatedAt: Date.now() }
              : conv
          ),
        }));
      },

      // 自定义提示词
      addCustomPrompt: (
        template: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>
      ) => {
        const now = Date.now();
        const prompt: PromptTemplate = {
          ...template,
          id: `custom_${now}_${Math.random().toString(36).slice(2, 8)}`,
          icon: template.icon || 'sparkles',
          color: template.color || 'hsl(var(--guide-11))',
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          customPrompts: [prompt, ...state.customPrompts],
        }));
        return prompt;
      },

      updateCustomPrompt: (
        id: string,
        updates: Partial<Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>>
      ) => {
        set((state) => ({
          customPrompts: state.customPrompts.map((prompt) =>
            prompt.id === id
              ? { ...prompt, ...updates, updatedAt: Date.now() }
              : prompt
          ),
        }));
      },

      deleteCustomPrompt: (id: string) => {
        set((state) => ({
          customPrompts: state.customPrompts.filter((prompt) => prompt.id !== id),
        }));
      },

      // 全局记忆
      addGlobalMemory: (
        content: string,
        type: MemoryType = 'general',
        importance: MemoryImportance = 'medium',
        tags: string[] = []
      ) => {
        const memory: GlobalMemory = {
          id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          userId: 'default',
          content,
          type,
          importance,
          tags,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 0,
        };
        set((state) => ({
          globalMemories: [...state.globalMemories, memory],
        }));
        return memory;
      },

      updateGlobalMemory: (
        id: string,
        updates: Partial<Omit<GlobalMemory, 'id' | 'userId'>>
      ) => {
        set((state) => ({
          globalMemories: state.globalMemories.map((memory) =>
            memory.id === id
              ? { ...memory, ...updates, updatedAt: Date.now() }
              : memory
          ),
        }));
      },

      deleteGlobalMemory: (id: string) => {
        set((state) => ({
          globalMemories: state.globalMemories.filter((memory) => memory.id !== id),
        }));
      },

      bumpGlobalMemoryAccess: (id: string) => {
        set((state) => ({
          globalMemories: state.globalMemories.map((memory) =>
            memory.id === id
              ? {
                  ...memory,
                  accessCount: memory.accessCount + 1,
                  lastAccessedAt: Date.now(),
                  updatedAt: Date.now(),
                }
              : memory
          ),
        }));
      },

      hydrateGlobalMemories: (memories: GlobalMemory[]) => {
        set(() => ({
          globalMemories: memories,
        }));
      },

      // 设置
      setApiConfig: (config) => set((state) => ({ apiConfig: { ...state.apiConfig, ...config } })),
      setSettings: (settings) => set((state) => ({ settings: { ...state.settings, ...settings } })),
      setShowWelcomeGuide: (show) => set({ showWelcomeGuide: show }),

      addConfiguredModel: (config) =>
        set((state) => {
          const exists = state.configuredModels.find(
            (m) => m.model === config.model && m.baseURL === config.baseURL
          );
          if (exists) return state;
          const newModel: ConfiguredModel = {
            ...config,
            id: `configured_${Date.now()}`,
            createdAt: Date.now(),
          };
          return { configuredModels: [...state.configuredModels, newModel] };
        }),

      removeConfiguredModel: (id) =>
        set((state) => ({
          configuredModels: state.configuredModels.filter((m) => m.id !== id),
        })),

      // UI 状态
      setFocusMode: (focus: boolean) => set({ focusMode: focus }),
      setSidePanelContent: (content) => set({ sidePanelContent: content }),
      toggleFocusMode: () => set((state) => ({ focusMode: !state.focusMode })),
      setEnabledFeature: (feature, enabled) =>
        set((state) => ({ enabledFeatures: { ...state.enabledFeatures, [feature]: enabled } })),
      setAppMode: (mode) => set({ appMode: mode }),

      // 水合
      setHasHydrated: (hasHydrated: boolean) => set({ hasHydrated }),

      rehydrate: () => {
        if (typeof window !== 'undefined') {
          const data = sessionStorageAdapter.getItem('ai-chat-storage');
          if (data) {
            try {
              const parsed = JSON.parse(data);
              const stateToRestore = parsed.state || parsed;
              if (stateToRestore) {
                set((state) => {
                  const restoredConversations = stateToRestore.conversations || [];
                  let restoredActiveId = stateToRestore.activeConversationId || null;
                  if (restoredActiveId && !restoredConversations.some((c: Conversation) => c.id === restoredActiveId)) {
                    restoredActiveId = null;
                  }
                  return {
                    ...state,
                    ...stateToRestore,
                    activeConversationId: restoredActiveId,
                    hasHydrated: true,
                  };
                });
                return;
              }
            } catch (e) {
              console.error('[unifiedStore] Failed to rehydrate:', e);
            }
          }
          set({ hasHydrated: true });
        }
      },
    }),
    {
      name: 'ai-chat-storage',
      storage: createJSONStorage(() => sessionStorageAdapter),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.error('[unifiedStore] Hydration error:', error);
        state?.setHasHydrated(true);
      },
      partialize: (state) => ({
        conversations: state.conversations,
        globalMemories: state.globalMemories,
        customPrompts: state.customPrompts,
        activeConversationId: state.activeConversationId,
        activeConversationIds: state.activeConversationIds,
        appMode: state.appMode,
        windowConfigs: state.windowConfigs,
        focusMode: state.focusMode,
        settings: state.settings,
        enabledFeatures: state.enabledFeatures,
        showWelcomeGuide: state.showWelcomeGuide,
        apiConfig: {
          baseURL: state.apiConfig.baseURL,
          model: state.apiConfig.model,
          temperature: state.apiConfig.temperature,
          maxTokens: state.apiConfig.maxTokens,
          reasoningSplit: state.apiConfig.reasoningSplit,
          thinkingBudget: state.apiConfig.thinkingBudget,
          showThinking: state.apiConfig.showThinking,
        },
        configuredModels: state.configuredModels.map((m) => ({ ...m, apiKey: '' })),
      }),
      skipHydration: true,
    }
  )
);

// 向后兼容别名
export const useChatStore = useUnifiedStore;