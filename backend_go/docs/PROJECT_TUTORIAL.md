# AI Chat 玩具 - Go 项目实战教程

## 目录

1. [项目概述](#项目概述)
2. [为什么需要这个项目？](#为什么需要这个项目)
3. [项目架构设计](#项目架构设计)
4. [目录结构详解](#目录结构详解)
5. [核心代码解读](#核心代码解读)
6. [从零搭建项目](#从零搭建项目)
7. [运行和测试](#运行和测试)
8. [常见问题解答](#常见问题解答)

---

## 项目概述

### 这是什么项目？

**AI Chat 玩具** 是一个使用 Go 语言开发的企业级 AI 对话和 Agent 执行平台。

简单来说，它能让：

```
用户 ──→ AI Chat 后端 ──→ MiniMax AI
         ↓
       存储对话
         ↓
       管理Agent
         ↓
       RAG检索 ──→ 知识库
```

### 核心功能

| 功能 | 说明 | 类比 |
|------|------|------|
| 💬 智能对话 | 和 AI 聊天 | 像微信聊天 |
| 🤖 Agent 执行 | 让 AI 执行任务 | 像智能助手 |
| 🔍 RAG 检索 | 结合知识库回答 | 像搜索引擎 |
| 👥 A2A 协作 | 多个 Agent 合作 | 像团队协作 |
| ✅ HITL 确认 | 人工确认危险操作 | 像审批流程 |
| 📊 监控 | 观察系统状态 | 像仪表盘 |

---

## 为什么需要这个项目？

### 学习价值

```
┌─────────────────────────────────────────────────────────────┐
│                    学习这个项目的价值                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1️⃣  学习企业级架构                                          │
│      └── 学会如何设计大型项目                                 │
│                                                             │
│  2️⃣  掌握 Go 实战技能                                       │
│      └── 不是 Hello World，而是真实项目                       │
│                                                             │
│  3️⃣  理解 AI Agent 原理                                    │
│      └── AI 怎么思考、怎么执行任务                           │
│                                                             │
│  4️⃣  积累工程经验                                          │
│      └── 配置、日志、测试、部署                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 技术收获

- **Web 开发**：用 Gin 框架构建 HTTP API
- **AI 集成**：调用 MiniMax API 实现对话
- **并发编程**：goroutine + channel 处理请求
- **错误处理**：统一的错误管理
- **日志系统**：结构化日志记录
- **监控指标**：Prometheus 格式指标

---

## 项目架构设计

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户请求                                 │
│                            ↓                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                      API 网关层                           │    │
│  │                  (Gin Router + Middleware)               │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │    │
│  │  │  CORS   │  │ 限流    │  │ 熔断    │  │ 日志    │  │    │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                            ↓                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                      业务逻辑层                           │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐         │    │
│  │  │ ChatHandler│  │AgentHandler│  │ A2AHandler │        │    │
│  │  └───────────┘  └───────────┘  └───────────┘         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                            ↓                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                      服务编排层                           │    │
│  │  ┌─────────────────┐  ┌─────────────────┐              │    │
│  │  │ChatOrchestrator │  │AgentOrchestrator│              │    │
│  │  └─────────────────┘  └─────────────────┘              │    │
│  └─────────────────────────────────────────────────────────┘    │
│                            ↓                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                      领域层                             │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │    │
│  │  │  Model  │  │  Agent  │  │   RAG   │  │   A2A   │  │    │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                            ↓                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    基础设施层                            │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │    │
│  │  │ MiniMax │  │  Viper  │  │zerolog │  │Prometheus│ │    │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                            ↓                                    │
│                    MiniMax API (外部服务)                       │
└─────────────────────────────────────────────────────────────────┘
```

### 为什么这样设计？

#### 1. 为什么分层？

| 分层 | 职责 | 好处 |
|------|------|------|
| API 层 | 处理请求响应 | 专注接口 |
| 业务层 | 处理业务逻辑 | 专注流程 |
| 领域层 | 核心业务规则 | 专注领域 |
| 基础设施层 | 通用功能 | 复用、隔离 |

**比喻：**
```
餐厅也分层！
┌─────────────────┐
│    服务员        │  ← API 层：接待客人
├─────────────────┤
│    厨师长        │  ← 业务层：协调做菜
├─────────────────┤
│    厨师          │  ← 领域层：做具体的菜
├─────────────────┤
│ 锅碗瓢盆燃气     │  ← 基础设施：工具
└─────────────────┘
```

#### 2. 为什么用 Gin？

| 框架 | 对比 | Go 项目选择 Gin 的理由 |
|------|------|------------------------|
| Spring Boot | Java，最成熟 | 太重，Go 不需要 |
| Express | Node.js，简单 | Node.js 用的 |
| Gin | Go，最快 | 原生、简单、性能高 |

#### 3. 为什么用 Viper？

- 支持 YAML、JSON、环境变量
- 能热更新配置
- Go 标准库没有这些功能

---

## 目录结构详解

```
backend_go/
│
├── cmd/                          # 🚪 入口目录
│   └── server/
│       └── main.go              # 👈 程序从这里开始！
│
├── config/                       # ⚙️ 配置目录
│   └── config.go                # 加载配置
│
├── pkg/                          # 📦 公共包（可被外部引用）
│   └── minimax/                 # MiniMax API 客户端
│       └── client.go           # API 调用代码
│
├── internal/                      # 🔒 内部包（只能内部用）
│   ├── application/            # 🎯 应用编排层
│   │   ├── chat_orchestrator.go # 聊天编排
│   │   └── agent_orchestrator.go # Agent编排
│   │
│   ├── domain/                  # 🧠 核心业务领域
│   │   ├── model/              # 模型相关
│   │   ├── agent/              # Agent相关
│   │   ├── rag/                # RAG相关
│   │   ├── a2a/                # A2A相关
│   │   └── search/             # 搜索相关
│   │
│   ├── handlers/                # 🖐️ HTTP 处理器
│   │   ├── chat.go             # 聊天接口
│   │   ├── agent.go            # Agent接口
│   │   ├── a2a.go              # A2A接口
│   │   ├── hitl.go              # HITL接口
│   │   └── admin/              # 管理后台接口
│   │
│   ├── middleware/              # 🔌 中间件
│   │   ├── security.go         # 安全中间件
│   │   ├── cors.go             # 跨域中间件
│   │   └── ratelimit.go        # 限流中间件
│   │
│   └── infra/                   # 🏗️ 基础设施
│       ├── circuitbreaker/      # 熔断器
│       ├── ratelimiter/         # 限流器
│       ├── metrics/             # 指标采集
│       └── sse/                 # SSE服务
│
├── domain/                       # 🧪 测试用的领域（简化版）
│   ├── agent/
│   ├── model/
│   ├── rag/
│   └── a2a/
│
├── infra/                         # 🧪 测试用的基础设施（简化版）
│   ├── circuitbreaker/
│   ├── metrics/
│   └── ratelimiter/
│
├── docs/                          # 📚 文档
│   ├── README.md
│   ├── GO_TUTORIAL.md
│   └── PROJECT_TUTORIAL.md
│
├── go.mod                         # 📋 Go 模块定义
├── go.sum                         # 🔒 依赖锁定
└── .env                           # 🔐 环境变量
```

### 目录命名规范

| 目录 | 为什么叫 internal？ | 为什么叫 pkg？ |
|------|---------------------|---------------|
| `internal/` | Go 特殊目录，只能被内部引用 | 标准目录，可被外部引用 |
| `cmd/` | 放可执行程序的入口 | - |
| `pkg/` | 放公共代码 | - |

---

## 核心代码解读

### 1. 程序入口 main.go

**文件位置：** `cmd/server/main.go`

```go
package main

import (
    "log"
    "net/http"
    "os"
    "strconv"
    "time"

    "github.com/ai-chat/backend_go/internal/application"
    "github.com/ai-chat/backend_go/internal/domain/a2a"
    "github.com/ai-chat/backend_go/internal/domain/agent"
    "github.com/ai-chat/backend_go/internal/handlers"
    adminHandlers "github.com/ai-chat/backend_go/internal/handlers/admin"
    "github.com/ai-chat/backend_go/internal/infra/metrics"
    "github.com/ai-chat/backend_go/internal/middleware"
    "github.com/ai-chat/backend_go/pkg/minimax"

    "github.com/gin-gonic/gin"
    "github.com/spf13/viper"
)

func main() {
    // 1️⃣ 初始化配置
    if err := initConfig(); err != nil {
        log.Fatalf("配置初始化失败: %v", err)
    }

    // 2️⃣ 设置 Gin 模式（debug 或 release）
    mode := viper.GetString("server.mode")
    if mode == "" {
        mode = "debug"
    }
    gin.SetMode(mode)

    // 3️⃣ 创建 Gin 引擎
    router := gin.New()

    // 4️⃣ 注册中间件
    router.Use(gin.Logger())        // 日志
    router.Use(gin.Recovery())     // 崩溃恢复
    router.Use(middleware.CORS(middleware.DefaultSecurityConfig()))
    router.Use(middleware.SecurityHeaders())

    // 5️⃣ 初始化 MiniMax 客户端
    minimaxClient := minimax.NewClient(minimax.Config{
        APIKey:    os.Getenv("MINIMAX_API_KEY"),
        BaseURL:   os.Getenv("MINIMAX_BASE_URL"),
        ModelName: os.Getenv("MINIMAX_MODEL"),
    })

    // 6️⃣ 初始化服务
    metricsCollector := metrics.NewCollector()
    a2aService := a2a.NewA2AService()
    hitlManager := agent.NewHITLManager(60 * time.Second)

    // 7️⃣ 创建编排器
    chatOrchestrator := application.NewChatOrchestrator(minimaxClient)
    agentOrchestrator := application.NewAgentOrchestrator()

    // 8️⃣ 创建处理器
    chatHandler := handlers.NewChatHandler(chatOrchestrator)
    agentHandler := handlers.NewAgentHandler(agentOrchestrator)
    a2aHandler := handlers.NewA2AHandler(a2aService)
    hitlHandler := handlers.NewHITLHandler(hitlManager)
    adminHandlersInstance := adminHandlers.NewAdminHandlers()

    // 9️⃣ 注册路由
    registerRoutes(router, chatHandler, agentHandler, a2aHandler, hitlHandler, adminHandlersInstance, metricsCollector)

    // 🔟 健康检查
    router.GET("/health", func(c *gin.Context) {
        c.JSON(200, gin.H{
            "status":  "ok",
            "service": "ai-chat-backend-go",
            "version": "1.0.0",
        })
    })

    // 1️⃣1️⃣ 启动服务器
    port := viper.GetInt("server.port")
    if port == 0 {
        port = 30000
    }
    addr := ":" + strconv.Itoa(port)
    log.Printf("Starting server on port %d", port)
    if err := router.Run(addr); err != nil {
        log.Fatalf("Failed to start server: %v", err)
    }
}
```

**代码流程图：**

```
main()
   │
   ├─→ initConfig()        配置初始化
   │
   ├─→ gin.New()          创建路由
   │
   ├─→ router.Use()       注册中间件
   │
   ├─→ minimax.NewClient() 创建 MiniMax 客户端
   │
   ├─→ NewChatOrchestrator() 创建服务
   │
   ├─→ registerRoutes()   注册路由
   │
   └─→ router.Run()       启动服务
```

### 2. MiniMax 客户端 client.go

**文件位置：** `pkg/minimax/client.go`

```go
package minimax

import (
    "bytes"
    "context"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "time"

    "github.com/ai-chat/backend_go/internal/domain/model"
)

// Client MiniMax API 客户端
type Client struct {
    apiKey    string
    baseURL   string
    modelName string
    client    *http.Client
}

// NewClient 创建客户端
func NewClient(cfg Config) *Client {
    if cfg.BaseURL == "" {
        cfg.BaseURL = "https://api.minimaxi.com/anthropic"
    }
    if cfg.ModelName == "" {
        cfg.ModelName = "MiniMax-M2.7"
    }

    return &Client{
        apiKey:    cfg.APIKey,
        baseURL:   cfg.BaseURL,
        modelName: cfg.ModelName,
        client: &http.Client{
            Timeout: 120 * time.Second,  // 2分钟超时
        },
    }
}

// Chat 发送聊天请求
func (c *Client) Chat(ctx context.Context, messages []model.Message) (*model.Response, error) {
    // 1️⃣ 转换消息格式
    minimaxMsgs := make([]minimaxMessage, len(messages))
    for i, msg := range messages {
        minimaxMsgs[i] = minimaxMessage{
            Role:    msg.Role,
            Content: msg.Content,
        }
    }

    // 2️⃣ 构建请求
    chatReq := ChatRequest{
        Model:     c.modelName,
        Messages:  minimaxMsgs,
        MaxTokens: 8000,
    }

    // 3️⃣ 序列化 JSON
    jsonData, err := json.Marshal(chatReq)
    if err != nil {
        return nil, fmt.Errorf("序列化请求失败: %w", err)
    }

    // 4️⃣ 创建 HTTP 请求
    httpReq, err := http.NewRequestWithContext(ctx, "POST",
        c.baseURL+"/v1/messages", bytes.NewReader(jsonData))
    if err != nil {
        return nil, fmt.Errorf("创建请求失败: %w", err)
    }

    // 5️⃣ 设置请求头
    httpReq.Header.Set("Content-Type", "application/json")
    httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
    httpReq.Header.Set("x-api-key", c.apiKey)

    // 6️⃣ 发送请求
    resp, err := c.client.Do(httpReq)
    if err != nil {
        return nil, fmt.Errorf("发送请求失败: %w", err)
    }
    defer resp.Body.Close()

    // 7️⃣ 读取响应
    body, err := io.ReadAll(resp.Body)
    if err != nil {
        return nil, fmt.Errorf("读取响应失败: %w", err)
    }

    // 8️⃣ 检查状态码
    if resp.StatusCode != 200 {
        return nil, fmt.Errorf("API错误: status=%d, body=%s", resp.StatusCode, string(body))
    }

    // 9️⃣ 解析 JSON
    var chatResp ChatResponse
    if err := json.Unmarshal(body, &chatResp); err != nil {
        return nil, fmt.Errorf("解析响应失败: %w", err)
    }

    // 🔟 提取文本内容
    textContent := ""
    for _, block := range chatResp.Content {
        if block.Type == "text" && block.Text != "" {
            textContent += block.Text
        }
    }

    // 返回结果
    return &model.Response{
        Content: textContent,
        Usage: model.Usage{
            InputTokens:  chatResp.Usage.InputTokens,
            OutputTokens: chatResp.Usage.OutputTokens,
            TotalTokens:  chatResp.Usage.InputTokens + chatResp.Usage.OutputTokens,
        },
    }, nil
}
```

**为什么这样设计？**

| 设计点 | 为什么 | 好处 |
|--------|--------|------|
| 独立的 Client 结构体 | 封装 API 调用 | 易测试、易替换 |
| Config 结构体配置 | 依赖注入 | 灵活配置 |
| 120秒超时 | AI 生成可能很慢 | 防止无限等待 |
| 返回 model.Response | 统一返回格式 | 便于处理 |

### 3. 聊天处理器 chat.go

**文件位置：** `internal/handlers/chat.go`

```go
// ChatHandler 聊天处理器
type ChatHandler struct {
    orchestrator *application.ChatOrchestrator
    sessions     sync.Map  // sessionId -> 会话数据
}

// ChatRequest 聊天请求
type ChatRequest struct {
    Messages []model.Message `json:"messages" binding:"required"`
    Model    string          `json:"model"`
    Stream   bool            `json:"stream"`
}

// HandleChat 处理聊天请求
func (h *ChatHandler) HandleChat(c *gin.Context) {
    // 1️⃣ 解析请求
    var req ChatRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(400, errors.ErrInvalidParameter(err.Error()).ToMap())
        return
    }

    // 2️⃣ 验证消息
    if len(req.Messages) == 0 {
        c.JSON(400, errors.ErrInvalidParameter("messages不能为空").ToMap())
        return
    }

    // 3️⃣ 设置默认模型
    if req.Model == "" {
        req.Model = "MiniMax-M2.7"
    }

    // 4️⃣ 调用编排器
    result, err := h.orchestrator.Chat(c.Request.Context(), &application.ChatRequest{
        Messages: req.Messages,
        Model:    req.Model,
        Stream:   req.Stream,
    })

    // 5️⃣ 处理错误
    if err != nil {
        if appErr, ok := err.(*errors.AppError); ok {
            c.JSON(appErr.HttpStatus, appErr.ToMap())
            return
        }
        c.JSON(500, errors.ErrInternal.WithDetail(err.Error()).ToMap())
        return
    }

    // 6️⃣ 返回结果
    c.JSON(200, result)
}
```

### 4. ChatOrchestrator 编排器

**文件位置：** `internal/application/chat_orchestrator.go`

```go
// ChatOrchestrator 聊天编排器
type ChatOrchestrator struct {
    client      *minimax.Client
    sessions    sync.Map  // sessionId -> 会话数据
    maxMessages int
}

// Chat 处理聊天请求
func (c *ChatOrchestrator) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
    // 1️⃣ 验证请求
    if len(req.Messages) == 0 {
        return nil, errors.ErrInvalidParameter("messages不能为空")
    }

    // 2️⃣ 获取或创建会话
    sessionId := req.Messages[0].Role
    session := c.getOrCreateSession(sessionId)

    // 3️⃣ 添加用户消息到会话
    session.mu.Lock()
    session.Messages = append(session.Messages, req.Messages...)
    session.UpdatedAt = nowMillis()
    session.mu.Unlock()

    // 4️⃣ 调用 MiniMax API
    resp, err := c.client.Chat(ctx, session.Messages)
    if err != nil {
        return nil, errors.ErrModel("MiniMax API调用失败", err)
    }

    // 5️⃣ 添加助手消息到会话
    assistantMessage := model.Message{
        Role:    "assistant",
        Content: resp.Content,
    }
    session.mu.Lock()
    session.Messages = append(session.Messages, assistantMessage)
    session.mu.Unlock()

    // 6️⃣ 返回响应
    return &ChatResponse{
        ID:      session.ID,
        Model:   req.Model,
        Choices: []ChatChoice{{
            Index:        0,
            Message:      assistantMessage,
            FinishReason: "stop",
        }},
        Usage: resp.Usage,
    }, nil
}
```

---

## 从零搭建项目

### 第一步：初始化项目

```bash
# 创建项目目录
mkdir backend_go
cd backend_go

# 初始化 Go 模块
go mod init github.com/ai-chat/backend_go
```

### 第二步：安装依赖

```bash
# 安装 Gin 框架
go get github.com/gin-gonic/gin

# 安装 Viper 配置库
go get github.com/spf13/viper

# 安装 zerolog 日志库
go get github.com/rs/zerolog

# 安装其他依赖...
go get github.com/prometheus/client_golang/prometheus
go get github.com/sony/gobreaker
```

### 第三步：创建目录结构

```bash
mkdir -p cmd/server
mkdir -p config
mkdir -p pkg/minimax
mkdir -p internal/application
mkdir -p internal/domain/{model,agent,rag,a2a,search}
mkdir -p internal/handlers/admin
mkdir -p internal/middleware
mkdir -p internal/infra/{circuitbreaker,ratelimiter,metrics,sse}
mkdir -p domain/{model,agent,rag,a2a}
mkdir -p infra/{circuitbreaker,ratelimiter,metrics}
mkdir -p docs
```

### 第四步：编写配置

**config/config.go：**

```go
package config

import (
    "github.com/spf13/viper"
)

func Load() error {
    viper.SetConfigName("config")
    viper.SetConfigType("yaml")
    viper.AddConfigPath(".")
    viper.AddConfigPath("./config")

    // 环境变量
    viper.AutomaticEnv()

    // 默认值
    viper.SetDefault("server.port", 30000)
    viper.SetDefault("server.mode", "debug")

    return viper.ReadInConfig()
}
```

### 第五步：编写 MiniMax 客户端

**pkg/minimax/client.go：**

```go
package minimax

import (
    "bytes"
    "context"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "time"
)

type Client struct {
    apiKey    string
    baseURL   string
    modelName string
    client    *http.Client
}

type Config struct {
    APIKey    string
    BaseURL   string
    ModelName string
}

func NewClient(cfg Config) *Client {
    if cfg.BaseURL == "" {
        cfg.BaseURL = "https://api.minimaxi.com/anthropic"
    }
    if cfg.ModelName == "" {
        cfg.ModelName = "MiniMax-M2.7"
    }

    return &Client{
        apiKey:    cfg.APIKey,
        baseURL:   cfg.BaseURL,
        modelName: cfg.ModelName,
        client: &http.Client{
            Timeout: 120 * time.Second,
        },
    }
}

type ChatRequest struct {
    Model     string `json:"model"`
    Messages  []struct {
        Role    string `json:"role"`
        Content string `json:"content"`
    } `json:"messages"`
    MaxTokens int `json:"max_tokens"`
}

type ChatResponse struct {
    Content []struct {
        Type string `json:"type"`
        Text string `json:"text"`
    } `json:"content"`
    Usage struct {
        InputTokens  int `json:"input_tokens"`
        OutputTokens int `json:"output_tokens"`
    } `json:"usage"`
}

func (c *Client) Chat(ctx context.Context, messages []struct { Role, Content string }) (string, error) {
    req := ChatRequest{
        Model:     c.modelName,
        Messages:  messages,
        MaxTokens: 8000,
    }

    jsonData, _ := json.Marshal(req)

    httpReq, _ := http.NewRequestWithContext(ctx, "POST",
        c.baseURL+"/v1/messages", bytes.NewReader(jsonData))
    httpReq.Header.Set("Content-Type", "application/json")
    httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)

    resp, err := c.client.Do(httpReq)
    if err != nil {
        return "", err
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)

    if resp.StatusCode != 200 {
        return "", fmt.Errorf("API错误: %d, %s", resp.StatusCode, string(body))
    }

    var chatResp ChatResponse
    json.Unmarshal(body, &chatResp)

    text := ""
    for _, block := range chatResp.Content {
        if block.Type == "text" {
            text += block.Text
        }
    }

    return text, nil
}
```

### 第六步：编写入口程序

**cmd/server/main.go：**

```go
package main

import (
    "fmt"
    "log"
    "net/http"
    "os"
    "strconv"

    "github.com/ai-chat/backend_go/pkg/minimax"

    "github.com/gin-gonic/gin"
    "github.com/spf13/viper"
)

func main() {
    // 配置
    viper.SetConfigName("config")
    viper.SetConfigType("yaml")
    viper.AddConfigPath(".")
    viper.SetDefault("server.port", 30000)

    port := viper.GetInt("server.port")
    if port == 0 {
        port = 30000
    }

    // MiniMax 客户端
    client := minimax.NewClient(minimax.Config{
        APIKey:    os.Getenv("MINIMAX_API_KEY"),
        BaseURL:   os.Getenv("MINIMAX_BASE_URL"),
        ModelName: os.Getenv("MINIMAX_MODEL"),
    })

    // Gin 路由
    gin.SetMode(gin.ReleaseMode)
    r := gin.Default()

    r.GET("/health", func(c *gin.Context) {
        c.JSON(200, gin.H{"status": "ok"})
    })

    r.POST("/api/chat", func(c *gin.Context) {
        var req struct {
            Messages []struct {
                Role    string `json:"role"`
                Content string `json:"content"`
            } `json:"messages"`
        }
        c.ShouldBindJSON(&req)

        result, err := client.Chat(c.Request.Context(), req.Messages)
        if err != nil {
            c.JSON(500, gin.H{"error": err.Error()})
            return
        }

        c.JSON(200, gin.H{
            "choices": []map[string]interface{}{
                {
                    "message": map[string]string{
                        "role":    "assistant",
                        "content": result,
                    },
                },
            },
        })
    })

    log.Printf("Starting server on port %d", port)
    r.Run(":" + strconv.Itoa(port))
}
```

---

## 运行和测试

### 运行项目

```bash
# 设置环境变量
export MINIMAX_API_KEY="你的API密钥"
export MINIMAX_BASE_URL="https://api.minimaxi.com/anthropic"
export MINIMAX_MODEL="MiniMax-M2.7"

# 运行
go run ./cmd/server

# 或者编译后运行
go build -o server ./cmd/server
./server
```

### 测试 API

```bash
# 健康检查
curl http://localhost:30000/health

# 发送消息
curl -X POST http://localhost:30000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'
```

---

## 常见问题解答

### Q1: 编译报错 "package xxx not found"

```bash
# 运行这个命令下载依赖
go mod tidy
```

### Q2: 端口被占用

```bash
# Windows 查看端口占用
netstat -ano | grep 30000

# 结束占用进程
taskkill //F //PID <进程ID>
```

### Q3: API 调用失败

1. 检查 API Key 是否正确
2. 检查网络连接
3. 查看服务器日志

### Q4: 如何添加新功能？

1. 在 `internal/domain/` 添加领域逻辑
2. 在 `internal/handlers/` 添加接口
3. 在 `cmd/server/main.go` 注册路由

---

## 下一步

恭喜你完成了项目教程！

**推荐继续学习：**

1. **[API 文档](API_DOCUMENTATION.md)** - 查看完整的 API 说明
2. **阅读源码** - 深入理解每个模块的实现
3. **添加功能** - 尝试添加新功能来加深理解

**实践建议：**

- 亲手敲一遍教程中的代码
- 修改代码实验各种功能
- 尝试添加一个新的 API 接口
- 给项目添加单元测试
