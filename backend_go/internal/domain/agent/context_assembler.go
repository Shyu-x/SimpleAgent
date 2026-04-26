package agent

import (
	"strings"

	"github.com/ai-chat/backend_go/internal/domain/model"
)

// ContextScenario 上下文场景类型
type ContextScenario int

const (
	ScenarioKB ContextScenario = iota // 知识库场景
	ScenarioMCP                       // MCP工具场景
	ScenarioMixed                     // 混合场景
)

// String 返回场景字符串
func (s ContextScenario) String() string {
	switch s {
	case ScenarioKB:
		return "knowledge_base"
	case ScenarioMCP:
		return "mcp_tools"
	case ScenarioMixed:
		return "mixed"
	default:
		return "unknown"
	}
}

// ContextConfig 上下文配置
type ContextConfig struct {
	Scenario         ContextScenario // 场景类型
	EnableReasoning  bool            // 启用思维链
	EnableMemory     bool            // 启用记忆
	EnableRAG        bool            // 启用RAG检索
	MaxContextTokens int             // 最大上下文token数
}

// DefaultContextConfig 默认配置
func DefaultContextConfig() ContextConfig {
	return ContextConfig{
		Scenario:         ScenarioMixed,
		EnableReasoning:  true,
		EnableMemory:     true,
		EnableRAG:        true,
		MaxContextTokens: 8000,
	}
}

// RAGResult RAG检索结果
type RAGResult struct {
	Content     string  `json:"content"`      // 内容
	Source      string  `json:"source"`       // 来源
	Score       float64 `json:"score"`        // 相关度分数
	DocumentID  string  `json:"document_id"` // 文档ID
	ChunkIndex  int     `json:"chunk_index"` // 块索引
}

// ContextAssember 上下文组装器
type ContextAssember struct {
	config ContextConfig
}

// NewContextAssember 创建上下文组装器
func NewContextAssember(config ContextConfig) *ContextAssember {
	return &ContextAssember{
		config: config,
	}
}

// WithScenario 设置场景
func (c *ContextAssember) WithScenario(scenario ContextScenario) *ContextAssember {
	c.config.Scenario = scenario
	return c
}

// WithReasoning 启用思维链
func (c *ContextAssember) WithReasoning(enable bool) *ContextAssember {
	c.config.EnableReasoning = enable
	return c
}

// WithMemory 启用记忆
func (c *ContextAssember) WithMemory(enable bool) *ContextAssember {
	c.config.EnableMemory = enable
	return c
}

// WithRAG 启用RAG
func (c *ContextAssember) WithRAG(enable bool) *ContextAssember {
	c.config.EnableRAG = enable
	return c
}

// Assemble 组装完整上下文
func (c *ContextAssember) Assemble(req *AssembleRequest) *AssembledContext {
	ctx := &AssembledContext{
		SystemPrompt: c.buildSystemPrompt(req),
		Messages:     make([]model.Message, 0),
		Tools:        req.Tools,
		Metadata:     make(map[string]interface{}),
	}

	// 添加记忆上下文
	if c.config.EnableMemory && req.MemoryMessages != nil {
		ctx.Messages = append(ctx.Messages, req.MemoryMessages...)
	}

	// 添加用户消息
	if req.UserMessage != "" {
		ctx.Messages = append(ctx.Messages, model.Message{
			Role:    "user",
			Content: req.UserMessage,
		})
	}

	// 添加RAG结果到系统提示
	if c.config.EnableRAG && len(req.RAGResults) > 0 {
		ctx.Metadata["rag_results"] = req.RAGResults
		ctx.RAGContext = c.formatRAGContext(req.RAGResults)
	}

	// 添加意图信息
	if req.Intent != nil {
		ctx.Metadata["intent"] = req.Intent
	}

	return ctx
}

// AssembleRequest 组装请求
type AssembleRequest struct {
	UserMessage    string          // 用户消息
	MemoryMessages []model.Message // 记忆消息
	RAGResults     []*RAGResult    // RAG检索结果
	Tools          []model.ToolDefinition // 可用工具
	Intent         *ResolvedIntent // 解析的意图
	SessionID      string          // 会话ID
}

// AssembledContext 组装后的上下文
type AssembledContext struct {
	SystemPrompt string                 // 系统提示
	Messages     []model.Message        // 消息列表
	Tools        []model.ToolDefinition // 工具列表
	RAGContext   string                 // RAG上下文
	Metadata     map[string]interface{} // 元数据
}

// buildSystemPrompt 构建系统提示
func (c *ContextAssember) buildSystemPrompt(req *AssembleRequest) string {
	var sb strings.Builder

	// 基础角色定义
	sb.WriteString("你是一个智能AI助手，")

	// 根据场景添加特定指令
	switch c.config.Scenario {
	case ScenarioKB:
		sb.WriteString("专门用于回答知识库相关问题。")
		sb.WriteString("请根据提供的知识库内容准确回答，如果知识库中没有相关信息，请明确告知。")
	case ScenarioMCP:
		sb.WriteString("专门用于通过工具完成用户任务。")
		sb.WriteString("请根据用户需求选择合适的工具完成任务。")
	case ScenarioMixed:
		sb.WriteString("具备知识问答和工具调用双重能力。")
		sb.WriteString("请根据用户问题判断是知识问答还是需要调用工具。")
	}

	// 添加思维链提示
	if c.config.EnableReasoning {
		sb.WriteString("\n\n在回答复杂问题时，请先进行思考分析（Thought），然后决定是否需要执行动作（Action）。")
	}

	// 添加RAG结果上下文
	if c.config.EnableRAG && len(req.RAGResults) > 0 {
		sb.WriteString("\n\n【知识库参考信息】\n")
		sb.WriteString(c.formatRAGContext(req.RAGResults))
	}

	// 添加意图引导（如果已知）
	if req.Intent != nil && req.Intent.Confidence > 0.7 {
		sb.WriteString("\n\n【用户意图】")
		sb.WriteString(req.Intent.Reasoning)
	}

	// 添加格式要求
	sb.WriteString("\n\n请用清晰、简洁的方式回答。")

	return sb.String()
}

// formatRAGContext 格式化RAG上下文
func (c *ContextAssember) formatRAGContext(results []*RAGResult) string {
	if len(results) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("以下是相关的参考信息：\n\n")

	for i, result := range results {
		sb.WriteString(`【参考` + string(rune('1'+i)) + `】`)
		if result.Source != "" {
			sb.WriteString(`（来源: ` + result.Source + `）`)
		}
		sb.WriteString("\n")
		sb.WriteString(result.Content)
		sb.WriteString("\n\n")
	}

	sb.WriteString("请基于以上参考信息回答用户问题，如有需要请标注参考来源。")
	return sb.String()
}

// BuildPrompt 构建用户prompt（不含系统提示）
func (c *ContextAssember) BuildPrompt(req *AssembleRequest) string {
	var sb strings.Builder

	// 添加RAG上下文
	if c.config.EnableRAG && len(req.RAGResults) > 0 {
		sb.WriteString("【参考信息】\n")
		for i, result := range req.RAGResults {
			sb.WriteString(`[` + string(rune('1'+i)) + `] `)
			sb.WriteString(result.Content)
			if result.Source != "" {
				sb.WriteString(` (来源: ` + result.Source + `)`)
			}
			sb.WriteString("\n")
		}
		sb.WriteString("\n")
	}

	// 添加用户问题
	sb.WriteString("用户问题: ")
	sb.WriteString(req.UserMessage)

	// 添加意图提示
	if req.Intent != nil && req.Intent.Confidence > 0.7 {
		sb.WriteString("\n\n【意图提示】")
		sb.WriteString(req.Intent.Reasoning)
	}

	return sb.String()
}

// GetSystemPrompt 获取系统提示
func (c *ContextAssember) GetSystemPrompt() string {
	config := DefaultContextConfig()
	assembler := NewContextAssember(config)
	return assembler.buildSystemPrompt(&AssembleRequest{})
}

// ExtractContextForTools 从完整上下文中提取工具调用所需的上下文
func (c *ContextAssember) ExtractContextForTools(messages []model.Message, tools []model.ToolDefinition) string {
	var sb strings.Builder

	sb.WriteString("当前对话上下文：\n")

	// 只取最近的消息（节省token）
	windowSize := 10
	if len(messages) > windowSize {
		messages = messages[len(messages)-windowSize:]
	}

	for _, msg := range messages {
		sb.WriteString(msg.Role + ": " + msg.Content + "\n")
	}

	sb.WriteString("\n可用工具：\n")
	for _, tool := range tools {
		sb.WriteString("- " + tool.Name + ": " + tool.Description + "\n")
	}

	return sb.String()
}

// EstimateTokens 估算token数（粗略估算）
func (c *ContextAssember) EstimateTokens(text string) int {
	// 中文字符约2个token，英文约0.75个token
	chineseCount := 0
	englishCount := 0

	for _, r := range text {
		if r < 128 {
			englishCount++
		} else {
			chineseCount++
		}
	}

	return int(float64(chineseCount)*2.0 + float64(englishCount)*0.75)
}

// TruncateIfNeeded 如果上下文过长则截断
func (c *ContextAssember) TruncateIfNeeded(ctx *AssembledContext) *AssembledContext {
	maxTokens := c.config.MaxContextTokens
	if maxTokens <= 0 {
		maxTokens = 8000
	}

	totalTokens := c.EstimateTokens(ctx.SystemPrompt)
	for _, msg := range ctx.Messages {
		totalTokens += c.EstimateTokens(msg.Content)
	}

	// 如果在限制内，不需要截断
	if totalTokens <= maxTokens {
		return ctx
	}

	// 从后往前截断消息
	for totalTokens > maxTokens && len(ctx.Messages) > 1 {
		removed := ctx.Messages[0]
		ctx.Messages = ctx.Messages[1:]
		totalTokens -= c.EstimateTokens(removed.Content)
	}

	return ctx
}
