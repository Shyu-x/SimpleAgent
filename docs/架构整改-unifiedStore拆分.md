# 架构整改：unifiedStore 拆分方案

> 调研时间：2026/05/15  
> 状态：已调研，待实施

---

## 一、当前状态分析

### 1.1 unifiedStore 问题概览

| 指标 | 当前值 | 阈值 | 状态 |
|------|--------|------|------|
| 文件行数 | 640 行 | 200 行 | 超标 3.2x |
| 状态字段数 | 21 个 | 10 个 | 超标 2.1x |
| 方法数 | 46 个 | 15 个 | 超标 3.1x |

### 1.2 方法使用频率分析

**高频方法（需优先迁移）：**
- addMessage, updateLastMessage, deleteMessage → messageStore
- createConversation, deleteConversation, setActiveConversation → conversationStore
- settings 读取 → uiStore

**低频方法（可延后）：**
- addGlobalMemory, updateGlobalMemory, deleteGlobalMemory → memoryStore (新)
- addCustomPrompt, updateCustomPrompt, deleteCustomPrompt → promptStore (新)

### 1.3 组件依赖关系图

使用 useChatStore 的组件（共24个文件），核心包括：
- useMemorySystem.ts - 记忆系统 Hook
- MemoryPanel.tsx, PromptSelector.tsx - 高频组件

---

## 二、拆分方案架构图

### 2.1 目标架构

```
unifiedStore (640行) → 拆分为：
├── conversationStore (186行) - 对话 CRUD、多窗口管理
├── messageStore (131行) - 消息操作（纯函数）
├── uiStore (153行) - UI 状态、主题、布局
├── settingsStore (135行) - API 配置、模型管理
├── memoryStore (新) - 全局记忆管理
└── promptStore (新) - 自定义提示词管理
```

### 2.2 各 Store 职责边界

| Store | 状态字段 | 持久化 |
|-------|---------|--------|
| conversationStore | conversations, activeId, windowConfigs | ai-chat-conversations |
| messageStore | (纯函数，无状态) | 无 |
| uiStore | settings, focusMode, sidePanel, appMode | ai-chat-ui |
| settingsStore | apiConfig, configuredModels | ai-chat-settings |
| memoryStore | globalMemories[] | ai-chat-memories |
| promptStore | customPrompts[] | ai-chat-prompts |

---

## 三、迁移步骤（按依赖顺序）

### Phase 1: 准备期（2天）
- 验证 existing stores: uiStore, settingsStore, conversationStore, messageStore
- 运行测试确保基础功能不受影响

### Phase 2: 核心期（3天）
- 创建 memoryStore (全局记忆)
- 创建 promptStore (自定义提示词)
- 验证 useMemorySystem hook 正常运作

### Phase 3: 整合期（2天）
- 重构 unifiedStore 作为聚合层，保持向后兼容
- 导出别名 useChatStore = useUnifiedStore
- 消除循环依赖风险

### Phase 4: 迁移期（3天）
**P0 核心：**
- useMemorySystem.ts: useChatStore -> useMemoryStore
- MemoryPanel.tsx: useChatStore -> useConversationStore + useMemoryStore
- PromptSelector.tsx: useChatStore -> useConversationStore + usePromptStore

**P1 高优先级：**
- ConversationList.tsx, ChatArea.tsx, ChatInput.tsx, Message.tsx

**P2 中优先级：**
- Settings.tsx, MultiWindowChat.tsx

### Phase 5: 收尾期（1天）
- 删除冗余代码
- 更新文档
- 最终验证

---

## 四、风险缓解

### 4.1 循环依赖风险
messageStore 设计为纯函数，不持有状态，组件层处理状态更新协调

### 4.2 数据迁移风险
- 保持 ai-chat-storage-v2 key
- 首次加载时解析旧数据，分发到子 store
- 逐步淘汰旧格式

### 4.3 测试覆盖风险
1. 单元测试：每个子 store 独立测试
2. 集成测试：验证 store 间通信
3. E2E 测试：关键用户流程

---

## 五、验证计划

### 5.1 手动验证清单

| 功能 | 预期结果 |
|------|---------|
| 对话 CRUD | 创建 -> 发送消息 -> 编辑 -> 删除 |
| 多窗口 | 打开多个窗口，分配不同对话 |
| 记忆系统 | 添加会话笔记 -> 全局记忆 -> 搜索 |
| Prompt | 创建 -> 选择 -> 删除 |
| 设置 | 修改主题 -> 刷新页面保持状态 |
| 数据迁移 | 从旧版本升级数据不丢失 |

### 5.2 性能验证

| 指标 | 目标 |
|------|------|
| Store 选择器重渲染次数 | < 100 次/对话切换 |
| 持久化体积 | < 500KB/对话 |
| 首屏加载时间 | < 2s |

---

## 六、进度估算

| Phase | 任务 | 预计工时 |
|-------|------|---------|
| Phase 1 | 准备期 - 验证现有 stores | 2 天 |
| Phase 2 | 核心期 - 创建 memoryStore/promptStore | 3 天 |
| Phase 3 | 整合期 - 重构 unifiedStore | 2 天 |
| Phase 4 | 迁移期 - 更新组件引用 | 3 天 |
| Phase 5 | 收尾期 - 清理与验证 | 1 天 |
| **总计** | | **11 天** |

---

## 七、附录

### A. 现有 store 状态

| 文件 | 行数 | 状态 |
|------|------|------|
| unifiedStore.ts | 640 | 待拆分 |
| conversationStore.ts | 186 | 已完成 |
| messageStore.ts | 131 | 已完成 |
| uiStore.ts | 153 | 已完成 |
| settingsStore.ts | 135 | 已完成 |

### B. 组件引用统计

- useChatStore 引用: 24 个文件
- 新 store 引用: 0 个文件（待迁移）

### C. 持久化 key 规划

| Store | 持久化 key |
|-------|-----------|
| conversationStore | ai-chat-conversations |
| uiStore | ai-chat-ui |
| settingsStore | ai-chat-settings |
| memoryStore | ai-chat-memories |
| promptStore | ai-chat-prompts |

---

*文档生成时间: 2026/05/15*
*下次更新: Phase 1 完成后*
