// stores/unifiedStore.ts - 统一 Store (向后兼容代理模式)
import { create } from 'zustand';
import type { Message, Conversation, Note, GlobalMemory, MemoryType, MemoryImportance, ConfiguredModel } from '@/types';
import { PromptTemplate } from '@/types/prompts';
import { useConversationStore } from './conversationStore';
import { useMessageStore } from './messageStore';
import { useUIStore } from './uiStore';
import { useSettingsStore } from './settingsStore';
import { useMemoryStore } from './memoryStore';

// 代理模式：聚合专用 Store，提供向后兼容接口
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
  // 状态代理
  conversations: Conversation[];
  activeConversationId: string | null;
  activeConversationIds: string[];
  windowConfigs: Record<string, WindowConfig>;
  globalMemories: GlobalMemory[];
  customPrompts: PromptTemplate[];
  settings: Settings;
  apiConfig: { apiKey: string; baseURL: string; model: string; temperature?: number; maxTokens?: number; reasoningSplit?: boolean; thinkingBudget?: number; showThinking?: boolean };
  configuredModels: ConfiguredModel[];
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
  updateConversationTitle: (id: string, title: string) => void;

  // 多窗口
  addActiveWindow: (id: string) => void;
  removeActiveWindow: (id: string) => void;
  assignConversationToWindow: (conversationId: string, windowId: string) => void;
  removeConversationFromWindow: (windowId: string) => void;
  openConversation: (id: string, options?: { targetWindow?: number }) => void;

  // 消息操作
  addMessage: (conversationId: string, message: Message) => void;
  updateLastMessage: (conversationId: string, content: string) => void;
  updateLastMessageThinking: (conversationId: string, thinking: string) => void;
  finalizeMessage: (conversationId: string, messageId: string) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  updateMessageContent: (conversationId: string, messageId: string, newContent: string) => void;

  // 备注操作
  addNote: (conversationId: string, content: string, metadata?: Partial<Pick<Note, 'type' | 'importance' | 'tags' | 'embedding'>>) => void;
  updateNote: (conversationId: string, noteId: string, updates: string | Partial<Omit<Note, 'id' | 'createdAt'>>) => void;
  deleteNote: (conversationId: string, noteId: string) => void;

  // 自定义提示词
  addCustomPrompt: (template: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>) => PromptTemplate;
  updateCustomPrompt: (id: string, updates: Partial<Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>>) => void;
  deleteCustomPrompt: (id: string) => void;

  // 全局记忆
  addGlobalMemory: (content: string, type?: MemoryType, importance?: MemoryImportance, tags?: string[]) => GlobalMemory;
  updateGlobalMemory: (id: string, updates: Partial<Omit<GlobalMemory, 'id' | 'userId'>>) => void;
  deleteGlobalMemory: (id: string) => void;
  bumpGlobalMemoryAccess: (id: string) => void;
  hydrateGlobalMemories: (memories: GlobalMemory[]) => void;

  // 设置
  setApiConfig: (config: Partial<{ apiKey: string; baseURL: string; model: string; temperature?: number; maxTokens?: number; reasoningSplit?: boolean; thinkingBudget?: number; showThinking?: boolean }>) => void;
  addConfiguredModel: (config: Omit<ConfiguredModel, 'id' | 'createdAt'>) => void;
  removeConfiguredModel: (id: string) => void;
  setSettings: (settings: Partial<Settings>) => void;
  setShowWelcomeGuide: (show: boolean) => void;

  // UI 状态
  setFocusMode: (focus: boolean) => void;
  setSidePanelContent: (content: UnifiedState['sidePanelContent']) => void;
  toggleFocusMode: () => void;
  setEnabledFeature: (feature: 'webSearch' | 'deepThinking' | 'imageGeneration', enabled: boolean) => void;
  setAppMode: (mode: 'chat' | 'agent') => void;

  // 水合
  setHasHydrated: (hasHydrated: boolean) => void;
  rehydrate: () => void;
}

export const useUnifiedStore = create<UnifiedState>()((set, get) => {
  // 对话 Store 变化时同步状态
  useConversationStore.subscribe((conversationState) => {
    set({
      conversations: conversationState.conversations,
      activeConversationId: conversationState.activeConversationId,
      activeConversationIds: conversationState.activeConversationIds,
      windowConfigs: conversationState.windowConfigs,
      hasHydrated: conversationState.hasHydrated,
    });
  });

  // 记忆 Store 变化时同步
  useMemoryStore.subscribe((memoryState) => {
    set({
      globalMemories: memoryState.globalMemories,
      customPrompts: memoryState.customPrompts,
    });
  });

  // 设置 Store 变化时同步
  useSettingsStore.subscribe((settingsState) => {
    set({
      settings: settingsState.settings,
      apiConfig: settingsState.apiConfig,
      configuredModels: settingsState.configuredModels,
    });
  });

  // UI Store 变化时同步
  useUIStore.subscribe((uiState) => {
    set({
      appMode: uiState.appMode,
      focusMode: uiState.focusMode,
      sidePanelContent: uiState.sidePanelContent,
      showWelcomeGuide: uiState.showWelcomeGuide,
      enabledFeatures: uiState.enabledFeatures,
    });
  });

  // 获取各 Store 初始状态
  const conversationState = useConversationStore.getState();
  const memoryState = useMemoryStore.getState();
  const settingsState = useSettingsStore.getState();
  const uiState = useUIStore.getState();

  return {
    // 初始状态
    conversations: conversationState.conversations,
    activeConversationId: conversationState.activeConversationId,
    activeConversationIds: conversationState.activeConversationIds,
    windowConfigs: conversationState.windowConfigs,
    globalMemories: memoryState.globalMemories,
    customPrompts: memoryState.customPrompts,
    settings: settingsState.settings,
    apiConfig: settingsState.apiConfig,
    configuredModels: settingsState.configuredModels,
    appMode: uiState.appMode,
    focusMode: uiState.focusMode,
    sidePanelContent: uiState.sidePanelContent,
    showWelcomeGuide: uiState.showWelcomeGuide,
    enabledFeatures: uiState.enabledFeatures,
    hasHydrated: conversationState.hasHydrated,

    // 对话 CRUD
    createConversation: () => useConversationStore.getState().createConversation(),
    deleteConversation: (id) => useConversationStore.getState().deleteConversation(id),
    restoreConversation: (conversation, index) =>
      useConversationStore.getState().restoreConversation(conversation, index),
    setActiveConversation: (id) => useConversationStore.getState().setActiveConversation(id),
    updateConversationTitle: (id, title) =>
      useConversationStore.getState().updateConversationTitle(id, title),

    // 多窗口
    addActiveWindow: (id) => useConversationStore.getState().addActiveWindow(id),
    removeActiveWindow: (id) => useConversationStore.getState().removeActiveWindow(id),
    assignConversationToWindow: (conversationId, windowId) =>
      useConversationStore.getState().assignConversationToWindow(conversationId, windowId),
    removeConversationFromWindow: (windowId) =>
      useConversationStore.getState().removeConversationFromWindow(windowId),
    openConversation: (id, options) =>
      useConversationStore.getState().openConversation(id, options),

    // 消息操作
    addMessage: (conversationId, message) => {
      const conversations = useConversationStore.getState().conversations;
      const updated = useMessageStore.getState().addMessage(conversationId, conversations, message);
      useConversationStore.setState({ conversations: updated });
    },
    updateLastMessage: (conversationId, content) => {
      const conversations = useConversationStore.getState().conversations;
      const updated = useMessageStore.getState().updateLastMessage(conversationId, conversations, content);
      useConversationStore.setState({ conversations: updated });
    },
    updateLastMessageThinking: (conversationId, thinking) => {
      const conversations = useConversationStore.getState().conversations;
      const updated = useMessageStore.getState().updateLastMessageThinking(conversationId, conversations, thinking);
      useConversationStore.setState({ conversations: updated });
    },
    finalizeMessage: (conversationId, messageId) => {
      const conversations = useConversationStore.getState().conversations;
      const updated = useMessageStore.getState().finalizeMessage(conversationId, conversations, messageId);
      useConversationStore.setState({ conversations: updated });
    },
    deleteMessage: (conversationId, messageId) => {
      const conversations = useConversationStore.getState().conversations;
      const updated = useMessageStore.getState().deleteMessage(conversationId, conversations, messageId);
      useConversationStore.setState({ conversations: updated });
    },
    updateMessageContent: (conversationId, messageId, newContent) => {
      const conversations = useConversationStore.getState().conversations;
      const updated = useMessageStore.getState().updateMessageContent(conversationId, conversations, messageId, newContent);
      useConversationStore.setState({ conversations: updated });
    },

    // 备注操作
    addNote: (conversationId, content, metadata) => {
      const conversations = useConversationStore.getState().conversations;
      const updated = useMessageStore.getState().addNote(conversationId, conversations, content, metadata);
      useConversationStore.setState({ conversations: updated });
    },
    updateNote: (conversationId, noteId, updates) => {
      const conversations = useConversationStore.getState().conversations;
      const updated = useMessageStore.getState().updateNote(conversationId, conversations, noteId, updates);
      useConversationStore.setState({ conversations: updated });
    },
    deleteNote: (conversationId, noteId) => {
      const conversations = useConversationStore.getState().conversations;
      const updated = useMessageStore.getState().deleteNote(conversationId, conversations, noteId);
      useConversationStore.setState({ conversations: updated });
    },

    // 自定义提示词
    addCustomPrompt: (template) => useMemoryStore.getState().addCustomPrompt(template),
    updateCustomPrompt: (id, updates) => useMemoryStore.getState().updateCustomPrompt(id, updates),
    deleteCustomPrompt: (id) => useMemoryStore.getState().deleteCustomPrompt(id),

    // 全局记忆
    addGlobalMemory: (content, type, importance, tags) =>
      useMemoryStore.getState().addGlobalMemory(content, type, importance, tags),
    updateGlobalMemory: (id, updates) => useMemoryStore.getState().updateGlobalMemory(id, updates),
    deleteGlobalMemory: (id) => useMemoryStore.getState().deleteGlobalMemory(id),
    bumpGlobalMemoryAccess: (id) => useMemoryStore.getState().bumpGlobalMemoryAccess(id),
    hydrateGlobalMemories: (memories) => useMemoryStore.getState().hydrateGlobalMemories(memories),

    // 设置
    setApiConfig: (config) => useSettingsStore.getState().setApiConfig(config),
    addConfiguredModel: (config) => useSettingsStore.getState().addConfiguredModel(config),
    removeConfiguredModel: (id) => useSettingsStore.getState().removeConfiguredModel(id),
    setSettings: (settings) => useSettingsStore.getState().setSettings(settings),
    setShowWelcomeGuide: (show) => useUIStore.getState().setShowWelcomeGuide(show),

    // UI 状态
    setFocusMode: (focus) => useUIStore.getState().setFocusMode(focus),
    setSidePanelContent: (content) => useUIStore.getState().setSidePanelContent(content),
    toggleFocusMode: () => useUIStore.getState().toggleFocusMode(),
    setEnabledFeature: (feature, enabled) => useUIStore.getState().setEnabledFeature(feature, enabled),
    setAppMode: (mode) => useUIStore.getState().setAppMode(mode),

    // 水合
    setHasHydrated: (hasHydrated) => {
      useConversationStore.getState().setHasHydrated(hasHydrated);
    },
    rehydrate: () => useConversationStore.getState().rehydrate(),
  };
});

// 向后兼容别名
export const useChatStore = useUnifiedStore;