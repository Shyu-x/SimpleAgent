# SimpleAgent Frontend API 文档

> SimpleAgent 前端 API 与组件接口文档
> 版本: 1.0.0
> 更新日期: 2026-03-18

---

## 目录

1. [环境配置 API](#1-环境配置-api)
2. [Chat Store API](#2-chat-store-api)
3. [API 配置](#3-api-配置)
4. [组件接口](#4-组件接口)

---

## 1. 环境配置 API

### 1.1 前端环境变量

| 变量名 | 类型 | 说明 | 默认值 |
|--------|------|------|--------|
| NEXT_PUBLIC_API_URL | string | 后端 API 地址 | http://localhost:30000 |
| NEXT_PUBLIC_BACKEND_URL | string | 后端服务器地址 | http://localhost:30000 |

### 1.2 配置示例

```env
# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:30000
NEXT_PUBLIC_BACKEND_URL=http://localhost:30000
```

---

## 2. Chat Store API

> Zustand 状态管理接口

### 2.1 Store 创建

```typescript
// frontend/src/store/chatStore.ts
import { create } from 'zustand';

interface ChatStore {
  // 状态
  messages: Message[];
  conversations: Conversation[];
  currentConversation: string | null;
  isLoading: boolean;
  model: string;
  temperature: number;
  // ...
}

export const useChatStore = create<ChatStore>((set, get) => ({
  // 初始状态
  messages: [],
  conversations: [],
  currentConversation: null,
  isLoading: false,
  model: 'gpt-4o',
  temperature: 0.7,
  // ...
}));
```

### 2.2 核心方法

#### 发送消息

```typescript
const sendMessage = useChatStore.getState().sendMessage;
// 或
const { sendMessage } = useChatStore();

await sendMessage(content: string, images?: File[]): Promise<void>
```

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| content | string | 是 | 消息内容 |
| images | File[] | 否 | 上传的图片文件 |

**返回值**: Promise<void>

**示例**:

```typescript
try {
  await sendMessage('你好，帮我解释什么是机器学习');
} catch (error) {
  console.error('发送失败:', error);
}
```

#### 获取响应（SSE 流式）

```typescript
const streamResponse = useChatStore.getState().streamResponse;

streamResponse(
  messages: Message[],
  options?: {
    model?: string;
    temperature?: number;
    onChunk?: (content: string) => void;
    onComplete?: () => void;
    onError?: (error: Error) => void;
  }
): Promise<void>
```

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| messages | Message[] | 是 | 消息历史 |
| options | Object | 否 | 配置选项 |
| options.model | string | 否 | 模型名称 |
| options.temperature | number | 否 | 温度参数 |
| options.onChunk | function | 否 | 流式接收回调 |
| options.onComplete | function | 否 | 完成回调 |
| options.onError | function | 否 | 错误回调 |

**示例**:

```typescript
await streamResponse(messages, {
  model: 'gpt-4o',
  temperature: 0.7,
  onChunk: (content) => {
    // 实时更新UI
    setDisplayedContent(prev => prev + content);
  },
  onComplete: () => {
    console.log('响应完成');
  }
});
```

#### 停止生成

```typescript
const stopGenerating = useChatStore.getState().stopGenerating;

stopGenerating(): void
```

**示例**:

```typescript
stopGenerating();
```

#### 管理会话

```typescript
// 创建新会话
const createConversation = useChatStore.getState().createConversation;
await createConversation(title?: string): Promise<string>

// 切换会话
const setCurrentConversation = useChatStore.getState().setCurrentConversation;
setCurrentConversation(conversationId: string): void

// 删除会话
const deleteConversation = useChatStore.getState().deleteConversation;
await deleteConversation(conversationId: string): Promise<void>

// 获取会话消息
const getConversationMessages = useChatStore.getState().getConversationMessages;
getConversationMessages(conversationId: string): Message[]
```

#### 管理消息

```typescript
// 删除消息
const deleteMessage = useChatStore.getState().deleteMessage;
deleteMessage(messageId: string): void

// 编辑消息
const editMessage = useChatStore.getState().editMessage;
editMessage(messageId: string, newContent: string): void

// 重新生成
const regenerateMessage = useChatStore.getState().regenerateMessage;
regenerateMessage(messageId: string): Promise<void>

// 复制消息
const copyMessage = useChatStore.getState().copyMessage;
copyMessage(messageId: string): Promise<void>
```

#### 配置管理

```typescript
// 设置模型
const setModel = useChatStore.getState().setModel;
setModel(model: string): void

// 设置温度
const setTemperature = useChatStore.getState().setTemperature;
setTemperature(temperature: number): void

// 获取当前配置
const config = useChatStore.getState();
console.log(config.model);      // 当前模型
console.log(config.temperature); // 当前温度
```

### 2.3 状态类型定义

```typescript
// 消息类型
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[];
  createdAt: number;
  model?: string;
  tokens?: number;
}

// 会话类型
interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  model?: string;
}

// 流式响应状态
interface StreamState {
  isStreaming: boolean;
  currentContent: string;
  displayedContent: string;
}
```

---

## 3. API 配置

### 3.1 API 配置文件

```typescript
// frontend/src/lib/apiConfig.ts
export interface Channel {
  id: string;
  name: string;
  provider: string;
  enabled: boolean;
  apiKey?: string;
  models: string[];
  baseURL?: string;
}

export interface APIConfig {
  channels: Channel[];
  defaultChannel: string;
  defaultModel: string;
}
```

### 3.2 可用模型列表

| 模型 ID | 提供商 | 说明 |
|---------|--------|------|
| gpt-5 | OpenAI | 最新 GPT-5 模型 |
| gpt-4o | OpenAI | GPT-4 Optimized |
| gpt-4o-mini | OpenAI | GPT-4 轻量版 |
| o1 | OpenAI | OpenAI o1 推理模型 |
| o1-mini | OpenAI | o1 轻量版 |
| claude-opus-4-6 | Anthropic | Claude 4 Opus |
| claude-sonnet-4-6 | Anthropic | Claude 4 Sonnet |
| claude-haiku-4-5 | Anthropic | Claude 4 Haiku |
| gemini-2.5-pro | Google | Gemini 2.5 Pro |
| gemini-2.5-flash | Google | Gemini 2.5 Flash |
| deepseek-chat | DeepSeek | DeepSeek 对话模型 |
| deepseek-coder | DeepSeek | DeepSeek 代码模型 |
| deepseek-reasoner | DeepSeek | DeepSeek 推理模型 |
| glm-4-plus | 智谱AI | GLM-4 Plus |
| glm-4-flash | 智谱AI | GLM-4 Flash |
| abab7-chat | MiniMax | MiniMax Chat |

### 3.3 模型参数

```typescript
interface ModelParams {
  model: string;           // 模型 ID
  temperature?: number;      // 温度 (0-2)
  max_tokens?: number;       // 最大 token 数
  top_p?: number;           // nucleus 采样
  frequency_penalty?: number;// 频率惩罚
  presence_penalty?: number; // 存在惩罚
  stop?: string[];          // 停止符
}
```

---

## 4. 组件接口

### 4.1 ChatArea (聊天区域)

```typescript
interface ChatAreaProps {
  messages: Message[];
  isLoading: boolean;
  streamingContent?: string;
  onSendMessage: (content: string) => void;
  onStopGenerating?: () => void;
  onDeleteMessage?: (id: string) => void;
  onCopyMessage?: (id: string) => void;
  onRegenerateMessage?: (id: string) => void;
}

// 使用示例
<ChatArea
  messages={messages}
  isLoading={isLoading}
  streamingContent={streamingContent}
  onSendMessage={handleSend}
/>
```

### 4.2 MessageInput (消息输入)

```typescript
interface MessageInputProps {
  disabled?: boolean;
  onSubmit: (content: string, files?: File[]) => void;
  onTyping?: (isTyping: boolean) => void;
  placeholder?: string;
  maxLength?: number;
}

// 功能支持
// - 文本输入
// - 文件/图片上传
// - 拖拽上传
// - 语音录制（可选）
```

### 4.3 ModelSelector (模型选择器)

```typescript
interface ModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
  channels?: Channel[];
  disabled?: boolean;
}

// 使用示例
<ModelSelector
  value={currentModel}
  onChange={setModel}
  channels={availableChannels}
/>
```

### 4.4 ConversationList (会话列表)

```typescript
interface ConversationListProps {
  conversations: Conversation[];
  currentId?: string;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  onNewChat?: () => void;
}
```

### 4.5 Sidebar (侧边栏)

```typescript
interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  position?: 'left' | 'right';
  width?: string | number;
}
```

### 4.6 SettingPanel (设置面板)

```typescript
interface SettingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  // 模型配置
  model: string;
  onModelChange: (model: string) => void;
  temperature: number;
  onTemperatureChange: (temp: number) => void;
  // 其他设置...
}
```

### 4.7 KnowledgePanel (知识库面板)

```typescript
interface KnowledgePanelProps {
  isOpen: boolean;
  onClose: () => void;
  documents: Document[];
  onUpload?: (file: File) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onSearch?: (query: string) => Promise<SearchResult[]>;
}
```

### 4.8 AgentPanel (智能体面板)

```typescript
interface AgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  agents: Agent[];
  onSelectAgent?: (agent: Agent) => void;
  onCreateAgent?: (config: AgentConfig) => Promise<void>;
}
```

### 4.9 TraceViewer (追踪面板)

```typescript
interface TraceViewerProps {
  isOpen: boolean;
  onClose: () => void;
  traces: Trace[];
  autoRefresh?: boolean;
  refreshInterval?: number;
}
```

### 4.10 PerformanceDashboard (性能面板)

```typescript
interface PerformanceDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  metrics: PerformanceMetrics;
  refreshInterval?: number;
}

interface PerformanceMetrics {
  uptime: number;
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  memoryUsage: number;
}
```

---

## 5. 事件与回调

### 5.1 SSE 事件类型

```typescript
// SSE 消息类型
type SSEMessageType =
  | 'content'     // 内容片段
  | 'done'        // 完成
  | 'error'       // 错误
  | 'tool_call'   // 工具调用
  | 'thinking';   // 思考中
```

### 5.2 事件监听示例

```typescript
// 在组件中监听 SSE
useEffect(() => {
  const eventSource = new EventSource('/api/chat/stream?sessionId=xxx');

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case 'content':
        appendContent(data.content);
        break;
      case 'done':
        completeResponse();
        break;
      case 'error':
        handleError(data.error);
        break;
    }
  };

  return () => eventSource.close();
}, []);
```

---

## 6. 错误处理

### 6.1 错误类型

```typescript
// 前端错误类型
interface APIError {
  code: string;
  message: string;
  status: number;
  details?: any;
}

// 常见错误码
const ErrorCodes = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  AUTH_FAILED: 'AUTH_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
  INVALID_REQUEST: 'INVALID_REQUEST',
  SERVER_ERROR: 'SERVER_ERROR',
  TIMEOUT: 'TIMEOUT'
};
```

### 6.2 错误处理示例

```typescript
try {
  await sendMessage(content);
} catch (error) {
  if (error.status === 401) {
    // 处理认证失败
    showNotification('请重新设置 API Key', 'error');
  } else if (error.status === 429) {
    // 处理限流
    showNotification('请求过于频繁，请稍后重试', 'warning');
  } else if (error.status >= 500) {
    // 处理服务器错误
    showNotification('服务器错误，请稍后重试', 'error');
  } else {
    // 处理其他错误
    showNotification(error.message, 'error');
  }
}
```

---

## 附录

### A. 状态管理最佳实践

```typescript
// 1. 选择性订阅，避免不必要的重渲染
const messages = useChatStore(state => state.messages);
const isLoading = useChatStore(state => state.isLoading);

// 2. 使用 shallow 比较
import { shallow } from 'zustand/shallow';
const { messages, isLoading } = useChatStore(
  state => ({ messages: state.messages, isLoading: state.isLoading }),
  shallow
);

// 3. 派生状态使用 selector
const sortedMessages = useChatStore(state =>
  [...state.messages].sort((a, b) => a.createdAt - b.createdAt)
);
```

### B. 性能优化

```typescript
// 1. 虚拟列表（大量消息时）
import { useVirtualizer } from '@tanstack/react-virtual';

// 2. 消息防抖
import { useDebouncedCallback } from 'use-debounce';

const debouncedSave = useDebouncedCallback(
  (messages) => saveToStorage(messages),
  1000
);

// 3. 图片懒加载
<img src={src} loading="lazy" alt={alt} />
```

### C. TypeScript 类型导出

```typescript
// frontend/src/types/index.ts
export * from './message';
export * from './conversation';
export * from './agent';
export * from './rag';
```
