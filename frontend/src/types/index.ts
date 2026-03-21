export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  attachments?: Attachment[];
  isComplete?: boolean;
  // 思维链内容（流式累积）
  thinking?: string;
}

export interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'audio' | 'document';
  url: string;
  size: number;
  preview?: string;
  duration?: number;
}

// 记忆类型 - 参考mem0的多层次记忆
export type MemoryType = 'user_pref' | 'context' | 'knowledge' | 'task' | 'general';

// 记忆重要性级别
export type MemoryImportance = 'high' | 'medium' | 'low';

export interface Note {
  id: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  // 扩展字段 - 支持智能记忆系统
  type?: MemoryType;  // 记忆类型
  importance?: MemoryImportance;  // 重要性
  tags?: string[];  // 标签
  embedding?: number[];  // 向量嵌入（用于语义检索）
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  notes: Note[];
  createdAt: number;
  updatedAt: number;
}

// 全局记忆 - 跨会话存储
export interface GlobalMemory {
  id: string;
  userId: string;
  content: string;
  type: MemoryType;
  importance: MemoryImportance;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
  accessCount: number;
}

export interface APIConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  // MiniMax M2.7 思维链配置
  reasoningSplit?: boolean;   // 是否启用思维链分离（thinking content 单独返回）
  thinkingBudget?: number;    // 思维预算 token 数（1-32000）
  showThinking?: boolean;      // 是否在 UI 中显示 thinking 内容
}

// 已配置的模型项（包含完整API配置）
export interface ConfiguredModel {
  id: string;
  apiKey: string;
  baseURL: string;
  model: string;
  name?: string;  // 自定义显示名称
  provider?: string;
  createdAt: number;
}

export interface Model {
  id: string;
  name: string;
  provider: string;
}

export const AVAILABLE_MODELS: Model[] = [
  // ===========================================
  // MiniMax (单一架构 - 2026年3月)
  // ===========================================
  { id: 'MiniMax-M2.7', name: 'MiniMax M2.7 (旗舰编程)', provider: 'MiniMax' },
  { id: 'MiniMax-M2.5', name: 'MiniMax M2.5', provider: 'MiniMax' },
  { id: 'MiniMax-Text-01', name: 'MiniMax Text 01', provider: 'MiniMax' },
  { id: 'MiniMax-VL-01', name: 'MiniMax VL 01 (多模态)', provider: 'MiniMax' },
  { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax M2.7 高速', provider: 'MiniMax' },
  { id: 'MiniMax-M2.5-highspeed', name: 'MiniMax M2.5 高速', provider: 'MiniMax' },
];

// ===========================================
// 模型最大输出Token限制（MiniMax 单一架构）
// ===========================================
export const MODEL_MAX_TOKENS: Record<string, number> = {
  // MiniMax
  'MiniMax-M2.7': 100000,
  'MiniMax-M2.5': 100000,
  'MiniMax-Text-01': 400000,
  'MiniMax-VL-01': 32000,
  'MiniMax-M2.7-highspeed': 100000,
  'MiniMax-M2.5-highspeed': 100000,
};

// 默认最大Token值（当模型不在列表中时）
export const DEFAULT_MAX_TOKENS = 16384;

// 获取模型的最大Token限制
export function getModelMaxTokens(modelId: string): number {
  return MODEL_MAX_TOKENS[modelId] || DEFAULT_MAX_TOKENS;
}

// 思维链类型
export * from './thinking';
