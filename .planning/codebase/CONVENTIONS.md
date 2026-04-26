# AI Chat 玩具 - 编码规范

**项目**: AI Chat 玩具 - 现代化AI对话平台
**位置**: `C:\Users\Xu\Desktop\chat玩具`
**更新**: 2026-04-26

---

## 语言要求

- **注释**: 所有代码注释使用中文
- **文档**: 所有文档（README、接口文档）使用中文
- **变量命名**: 使用英文
- **UI文本**: 使用中文

> 例外: 不允许使用 emoji，必须使用文字描述

---

## 代码格式化

### ESLint 配置

**文件**: `frontend/.eslintrc.json`

```json
{
  "extends": ["next/core-web-vitals", "next/typescript"],
  "rules": {
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "react-hooks/exhaustive-deps": "off",
    "react/no-unescaped-entities": "off",
    "@next/next/no-img-element": "off",
    "jsx-a11y/alt-text": "off"
  }
}
```

### TypeScript 配置

**文件**: `frontend/tsconfig.json`

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": false,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "paths": { "@/*": ["./src/*"] },
    "target": "ES2022"
  }
}
```

### Jest 配置

**文件**: `backend/jest.config.js`

- 测试环境: `node`
- 超时: 10秒
- 覆盖率阈值: 30%
- 报告格式: `text`, `lcov`, `html`

---

## 命名约定

### 文件命名

| 类型 | 规范 | 示例 |
|------|------|------|
| React组件 | PascalCase | `ChatArea.tsx`, `AgentExecutionPanel.tsx` |
| JavaScript模块 | camelCase | `chatStore.ts`, `agentEngine.js` |
| 工具函数 | camelCase | `retry.js`, `circuitBreaker.js` |
| 配置文件 | kebab-case | `jest.config.js`, `playwright.config.js` |
| 测试文件 | `.test.js` 或 `.spec.js` | `hitl.test.js`, `chat.spec.ts` |

### 变量命名

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件 | PascalCase | `ChatArea`, `AgentExecutionPanel` |
| 函数 | camelCase | `generateId`, `handleScroll` |
| 变量 | camelCase | `activeConversationId`, `isLoading` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRIES`, `REACT_PHASES` |
| 私有属性 | _前缀 | `_checkCancelled`, `_summarizeMessages` |
| 类 | PascalCase | `AgentEngine`, `CircuitBreaker` |

### 目录结构

```
backend/src/
├── application/     # 应用编排层
├── domain/          # 核心业务逻辑
├── infra/           # 基础设施
├── common/          # 通用基础
├── routes/          # 接口层 (30+ 路由)
├── services/        # 业务逻辑层
├── middleware/      # 中间件
└── utils/           # 工具函数

frontend/src/
├── app/             # Next.js App Router
├── components/      # React组件
│   ├── agent/       # Agent相关组件
│   ├── admin/       # 管理后台组件
│   └── ...
├── store/           # Zustand状态
├── hooks/           # 自定义Hooks
├── lib/             # 工具库
└── types/           # TypeScript类型
```

---

## 代码风格

### 注释规范

```javascript
/**
 * Agent执行引擎 - 智能化升级版本
 * 核心循环：思考(Reason) -> 行动(Act) -> 观察(Observe) -> 反思(Reflect) -> 决策(Continue)
 * 支持LLM推理、ReAct模式、反思机制
 *
 * 借鉴 MiniMax Mini-Agent 的设计:
 * - 结构化日志 (AgentLogger)
 * - 重试机制 (withRetry, withTimeout)
 * - Session Note Tool 持久化记忆
 */

// 单行注释使用 // (中文)
const maxRetries = 3;  // 最大重试次数
```

### React组件规范

```typescript
'use client';

import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '@/store/chatStore';

// 简单的 ID 生成函数
function generateId(): string {
  return `id_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

interface ChatAreaProps {
  conversationId?: string;
  onOpenSidebar?: () => void;
}

export default function ChatArea({ conversationId }: ChatAreaProps) {
  // 状态管理
  const [isLoading, setIsLoading] = useState(false);

  // 回调函数使用 useCallback
  const handleScroll = useCallback(() => {
    // ...
  }, []);

  // 使用 useMemo 缓存计算结果
  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId),
    [conversations, activeConversationId]
  );
}
```

### 函数命名

| 功能 | 命名 | 示例 |
|------|------|------|
| 事件处理 | handle* | `handleScroll`, `handleClick` |
| 数据获取 | get*/fetch* | `getConversation`, `fetchMessages` |
| 数据设置 | set* | `setActiveConversation` |
| 状态判断 | is*/has*/should* | `isLoading`, `hasPermission` |
| 工具执行 | execute* | `executeTool`, `executeWithTimeout` |

---

## 错误处理

### 错误分类

```javascript
const ERROR_CLASSIFICATION = {
  TRANSIENT: 'transient',       // 临时错误（网络超时等），可重试
  RESOURCE: 'resource',         // 资源错误（内存不足等），可重试但需降级
  PARAMETER: 'parameter',        // 参数错误，不应重试
  AUTHENTICATION: 'auth',        // 认证错误，不应重试
  RATE_LIMIT: 'rate_limit',     // 限流错误，可重试但需退避
  UNKNOWN: 'unknown'            // 未知错误，根据情况判断
};
```

### 重试策略

```javascript
const RETRY_STRATEGY = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  exponentialBase: 2,
  errorTypes: {
    [ERROR_CLASSIFICATION.TRANSIENT]: { maxRetries: 3, backoffMultiplier: 1 },
    [ERROR_CLASSIFICATION.RESOURCE]: { maxRetries: 2, backoffMultiplier: 1.5 },
    [ERROR_CLASSIFICATION.RATE_LIMIT]: { maxRetries: 5, backoffMultiplier: 2 }
  }
};
```

---

## API 设计

### RESTful 规范

| 操作 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 获取列表 | GET | `/api/resource` | |
| 获取单个 | GET | `/api/resource/:id` | |
| 创建 | POST | `/api/resource` | |
| 更新 | PUT/PATCH | `/api/resource/:id` | |
| 删除 | DELETE | `/api/resource/:id` | |

### 响应格式

```javascript
// 成功响应
{ "success": true, "data": {...} }

// 错误响应
{ "error": { "code": "INVALID_PARAMETER", "message": "参数错误" } }
```

### SSE 流式响应

```javascript
// 使用 text/event-stream
// Content-Type: text/event-stream
// 数据格式: data: {"content": "..."}\n\n
```

---

## 目录结构规范

### 后端分层

```
src/
├── application/           # 应用编排层
│   ├── ChatOrchestrator.js
│   └── AgentOrchestrator.js
├── domain/                # 核心业务逻辑
│   ├── model/             # 模型抽象
│   ├── rag/               # RAG领域
│   └── agent/             # Agent领域
├── infra/                 # 基础设施层
│   ├── circuitBreaker/    # 熔断器
│   ├── rateLimiter/       # 限流器
│   ├── metrics/          # 指标采集
│   └── sse/               # SSE基础设施
├── common/                # 通用基础
│   └── errors/            # 统一错误体系
├── routes/                # 接口层 (30+ 路由)
├── services/              # 业务逻辑层
├── middleware/            # 中间件
└── utils/                 # 工具函数
```

### 前端分层

```
src/
├── app/                   # Next.js App Router
│   └── page.tsx           # 主页面
├── components/            # React组件
│   ├── ChatArea.tsx       # 聊天区域
│   ├── ChatInput.tsx      # 输入框
│   ├── agent/             # Agent相关
│   │   ├── MissionControl/
│   │   ├── HumanConfirmationDialog.tsx
│   │   └── PerformanceMonitor.tsx
│   └── admin/             # 管理后台
│       ├── AdminDashboard.tsx
│       ├── KnowledgeBase/
│       └── ToolRegistry/
├── store/                 # Zustand状态
├── hooks/                 # 自定义Hooks
├── lib/                   # 工具库
│   ├── apiClient.ts       # API客户端
│   └── apiConfig.ts       # API配置
└── types/                 # TypeScript类型
```

---

## 测试规范

### 测试文件位置

| 类型 | 位置 | 命名 |
|------|------|------|
| 单元测试 | `backend/tests/unit/` | `*.test.js` |
| 集成测试 | `backend/tests/integration/` | `*.test.js` |
| E2E测试 | `tests/e2e/` | `*.spec.ts` |
| 量化测试 | `tests/` | `*_runner.js` |

### 测试命名

```javascript
test('should create a checkpoint with valid fields', () => {
  // 测试代码
});

test('should detect high risk operations', () => {
  // 测试代码
});
```

### Jest 配置

- 文件后缀: `.test.js`, `.spec.js`, `__tests__/**/*.js`
- 测试超时: 10秒
- 覆盖率阈值: 全局 30%

---

## 安全规范

### XSS防护

- 使用 `dompurify` 净化用户输入
- 使用 `shiki` 替代 `highlight.js` 进行语法高亮
- 禁止使用 `rehype-raw`

### 安全响应头

```javascript
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

---

## 环境变量

### 后端 (.env)

```bash
# MiniMax Token Plan API (必需)
MINIMAX_API_KEY=your_token_plan_api_key

# MiniMax API 地址 (可选)
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic

# Ollama 向量模型 (可选)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=mxbai-embed-large

# RAG 配置
RAG_CHUNK_SIZE=512
RAG_TOP_K=5
RAG_RERANK=true
```

### 前端 (.env.local)

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:30000
```

---

## 响应式断点

| 设备 | 断点 | 说明 |
|------|------|------|
| 移动端 | < 640px | |
| 平板 | 640px - 1023px | |
| 桌面 | 1024px+ | |