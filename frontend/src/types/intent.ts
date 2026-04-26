/**
 * 意图树数据类型定义
 *
 * 用于前端与后端 IntentClassifier 组件的数据交互
 * 支持领域(Domain) -> 类目(Category) -> 话题(Topic) 三层结构
 */

export interface IntentNode {
  id: string;
  name: string;           // 节点名称
  level: IntentLevel;     // 层级 (1: 领域, 2: 类目, 3: 话题)
  keywords: string[];    // 匹配关键词
  description?: string;   // 描述
  children: IntentNode[]; // 子节点
  enabled: boolean;       // 是否启用
  createdAt?: string;     // 创建时间
  updatedAt?: string;      // 更新时间
}

export type IntentLevel = 1 | 2 | 3;

// 层级名称映射
export const INTENT_LEVEL_NAMES: Record<IntentLevel, string> = {
  1: '领域',
  2: '类目',
  3: '话题'
};

// 层级颜色映射（用于UI展示）
export const INTENT_LEVEL_COLORS: Record<IntentLevel, string> = {
  1: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
  2: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  3: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
};

// API 请求/响应类型
export interface IntentTreeResponse {
  tree: IntentNode[];
  version: string;
  updatedAt: string;
}

export interface IntentNodeCreateRequest {
  name: string;
  level: IntentLevel;
  keywords: string[];
  description?: string;
  parentId?: string;
  enabled?: boolean;
}

export interface IntentNodeUpdateRequest {
  name?: string;
  keywords?: string[];
  description?: string;
  enabled?: boolean;
  parentId?: string;  // 用于移动节点
}

export interface IntentTestRequest {
  query: string;
}

export interface IntentTestResult {
  matched: boolean;
  nodeId?: string;
  nodeName?: string;
  confidence: number;
  matchedKeywords: string[];
}

// 意图树操作状态
export interface IntentTreeState {
  loading: boolean;
  saving: boolean;
  error: string | null;
  selectedNode: IntentNode | null;
  expandedNodes: Set<string>;
}
