// stores/uiStore.ts - UI 状态领域 Store
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { APIConfig, ConfiguredModel } from '@/types';
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

export type SidePanelContent = 'none' | 'settings' | 'memory' | 'agents' | 'tools' | 'kb';
export type AppMode = 'chat' | 'agent';

interface UIState {
  // UI 状态
  settings: Settings;
  focusMode: boolean;
  sidePanelContent: SidePanelContent;
  appMode: AppMode;
  showWelcomeGuide: boolean;
  enabledFeatures: EnabledFeatures;
  hasHydrated: boolean;

  // API 配置（不含敏感信息）
  apiConfig: Pick<APIConfig, 'baseURL' | 'model' | 'temperature' | 'maxTokens' | 'reasoningSplit' | 'thinkingBudget' | 'showThinking'>;
  configuredModels: ConfiguredModel[];

  // Actions
  setFocusMode: (focus: boolean) => void;
  setSidePanelContent: (content: SidePanelContent) => void;
  toggleFocusMode: () => void;
  setEnabledFeature: (feature: keyof EnabledFeatures, enabled: boolean) => void;
  setSettings: (settings: Partial<Settings>) => void;
  setShowWelcomeGuide: (show: boolean) => void;
  setAppMode: (mode: AppMode) => void;
  setApiConfig: (config: Partial<UIState['apiConfig']>) => void;
  addConfiguredModel: (config: Omit<ConfiguredModel, 'id' | 'createdAt'>) => void;
  removeConfiguredModel: (id: string) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
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
      focusMode: false,
      sidePanelContent: 'none',
      appMode: 'chat',
      showWelcomeGuide: true,
      enabledFeatures: {
        webSearch: false,
        deepThinking: false,
        imageGeneration: true,
      },
      hasHydrated: false,
      apiConfig: {
        baseURL: getBaseURLForModel('MiniMax-M2.7'),
        model: 'MiniMax-M2.7',
      },
      configuredModels: [],

      setFocusMode: (focus) => set({ focusMode: focus }),
      setSidePanelContent: (content) => set({ sidePanelContent: content }),
      toggleFocusMode: () => set((state) => ({ focusMode: !state.focusMode })),
      setEnabledFeature: (feature, enabled) =>
        set((state) => ({ enabledFeatures: { ...state.enabledFeatures, [feature]: enabled } })),
      setSettings: (settings) => set((state) => ({ settings: { ...state.settings, ...settings } })),
      setShowWelcomeGuide: (show) => set({ showWelcomeGuide: show }),
      setAppMode: (mode) => set({ appMode: mode }),

      setApiConfig: (config) =>
        set((state) => ({ apiConfig: { ...state.apiConfig, ...config } })),

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

      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: 'ai-chat-ui',
      storage: createJSONStorage(() => sessionStorageAdapter),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.error('[uiStore] Hydration error:', error);
        state?.setHasHydrated(true);
      },
      partialize: (state) => ({
        settings: state.settings,
        focusMode: state.focusMode,
        appMode: state.appMode,
        showWelcomeGuide: state.showWelcomeGuide,
        enabledFeatures: state.enabledFeatures,
        apiConfig: state.apiConfig,
        configuredModels: state.configuredModels.map((m) => ({ ...m, apiKey: '' })),
      }),
      skipHydration: true,
    }
  )
);
