// stores/index.ts - Store 统一导出
// 使用说明：
// - 对话 CRUD：useConversationStore
// - 消息操作：useMessageStore (纯函数，需配合 conversationStore)
// - UI 状态：useUIStore
// - 设置：useSettingsStore
// - 统一状态：useUnifiedStore (向后兼容)
// - 向后兼容：useChatStore (从 @/store/chatStore 导入)

export { useConversationStore } from './conversationStore';
export type { ConversationState } from './conversationStore';

export { useMessageStore } from './messageStore';

export { useUIStore } from './uiStore';
export type { Settings, EnabledFeatures, SidePanelContent, AppMode } from './uiStore';

export { useSettingsStore } from './settingsStore';
export type { Settings as AppSettings } from './settingsStore';

export { useUnifiedStore, useChatStore } from './unifiedStore';
export { validateApiKey, getProviderFromModel } from './settingsStore';

// Agent 相关 store
export { useMissionControlStore } from '@/components/agent/MissionControl/store';
export type { ActionHistoryItem } from '@/components/agent/MissionControl/types';