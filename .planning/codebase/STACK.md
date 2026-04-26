# Stack Research

**Domain:** AI Chat / Conversational AI Platform
**Researched:** 2026-04-26
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|-----------|---------|---------|-----------------|
| React | 19.0.0 | 前端UI框架 | 现代化Hooks支持，虚拟DOM高效渲染 |
| Next.js | 15.0.0 | React SSR/SSG框架 | App Router、TurboPack、更快的构建 |
| Zustand | 5.0.0 | 状态管理 | 轻量级、TypeScript优先、无样板代码 |
| Express | 4.18.2 | 后端HTTP框架 | 成熟稳定、中间件丰富、社区生态大 |
| Node.js | 18+ | 运行时 | V8引擎优化、异步I/O高效 |

### Supporting Libraries

#### Frontend

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| framer-motion | 12.36.0 | 动画库 | 页面过渡、组件动画 |
| shiki | 4.0.2 | 语法高亮 | 代码块高亮（已替代highlight.js） |
| dompurify | 3.3.3 | XSS防护 | 用户输入净化 |
| react-markdown | 9.0.1 | Markdown渲染 | 聊天消息渲染 |
| remark-gfm | 4.0.0 | GFM支持 | GitHub风格表格、任务列表 |
| remark-math | 6.0.0 | 数学公式 | KaTeX数学公式渲染 |
| recharts | 3.8.0 | 图表库 | 数据可视化（性能监控） |
| @dnd-kit/core | 6.3.1 | 拖拽库 | 可视化编辑器 |
| lucide-react | 0.460.0 | 图标库 | 现代扁平图标 |
| tailwindcss | 3.4.17 | CSS框架 | 原子化CSS、快速开发 |

#### Backend

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| axios | 1.6.0 | HTTP客户端 | 外部API调用 |
| @modelcontextprotocol/sdk | 0.5.0 | MCP协议 | Agent工具扩展 |
| cors | 2.8.5 | CORS中间件 | 跨域请求处理 |
| multer | 1.4.5-lts.1 | 文件上传 | 文档上传处理 |
| cheerio | 1.0.0-rc.12 | HTML解析 | 网页内容提取 |
| uuid | 9.0.1 | UUID生成 | 会话ID生成 |
| swagger-jsdoc | 6.2.8 | API文档 | OpenAPI文档生成 |
| swagger-ui-express | 5.0.0 | API文档UI | Swagger调试界面 |
| ioredis | 5.10.0 | Redis客户端 | 缓存、会话存储 |
| pg | 8.20.0 | PostgreSQL客户端 | 关系数据库 |
| @prisma/client | 7.5.0 | ORM | 数据库操作 |
| opossum | 5.0.1 | 熔断器 | 熔断降级（已在用自研CircuitBreaker） |
| vm2 | 3.10.5 | 沙箱执行 | 代码执行隔离 |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| playwright | 1.58.2 | E2E测试 | 跨浏览器测试 |
| jest | 30.3.0 | 单元测试 | 测试框架 |
| typescript | 5.7.0 | 类型系统 | 类型检查（前端） |
| ts-jest | 29.4.6 | TS测试 | TypeScript支持 |
| eslint | 9.17.0 | 代码检查 | Lint规则 |
| autocannon | 8.0.0 | 压测工具 | 性能压测 |

## Installation

```bash
# Frontend
cd frontend
npm install react@^19.0.0 next@^15.0.0 zustand@^5.0.0 framer-motion@^12.36.0

# Backend
cd backend
npm install express@^4.18.2 axios@^1.6.0 cors@^2.8.5

# Dev dependencies
npm install -D jest@^30.3.0 playwright@^1.58.2 typescript@^5.7.0
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|------------------------|
| Zustand | Redux Toolkit | 需要更多中间件或Immutable模式时 |
| Express | Fastify | 需要更高性能时（但生态较小） |
| shiki | highlight.js | 需要更多语言支持时（但有XSS风险） |
| 自研CircuitBreaker | opossum | 需要官方维护的熔断器时 |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| rehype-raw | XSS安全风险 | shiki + dompurify |
| highlight.js | 安全性问题 | shiki |
| moment.js | 体积大（已停止维护） | date-fns / dayjs |
| lodash | 完整包体积大 | 按需引入或原生方法 |

## Stack Patterns by Variant

**If 需要支持实时流式响应:**
- 使用 SSE (Server-Sent Events) 配合 MiniMax 流式API
- 前端使用 EventSource 或 fetch stream

**If 需要多Agent协作:**
- 使用 A2A (Agent-to-Agent) 协议
- AgentOrchestrator 编排多个Agent

**If 需要本地向量模型:**
- 使用 Ollama 部署 mxbai-embed-large
- 通过 HTTP 调用 Ollama API

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| React 19 | Next.js 15 | 需要 Next.js 15+ 支持 |
| Next.js 15 | React 19 | App Router支持 |
| Zustand 5 | React 19 | 需React 18.2+ |
| Node.js 18+ | Express 4.18 | 推荐使用LTS版本 |
| Prisma 7 | PostgreSQL | 需要Pg 12+ |

## Sources

- [React官方文档](https://react.dev) — React 19新特性
- [Next.js文档](https://nextjs.org/docs) — App Router最佳实践
- [Zustand文档](https://zustand-demo.pmnd.rs) — 状态管理
- [Express文档](https://expressjs.com) — 中间件模式
- [MiniMax API文档](https://api.minimaxi.com) — Token Plan API

---
*Stack research for: AI Chat 玩具*
*Researched: 2026-04-26*
