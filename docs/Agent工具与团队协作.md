# Agent 工具与团队协作

> 文档版本: v2.1.0
> 更新日期: 2026-04-01

---

## 一、支持的工具列表

### 1.1 工具总览

| 工具名称 | 类名 | 类别 | 功能描述 |
|----------|------|------|----------|
| `file_operations` | FileSystemTool | filesystem | 文件读写、列表、删除 |
| `shell` | ShellTool | system | 执行系统命令 |
| `web_search` | WebSearchTool | internet | 网络搜索 (MCP) |
| `http_request` | HttpRequestTool | internet | HTTP 请求 |
| `code_execution` | CodeExecutionTool | compute | 代码执行 |
| `calculator` | CalculatorTool | compute | 数学计算、统计、单位换算 |
| `datetime` | DateTimeTool | utility | 日期时间查询 |
| `data_processing` | DataProcessingTool | data | 数据处理转换 |
| `web_scraper` | WebScraperTool | internet | 网页抓取 |
| `record_note` | SessionNoteTool | memory | 记录笔记 |
| `recall_notes` | SessionNoteTool | memory | 回忆笔记 |
| `minimax_search` | MiniMaxSearchTool | internet | MiniMax 搜索服务 |
| `enhanced_search` | EnhancedSearchTool | internet | 增强搜索(多源/批量/技术文档) |
| `github` | GitHubTool | developer | GitHub API 操作 |
| `weather` | WeatherTool | information | 天气查询 |
| `translation` | TranslationTool | content | 多语言翻译 |
| `code_review` | CodeReviewTool | developer | 代码安全审查 |
| `image_generation` | ImageGenerationTool | multimodal | AI 图片生成 |
| `qrcode` | QrCodeTool | utility | 二维码生成 |
| `currency_converter` | CurrencyConverterTool | finance | 货币转换 |
| `url_shortener` | UrlShortenerTool | utility | URL 缩短 |
| `timezone_converter` | TimezoneConverterTool | utility | 时区转换 |
| `text_summary` | TextSummaryTool | content | 文本摘要 |
| `error_tracking` | ErrorTrackingTool | developer | 错误跟踪 |
| `note` | NoteTool | content | 个人笔记管理 |
| `prompt_template` | PromptTemplateTool | developer | 提示词模板 |
| `meeting` | MeetingTool | communication | 日程管理 |
| `readme` | ReadmeTool | developer | README 生成 |

### 1.2 工具详细说明

#### 1.2.1 文件系统工具 (FileSystemTool)

```javascript
{
  name: 'file_operations',
  category: 'filesystem',
  operations: ['read', 'write', 'delete', 'list', 'exists', 'mkdir']
}
```

**参数**:
- `operation`: 操作类型 (read/write/delete/list/exists/mkdir)
- `path`: 文件路径
- `content`: 写入内容 (write操作需要)

**安全特性**:
- 路径限制在 basePath 内
- 只允许配置的扩展名
- 文件大小限制 (默认 1MB)

---

#### 1.2.2 Shell 工具 (ShellTool)

```javascript
{
  name: 'shell',
  category: 'system',
  commands: ['bash', 'powershell', 'cmd']
}
```

**功能**:
- 执行系统命令
- 支持 bash / PowerShell / cmd
- 超时保护

---

#### 1.2.3 Web 搜索工具 (WebSearchTool)

```javascript
{
  name: 'web_search',
  category: 'internet',
  provider: 'MiniMax MCP'
}
```

**参数**:
- `query`: 搜索查询词
- `options.maxResults`: 最大结果数 (默认5)
- `options.language`: 语言代码
- `options.timeRange`: 时间范围 (day/week/month/year/all)

**实现**:
- 使用 MiniMax MCP Search Service
- 支持 Jina AI / DuckDuckGo fallback

---

#### 1.2.4 HTTP 请求工具 (HttpRequestTool)

```javascript
{
  name: 'http_request',
  category: 'internet',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
}
```

**功能**:
- 发送 HTTP 请求
- 支持自定义 headers
- JSON 请求/响应

---

#### 1.2.5 代码执行工具 (CodeExecutionTool)

```javascript
{
  name: 'code_execution',
  category: 'compute',
  languages: ['javascript', 'python']
}
```

**功能**:
- 安全沙箱执行代码
- JavaScript / Python 支持
- 超时限制

---

#### 1.2.6 计算器工具 (CalculatorTool)

```javascript
{
  name: 'calculator',
  category: 'compute',
  operations: ['add', 'subtract', 'multiply', 'divide', 'mod', 'power']
}
```

**功能**:
- 基本数学运算
- 支持链式计算
- 高精度运算

---

#### 1.2.7 日期时间工具 (DateTimeTool)

```javascript
{
  name: 'datetime',
  category: 'utility',
  functions: ['now', 'format', 'parse', 'add', 'diff']
}
```

**功能**:
- 获取当前时间
- 日期格式化
- 日期计算

---

#### 1.2.8 数据处理工具 (DataProcessingTool)

```javascript
{
  name: 'data_processing',
  category: 'data',
  operations: ['filter', 'map', 'reduce', 'sort', 'group', 'join']
}
```

**功能**:
- 数组/对象操作
- JSON 数据转换
- 数据聚合

---

#### 1.2.9 网页抓取工具 (WebScraperTool)

```javascript
{
  name: 'web_scraper',
  category: 'internet'
}
```

**功能**:
- 抓取网页内容
- HTML 解析
- 内容提取

---

#### 1.2.10 Session Note 工具 (SessionNoteTool)

```javascript
// 记录笔记
{
  name: 'record_note',
  params: {
    content: '要记录的内容',
    category: '分类 (可选)'
  }
}

// 回忆笔记
{
  name: 'recall_notes',
  params: {
    category: '按分类筛选 (可选)'
  }
}
```

**功能**:
- 持久化存储到 JSON 文件
- 按分类组织
- 时间戳记录

---

#### 1.2.11 MiniMax 搜索工具 (MiniMaxSearchTool)

```javascript
{
  name: 'minimax_search',
  category: 'internet',
  provider: 'MiniMax API',
  actions: ['search', 'batch_search', 'research', 'compare', 'trending']
}
```

**参数**:
- `action`: 操作类型
  - `search`: 单次搜索
  - `batch_search`: 批量搜索（最多 20 个查询）
  - `research`: 深度研究（多轮搜索 + 结果聚合）
  - `compare`: 对比分析（多查询对比）
  - `trending`: 获取趋势话题
- `queries`: 搜索查询数组（batch_search 最多 20 个）
- `options.maxResults`: 每次搜索最大结果数 (默认 5)
- `options.language`: 语言代码 (zh/en)

**API 调用**:
```javascript
// 单次搜索
{
  name: 'minimax_search',
  params: {
    action: 'search',
    query: 'React 19 新特性',
    maxResults: 5
  }
}

// 批量搜索 (最多 20 个查询)
{
  name: 'minimax_search',
  params: {
    action: 'batch_search',
    queries: ['React 19', 'Next.js 16', 'Zustand 5', 'MiniMax API'],
    maxResults: 3
  }
}

// 深度研究
{
  name: 'minimax_search',
  params: {
    action: 'research',
    topic: 'AI Agent 框架对比',
    depth: 3
  }
}

// 趋势话题
{
  name: 'minimax_search',
  params: {
    action: 'trending',
    category: 'technology'
  }
}
```

**实现**:
- 使用 MiniMax Token Plan API 直接搜索
- 批量搜索支持并行请求
- 结果自动去重和排序

---

#### 1.2.12 增强搜索工具 (EnhancedSearchTool)

```javascript
{
  name: 'enhanced_search',
  category: 'internet',
  actions: ['search', 'multi_search', 'batch_search', 'search_history', 'tech_search', 'news_search', 'clear_history']
}
```

**参数**:
- `action`: 操作类型
  - `search`: 单源搜索
  - `multi_search`: 多源并行搜索 (MCP + Jina + DuckDuckGo)
  - `batch_search`: 批量搜索（最多20个查询）
  - `search_history`: 获取搜索历史
  - `tech_search`: 技术文档搜索 (GitHub/NPM/PyPI/MDN等)
  - `news_search`: 新闻搜索
  - `clear_history`: 清除搜索历史
- `query`: 搜索关键词
- `queries`: 批量查询列表
- `sources`: 搜索源数组 `['mcp', 'jina', 'duckduckgo', 'all']`
- `options`: 可选参数
  - `maxResults`: 最大结果数
  - `language`: 语言 (zh/en)
  - `timeRange`: 时间范围
  - `category`: 搜索分类
- `domain`: 技术文档域名 (github, npm, pypi, stackoverflow, devdocs, mdndocs, react, vue, nextjs, typescript, rust, python, deno, bun)

**API 调用**:
```javascript
// 单源搜索
{
  name: 'enhanced_search',
  params: {
    action: 'search',
    query: 'React 19 新特性',
    sources: ['mcp'],
    options: { maxResults: 5, language: 'zh' }
  }
}

// 多源搜索
{
  name: 'enhanced_search',
  params: {
    action: 'multi_search',
    query: 'Zustand 5 状态管理',
    sources: ['all'],
    options: { maxResults: 3 }
  }
}

// 批量搜索
{
  name: 'enhanced_search',
  params: {
    action: 'batch_search',
    queries: ['React 19', 'Next.js 16', 'MiniMax API'],
    options: { maxResults: 5 }
  }
}

// 技术文档搜索
{
  name: 'enhanced_search',
  params: {
    action: 'tech_search',
    query: 'useState hook',
    domain: 'react',
    options: { maxResults: 5 }
  }
}

// 新闻搜索
{
  name: 'enhanced_search',
  params: {
    action: 'news_search',
    query: 'AI Agent 最新进展',
    options: { timeRange: 'week' }
  }
}
```

**实现**:
- 优先使用 MCP 搜索服务
- 多源并行搜索自动聚合
- 搜索历史本地记录（最多100条）
- 技术文档搜索支持 12+ 常用域名

---

#### 1.2.13 GitHub 工具 (GitHubTool)

```javascript
{
  name: 'github',
  category: 'developer',
  cli: 'gh',
  actions: [
    'search_repos', 'repo_info', 'repo_content',
    'user_info', 'trending', 'issues', 'commits'
  ]
}
```

**参数**:
- `action`: 操作类型
  - `search_repos`: 搜索仓库
  - `repo_info`: 获取仓库信息
  - `repo_content`: 获取仓库内容
  - `user_info`: 获取用户信息
  - `trending`: 获取趋势仓库
  - `issues`: 获取 Issue 列表
  - `commits`: 获取提交历史
- `query`: 搜索查询（search_repos）
- `owner`: 仓库所有者
- `repo`: 仓库名称
- `path`: 文件路径（repo_content）
- `user`: GitHub 用户名（user_info）
- `options`: 可选参数（limit, sort, direction 等）

**API 调用**:
```javascript
// 搜索仓库
{
  name: 'github',
  params: {
    action: 'search_repos',
    query: 'react agent framework',
    limit: 10,
    sort: 'stars'
  }
}

// 获取仓库信息
{
  name: 'github',
  params: {
    action: 'repo_info',
    owner: 'anthropics',
    repo: 'claude-code'
  }
}

// 获取仓库内容
{
  name: 'github',
  params: {
    action: 'repo_content',
    owner: 'vercel',
    repo: 'next.js',
    path: 'packages/next/src'
  }
}

// 获取用户信息
{
  name: 'github',
  params: {
    action: 'user_info',
    user: 'shadcn'
  }
}

// 获取趋势仓库
{
  name: 'github',
  params: {
    action: 'trending',
    language: 'javascript',
    period: 'weekly'
  }
}

// 获取 Issue 列表
{
  name: 'github',
  params: {
    action: 'issues',
    owner: 'facebook',
    repo: 'react',
    state: 'open',
    limit: 20
  }
}

// 获取提交历史
{
  name: 'github',
  params: {
    action: 'commits',
    owner: 'vercel',
    repo: 'next.js',
    path: 'packages/next',
    limit: 10
  }
}
```

**实现**:
- 使用 GitHub CLI (`gh`) 执行命令
- 支持认证（通过 gh auth 登录）
- 结果解析为结构化 JSON

---

### 1.3 工具分类

```
┌─────────────────────────────────────────────────────────────────┐
│                        工具分类 (13类 29个工具)                   │
├─────────────────────────────────────────────────────────────────┤
│  filesystem                                                     │
│  └── file_operations (文件读写删除列表)                         │
│                                                                  │
│  system                                                         │
│  └── shell (执行系统命令)                                        │
│                                                                  │
│  compute                                                        │
│  ├── code_execution (代码执行)                                   │
│  └── calculator (计算器/统计/单位换算)                           │
│                                                                  │
│  data                                                           │
│  └── data_processing (数据处理)                                  │
│                                                                  │
│  utility                                                        │
│  ├── datetime (日期时间)                                         │
│  ├── qrcode (二维码生成)                                         │
│  ├── url_shortener (URL缩短)                                     │
│  └── timezone_converter (时区转换)                               │
│                                                                  │
│  memory                                                         │
│  ├── record_note (记录笔记)                                      │
│  └── recall_notes (回忆笔记)                                     │
│                                                                  │
│  internet                                                       │
│  ├── minimax_search (MiniMax搜索)                               │
│  ├── web_search (网络搜索)                                       │
│  ├── http_request (HTTP请求)                                    │
│  └── web_scraper (网页抓取)                                      │
│                                                                  │
│  developer                                                      │
│  ├── github (GitHub操作)                                        │
│  ├── code_review (代码审查)                                     │
│  ├── error_tracking (错误跟踪)                                   │
│  └── prompt_template (提示词模板)                                │
│                                                                  │
│  content                                                        │
│  ├── translation (翻译)                                         │
│  ├── text_summary (文本摘要)                                     │
│  └── note (个人笔记)                                             │
│                                                                  │
│  communication                                                  │
│  └── meeting (日程管理)                                          │
│                                                                  │
│  finance                                                        │
│  └── currency_converter (货币转换)                              │
│                                                                  │
│  information                                                    │
│  └── weather (天气查询)                                          │
│                                                                  │
│  multimodal                                                     │
│  └── image_generation (图片生成)                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、Agent 团队协作 (A2A 协议)

### 2.1 A2A 协议概述

A2A (Agent-to-Agent) 协议实现多 Agent 之间的协作通信，支持：
- Agent 注册与发现
- 任务委托
- 结果回传
- 状态同步
- 心跳检测

### 2.2 核心组件

```
┌─────────────────────────────────────────────────────────────────┐
│                       A2A 架构                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                │
│  │  A2AAgentRegistry │    │  A2AMessageBroker │                │
│  │   Agent 注册表    │    │    消息代理      │                │
│  │  - register()    │    │  - send()        │                │
│  │  - heartbeat()   │    │  - receive()     │                │
│  │  - listOnline()  │    │  - inbox Map     │                │
│  └──────────────────┘    └──────────────────┘                │
│           │                        │                            │
│           └──────────┬─────────────┘                            │
│                      ▼                                           │
│           ┌──────────────────┐                                  │
│           │    A2AService     │                                  │
│           │   统一服务接口     │                                  │
│           │  - delegateTask() │                                  │
│           │  - returnResult() │                                  │
│           │  - sendProgress() │                                  │
│           └──────────────────┘                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 消息类型

| 消息类型 | 说明 | 方向 |
|----------|------|------|
| `task.delegate` | 任务委托 | 委托方 → 执行方 |
| `result.return` | 结果回传 | 执行方 → 委托方 |
| `status.sync` | 状态同步 | 任意 → 广播 |
| `heartbeat` | 心跳检测 | Agent → A2A |
| `error.notify` | 错误通知 | 任意 → 任意 |
| `progress.update` | 进度更新 | 执行方 → 委托方 |

### 2.4 任务状态

| 状态 | 说明 |
|------|------|
| `pending` | 等待处理 |
| `running` | 执行中 |
| `completed` | 已完成 |
| `failed` | 失败 |
| `cancelled` | 已取消 |

---

## 三、协作流程

### 3.1 任务委托时序

```
Agent A (委托方)                    A2AService                   Agent B (执行方)
      │                                │                              │
      │──register(agentInfo)─────────▶│                              │
      │                                │                              │
      │                                │◀───register(agentInfo)────────│
      │                                │                              │
      │                                │                              │
      │──delegateTask()──────────────▶│                              │
      │                                │                              │
      │   创建 Task                     │                              │
      │   发送 MESSAGE                  │                              │
      │                                │──TASK_DELEGATE──────────────▶│
      │                                │                              │
      │                                │                              │──execute()
      │                                │                              │
      │                                │◀──RESULT_RETURN─────────────│
      │                                │                              │
      │◀──result──────────────────────│                              │
      │                                │                              │
```

### 3.2 多 Agent 协作模式

#### 3.2.1 主从模式

```
                    ┌─────────────┐
                    │  主 Agent   │
                    │ (Orchestrator)│
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌───────────┐   ┌───────────┐   ┌───────────┐
    │ Agent A   │   │ Agent B   │   │ Agent C   │
    │ (搜索)    │   │ (执行)    │   │ (验证)    │
    └───────────┘   └───────────┘   └───────────┘
```

**代码示例**:
```javascript
// 主 Agent
const result = await agent.delegateToAgent('agent_search', {
  title: '搜索任务',
  description: '搜索相关信息',
  input: { query: 'xxx' }
});

// 获取结果
const searchResult = await agent.waitForResult(result.task.id);
```

#### 3.2.2 并行模式

```
         ┌─────────────┐
         │  主 Agent   │
         └──────┬──────┘
                │
    ┌───────────┼───────────┐
    │           │           │
    ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│Agent A │ │Agent B │ │Agent C │
│ 并行   │ │ 并行   │ │ 并行   │
└────┬────┘ └────┬────┘ └────┬────┘
     │           │           │
     └───────────┴───────────┘
                 │
                 ▼
         ┌─────────────┐
         │  聚合结果   │
         └─────────────┘
```

**代码示例**:
```javascript
// 并行委托多个任务
const tasks = [
  agent.delegateToAgent('agent_1', task1),
  agent.delegateToAgent('agent_2', task2),
  agent.delegateToAgent('agent_3', task3)
];

// 等待所有结果
const results = await Promise.all(
  tasks.map(t => agent.waitForResult(t.task.id))
);
```

#### 3.2.3 链式模式

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│Agent A │───▶│Agent B │───▶│Agent C │───▶│Agent D │
│  输入   │    │  处理1  │    │  处理2  │    │  输出   │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
```

**代码示例**:
```javascript
// 链式处理
let result = await agent.delegateToAgent('agent_input', inputTask);
result = await agent.delegateToAgent('agent_process1', { input: result });
result = await agent.delegateToAgent('agent_process2', { input: result });
result = await agent.delegateToAgent('agent_output', { input: result });
```

---

## 四、API 接口

### 4.1 A2AService 方法

| 方法 | 说明 |
|------|------|
| `registerAgent(info)` | 注册 Agent |
| `unregisterAgent(id)` | 注销 Agent |
| `agentHeartbeat(id)` | 发送心跳 |
| `delegateTask(options)` | 委托任务 |
| `returnResult(taskId, result)` | 返回结果 |
| `sendProgress(taskId, progress)` | 发送进度 |
| `syncStatus(agentId, status)` | 同步状态 |
| `receiveMessages(agentId)` | 接收消息 |
| `listAgents()` | 列出在线 Agent |
| `getTaskStatus(taskId)` | 获取任务状态 |

### 4.2 AgentEngine A2A 方法

| 方法 | 说明 |
|------|------|
| `registerToA2A(a2aService)` | 注册到 A2A 网络 |
| `unregisterFromA2A()` | 从 A2A 网络注销 |
| `delegateToAgent(targetId, task)` | 委托任务 |
| `waitForResult(taskId, timeout)` | 等待结果 |
| `handleA2AMessage(message)` | 处理收到的消息 |
| `pollA2AMessages()` | 轮询消息 |
| `sendA2AHeartbeat()` | 发送心跳 |

---

## 五、使用示例

### 5.1 MiniMax 搜索工具

```javascript
const { MiniMaxSearchTool } = require('./services/tools/minimaxSearchTool');

const searchTool = new MiniMaxSearchTool({
  apiKey: process.env.MINIMAX_API_KEY
});

// 单次搜索
const result = await searchTool.execute({
  action: 'search',
  query: 'React 19 新特性',
  maxResults: 5
});

console.log(result.data);

// 批量搜索 (最多 20 个查询)
const batchResults = await searchTool.execute({
  action: 'batch_search',
  queries: [
    'React 19',
    'Next.js 16',
    'Zustand 5',
    'MiniMax API'
  ],
  maxResults: 3
});

// 深度研究
const researchResult = await searchTool.execute({
  action: 'research',
  topic: 'AI Agent 框架对比',
  depth: 3
});
```

### 5.2 GitHub 工具

```javascript
const { GitHubTool } = require('./services/tools/githubTool');

const github = new GitHubTool();

// 搜索仓库
const repos = await github.execute({
  action: 'search_repos',
  query: 'react agent framework',
  limit: 10,
  sort: 'stars'
});

// 获取仓库信息
const repoInfo = await github.execute({
  action: 'repo_info',
  owner: 'anthropics',
  repo: 'claude-code'
});

// 获取用户信息
const userInfo = await github.execute({
  action: 'user_info',
  user: 'shadcn'
});

// 获取趋势仓库
const trending = await github.execute({
  action: 'trending',
  language: 'javascript',
  period: 'weekly'
});

// 获取 Issue 列表
const issues = await github.execute({
  action: 'issues',
  owner: 'facebook',
  repo: 'react',
  state: 'open',
  limit: 20
});

// 获取提交历史
const commits = await github.execute({
  action: 'commits',
  owner: 'vercel',
  repo: 'next.js',
  path: 'packages/next',
  limit: 10
});
```

### 5.3 初始化 A2A 服务

```javascript
const { A2AService } = require('./services/a2aService');
const AgentEngine = require('./services/agentEngine');

// 创建 A2A 服务
const a2aService = new A2AService();

// 创建 Agent 并注册
const agent = new AgentEngine({
  a2aEnabled: true,
  a2aAgentId: 'search-agent'
});
agent.registerToA2A(a2aService);
```

### 5.2 委托任务

```javascript
// 委托搜索任务
const taskResult = agent.delegateToAgent('execute-agent', {
  title: '执行代码',
  description: '运行 Python 代码',
  input: { code: 'print("hello")' },
  priority: 1,
  timeout: 60000
});

console.log(`Task delegated: ${taskResult.task.id}`);
```

### 5.3 接收并处理任务

```javascript
// Agent B (执行方) 处理收到的消息
agent.handleA2AMessage(message);

// 或者轮询消息
const messages = agent.pollA2AMessages();
for (const msg of messages) {
  await agent.handleA2AMessage(msg);
}
```

### 5.4 任务协作示例

```javascript
// 完整的多 Agent 协作示例
async function collaborativeTask(orchestrator, query) {
  // 1. 搜索 Agent 搜索信息
  const searchResult = await orchestrator.delegateToAgent('search-agent', {
    title: '搜索',
    input: { query }
  });
  const searchData = await orchestrator.waitForResult(searchResult.task.id);

  // 2. 分析 Agent 处理数据
  const analysisResult = await orchestrator.delegateToAgent('analysis-agent', {
    title: '分析',
    input: { data: searchData }
  });
  const analysisData = await orchestrator.waitForResult(analysisResult.task.id);

  // 3. 报告 Agent 生成报告
  const reportResult = await orchestrator.delegateToAgent('report-agent', {
    title: '生成报告',
    input: { analysis: analysisData }
  });
  const report = await orchestrator.waitForResult(reportResult.task.id);

  return report;
}
```

---

## 六、心跳与故障处理

### 6.1 心跳机制

```
Agent                          A2AAgentRegistry
  │                                   │
  │──heartbeat()─────────────────────▶│
  │                                   │ 更新 lastSeen
  │                                   │
  │         (60秒无心跳视为离线)       │
  │                                   │
```

- 心跳间隔: 30秒 (可配置)
- 超时阈值: 60秒
- 离线清理: 每 30秒 检查一次

### 6.2 故障恢复

```javascript
// 检查点恢复
const agent = new AgentEngine();
const sessions = await agent.getRecoverableSessions();

if (sessions.length > 0) {
  const lastSession = sessions[0];
  const result = await agent.execute(task, {}, lastSession.id);
}
```

### 6.3 任务超时处理

```javascript
// 委托任务时设置超时
const result = agent.delegateToAgent('worker-agent', task, {
  timeout: 5 * 60 * 1000 // 5分钟
});

// 等待结果，带超时
try {
  const output = await agent.waitForResult(result.task.id, 60000);
} catch (e) {
  console.error('任务超时:', e.message);
}
```

---

## 七、工具选择机制

### 7.1 选择策略

```
┌─────────────────────────────────────────────────────────────────┐
│                      工具选择流程                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. LLM 语义匹配 (优先)                                         │
│     └── 置信度 >= threshold → 直接使用                            │
│                                                                  │
│  2. 关键词匹配 (回退)                                           │
│     └── intentToolMapping 查找                                   │
│                                                                  │
│  3. 默认回退                                                     │
│     └── 返回 null                                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 意图映射表

| 关键词 | 推荐工具 |
|--------|----------|
| search, 搜索, 查找 | web_search, http_request |
| code, 编程, 运行, 执行 | code_execution |
| calculate, 计算, 等于 | calculator |
| file, 文件, 读取, 写入 | file_operations |
| data, 分析, 处理 | data_processing |
| datetime, 时间, 日期 | datetime |

### 7.3 工具注册

```javascript
// AgentEngine 中注册工具
const agent = new AgentEngine();

// 注册自定义工具
agent.registerTool({
  name: 'my_tool',
  description: '自定义工具',
  parameters: { ... },
  execute: async (args) => {
    // 执行逻辑
    return { success: true, result: '...' };
  }
});
```

---

**文档更新**: 2026-04-01 (v2.1.0 - 新增 EnhancedSearchTool, ReadmeTool)
