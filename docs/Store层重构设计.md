# Store 层重构设计文档

**项目**: AI Chat 玩具
**版本**: v2.3.0
**日期**: 2026-04-03
**状态**: 设计中

---

## 一、现状分析

### 1.1 Store 文件一览

| 文件路径 | Store 名称 | 职责 | 存储介质 | 行数 |
|---------|-----------|------|---------|------|
| `src/store/chatStore.ts` | `useChatStore` | 全局状态（对话、消息、API配置、设置） | sessionStorage | 621 |
| `src/store/agentWorkflowStore.ts` | `useAgentWorkflowStore` | Agent 工作流编排 | localStorage | 612 |
| `src/stores/conversationStore.ts` | `useConversationStore` | 对话 CRUD（从 chatStore 拆分） | sessionStorage | 200 |
| `src/stores/messageStore.ts` | `useMessageStore` | 消息操作函数库 | 无持久化 | 132 |
| `src/stores/uiStore.ts` | `useUIStore` | UI 状态（设置、面板、App模式） | sessionStorage | 153 |
| `src/components/agent/MissionControl/store.ts` | `useMissionControlStore` | Mission Control 任务/Agent 管理 | 无持久化 | 345 |

### 1.2 各 Store 职责详解

#### useChatStore (`src/store/chatStore.ts` - 621 行)

```
职责：
- 对话列表 conversations (CRUD)
- 消息列表 messages (within conversations)
- API 配置 apiConfig (baseURL, model, temperature, maxTokens, reasoningSplit, thinkingBudget, showThinking)
- 已配置模型列表 configuredModels
- 全局记忆 globalMemories
- 自定义 Prompt 模板 customPrompts
- 多窗口配置 windowConfigs / activeConversationIds
- UI 状态（focusMode, sidePanelContent, appMode, settings, enabledFeatures）
- 笔记操作 notes (add/update/delete)

持久化：sessionStorage (ai-chat-storage)
敏感信息处理：apiKey 不持久化，configuredModels 中的 apiKey 被清空
```

#### useConversationStore (`src/stores/conversationStore.ts` - 200 行)

```
职责：
- 对话 CRUD（与 chatStore 完全重复）
- 多窗口管理（与 chatStore 完全重复）
- 排序与重命名

持久化：sessionStorage (ai-chat-conversations)
注意：与 chatStore 职责 100% 重叠，数据同步问题
```

#### useMessageStore (`src/stores/messageStore.ts` - 132 行)

```
职责：
- 消息操作纯函数（addMessage, updateLastMessage, deleteMessage 等）
- 笔记操作纯函数（addNote, updateNote, deleteNote）

持久化：无（纯函数库）
注意：设计为工具函数库，通过参数接收 conversations 数组返回新数组
```

#### useUIStore (`src/stores/uiStore.ts` - 153 行)

```
职责：
- 用户设置 settings (theme, desktopPalette, typingSpeed, fontSize, windowLayout, animationsEnabled, soundEnabled, autoTitle)
- 启用功能 enabledFeatures (webSearch, deepThinking, imageGeneration)
- UI 状态（focusMode, sidePanelContent, appMode, showWelcomeGuide）
- API 配置 apiConfig（不含 apiKey）
- 已配置模型列表 configuredModels

持久化：sessionStorage (ai-chat-ui)
注意：与 chatStore 的 UI 相关状态严重重叠
```

#### useAgentWorkflowStore (`src/store/agentWorkflowStore.ts` - 612 行)

```
职责：
- 工作流定义 workflows (create/update/delete)
- Agent 管理 (add/update/remove agent)
- Task 管理 (add/update/remove task)
- 执行状态 execution (start/pause/resume/stop)
- SSE 事件处理 handleSSEEvent
- 错误管理 errors / 确认请求 pendingConfirmations

持久化：localStorage (agent-workflow-storage) - 仅 workflows
注意：与 MissionControl Store 存在重叠
```

#### useMissionControlStore (`src/components/agent/MissionControl/store.ts` - 345 行)

```
职责：
- Mission 任务管理 (tasks, agents, events)
- 任务分配 assignTask / 完成 completeTask / 失败 failTask
- Agent 状态管理 updateAgentStatus
- 事件广播 broadcastTask / broadcastMessage
- 操作历史 actionHistory
- 批量操作 (batchComplete, batchFail)

持久化：无
注意：独立于其他 Store，无跨 Store 同步机制
```

### 1.3 存储键不一致

| Store | sessionStorage key | localStorage key |
|-------|-------------------|-----------------|
| `useChatStore` | `ai-chat-storage` | - |
| `useConversationStore` | `ai-chat-conversations` | - |
| `useUIStore` | `ai-chat-ui` | - |
| `useAgentWorkflowStore` | - | `agent-workflow-storage` |
| `useMissionControlStore` | 无 | 无 |

---

## 二、问题清单

### 问题 1: API Key 刷新后丢失 (严重)

**现象**: 页面刷新后，`chatStore` 中的 `apiConfig.apiKey` 变为空字符串，导致所有 API 调用失败。

**根因分析**:

```javascript
// chatStore.ts L156 - 初始化时 apiKey 为空
apiConfig: {
  apiKey: '', // 空字符串 - API Key 由后端代理安全存储
  ...
}

// chatStore.ts L588-613 - persist partialize 配置
partialize: (state) => ({
  apiConfig: {
    baseURL: state.apiConfig.baseURL,
    model: state.apiConfig.model,
    temperature: state.apiConfig.temperature,
    maxTokens: state.apiConfig.maxTokens,
    reasoningSplit: state.apiConfig.reasoningSplit,
    thinkingBudget: state.apiConfig.thinkingBudget,
    showThinking: state.apiConfig.showThinking,
    // apiKey 被排除，不持久化
  },
  configuredModels: state.configuredModels.map(m => ({
    ...m,
    apiKey: '' // 不持久化敏感信息
  })),
})
```

**问题**:
1. 设计意图是"API Key 由后端代理安全存储"，但后端并未提供 Key 存储/恢复 API
2. 前端清除 apiKey，后端又无法恢复，导致 Key 永久丢失
3. sessionStorage 本身就是会话级存储，刷新页面应该保持

**影响范围**: 所有使用 `useChatStore` 的组件，刷新后必须重新输入 API Key

---

### 问题 2: 两套并行 Store 架构 (严重)

**现状**:
```
旧架构（仍活跃）:
  useChatStore (621 行) - 对话 + 消息 + UI + API 配置 + 记忆

新架构（部分完成）:
  useConversationStore (200 行) - 对话 CRUD
  useMessageStore (132 行) - 消息操作纯函数
  useUIStore (153 行) - UI 状态
```

**问题**:
1. `useConversationStore` 与 `useChatStore.conversations` 职责 100% 重复
2. `useUIStore` 与 `useChatStore` 的 UI 状态（focusMode, appMode, settings 等）重复
3. `stores/index.ts` 导出新架构，但业务代码仍在使用 `useChatStore`
4. 两个 Store 都操作同一份 sessionStorage（不同 key），导致数据不一致

**数据流冲突示例**:
```
用户新建对话:
  useChatStore.createConversation() → 更新 'ai-chat-storage'
  useConversationStore.createConversation() → 更新 'ai-chat-conversations'

  两个 Store 数据不同步！
```

---

### 问题 3: store 之间缺乏统一同步机制 (中等)

**现状**:
```
useChatStore <---> useConversationStore (无同步)
useChatStore <---> useUIStore (无同步)
useAgentWorkflowStore <---> useMissionControlStore (无同步)
```

**问题**:
1. 各 Store 独立更新，无跨 Store 状态同步
2. `messageStore` 是纯函数，但被 `chatStore` 和 `conversationStore` 各自复制了操作逻辑
3. MissionControl 的 Agent 状态变化无法同步到 AgentWorkflow

---

### 问题 4: sessionStorage vs localStorage 混用 (中等)

| Store | 存储介质 | Key |
|-------|---------|-----|
| useChatStore | sessionStorage | `ai-chat-storage` |
| useConversationStore | sessionStorage | `ai-chat-conversations` |
| useUIStore | sessionStorage | `ai-chat-ui` |
| useAgentWorkflowStore | localStorage | `agent-workflow-storage` |
| useMissionControlStore | 无 | - |

**问题**:
1. `sessionStorage` vs `localStorage` 语义不清晰
   - sessionStorage: 标签页关闭清除
   - localStorage: 永久保存
2. Agent 工作流使用 localStorage，但 MissionControl 使用内存
3. 导致用户体验不一致（刷新后对话消失，但工作流还在）

---

### 问题 5: Zustand 5 最佳实践未遵循 (中等)

**当前问题**:
1. **Hydration 处理不一致**:
   - `chatStore`: `skipHydration: true` + 手动 `rehydrate()`
   - `conversationStore`: `skipHydration: true` + 手动 `rehydrate()`
   - `uiStore`: `skipHydration: true` + 手动 `setHasHydrated()`
   - `agentWorkflowStore`: 默认 hydration

2. **persist 配置分散**:
   - 每个 Store 独立定义 partialize、storage adapter
   - 重复代码多，无统一封装

3. **状态更新模式不统一**:
   - chatStore: 直接操作嵌套对象
   - messageStore: 纯函数返回新对象
   - agentWorkflowStore: 使用 `get()` 访问其他状态

---

### 问题 6: uiStore 默认模型名称错误

**位置**: `src/stores/uiStore.ts:95-96`

**问题**: 默认模型使用 `MiniMax-M2.7-highspeed`，但 Token Plan 不支持 highspeed 版本

```typescript
// 错误代码
apiConfig: {
  baseURL: getBaseURLForModel('MiniMax-M2.7-highspeed'),
  model: 'MiniMax-M2.7-highspeed',
},
```

**修复**: 改为 `MiniMax-M2.7`

---

### 问题 7: 存储适配器重复定义

**位置**: 每个 store 文件内独立定义 `sessionStorageAdapter`

**影响**: 代码重复，维护困难

**统计**: 至少 3 处重复定义（chatStore, conversationStore, uiStore）

---

## 三、重构方案

### 3.1 统一 Store 架构设计

```
目标架构：
┌─────────────────────────────────────────────────────────────┐
│                      React Components                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     hooks/index.ts                           │
│  (统一导出，屏蔽底层 Store 变更)                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  stores/index.ts (重构)                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐             │
│  │ ChatStore   │ │ UIStore     │ │ AgentStore  │             │
│  │ (领域聚合)   │ │ (UI 状态)   │ │ (工作流)     │             │
│  └─────────────┘ └─────────────┘ └─────────────┘             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              stores/persist/index.ts (统一持久化)             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ SessionStorageAdapter (统一 sessionStorage 封装)     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   API Key 安全恢复机制                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 后端 API: GET /api/auth/token (从后端获取/刷新 Token) │   │
│  │ 前端: sessionStorage['auth_token'] + Store 内存缓存   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 核心 Store 职责定义

| Store | 职责 | 持久化 | 命名空间 |
|-------|------|--------|---------|
| `useChatStore` | 对话、消息、API配置、记忆 | sessionStorage | `chat` |
| `useUIStore` | UI状态、设置、面板 | sessionStorage | `ui` |
| `useAgentStore` | Agent工作流 + MissionControl 合并 | localStorage | `agent` |
| `useAuthStore` | API Key 认证状态（新增） | sessionStorage | `auth` |

### 3.3 API Key 安全恢复机制

**问题本质**: sessionStorage 在刷新后应该保持（同标签页），但当前设计是主动清空 Key。

**方案**: 保留 sessionStorage 的会话语义，但增加 Key 自动恢复机制。

```
┌──────────────────────────────────────────────────────────────┐
│                     API Key 恢复流程                           │
├──────────────────────────────────────────────────────────────┤
│  1. 用户输入 API Key                                          │
│     └── 保存到 sessionStorage['minimax_api_key']              │
│     └── 保存到 useAuthStore.apiKey                           │
│                                                               │
│  2. 页面刷新（sessionStorage 保持）                           │
│     └── App 启动 → useAuthStore.rehydrate()                  │
│     └── 从 sessionStorage 恢复 apiKey                         │
│     └── 自动设置到 API Client                                 │
│                                                               │
│  3. 跨标签页同步（可选）                                       │
│     └── storage 事件监听                                      │
│     └── 广播新的 apiKey                                      │
└──────────────────────────────────────────────────────────────┘
```

**新增 useAuthStore**:
```typescript
interface AuthState {
  apiKey: string;
  tokenExpiry: number | null;
  isAuthenticated: boolean;

  // Actions
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  rehydrate: () => void;
}

// 持久化配置
{
  name: 'ai-chat-auth',
  storage: createJSONStorage(() => sessionStorage),
  partialize: (state) => ({
    apiKey: state.apiKey,
    tokenExpiry: state.tokenExpiry,
  }),
}
```

### 3.4 跨 Store 状态同步方案

**方案**: 使用 Zustand 的 `subscribeWithSelector` 实现跨 Store 同步。

```typescript
// stores/sync.ts - 跨 Store 同步器

import { useChatStore } from './chatStore';
import { useUIStore } from './uiStore';
import { useConversationStore } from './conversationStore';

// 1. conversationStore 更新 → 同步到 chatStore
useConversationStore.subscribe(
  (state) => state.conversations,
  (conversations, prevConversations) => {
    if (conversations !== prevConversations) {
      useChatStore.setState({ conversations });
    }
  }
);

// 2. UI Store appMode 变更 → 同步到 chatStore
useUIStore.subscribe(
  (state) => state.appMode,
  (appMode) => {
    useChatStore.setState({ appMode });
  }
);

// 3. chatStore UI 状态变更 → 同步到 uiStore
useChatStore.subscribe(
  (state) => ({ focusMode: state.focusMode, sidePanelContent: state.sidePanelContent }),
  (uiState) => {
    useUIStore.setState(uiState);
  },
  { equalityFn: shallow }
);
```

**替代方案（更推荐）**: 直接废弃重复的 Store，统一使用单一 Store。

### 3.5 Zustand 5 最佳实践

#### 1. 统一 Hydration 处理
```typescript
// stores/persist/hydration.ts
export const withHydration = <S extends object>(
  storeCreator: () => StateCreator<S>,
  storeName: string
) => {
  return (set, get, store) => {
    const result = storeCreator(set, get, store);

    // 统一 hydration 逻辑
    if (typeof window !== 'undefined') {
      // 客户端：手动触发 hydration
      const stored = sessionStorage.getItem(`ai-chat-${storeName}`);
      if (stored) {
        try {
          const { state } = JSON.parse(stored);
          store.setState({ ...state, hasHydrated: true }, true);
        } catch (e) {
          console.error(`[${storeName}] Hydration failed:`, e);
        }
      }
    }

    return result;
  };
};
```

#### 2. Selector 优化
```typescript
// 使用 shallow 进行引用相等性优化
import { shallow } from 'zustand/shallow';

// 避免不必要的重渲染
const { focusMode, sidePanelContent } = useUIStore(
  (state) => ({
    focusMode: state.focusMode,
    sidePanelContent: state.sidePanelContent,
  }),
  shallow
);
```

---

## 四、实施步骤

### Phase 1: 统一 Store 架构（1-2 天）

**目标**: 消除重复 Store，建立单一数据源

**步骤**:
1. [ ] 创建 `stores/authStore.ts` - API Key 认证状态
2. [ ] 重构 `stores/chatStore.ts` - 移除 UI 相关状态（已迁移到 uiStore）
3. [ ] 重构 `stores/uiStore.ts` - 完善 UI 状态管理
4. [ ] 废弃 `stores/conversationStore.ts` - 迁移到 chatStore
5. [ ] 更新 `stores/index.ts` - 统一导出

**迁移映射**:
```
废弃:
  useConversationStore → useChatStore (已包含)

保留并完善:
  useChatStore (对话 + 消息 + API配置 + 记忆)
  useUIStore (UI状态 + 设置)

新增:
  useAuthStore (API Key 管理)
```

### Phase 2: API Key 安全恢复（1 天）

**目标**: 解决刷新后 API Key 丢失问题

**步骤**:
1. [ ] 创建 `useAuthStore` - 独立的认证状态 Store
2. [ ] 修改 `apiClient.ts` - 从 authStore 获取 API Key
3. [ ] 添加 App 级初始化逻辑 - 启动时恢复 API Key
4. [ ] （可选）添加后端 Token 刷新 API

### Phase 3: 跨 Store 同步机制（0.5 天）

**目标**: 建立 Store 间数据同步

**步骤**:
1. [ ] 创建 `stores/sync.ts` - 同步器
2. [ ] 配置 conversationStore ↔ chatStore 同步
3. [ ] 配置 chatStore ↔ uiStore 同步（双向）
4. [ ] 添加测试验证同步正确性

### Phase 4: Agent Store 合并（1 天）

**目标**: 统一 Agent 工作流状态

**步骤**:
1. [ ] 合并 `useAgentWorkflowStore` 和 `useMissionControlStore`
2. [ ] 保留 `MissionControl` 组件的 UI 逻辑
3. [ ] 添加工作流状态持久化

### Phase 5: 清理与文档（0.5 天）

**目标**: 完善导出，优化代码

**步骤**:
1. [ ] 更新 `hooks/index.ts` - 统一导出
2. [ ] 更新 `lib/apiClient.ts` - 使用 authStore
3. [ ] 添加 JSDoc 注释
4. [ ] 更新 CLAUDE.md

---

## 五、风险评估

### 风险 1: 重构范围大，可能影响现有功能

**评估**: 中等风险

**缓解措施**:
1. Phase 1 先处理废弃 Store，保持 chatStore 兼容
2. 逐步迁移，每阶段验证功能正常
3. 保留旧 Store 别名（如 `useLegacyChatStore`）供紧急回滚

### 风险 2: sessionStorage vs localStorage 语义变更

**评估**: 低风险

**影响**: 用户可能发现刷新后对话消失（sessionStorage 正常行为）

**缓解措施**:
1. 明确告知用户数据存储策略
2. 提供"记住我"选项（使用 localStorage）

### 风险 3: API Key 安全问题

**评估**: 低风险（当前已是后端代理模式）

**说明**: API Key 仍然存储在 sessionStorage（前端），符合当前架构

---

## 六、目标架构

```
src/stores/
├── index.ts                    # 统一导出
├── chatStore.ts               # 对话 + 消息 + API配置 + 记忆 (主Store)
├── uiStore.ts                 # UI状态 + 设置 (已完善)
├── authStore.ts               # API Key 认证 (新增)
├── agentStore.ts              # Agent工作流 + MissionControl (合并)
└── persist/
    ├── index.ts               # 统一持久化配置
    ├── SessionStorageAdapter.ts
    └── hydration.ts           # Hydration 工具
```

---

## 七、Store 持久化策略

| Store | 存储 | Key | 持久化字段 |
|-------|------|-----|-----------|
| chatStore | sessionStorage | `ai-chat` | conversations, globalMemories, customPrompts, windowConfigs |
| uiStore | sessionStorage | `ai-chat-ui` | settings, enabledFeatures, focusMode, appMode |
| authStore | sessionStorage | `ai-chat-auth` | apiKey, tokenExpiry |
| agentStore | localStorage | `ai-chat-agent` | workflows, settings |

**设计原则**:
- sessionStorage: 对话、UI 设置（随标签页消失，符合用户预期）
- localStorage: Agent 工作流定义（跨会话保留，用户工作成果）

---

## 八、关键 API 设计

### useAuthStore

```typescript
// stores/authStore.ts
interface AuthState {
  apiKey: string;
  isAuthenticated: boolean;
  tokenExpiry: number | null;

  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  validateApiKey: () => Promise<boolean>;
  rehydrate: () => void;
}
```

### useChatStore (简化后)

```typescript
// stores/chatStore.ts (简化版)
interface ChatState {
  // 对话
  conversations: Conversation[];
  activeConversationId: string | null;
  activeConversationIds: string[];
  windowConfigs: Record<string, WindowConfig>;

  // 消息（内嵌在 conversation 中）
  addMessage: (conversationId: string, message: Message) => void;
  updateLastMessage: (conversationId: string, content: string) => void;
  // ... 其他消息操作

  // 记忆
  globalMemories: GlobalMemory[];
  addGlobalMemory: (content: string, type?: MemoryType) => void;

  // Prompt
  customPrompts: PromptTemplate[];
  addCustomPrompt: (template: Omit<PromptTemplate, 'id'>) => void;

  // Hydration
  hasHydrated: boolean;
  rehydrate: () => void;
}
```

---

## 九、快速修复项（立即执行）

| 优先级 | 修复项 | 预估工作量 | 风险 |
|--------|--------|-----------|------|
| P0 | uiStore 默认模型名称修正 (`MiniMax-M2.7-highspeed` → `MiniMax-M2.7`) | 5分钟 | 极低 |
| P1 | 创建统一存储适配器 (`stores/persist/SessionStorageAdapter.ts`) | 30分钟 | 低 |
| P2 | chatStore 职责拆分 | 2天 | 中 |
| P3 | API Key 安全恢复机制 | 2天 | 中 |

**建议**: 立即修复 P0 问题（5分钟），避免用户遇到模型名称错误。

### 修复 P0: uiStore 默认模型

```typescript
// src/stores/uiStore.ts 第 94-97 行
apiConfig: {
  baseURL: getBaseURLForModel('MiniMax-M2.7'),  // 修正
  model: 'MiniMax-M2.7',  // 修正
},
```

### 创建统一存储适配器

```typescript
// src/stores/persist/SessionStorageAdapter.ts
export const sessionStorageAdapter = {
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
```

---

**文档版本**: 2.0
**更新日期**: 2026-04-03
**下次更新**: 重构 Phase 1 完成后
