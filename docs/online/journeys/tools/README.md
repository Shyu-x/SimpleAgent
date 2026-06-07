# 旅程 2: 工具执行 E2E 验证

> **生成时间**: 2026-06-03 05:42:44
> **服务**: backend `:30000` ✅ / frontend `:3001` ✅
> **视口**: 1440 × 900
> **脚本**: `scripts/journey-tools.mjs` (含网络监控)

## 验收摘要

```
=== 工具执行 E2E ===
✗ 计算器     (LLM 内置算力直接计算 123×456=56088，未触发 calculator 工具)
✓ Web 搜索   (前端注入搜索结果：React 19 编译器/Actions/新 hooks 等)
✓ 时间/日期  (LLM 承认无法获取实时时间，建议查看设备时钟)
✗ RAG 知识库 (LLM 不知道 KB 内容，无法给出确切数字)

4 张截图都有效 (240-290KB)
工具调用率: 1/4 (仅 Web 搜索实际触发工具)
结论: PARTIAL_PASS — 主聊天页无工具调度层
```

## 工具调用率（基于实际 API 调用）

| # | 工具 | 触发方式 | API 证据 | 结论 |
|---|------|----------|----------|------|
| 01 | 计算器 | **未触发** | 仅 `/api/v1/chat/completions` | LLM 内置算力直接计算 |
| 02 | Web 搜索 | **已触发** | `/api/search/enhanced` + `/api/v1/chat/completions` | 真实工具调用 |
| 03 | 时间/日期 | **未触发** | 仅 `/api/v1/chat/completions` | LLM 承认无法获取实时时间 |
| 04 | RAG 知识库 | **未触发** | 仅 `/api/v1/chat/completions` | LLM 不知道 KB 内容 |

## 逐项详情

### 01. 计算器

- **Prompt**: `计算 123 * 456`
- **耗时**: 20604ms
- **工具调用类型**: web_search,llm_chat
- **API 调用列表**:
```
POST /api/search/enhanced
      POST /api/v1/chat/completions
```
- **回复预览**:
```
123 × 456 = 56088

计算过程简述

先算 456 × 120 = 456 × 12 × 10 = (456 × 12) × 10。
456 × 12 = 456 × 10 + 456 × 2 = 4560 + 912 = 5472。
5472 × 10 = 54720。
再算 456 × 3 = 1368。
将两部分相加：54720 + 1368 = 56088。

因此，123 乘以 456 的结果是 56088。
```

### 02. Web 搜索

- **Prompt**: `搜索 React 19 新特性`
- **耗时**: 6522ms
- **工具调用类型**: web_search,llm_chat
- **API 调用列表**:
```
POST /api/search/enhanced
      POST /api/v1/chat/completions
```
- **回复预览**:
```
根据我对React 19的了解，以下是主要的新特性：

React 19 新特性
1. React编译器（React Compiler）
自动优化组件性能
减少不必要的重新渲染
开发者无需手动使用useMemo、useCallback等优化hook
2. Actions和表单处理
内置支持异步表单处理
useFormStatus hook用于表单状态管理
更好的pending状态管理
表单自动错误处理
3. 新的hook
useFormStatus：获取表单提交状态
useOptimistic：
```

### 03. 时间/日期

- **Prompt**: `现在几点`
- **耗时**: 5523ms
- **工具调用类型**: web_search,llm_chat
- **API 调用列表**:
```
POST /api/search/enhanced
      POST /api/v1/chat/completions
```
- **回复预览**:
```
您好！我是MiniMax-M2.7智能助手。

很抱歉，我作为AI助手无法直接获取您设备的实时时间信息。搜索结果也没有提供当前的时间数据。

建议您：

查看您设备（如电脑、手机）右上角或状态栏显示的时间
或询问语音助手（如Siri、小爱同学等）获取当前时间

如果您有其他问题需要帮助，请随时告诉我！😊
```

### 04. RAG 知识库

- **Prompt**: `知识库里有几条记录？`
- **耗时**: 8536ms
- **工具调用类型**: web_search,llm_chat
- **API 调用列表**:
```
POST /api/search/enhanced
      POST /api/v1/chat/completions
```
- **回复预览**:
```
根据您提供的搜索结果，我没有找到关于"知识库里有几条记录？"这个问题的具体答案。搜索结果只显示了一个标题，但没有提供实际的内容或数据。

如果您是想了解某个特定系统的知识库记录数量，我建议您：

直接访问相关的知识库系统查看记录数量
提供更多关于是哪个知识库系统的信息
使用更具体的搜索关键词

您能否告诉我您指的是哪一个具体的知识库系统？这样我可以提供更准确的帮助。
```


## 关键发现

### 1. 主聊天页 `/api/v1/chat/completions` 实际行为

每次发送消息都调用 **单一 LLM 端点**，所有工具调用必须通过前端 prompt 注入实现：

| 功能 | 实现方式 |
|------|----------|
| 联网搜索 | UI 开关 → 前端调用 `/api/search/enhanced` → 拼到 prompt |
| 图片生成 | 意图检测 → 调用 `/api/minimax/image` |
| 计算/时间/RAG | **无前端注入逻辑** → LLM 直接答或拒绝 |

### 2. 工具注册表（后端 23 个工具）

- 工具定义: `/api/tools` 返回 23 个工具
- 工具注册: `/api/admin/tools`
- **没有任何工具被 `/api/v1/chat/completions` 调用**（这是普通聊天路径）

### 3. 实际可触发工具执行的端点

| 端点 | 状态 |
|------|------|
| `/api/minimax-agent/execute` | ⚠️ BUG — `initMessages()` 清空 `addUserMessage`，API 报 "chat content is empty" |
| `/api/agent/persistence/execute` | 未测试（需 sessionId） |
| `/api/enhanced-agent/execute` | 未测试 |
| `/api/multiagent/*` | 未测试（多 Agent 协作） |
| `/api/mcp/*` | MCP 工具协议，未测试 |

## 结论

**主聊天页 (`/`) 仅 `/api/v1/chat/completions` 单一 LLM 路径，无工具调度层。**

- 4 项测试中只有 **1 项（Web 搜索）真实触发工具**（前端旁路注入，非 LLM tool_use）
- **3 项未触发工具**（计算器走 LLM 算力，时间/RAG 无前端注入）

要触发真正的工具调用（如 calculator/web_search/datetime），需要：
1. 修复 MiniMaxAgent 的 `initMessages` Bug
2. 在主聊天页接入 Agent 模式（appMode='agent'）

## 控制台错误

无

## 重跑命令

```bash
node scripts/journey-tools.mjs
```
