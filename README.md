# SimpleAgent

一个基于 React 19 + Next.js 16 + Express 构建的现代化 AI 对话平台，集成多模型路由、Agent 引擎、RAG 知识库等核心能力。

---

## 项目简介

本项目（**SimpleAgent**）是一个全栈 AI 对话应用的技术实践，旨在探索现代 AI 应用架构设计与工程实现。系统实现了以下核心能力：

- **多模型统一接入**：支持 OpenAI、Anthropic、Google、DeepSeek、MiniMax、智谱AI 等主流 LLM Provider
- **智能意图理解**：基于关键词匹配与 LLM 语义分析混合的意图分类系统
- **Agent 任务执行**：实现 ReAct 推理模式的 Agent 引擎，支持工具调用与多轮推理
- **RAG 知识检索**：混合向量检索与全文检索的知识库查询能力
- **会话状态管理**：基于滑动窗口的智能会话记忆与上下文管理

> 注：本项目主要用于技术研究与学习，生产环境部署请根据实际需求进行评估与优化。

---

## 技术架构

### 技术栈概览

![技术栈](./docs/README_技术栈.png)

#### 前端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | 16.0.0 | 全栈框架与 SSR |
| React | 19.0.0 | UI 组件库 |
| Zustand | 5.0.0 | 状态管理 |
| Tailwind CSS | 3.4.17 | 样式方案 |
| Framer Motion | 12.36.0 | 动画效果 |

#### 后端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Express | 4.18.2 | Web 框架 |
| SSE | - | Server-Sent Events 流式响应 |
| Model Context Protocol | 0.5.0 | 工具抽象层 |

---

## 系统架构

![系统架构](./docs/README_架构图.png)

系统采用经典的分层架构设计，从上至下依次为：

### 1. 接入层 (Next.js Frontend)

- React 19 + Next.js 16 构建的单页应用
- Zustand 5 进行前端状态管理
- SSE Client 接收后端流式响应
- Typewriter 组件实现打字机效果

### 2. 网关层 (Express Router)

- 统一的 API 入口与请求分发
- 集成限流、熔断、日志等中间件
- Session 与会话状态管理

### 3. 智能层 (AI Services)

```
用户请求
    │
    ▼
┌─────────────────┐
│ Task Classifier │ ─── 意图分析 (5大类: 工具调用/创意生成/任务执行/知识查询/日常对话)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Tool Registry  │ ─── 工具选择 (关键词匹配 / LLM 语义选择)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Agent Engine   │ ─── ReAct 推理循环 + 任务编排
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌───────┐
│  RAG  │ │Memory │ ─── 混合检索 / 会话记忆
└───────┘ └───────┘
```

### 4. 模型层 (LLM Providers)

- 统一的 API 适配层
- 多 Provider 负载均衡
- 模型熔断与自动降级

---

## Agent 工作流程

![Agent流程](./docs/README_Agent流程图.png)

一次完整的对话请求处理流程如下：

1. **意图分析**：Task Classifier 分析用户输入，识别意图类型（tool_use / creative / task / knowledge / conversation）

2. **工具选择**：Tool Registry 根据意图类型与查询内容，选择最合适的工具或直接调用 LLM

3. **推理执行**：Agent Engine 执行 ReAct（Reasoning + Acting）推理循环
   - Thought: 分析当前状态与目标
   - Action: 选择并执行工具或调用 LLM
   - Observation: 观察执行结果
   - 循环直到任务完成或达到最大迭代次数

4. **知识检索**（如需要）：RAG Service 执行混合检索
   - 向量检索：基于 Embedding 的语义匹配
   - 全文检索：关键词精确匹配
   - 结果融合：RRF（Reciprocal Rank Fusion）重排序

5. **会话记忆**：Memory 模块管理上下文
   - 滑动窗口：保留最近 N 轮对话
   - 自动摘要：超过阈值时压缩历史信息

6. **流式响应**：后端通过 SSE 实时推送，前端逐字渲染

---

## 核心模块

### Task Classifier（意图分类）

支持两种模式：
- **关键词匹配**：基于规则的特征词匹配，延迟 <1ms
- **LLM 语义理解**：调用 LLM 进行深度意图分析

量化测试结果（2026-03-18）：

| 方法 | 准确率 | 延迟 |
|------|--------|------|
| 关键词匹配 | 70.0% | <1ms |
| LLM 语义 | ~60% | ~100ms |

### Tool Registry（工具注册中心）

管理所有可用工具的注册、选择与执行。支持：
- 关键词定向检索
- LLM 语义选择
- 工具参数自动提取

量化测试结果：

| 方法 | 准确率 |
|------|--------|
| 关键词匹配 | 90.0% |
| LLM 语义选择 | 75.0% |

### Agent Engine（Agent 引擎）

基于 ReAct 模式的推理引擎：
- 支持多轮工具调用
- 内置反思（Reflection）机制
- 任务执行超时控制
- 自动重试与错误恢复

---

## 快速开始

### 环境要求

- Node.js 18.0+
- npm 9.0+ 或 pnpm 8.0+

### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/your-repo/simple-agent.git
cd simple-agent

# 2. 安装前端依赖
cd frontend
npm install
cd ..

# 3. 安装后端依赖
cd backend
npm install
cd ..

# 4. 配置环境变量
cp .env.example frontend/.env.local
# 编辑 frontend/.env.local，填入你的 API Key
```

### 启动服务

```bash
# 终端1：启动后端 (默认端口 30000)
cd backend
npm run dev

# 终端2：启动前端 (默认端口 5173)
cd frontend
npm run dev
```

访问 http://localhost:5173 开始使用。

### 环境变量说明

```env
# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:30000
NEXT_PUBLIC_BACKEND_URL=http://localhost:30000

# API Keys (至少配置一个)
OPENAI_API_KEY=sk-xxxx
ANTHROPIC_API_KEY=sk-ant-xxxx
GOOGLE_API_KEY=xxxx
DEEPSEEK_API_KEY=sk-xxxx
MINIMAX_API_KEY=xxxx
ZHIPU_API_KEY=xxxx
```

---

## 项目结构

```
simple-agent/
│
├── frontend/                    # Next.js 前端应用
│   ├── src/
│   │   ├── app/                # App Router 页面
│   │   ├── components/          # React 组件
│   │   │   ├── chat/           # 聊天相关组件
│   │   │   ├── sidebar/        # 侧边栏组件
│   │   │   └── ui/             # 基础 UI 组件
│   │   ├── store/              # Zustand 状态管理
│   │   └── lib/                # 工具函数与配置
│   └── package.json
│
├── backend/                     # Express 后端服务
│   ├── src/
│   │   ├── routes/             # API 路由
│   │   │   ├── chat.js         # 聊天接口
│   │   │   ├── proxy.js        # API 代理
│   │   │   └── mcp.js          # MCP 工具
│   │   ├── services/           # 业务逻辑
│   │   │   ├── router/         # 路由层服务
│   │   │   │   ├── taskClassifier.js    # 意图分类
│   │   │   │   └── modelRouter.js       # 模型路由
│   │   │   ├── tools/          # 工具系统
│   │   │   │   ├── toolRegistry.js      # 工具注册
│   │   │   │   └── *.js      # 内置工具
│   │   │   ├── agent/         # Agent 引擎
│   │   │   │   └── agentEngine.js
│   │   │   ├── rag/           # RAG 服务
│   │   │   │   ├── hybridSearch.js      # 混合检索
│   │   │   │   └── ragService.js
│   │   │   ├── memory/        # 会话记忆
│   │   │   │   └── smartMemory.js
│   │   │   └── *.js           # 基础设施
│   │   └── middleware/        # Express 中间件
│   └── package.json
│
├── docs/                        # 设计文档与图表
│   └── README_*.png            # README 引用图表
│
└── scripts/                     # 辅助脚本
```

---

## 性能指标

基于量化测试（2026-03-18，17 组对照实验）：

### 意图分类与工具选择

| 任务 | 最佳方法 | 准确率 | 延迟 |
|------|----------|--------|------|
| 意图分类 | 关键词匹配 | 70.0% | <1ms |
| 工具选择 | 关键词匹配 | 90.0% | <1ms |

### LLM 推理延迟

| 模型 | 平均延迟 | P95 | P99 |
|------|----------|-----|-----|
| gpt-4o-mini | 92ms | 93ms | 94ms |
| gpt-4o | 209ms | 215ms | 231ms |

### 并行执行

| 模式 | 耗时 | 加速比 |
|------|------|--------|
| 串行 (10 任务) | 620ms | 1.0x |
| 并行 4 并发 | 186ms | 3.3x |

### Agent 系统开销

| 指标 | 直接 API | Agent 系统 | 差异 |
|------|----------|------------|------|
| 平均延迟 | 155ms | 187ms | +20.5% |
| 工具调用率 | 0% | 32-44% | +44% |
| 任务理解准确率 | 64% | 78% | +14% |

---

## API 接口

### 聊天接口

```bash
# 流式聊天
POST /api/chat
Content-Type: application/json

{
  "messages": [
    {"role": "user", "content": "你好"}
  ],
  "model": "gpt-4o",
  "stream": true
}
```

### 意图分类

```bash
POST /api/router/intent
{
  "query": "搜索今天的天气"
}
# 返回: {"intent": {"type": "tool_use"}, "confidence": 0.9}
```

### 混合检索

```bash
POST /api/router/search
{
  "query": "什么是机器学习",
  "topK": 5
}
```

---

## 后续规划

- [ ] 完善联网搜索功能
- [ ] 插件系统设计与实现
- [ ] 更强的多模态能力（图像理解、视频生成）
- [ ] 生产级优化（缓存、监控、部署）

---

## 详细文档

本项目维护了完整的架构设计文档：

- [docs/framework/](./docs/framework/) - 框架文档汇总
  - [系统总览](./docs/framework/overview.puml) - 高层C4架构图
  - [部署架构](./docs/framework/deployment-arch.puml) - 部署拓扑图
- [docs/架构设计方案.md](./docs/架构设计方案.md) - 完整架构设计方案
- [docs/架构分析改良报告.md](./docs/架构分析改良报告.md) - 架构评估与改进建议
- [docs/源码详细分析报告.md](./docs/源码详细分析报告.md) - 源码结构详细分析
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) - 部署指南

---

## 参考资源

- [Next.js Documentation](https://nextjs.org/docs)
- [React 19](https://react.dev)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)

---

## License

MIT License
