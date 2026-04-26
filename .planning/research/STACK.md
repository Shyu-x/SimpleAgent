# AI Agent 平台标准技术栈 (2025)

> 研究日期: 2026-04-26
> 基于 Next.js 15 + React 19 + MiniMax 架构

---

## 目录

1. [前端框架](#1-前端框架)
2. [状态管理](#2-状态管理)
3. [流式响应 (SSE)](#3-流式响应-sse)
4. [AI SDK 集成](#4-ai-sdk-集成)
5. [后端框架](#5-后端框架)
6. [测试框架](#6-测试框架)
7. [工具链](#7-工具链)
8. [不推荐使用的技术](#8-不推荐使用的技术)
9. [技术决策矩阵](#9-技术决策矩阵)

---

## 1. 前端框架

### Next.js 15 (App Router) ✅ **推荐**

| 项目 | 推荐版本 | 说明 |
|------|----------|------|
| next | `^15.0.0` | React 19 RC 支持，稳定版 |
| react | `^19.0.0` | React 19 RC |
| react-dom | `^19.0.0` | React DOM |

**关键新特性 (Next.js 15)**:

1. **React 19 支持**
   - `use()` hook - 在渲染中直接读取 promises 和 contexts
   - `useActionState` (原 useFormState) - 表单状态管理
   - `useOptimistic` - 乐观更新
   - `useFormStatus` - 表单提交状态

2. **流式改进**
   - `prerender()` API 支持静态 HTML 生成
   - `unstable_after` 支持响应后执行代码

3. **Turbopack 稳定版**
   - 开发启动提速 76.7%
   - Fast Refresh 提速 96.3%

**置信度**: 95%

**理由**: Next.js 15 是 2025 年构建 AI 应用的标准框架，Vercel 官方支持，生态完善。

---

### 不推荐: Pages Router ❌

**理由**:
- Next.js 15 重心在 App Router
- React 19 新特性优先在 App Router 支持
- Pages Router 仅做向后兼容

**置信度**: 90%

---

## 2. 状态管理

### Zustand 5 ✅ **推荐**

| 项目 | 推荐版本 | 说明 |
|------|----------|------|
| zustand | `^5.0.0` | 轻量级状态管理 |
| zustand/middleware | 内置 | persist, devtools, subscribeWithSelector |

**AI Agent 场景最佳实践**:

```typescript
// 消息流状态管理
interface ChatState {
  messages: Message[];
  streamingContent: string;
  isStreaming: boolean;
  addMessage: (msg: Message) => void;
  updateStreaming: (chunk: string) => void;
  setStreaming: (status: boolean) => void;
}

// Session 状态管理
interface SessionState {
  sessionId: string | null;
  agentMode: 'chat' | 'agent' | 'hitl';
  context: Context;
}
```

**为什么适合 AI Agent**:

1. **轻量** - 无 Provider 嵌套地狱
2. **TypeScript 原生** - 完整类型推断
3. **中间件丰富** - persist (localStorage/sessionStorage), devtools, subscribeWithSelector
4. **Zustand 5 改进** - 更小的 bundle, 更好的 React 19 兼容

**置信度**: 90%

### 备选: Jotai

| 项目 | 推荐版本 | 适用场景 |
|------|----------|----------|
| jotai | `^2.10.0` | 原子化状态，需要细粒度更新 |

**适用场景**:
- 复杂的多窗口聊天 (需要独立的 atom 订阅)
- 需要 derived state 模式

**置信度**: 75%

### 不推荐: Redux Toolkit ❌

**理由**:
- 样板代码过多
- AI Agent UI 需要快速迭代，Redux 太重
- 与 React 19 新特性 (use) 集成复杂

**置信度**: 85%

---

## 3. 流式响应 (SSE)

### SSE (Server-Sent Events) ✅ **推荐**

**标准实现模式**:

```javascript
// 后端 (Express/Next.js API Route)
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 模拟流式响应
  const tokens = ['Hello', ' ', 'world', '!'];

  tokens.forEach((token, i) => {
    res.write(`event: chat\n`);
    res.write(`data: ${JSON.stringify({ token, done: i === tokens.length - 1 })}\n\n`);
  });

  res.end();
});

// 前端 (React)
const EventSource = () => {
  const [content, setContent] = useState('');

  useEffect(() => {
    const eventSource = new EventSource('/api/stream');

    eventSource.addEventListener('chat', (event) => {
      const { token, done } = JSON.parse(event.data);
      setContent(prev => prev + token);
      if (done) eventSource.close();
    });

    eventSource.onerror = (err) => {
      console.error('SSE error:', err);
      eventSource.close();
    };

    return () => eventSource.close();
  }, []);

  return <div>{content}</div>;
};
```

**关键 Header 配置**:

| Header | 值 | 作用 |
|--------|-----|------|
| Content-Type | text/event-stream | SSE 标识 |
| Cache-Control | no-cache | 禁用缓存 |
| Connection | keep-alive | 保持连接 |
| Access-Control-Allow-Origin | * | 跨域支持 |

**心跳保活**: 每 30 秒发送 `: heartbeat\n\n`

**置信度**: 95%

### Vercel AI SDK 流式抽象 ✅ **推荐用于 AI**

| 项目 | 推荐版本 | 说明 |
|------|----------|------|
| ai | `^3.0.0` | Vercel AI SDK 核心 |
| @ai-sdk/openai | 最新 | OpenAI 兼容 provider |
| @ai-sdk/anthropic | 最新 | Anthropic 兼容 |

**优势**:
- 统一流式 API
- Provider 抽象 (支持 MiniMax 等)
- React Server Components 一等支持
- 工具调用自动处理

```typescript
import { streamText } from 'ai';

// Next.js App Router Route Handler
export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await streamText({
    model: openai('gpt-4-turbo'),
    messages,
    tools: { /* ... */ },
  });

  return result.toDataStreamResponse();
}
```

**置信度**: 85%

### 不推荐: WebSocket ❌

**理由**:
- SSE 是单向，更适合 AI 聊天 (服务器推流)
- WebSocket 适合双向实时通信 (如 multiplayer 编辑)
- SSE 更简单，HTTP/2 优好

**置信度**: 80%

---

## 4. AI SDK 集成

### MiniMax 适配 ✅ **推荐自建适配器**

当前项目使用自建 `MiniMaxChatClient`，这是正确的做法。

**架构建议**:

```typescript
// 1. 统一模型接口
interface ChatModel {
  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  streamChat(messages: Message[], options?: ChatOptions): ReadableStream;
}

// 2. MiniMax 实现
class MiniMaxChatClient implements ChatModel {
  constructor(config: MiniMaxConfig) { /* ... */ }

  async chat(messages, options) {
    // 调用 MiniMax API
  }

  streamChat(messages, options): ReadableStream {
    // 返回 SSE 流
  }
}

// 3. Provider 抽象
class ModelProvider {
  private clients: Map<string, ChatModel>;

  getClient(model: string): ChatModel {
    return this.clients.get(model) || this.clients.get('default');
  }
}
```

**MiniMax API 特性**:
- `MiniMax-M2.7` - 旗舰编程模型 (100K tokens)
- `MiniMax-VL-01` - 多模态 (32K tokens)
- `MiniMax-Text-01` - 长文本 (400K tokens)
- `reasoning_split` - 思维链分离

**置信度**: 90%

### 向量数据库

| 数据库 | 推荐版本 | 适用场景 |
|--------|----------|----------|
| Qdrant | `1.12+` | 生产环境向量检索 |
| pgvector | `0.5+` | 已有 PostgreSQL |
| Chroma | `0.4+` | 原型/MVP |

**当前项目**: Qdrant ✅ 正确选择

**置信度**: 90%

---

## 5. 后端框架

### Express 4.18 ✅ **推荐**

| 项目 | 推荐版本 | 说明 |
|------|----------|------|
| express | `^4.18.0` | 稳定可靠 |
| cors | `^2.8.0` | 跨域支持 |
| helmet | `^7.0.0` | 安全头 |

**AI Agent 后端职责**:
- SSE 流式响应端点
- Agent 执行编排
- RAG 检索服务
- 工具调用路由
- MCP 协议集成

**置信度**: 90%

### 不推荐: NestJS ❌

**理由**:
- 学习曲线陡峭
- 装饰器语法与纯 Node.js 差异大
- AI Agent 需要灵活的工具执行，Nest 约束太多

**置信度**: 70%

### 备选: Fastify

| 项目 | 推荐版本 | 适用场景 |
|------|----------|----------|
| fastify | `^4.26.0` | 高性能 API |

**适用场景**: 如果性能是瓶颈，可以考虑

**置信度**: 65%

---

## 6. 测试框架

### Vitest + React Testing Library ✅ **推荐**

| 项目 | 推荐版本 | 说明 |
|------|----------|------|
| vitest | `^2.0.0` | Vite 原生测试框架 |
| @testing-library/react | `^16.0.0` | React 组件测试 |
| @testing-library/user-event | `^14.5.0` | 用户交互模拟 |
| jsdom | `^25.0.0` | DOM 模拟 |

**AI Agent 测试策略**:

```typescript
// 1. 组件测试 (React Testing Library)
describe('ChatInput', () => {
  it('should handle form submission', async () => {
    render(<ChatInput onSend={mockOnSend} />);

    const input = screen.getByPlaceholderText('输入消息...');
    await userEvent.type(input, 'Hello');
    await userEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(mockOnSend).toHaveBeenCalledWith('Hello');
  });

  it('should show streaming indicator', () => {
    render(<ChatInput isStreaming={true} />);
    expect(screen.getByText('思考中...')).toBeInTheDocument();
  });
});

// 2. SSE 流测试
describe('SSE Stream', () => {
  it('should handle streaming response', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue('event: chat\ndata: {"token":"Hello"}\n\n');
        controller.enqueue('event: chat\ndata: {"token":"World","done":true}\n\n');
        controller.close();
      }
    });

    // 验证流处理逻辑
    const reader = stream.getReader();
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    expect(chunks.length).toBe(2);
  });
});
```

**置信度**: 90%

### Playwright ✅ **E2E 测试推荐**

| 项目 | 推荐版本 | 说明 |
|------|----------|------|
| playwright | `^1.50.0` | E2E 测试框架 |
| @playwright/test | 同上 | Playwright 测试套件 |

**用途**:
- 端到端聊天流程
- 多窗口聊天
- 响应式布局
- AI 功能集成测试

**置信度**: 90%

### 不推荐: Jest ❌

**理由**:
- 慢 (与 Vite 生态不匹配)
- ESM 支持不完善
- React 19 新特性测试支持滞后

**置信度**: 85%

---

## 7. 工具链

### 代码质量

| 工具 | 推荐版本 | 用途 |
|------|----------|------|
| ESLint 9 | `^9.0.0` | 代码检查 |
| Prettier | `^3.0.0` | 代码格式化 |
| TypeScript | `^5.4.0` | 类型检查 |

**ESLint 配置 (Next.js 15 + React 19)**:

```javascript
// eslint.config.mjs
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import next from 'eslint-plugin-next';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { react, next },
    rules: {
      ...react.configs.recommended.rules,
      ...next.configs.recommended.rules,
      'react/no-unknown-property': ['error', { ignore: ['jsx', 'css'] }],
    },
  },
];
```

### 构建工具

| 工具 | 推荐版本 | 用途 |
|------|----------|------|
| Turbopack | 内置 Next.js 15 | 开发构建 (稳定) |
| Webpack | 5.x | 生产构建 (默认) |
| SWC | 内置 | TypeScript/JSX 编译 |

**置信度**: 95%

---

## 8. 不推荐使用的技术

### 1. SWR ❌

**理由**:
- React 19 的 `use()` hook 和 Suspense 替代
- 状态管理更推荐 Zustand/P Jotai
- SWR 的 revalidation 在 AI 场景不适用

**置信度**: 80%

### 2. Apollo Client ❌

**理由**:
- GraphQL 对 AI Agent 场景过度设计
- REST + SSE 更简单直接
- 增加不必要的复杂度

**置信度**: 85%

### 3. Material UI (MUI) ❌

**理由**:
- 样式与 AI 应用的现代美学不匹配
- bundle size 大 (200KB+)
- Headless UI / Radix UI + Tailwind 更灵活

**置信度**: 75%

### 4. Socket.IO ❌

**理由**:
- SSE 是 AI 流式响应标准
- WebSocket 双向通信是 overkill
- Socket.IO 额外协议开销

**置信度**: 80%

### 5. Relay ❌

**理由**:
- GraphQL 客户端过于复杂
- AI Agent 不需要 GraphQL 的强一致性
- 学习曲线陡峭

**置信度**: 85%

---

## 9. 技术决策矩阵

### 前端栈

| 场景 | 推荐方案 | 置信度 | 备选 |
|------|----------|--------|------|
| 框架 | Next.js 15 App Router | 95% | - |
| React | React 19 | 95% | React 18 (Pages Router) |
| 状态管理 | Zustand 5 | 90% | Jotai |
| 样式 | Tailwind CSS 4 | 90% | CSS Modules |
| 流式 | SSE + AI SDK | 90% | WebSocket |
| 测试 | Vitest + RTL + Playwright | 90% | Jest |

### 后端栈

| 场景 | 推荐方案 | 置信度 | 备选 |
|------|----------|--------|------|
| API | Express 4.18 | 90% | Fastify |
| 向量 | Qdrant | 90% | pgvector |
| 协议 | SSE + MCP | 90% | WebSocket |
| 任务队列 | QueueManager (自建) | 85% | BullMQ |
| 缓存 | Redis | 80% | 内存缓存 |

### 2025 AI Agent 标准技术栈

```
┌─────────────────────────────────────────────────────────────┐
│                      前端 (2025 标准)                        │
├─────────────────────────────────────────────────────────────┤
│  Next.js 15 (App Router) + React 19 + Zustand 5 + Tailwind  │
│  Vitest + Playwright + TypeScript 5.4                       │
│  SSE 流式 + AI SDK 抽象                                      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      后端 (2025 标准)                        │
├─────────────────────────────────────────────────────────────┤
│  Express 4.18 + Node.js 20 + TypeScript                     │
│  Qdrant (向量) + Redis (缓存)                                │
│  SSE 流式 + MCP 协议 + A2A 协议                              │
│  熔断器 (CircuitBreaker) + 限流器 (RateLimiter)              │
└─────────────────────────────────────────────────────────────┘
```

---

## 附录: 关键资源

- [Next.js 15 官方博客](https://nextjs.org/blog/next-15)
- [React 19 升级指南](https://react.dev/blog/2024/12/05/react-19)
- [Vercel AI SDK](https://ai-sdk.dev)
- [MDN SSE 文档](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [Vitest 官方文档](https://vitest.dev)
- [Playwright](https://playwright.dev)

---

*本文件由 Claude Code 自动生成，基于 2025 年最新技术栈研究*
