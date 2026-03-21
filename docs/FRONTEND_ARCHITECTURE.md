# AI Chat 玩具 - 前端架构文档

> 最后更新: 2026-03-19

## 目录结构

```
frontend/src/
├── app/                      # Next.js App Router
│   ├── layout.tsx            # 根布局
│   ├── page.tsx              # 主页面
│   └── globals.css           # 全局样式
│
├── components/               # React 组件库
│   ├── ChatArea.tsx          # 聊天区域
│   ├── ChatInput.tsx         # 聊天输入框
│   ├── ConversationList.tsx   # 对话列表
│   ├── ConversationContextMenu.tsx  # 对话右键菜单
│   ├── DraggableConversationItem.tsx  # 可拖拽对话项
│   ├── MultiWindowChat.tsx   # 多窗口聊天
│   ├── MultiWindowDropZone.tsx  # 多窗口拖拽区域
│   ├── FocusModeChat.tsx     # 专注模式
│   ├── IntentSuggestionBanner.tsx  # 意图提示
│   ├── KeyboardShortcuts.tsx # 快捷键
│   ├── KnowledgeBaseManager.tsx  # 知识库管理
│   ├── MemoryPanel.tsx       # 记忆面板
│   ├── Message.tsx           # 消息组件
│   ├── MessageContextMenu.tsx  # 消息右键菜单
│   ├── MessageStatus.tsx     # 消息状态
│   ├── MiniMaxAgent.tsx      # MiniMax Agent
│   ├── MultiAgentPanel.tsx   # 多Agent面板
│   ├── MultiAgentVisualization.tsx  # 多Agent可视化
│   ├── MultiModelConfig.tsx  # 多模型配置
│   ├── NotePanel.tsx         # 笔记面板
│   ├── PerformanceDashboard.tsx  # 性能面板
│   ├── PromptSelector.tsx     # 提示词选择器
│   ├── SearchResults.tsx      # 搜索结果
│   ├── Settings.tsx          # 设置面板
│   ├── ThinkingChain.tsx      # 思维链
│   ├── Toast.tsx             # 提示组件
│   ├── ToolWaterfall.tsx     # 工具瀑布流
│   ├── TraceViewer.tsx       # 追踪查看器
│   ├── Typewriter.tsx        # 打字机效果
│   ├── WelcomeGuide.tsx      # 欢迎引导
│   ├── CheckpointTimeline.tsx  # 检查点时间线
│   ├── CheckpointRecoveryPanel.tsx  # 检查点恢复面板
│   ├── ContentPreview.tsx    # 内容预览
│   ├── HumanLoopConfirmation.tsx  # 人工确认对话框
│   ├── LoadingSkeleton.tsx   # 加载骨架屏
│   ├── MarkdownRenderer.tsx  # Markdown渲染
│   ├── WorkflowTemplateEditor.tsx  # 工作流模板编辑器
│   │
│   ├── agent/                # Agent 模块
│   │   ├── AgentWorkspace.tsx     # Agent 工作区
│   │   ├── AgentConfigPanel.tsx   # Agent 配置面板
│   │   ├── AgentCollaborationPanel.tsx  # Agent 协作面板
│   │   ├── AgentDebugger.tsx      # Agent 调试器
│   │   ├── AgentExecutionPanel.tsx  # Agent 执行面板
│   │   ├── AgentStatusIndicator.tsx  # Agent 状态指示器
│   │   ├── ConfigVersionManager.tsx  # 配置版本管理
│   │   ├── ErrorRecoveryUI.tsx     # 错误恢复UI
│   │   ├── ExecutionHistory.tsx    # 执行历史
│   │   ├── HumanConfirmationDialog.tsx  # 人工确认对话框
│   │   ├── PerformanceMonitor.tsx  # 性能监控
│   │   ├── ToolCallDisplay.tsx     # 工具调用显示
│   │   ├── ToolMarketplace.tsx     # 工具市场
│   │   ├── WorkflowEditor.tsx      # 工作流编辑器
│   │   ├── workflow/
│   │   │   └── DndWorkflowCanvas.tsx  # 可视化工作流画布
│   │   └── index.ts
│   │
│   ├── mobile/               # 移动端模块
│   │   ├── MobileLayout.tsx      # 移动端布局
│   │   ├── MobileChatArea.tsx     # 移动端聊天区
│   │   ├── BottomSheet.tsx        # 底部弹出面板
│   │   ├── GestureRecognition.ts   # 手势识别
│   │   ├── HapticFeedback.ts       # 触觉反馈
│   │   ├── InertialScroll.tsx     # 惯性滚动
│   │   ├── LayoutAdapter.ts       # 布局适配器
│   │   ├── PerformanceOptimization.tsx  # 性能优化
│   │   ├── Skeleton.tsx           # 骨架屏
│   │   └── index.tsx
│   │
│   └── animations/           # 动画变体
│       └── variants.ts       # Framer Motion 变体
│
├── hooks/                    # 自定义 Hooks
│   ├── index.ts             # 导出入口
│   ├── useAgentSSE.ts       # Agent SSE 连接
│   ├── useRealAgentSSE.ts   # 真实 Agent SSE
│   ├── useBrowser.tsx        # 浏览器操作
│   ├── useEnhancedAgent.ts   # 增强 Agent
│   ├── useEnhancedMemory.ts  # 增强记忆
│   ├── useGesture.ts         # 手势操作
│   ├── useHITL.tsx          # 人工介入
│   ├── useIntentDetection.ts # 意图检测
│   ├── useMCP.ts            # MCP 协议
│   ├── useMemorySystem.ts    # 记忆系统
│   ├── useMultiAgent.ts      # 多Agent
│   ├── useN8N.ts            # N8N 集成
│   ├── useRouter.ts         # 虚拟路由
│   ├── useSearch.tsx        # 搜索
│   ├── useSearchEnhanced.ts  # 增强搜索
│   ├── useThinkingChain.ts   # 思维链
│   └── useWorkflowExecution.ts  # 工作流执行
│
├── lib/                      # 工具库
│   ├── api.ts               # API 调用
│   ├── apiConfig.ts         # API 配置
│   ├── export.ts             # 导出功能
│   ├── hooks.ts              # 工具 Hooks
│   ├── modelConfig.ts        # 模型配置
│   ├── sse.ts               # SSE 客户端
│   ├── agentWorkflowAPI.ts   # Agent 工作流 API
│   ├── workflowExecutionService.ts  # 工作流执行服务
│   └── workflowPersistence.ts  # 工作流持久化
│
├── store/                    # 状态管理
│   ├── chatStore.ts         # 聊天状态 (Zustand)
│   └── agentWorkflowStore.ts  # Agent 工作流状态
│
├── contexts/                 # React Context
│   └── RouterContext.tsx     # 路由上下文
│
├── types/                    # TypeScript 类型
│   ├── index.ts             # 类型导出
│   ├── prompts.ts           # 提示词类型
│   └── thinking.ts          # 思维链类型
│
└── __tests__/               # 单元测试
    ├── chatStore.test.ts
    ├── PerformanceDashboard.test.tsx
    └── TraceViewer.test.tsx
```

## 技术栈

| 分类 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js | 16.x |
| UI库 | React | 19.x |
| 状态管理 | Zustand | 5.x |
| 动画 | Framer Motion | 11.x |
| 样式 | Tailwind CSS | 3.x |
| 图表 | Lucide React (图标) | 最新 |
| 路由 | App Router + 自定义虚拟路由 | - |
| HTTP | Fetch + SSE | - |

## 状态管理架构

### chatStore (Zustand)

```typescript
interface ChatState {
  // 对话状态
  conversations: Conversation[];
  activeConversationId: string | null;

  // 应用模式
  appMode: 'chat' | 'agent';
  focusMode: boolean;
  sidebarOpen: boolean;
  sidePanelContent: SidePanelContent;

  // 设置
  settings: AppSettings;
  desktopPalette: string;

  // 窗口布局
  windowConfigs: Record<string, WindowConfig>;
  windowLayout: 'single' | 'dual' | 'triple' | 'quad';

  // 欢迎引导
  showWelcomeGuide: boolean;

  // 持久化
  hasHydrated: boolean;
  rehydrate: () => void;
}
```

### agentWorkflowStore

```typescript
interface AgentWorkflowState {
  workflows: Workflow[];
  activeWorkflowId: string | null;
  executionStatus: ExecutionStatus;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}
```

## 页面布局架构

### 桌面端布局 (page.tsx)

```
┌──────────────────────────────────────────────────────────────┐
│  Header: 标题 | 模式切换 | 专注模式 | 侧边面板按钮          │
├─────────┬────────────────────────────────────────────────────┤
│         │                                                    │
│ 侧边栏   │              主内容区                              │
│ (292px) │  ┌──────────────────────────────────────────┐     │
│         │  │                                          │     │
│ 对话列表 │  │     MultiWindowChat / AgentWorkspace    │     │
│         │  │                                          │     │
│         │  │     FocusModeChat (专注模式全屏)          │     │
│         │  │                                          │     │
│         │  └──────────────────────────────────────────┘     │
│         │                                                    │
└─────────┴────────────────────────────────────────────────────┘
```

### 移动端布局

```
┌─────────────────────────┐
│      Header (可选)      │
├─────────────────────────┤
│                         │
│      MobileChatArea     │
│                         │
├─────────────────────────┤
│      ChatInput          │
├─────────────────────────┤
│   BottomNav (4 Tab)     │
└─────────────────────────┘
```

## 路由架构

### 虚拟路由 (useRouter)

| 路径 | 组件 | 说明 |
|------|------|------|
| `/` | page.tsx | 主页面 |
| `/c/:id` | page.tsx | 对话详情 |
| `/c/:id/focus` | FocusModeChat | 专注模式 |
| `/agent` | AgentWorkspace | Agent 工作区 |
| `/agent/:tab` | AgentWorkspace | Agent Tab |
| `/kb` | KnowledgeBaseManager | 知识库 |
| `/settings` | Settings | 设置 |

## 核心功能模块

### 1. 多窗口系统

- `MultiWindowChat` - 多窗口容器
- `MultiWindowDropZone` - 拖拽区域
- `DraggableConversationItem` - 可拖拽对话项
- 支持 single/dual/triple/quad 布局

### 2. Agent 系统

- `AgentWorkspace` - Agent 工作区
- `AgentConfigPanel` - 配置面板
- `WorkflowEditor` - 工作流编辑器
- `DndWorkflowCanvas` - 可视化画布
- `AgentExecutionPanel` - 执行监控
- `ToolMarketplace` - 工具市场

### 3. 记忆系统

- `MemoryPanel` - 记忆面板
- `useMemorySystem` - 记忆 Hook
- `useEnhancedMemory` - 增强记忆
- 全局记忆 / 会话记忆

### 4. 联网搜索

- `SearchResults` - 搜索结果展示
- `useSearchEnhanced` - 增强搜索 Hook
- MiniMax / Jina / DuckDuckGo 多源

### 5. 思维链可视化

- `ThinkingChain` - 思维链展示
- `ToolWaterfall` - 工具调用瀑布流
- `TraceViewer` - 执行追踪

### 6. 知识库

- `KnowledgeBaseManager` - 知识库管理
- RAG 向量检索
- 文档上传与解析

## API 接口

### 对话接口

```typescript
// 前端 → 后端
POST /api/chat/send
POST /api/chat/sse
GET  /api/conversations
POST /api/conversations
PUT  /api/conversations/:id
DELETE /api/conversations/:id
```

### Agent 接口

```typescript
POST /api/agents/execute
POST /api/agents/sse
GET  /api/agents/workflows
POST /api/agents/workflows
```

### 记忆接口

```typescript
GET  /api/memories
POST /api/memories
PUT  /api/memories/:id
DELETE /api/memories/:id
```

### 搜索接口

```typescript
POST /api/search/enhanced
POST /api/search/fetch
```

## 样式系统

### 主题变量

```css
:root {
  --bg-app: hsl(var(--bg-primary));
  --bg-surface: hsl(var(--surface));
  --border-subtle: hsl(var(--border-subtle));
  --border-strong: hsl(var(--border-strong));
  --text-main: hsl(var(--text-primary));
  --text-muted: hsl(var(--text-secondary));
  --primary: hsl(var(--primary));
}
```

### 调色板

- `aurora` - 极光 (默认)
- `ocean` - 海洋
- `forest` - 森林
- `sunset` - 日落
- `midnight` - 午夜

## 响应式断点

| 断点 | 尺寸 | 布局 |
|------|------|------|
| 移动端 | < 640px | 移动端专用布局 |
| 平板 | 640-1023px | 适配布局 |
| 桌面 | ≥ 1024px | 完整桌面布局 |

## 组件清单

### 基础组件
- [x] Button
- [x] Input
- [x] Card
- [x] Modal
- [x] Toast
- [x] Skeleton

### 功能组件
- [x] ChatArea
- [x] ChatInput
- [x] Message
- [x] ConversationList
- [x] Settings
- [x] KnowledgeBaseManager

### Agent 组件
- [x] AgentWorkspace
- [x] AgentConfigPanel
- [x] WorkflowEditor
- [x] AgentExecutionPanel
- [x] ToolMarketplace

### 高级组件
- [x] MultiWindowChat
- [x] FocusModeChat
- [x] ThinkingChain
- [x] MemoryPanel
- [x] SearchResults
