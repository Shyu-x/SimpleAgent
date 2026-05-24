// 手势相关 Hooks
export { useSwipeGesture, useLongPress, useRipple, useDragSort } from './useGesture';

// 意图检测 Hook
export { useIntentDetection, default } from './useIntentDetection';
export type { IntentResult, IntentType } from './useIntentDetection';

// 思维链 Hook
export { useThinkingChain } from './useThinkingChain';

// 虚拟路由 Hook
export { useRouter } from './useRouter';
export type { Route, RouterState } from './useRouter';

// 增强搜索 Hook
export { useSearchEnhanced } from './useSearchEnhanced';

// 自动生图 Hook
export { useAutoImageGeneration } from './useAutoImageGeneration';

// ============ Agent SSE Hooks ============
// 注意: useRealAgentSSE 在 useAgentSSE.ts 和 useRealAgentSSE.ts 中有重复定义
// useAgentSSE.ts - 轮询模式 + 简单 SSE
// useRealAgentSSE.ts - 完整 SSEClient + 多路复用
export { useAgentSSE, useRealAgentSSE } from './useAgentSSE';
export { useRealAgentSSE as useRealAgentSSEAlt } from './useRealAgentSSE';

// ============ HITL Hooks ============
export { useHumanInTheLoop, CheckpointModal } from './useHITL';
export { useHITLSSE } from './useHITLSSE';

// ============ 增强 Agent Hooks ============
export { useEnhancedAgent } from './useEnhancedAgent';
export { useEnhancedMemory } from './useEnhancedMemory';
export { useMemorySystem } from './useMemorySystem';
export { useMultiAgent } from './useMultiAgent';
export { useMCP } from './useMCP';
export { useN8N } from './useN8N';

// ============ Admin SSE Hook ============
export { useAdminSSE } from './useAdminSSE';
export type { SystemStats, QdrantStatus, CollectionInfo, AdminSSEEvent } from '@/lib/sse-clients';

// ============ 浏览器自动化 Hook ============
export { useBrowser } from './useBrowser';

// ============ 搜索 Hooks ============
export { useSearch } from './useSearch';

// ============ 工作流执行 Hook ============
export { useWorkflowExecution } from './useWorkflowExecution';

// ============ 图片意图 Hook ============
export { detectImageIntent, cleanImagePrompt } from './useImageIntent';
export { default as useImageIntent } from './useImageIntent';
