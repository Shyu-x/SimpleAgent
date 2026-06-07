# SimpleAgent

现代化 AI 对话平台，基于 React 19 + Next.js 16 + Express 构建。

[![CI/CD](https://github.com/Shyu-x/SimpleAgent/actions/workflows/ci.yml/badge.svg)](https://github.com/Shyu-x/SimpleAgent/actions)
[![Node.js](https://img.shields.io/badge/node-18%2B-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square)](LICENSE)

## 功能特性

| 分类 | 功能 | 说明 |
|------|------|------|
| **对话** | SSE 流式响应 | 打字机效果，实时输出 |
| | 多模态输入 | 支持图片、语音 |
| | 意图检测 | 5 种意图自动分流 |
| | 思维链可视化 | MiniMax 推理过程展示 |
| **Agent** | ReAct 执行引擎 | 推理 + 行动循环 |
| | 工具调用 | 30+ 内置工具 |
| | MCP 协议 | Model Context Protocol |
| | HITL 确认 | 人机协作安全确认 |
| | A2A 协作 | 多 Agent 团队协作 |
| **RAG** | 知识库管理 | 文档上传与索引 |
| | 混合检索 | 向量 + 关键词混合搜索 |
| | 问题重写 | 自动补全不完整查询 |
| | 多策略重排序 | CrossEncoder/BM25/Semantic |
| **企业级** | 熔断器 | 自动故障转移 |
| | 限流保护 | 队列式速率限制 |
| | 指标监控 | Prometheus 格式 |
| | 配置热更新 | 运行时动态配置 |
| | 管理后台 | 知识库/工具/模型/Prompt |

## 技术架构

```
+------------------------------------------------------------------+
|                      前端 (Port 3001)                              |
|   React 19 + Next.js 16 + Zustand 5 + TypeScript                 |
+------------------------------------------------------------------+
                              SSE
+------------------------------------------------------------------+
|                      后端 (Port 30000)                             |
|   Node.js + Express + 分层架构                                    |
+------------------------------------------------------------------+
                              API
+------------------------------------------------------------------+
|                      MiniMax API (外部服务)                        |
|   M2.7 / VL-01 / image-01                                        |
+------------------------------------------------------------------+
```

### 后端分层架构

```
backend/src/
├── application/     # 应用编排层 (ChatOrchestrator, AgentOrchestrator)
├── domain/          # 核心业务逻辑
│   ├── model/       # 模型抽象
│   ├── rag/         # RAG 领域 (QueryRewrite, QueryDecompose, Reranker)
│   ├── agent/       # Agent 领域 (IntentRouter, ToolExecutor)
│   └── search/      # 检索领域 (VectorSearch, KeywordSearch)
├── infra/           # 基础设施
│   ├── circuitBreaker/  # 熔断器
│   ├── rateLimiter/      # 限流器
│   ├── metrics/          # Prometheus 指标
│   ├── alert/            # 告警管理
│   ├── config/           # 配置中心
│   └── queue/            # 队列管理
├── common/          # 通用工具 (errors/)
├── routes/          # API 端点 (40+ 路由)
│   ├── admin/          # 管理后台 API
│   ├── a2a.js          # A2A 协作
│   ├── chat.js         # 对话接口
│   ├── hitl.js         # HITL 确认
│   └── ...
└── services/        # 业务逻辑层
    ├── agent/          # Agent 服务
    ├── model/          # 模型客户端
    ├── rag/            # RAG 服务
    ├── router/         # 模型路由
    └── tools/          # 工具实现 (30+)
```

## 快速开始

### 环境要求

| 依赖 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | 18+ (推荐 20.x) | LTS 版本 |
| pnpm | 8+ | 项目默认包管理器 |
| MiniMax API Key | Token Plan | 必须配置 |

### 本地开发

```bash
# 1. 克隆项目
git clone https://github.com/Shyu-x/SimpleAgent.git
cd SimpleAgent

# 2. 配置环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env，添加你的 MINIMAX_API_KEY

# 3. 安装后端依赖
cd backend && pnpm install

# 4. 安装前端依赖
cd frontend && pnpm install

# 5. 启动后端 (端口 30000)
cd backend && pnpm dev

# 6. 启动前端 (端口 3001)
cd frontend && pnpm dev
```

访问 http://localhost:3001

### Docker 部署

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env，添加你的 MINIMAX_API_KEY

# 2. 一键启动
docker-compose up -d

# 3. 验证服务
curl http://localhost:30000/health
```

### PM2 进程管理

```bash
# 启动所有服务
pm2 start ecosystem.config.js

# 查看状态
pm2 list

# 查看日志
pm2 logs ai-chat-backend
pm2 logs ai-chat-frontend

# 重启服务
pm2 restart ai-chat-backend
pm2 restart ai-chat-frontend
```

## 环境变量

### 后端 (.env)

```bash
# 必需
MINIMAX_API_KEY=your_token_plan_api_key

# 应用配置
NODE_ENV=production
PORT=30000

# RAG 配置
RAG_CHUNK_SIZE=512
RAG_TOP_K=5
RAG_RERANK=true

# 向量数据库
VECTOR_DB_TYPE=memory        # memory (默认) 或 qdrant
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_COLLECTION=chat_documents
```

### 前端 (.env.local)

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:30000
NEXT_PUBLIC_API_URL=/api
```

## 技术栈

| 层次 | 技术 | 说明 |
|------|------|------|
| **前端框架** | React 19, Next.js 16 | 现代化 React 生态 |
| **状态管理** | Zustand 5 | 轻量级状态管理 |
| **样式** | Tailwind CSS | 原子化 CSS |
| **类型检查** | TypeScript | 类型安全 |
| **后端框架** | Express, Node.js | 服务端运行 |
| **流式响应** | SSE | Server-Sent Events |
| **AI 模型** | MiniMax M2.7 | Token Plan API |
| **向量库** | Qdrant (可选) | 高性能向量检索 |
| **监控** | Prometheus | 指标采集 |

## 核心模块

### 意图检测系统

自动识别用户意图并分流：

| 意图类型 | 说明 | 处理策略 |
|----------|------|----------|
| `tool_use` | 工具执行请求 | 调用工具系统 |
| `knowledge` | RAG 知识查询 | 检索知识库 |
| `creative` | 创意生成 | 文生图/文生文 |
| `task` | 任务执行 | Agent 处理 |
| `conversation` | 日常对话 | 直接回复 |

低置信度时触发澄清机制，避免错误分流。

### ReAct Agent 引擎

推理 + 行动协同循环：

```
Thought: 分析当前状态和目标
  ↓
Action: 选择并执行工具或 LLM
  ↓
Observation: 处理执行结果
  ↓
(循环直到完成或达到最大迭代次数)
```

### RAG 流水线

```
用户查询
    ↓
Query Rewrite (补全不完整查询)
    ↓
Query Decompose (拆分复杂问题)
    ↓
Hybrid Search (向量 + 关键词检索)
    ↓
Reranking (多策略融合排序)
    ↓
Citation Assembly (来源追溯)
    ↓
答案生成
```

### 企业级功能

| 功能 | 说明 | 文件 |
|------|------|------|
| 熔断器 | 自动故障转移，快速失败 | `infra/circuitBreaker/` |
| 队列限流 | 基于优先级的速率限制 | `infra/rateLimiter/` |
| Prometheus 指标 | 性能指标采集 | `infra/metrics/` |
| 告警管理 | critical/warning/info 三级 | `infra/alert/` |
| 配置热更新 | 运行时动态配置 | `infra/config/` |
| 优先级队列 | SSE 状态通知 | `infra/queue/` |

## API 文档

详细 API 文档请参考：

- [接口文档](./docs/接口文档.md) - OpenAPI 3.0 格式完整文档
- [API 设计规范](./docs/API设计规范文档.md) - 设计原则与规范

## 项目文档

| 文档 | 说明 |
|------|------|
| [CLAUDE.md](./CLAUDE.md) | 项目指令和架构详情 |
| [CHANGELOG.md](./CHANGELOG.md) | 版本历史与更新日志 |
| [DEPLOYMENT.md](./docs/DEPLOYMENT.md) | 部署指南 |
| [运维手册](./docs/运维手册.md) | 生产环境运维 |
| [docs/](./docs/) | 技术文档目录 |

## 性能指标

基准测试结果 (2026-03-18):

| 任务 | 方法 | 准确率 | 延迟 |
|------|------|--------|------|
| 意图分类 | 关键词匹配 | 70% | <1ms |
| 工具选择 | 关键词匹配 | 90% | <1ms |
| 知识检索 | 混合搜索 | 98% | <10ms |

并行执行加速比:

| 模式 | 10 任务耗时 | 加速比 |
|------|-------------|--------|
| 串行 | 620ms | 1.0x |
| 并行 4 并发 | 186ms | 3.3x |

## 许可

AGPL-3.0 - 详见 [LICENSE](LICENSE) 文件

## 参考资源

- [Next.js 文档](https://nextjs.org/docs)
- [React 19](https://react.dev)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [ReAct: 推理与行动协同](https://arxiv.org/abs/2210.03629)
- [MiniMax API](https://api.minimaxi.com)