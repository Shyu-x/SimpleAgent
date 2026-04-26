import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Message, Conversation, APIConfig, ConfiguredModel, Note, GlobalMemory, MemoryType, MemoryImportance } from '@/types';
import { PromptTemplate } from '@/types/prompts';
import { getBaseURLForModel, getProviderFromModel as inferProviderFromModel } from '@/lib/modelConfig';

// 🔒 安全：使用 sessionStorage 替代 localStorage
// sessionStorage 仅在当前会话（标签页）有效，关闭标签页后自动清除
const sessionStorage = {
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

interface Settings {
  theme: 'light' | 'dark' | 'system';
  desktopPalette: 'aurora' | 'mint' | 'sunset';
  typingSpeed: number;
  fontSize: number;
  windowLayout: 'single' | 'horizontal' | 'vertical' | 'grid';
  animationsEnabled: boolean;
  soundEnabled: boolean;
  autoTitle: boolean;
}

// 🔒 API Key 验证函数 (MiniMax 单一架构)
export function validateApiKey(apiKey: string): { valid: boolean; error?: string } {
  if (!apiKey || apiKey.trim() === '') {
    return { valid: false, error: 'API Key 不能为空' };
  }

  const trimmedKey = apiKey.trim();

  // MiniMax API Key 通常以 eyJ 开头 (JWT) 或 sk- 开头
  if (!trimmedKey.startsWith('eyJ') && !trimmedKey.startsWith('sk-')) {
    return { valid: false, error: 'MiniMax API Key 格式不正确' };
  }

  return { valid: true };
}

export function getProviderFromModel(model: string): string {
  return inferProviderFromModel(model);
}

interface WindowConfig {
  conversationId: string | null;
  gridArea?: { col: number; row: number };
}

interface ChatState {
  conversations: Conversation[];
  globalMemories: GlobalMemory[];
  customPrompts: PromptTemplate[];
  activeConversationId: string | null;
  activeConversationIds: string[];  // 多窗口支持
  appMode: 'chat' | 'agent';  // App 模式
  windowConfigs: Record<string, WindowConfig>;  // 窗口配置 - 支持拖拽分配
  hasHydrated: boolean;
  apiConfig: APIConfig;
  configuredModels: ConfiguredModel[];  // 已配置的模型列表
  settings: Settings;
  showWelcomeGuide: boolean;  // 欢迎指南显示状态
  focusMode: boolean;  // Focus Mode 专注模式
  sidePanelContent: 'none' | 'settings' | 'memory' | 'agents' | 'tools' | 'kb';  // 侧边栏面板内容
  enabledFeatures: {  // 功能开关
    webSearch: boolean;
    deepThinking: boolean;
    imageGeneration: boolean;
  };
  setFocusMode: (focus: boolean) => void;
  setSidePanelContent: (content: 'none' | 'settings' | 'memory' | 'agents' | 'tools' | 'kb') => void;
  toggleFocusMode: () => void;
  setEnabledFeature: (feature: 'webSearch' | 'deepThinking' | 'imageGeneration', enabled: boolean) => void;
  createConversation: () => string;
  deleteConversation: (id: string) => void;
  restoreConversation: (conversation: Conversation, index?: number) => void;
  setActiveConversation: (id: string) => void;
  addActiveWindow: (id: string) => void;
  removeActiveWindow: (id: string) => void;
  addMessage: (conversationId: string, message: Message) => void;
  updateLastMessage: (conversationId: string, content: string) => void;
  updateLastMessageThinking: (conversationId: string, thinking: string) => void;
  setApiConfig: (config: Partial<APIConfig>) => void;
  addConfiguredModel: (config: Omit<ConfiguredModel, 'id' | 'createdAt'>) => void;
  removeConfiguredModel: (id: string) => void;
  setSettings: (settings: Partial<Settings>) => void;
  setShowWelcomeGuide: (show: boolean) => void;
  reorderConversations: (draggedId: string, targetId: string) => void;
  updateConversationTitle: (id: string, title: string) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  updateMessageContent: (conversationId: string, messageId: string, newContent: string) => void;
  finalizeMessage: (conversationId: string, messageId: string) => void;
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
  addCustomPrompt: (
    template: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ) => PromptTemplate;
  updateCustomPrompt: (
    id: string,
    updates: Partial<Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>>
  ) => void;
  deleteCustomPrompt: (id: string) => void;
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
  setHasHydrated: (hasHydrated: boolean) => void;
  setAppMode: (mode: 'chat' | 'agent') => void;
  assignConversationToWindow: (conversationId: string, windowId: string) => void;
  removeConversationFromWindow: (windowId: string) => void;
  rehydrate: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      conversations: [],
      globalMemories: [],
      customPrompts: [],
      activeConversationId: null,
      activeConversationIds: [],
      appMode: 'chat',
      windowConfigs: {},
      hasHydrated: false,
      // 🔒 安全：API Key 由后端管理，前端不再存储敏感信息
      // 默认配置仅包含 model 和 baseURL (用于推断 provider)
      apiConfig: {
        apiKey: '', // 空字符串 - API Key 由后端代理安全存储
        baseURL: getBaseURLForModel('MiniMax-M2.7'),
        model: 'MiniMax-M2.7'
      },
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
      showWelcomeGuide: true,
      configuredModels: [],
      focusMode: false,
      sidePanelContent: 'none' as const,
      enabledFeatures: {
        webSearch: false,
        deepThinking: false,
        imageGeneration: true,
      },

      setFocusMode: (focus: boolean) => set({ focusMode: focus }),
      setSidePanelContent: (content) => set({ sidePanelContent: content }),
      toggleFocusMode: () => set((state) => ({ focusMode: !state.focusMode })),
      setEnabledFeature: (feature, enabled) => set((state) => ({
        enabledFeatures: { ...state.enabledFeatures, [feature]: enabled },
      })),

      createConversation: () => {
        const id = `conv_${Date.now()}`;
        const newConversation: Conversation = {
          id, title: '新对话', messages: [], notes: [], createdAt: Date.now(), updatedAt: Date.now(),
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
          // Insert at the specified index, or at the beginning if not specified
          const insertIndex = index !== undefined && index >= 0 && index <= newConversations.length ? index : 0;
          newConversations.splice(insertIndex, 0, conversation);
          return { conversations: newConversations, activeConversationId: conversation.id };
        });
      },

      setActiveConversation: (id: string) => set({ activeConversationId: id }),

      addActiveWindow: (id: string) => {
        set((state) => {
          if (state.activeConversationIds.includes(id)) return state;
          // 限制最多4个窗口
          const newIds = [...state.activeConversationIds, id].slice(-4);
          return { activeConversationIds: newIds };
        });
      },

      removeActiveWindow: (id: string) => {
        set((state) => ({
          activeConversationIds: state.activeConversationIds.filter((cid) => cid !== id),
        }));
      },

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

      setApiConfig: (config) => set((state) => ({ apiConfig: { ...state.apiConfig, ...config } })),

      // 添加已配置的模型到列表
      addConfiguredModel: (config) => set((state) => {
        // 检查是否已存在相同的配置
        const exists = state.configuredModels.find(
          m => m.model === config.model && m.baseURL === config.baseURL
        );
        if (exists) return state;

        const newModel: ConfiguredModel = {
          ...config,
          id: `configured_${Date.now()}`,
          createdAt: Date.now()
        };
        return {
          configuredModels: [...state.configuredModels, newModel]
        };
      }),

      // 移除已配置的模型
      removeConfiguredModel: (id) => set((state) => ({
        configuredModels: state.configuredModels.filter(m => m.id !== id)
      })),

      setSettings: (settings) => set((state) => ({ settings: { ...state.settings, ...settings } })),
      setShowWelcomeGuide: (show) => set({ showWelcomeGuide: show }),

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

      addNote: (
        conversationId: string,
        content: string,
        metadata?: Partial<Pick<Note, 'type' | 'importance' | 'tags' | 'embedding'>>
      ) => {
        const note = {
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

      // 手动触发状态恢复（用于客户端首次加载）
      rehydrate: () => {
        if (typeof window !== 'undefined') {
          const data = sessionStorage.getItem('ai-chat-storage');
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
              console.error('Failed to rehydrate:', e);
            }
          }
          // 标记已恢复
          set({ hasHydrated: true });
        }
      },

      setHasHydrated: (hasHydrated: boolean) => set({ hasHydrated }),

      setAppMode: (mode: 'chat' | 'agent') => set({ appMode: mode }),

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
          // 确保 activeConversationIds 中包含该窗口
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
    }),
    {
      name: 'ai-chat-storage',
      storage: createJSONStorage(() => sessionStorage),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('Failed to hydrate chat store:', error);
        }
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
        // 仅持久化 baseURL 和 model，不持久化 apiKey（安全考虑）
        apiConfig: {
          baseURL: state.apiConfig.baseURL,
          model: state.apiConfig.model,
          temperature: state.apiConfig.temperature,
          maxTokens: state.apiConfig.maxTokens,
          reasoningSplit: state.apiConfig.reasoningSplit,
          thinkingBudget: state.apiConfig.thinkingBudget,
          showThinking: state.apiConfig.showThinking,
        },
        // 持久化已配置的模型（不含 apiKey），仅保存配置信息
        configuredModels: state.configuredModels.map(m => ({
          ...m,
          apiKey: '' // 不持久化敏感信息
        })),
      }),
      // 跳过服务端水合，防止 hydration mismatch
      // 使用 hasHydrated 状态手动控制客户端水合
      skipHydration: true,
    }
  )
);
