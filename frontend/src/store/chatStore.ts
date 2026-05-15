// store/chatStore.ts - 向后兼容层 (deprecated)
// 推荐使用 @/stores 中的模块化 store
// - useConversationStore: 对话 CRUD
// - useMessageStore: 消息操作
// - useUIStore: UI 状态
// - useSettingsStore: 设置
// - useUnifiedStore: 统一 store (完整功能)

export { useUnifiedStore as useChatStore } from '@/stores/unifiedStore';
export { validateApiKey, getProviderFromModel } from '@/stores/settingsStore';