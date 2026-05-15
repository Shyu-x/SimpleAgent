// stores/memoryStore.ts - 记忆与自定义提示词领域 Store
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { GlobalMemory, MemoryType, MemoryImportance } from '@/types';
import { PromptTemplate } from '@/types/prompts';

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

export interface MemoryState {
  // State
  globalMemories: GlobalMemory[];
  customPrompts: PromptTemplate[];
  hasHydrated: boolean;

  // 全局记忆 CRUD
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

  // 自定义提示词 CRUD
  addCustomPrompt: (
    template: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ) => PromptTemplate;
  updateCustomPrompt: (
    id: string,
    updates: Partial<Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>>
  ) => void;
  deleteCustomPrompt: (id: string) => void;

  // 水合
  setHasHydrated: (hasHydrated: boolean) => void;
}

export const useMemoryStore = create<MemoryState>()(
  persist(
    (set) => ({
      globalMemories: [],
      customPrompts: [],
      hasHydrated: false,

      // 全局记忆 CRUD
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

      updateGlobalMemory: (id, updates) => {
        set((state) => ({
          globalMemories: state.globalMemories.map((memory) =>
            memory.id === id
              ? { ...memory, ...updates, updatedAt: Date.now() }
              : memory
          ),
        }));
      },

      deleteGlobalMemory: (id) => {
        set((state) => ({
          globalMemories: state.globalMemories.filter((memory) => memory.id !== id),
        }));
      },

      bumpGlobalMemoryAccess: (id) => {
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

      hydrateGlobalMemories: (memories) => {
        set(() => ({
          globalMemories: memories,
        }));
      },

      // 自定义提示词 CRUD
      addCustomPrompt: (template) => {
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

      updateCustomPrompt: (id, updates) => {
        set((state) => ({
          customPrompts: state.customPrompts.map((prompt) =>
            prompt.id === id
              ? { ...prompt, ...updates, updatedAt: Date.now() }
              : prompt
          ),
        }));
      },

      deleteCustomPrompt: (id) => {
        set((state) => ({
          customPrompts: state.customPrompts.filter((prompt) => prompt.id !== id),
        }));
      },

      // 水合
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: 'ai-chat-memory',
      storage: createJSONStorage(() => sessionStorageAdapter),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.error('[memoryStore] Hydration error:', error);
        state?.setHasHydrated(true);
      },
      partialize: (state) => ({
        globalMemories: state.globalMemories,
        customPrompts: state.customPrompts,
      }),
      skipHydration: true,
    }
  )
);
