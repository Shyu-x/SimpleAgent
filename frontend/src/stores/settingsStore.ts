// stores/settingsStore.ts - 设置领域 Store
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { APIConfig, ConfiguredModel } from '@/types';
import type { Settings } from '@/types/common';
import { getBaseURLForModel as inferBaseURL } from '@/lib/modelConfig';
import { sessionStorageAdapter } from './storage';

// API Key 验证函数 (MiniMax 单一架构)
export function validateApiKey(apiKey: string): { valid: boolean; error?: string } {
  if (!apiKey || apiKey.trim() === '') {
    return { valid: false, error: 'API Key 不能为空' };
  }
  const trimmedKey = apiKey.trim();
  if (!trimmedKey.startsWith('eyJ') && !trimmedKey.startsWith('sk-')) {
    return { valid: false, error: 'MiniMax API Key 格式不正确' };
  }
  return { valid: true };
}

export function getProviderFromModel(model: string): string {
  if (model.startsWith('MiniMax-')) return 'MiniMax';
  return 'Custom';
}

interface SettingsState {
  settings: Settings;
  apiConfig: Pick<APIConfig, 'apiKey' | 'baseURL' | 'model' | 'temperature' | 'maxTokens' | 'reasoningSplit' | 'thinkingBudget' | 'showThinking'>;
  configuredModels: ConfiguredModel[];
  hasHydrated: boolean;

  // Actions
  setSettings: (settings: Partial<Settings>) => void;
  setApiConfig: (config: Partial<SettingsState['apiConfig']>) => void;
  addConfiguredModel: (config: Omit<ConfiguredModel, 'id' | 'createdAt'>) => void;
  removeConfiguredModel: (id: string) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
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
      apiConfig: {
        apiKey: '',
        baseURL: inferBaseURL('MiniMax-M2.7'),
        model: 'MiniMax-M2.7',
      },
      configuredModels: [],
      hasHydrated: false,

      setSettings: (settings) =>
        set((state) => ({ settings: { ...state.settings, ...settings } })),

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
      name: 'ai-chat-settings',
      storage: createJSONStorage(() => sessionStorageAdapter),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.error('[settingsStore] Hydration error:', error);
        state?.setHasHydrated(true);
      },
      partialize: (state) => ({
        settings: state.settings,
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