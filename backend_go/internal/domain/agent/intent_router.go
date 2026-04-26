package agent

import (
	"context"
	"strings"
)

// Intent 意图类型 (5种核心意图 + HITL)
type Intent int

const (
	IntentUnknown Intent = iota // 未知
	IntentChat                 // 闲聊对话
	IntentToolCall            // 工具调用
	IntentRAG                 // 知识检索增强
	IntentA2A                 // Agent间协作
	IntentHITL                // 人机协作确认
)

// String 返回意图字符串
func (i Intent) String() string {
	switch i {
	case IntentUnknown:
		return "unknown"
	case IntentChat:
		return "chat"
	case IntentToolCall:
		return "tool_call"
	case IntentRAG:
		return "rag"
	case IntentA2A:
		return "a2a"
	case IntentHITL:
		return "hitl"
	default:
		return "unknown"
	}
}

// IntentConfidence 意图置信度
type IntentConfidence struct {
	Intent     Intent   `json:"intent"`
	Confidence float64  `json:"confidence"`
	NeedsClarify bool   `json:"needs_clarify"` // 是否需要澄清
	ClarifyMsg  string  `json:"clarify_msg,omitempty"` // 澄清消息
}

// IntentRouter 意图路由器
type IntentRouter struct {
	knowledgeKeywords []string
	toolKeywords      []string
	ragKeywords       []string
	a2aKeywords       []string
	hitlKeywords       []string
	llmAssisted       bool
	modelClient       ModelClient // LLM辅助判断
}

// ModelClient 模型客户端接口 (用于LLM辅助意图判断)
type ModelClient interface {
	ClassifyIntent(ctx context.Context, text string) (Intent, float64, error)
}

// NewIntentRouter 创建意图路由器
func NewIntentRouter() *IntentRouter {
	return &IntentRouter{
		knowledgeKeywords: []string{"是什么", "为什么", "如何", "怎么", "谁知道", "请问", "告诉我", "解释", "概念", "定义", "知识", "原理"},
		toolKeywords:      []string{"搜索", "查询", "计算", "转换", "获取", "打开", "关闭", "发送", "调用", "执行", "使用工具", "帮我"},
		ragKeywords:       []string{"文档", "知识库", "查找", "检索", "在库中找", "根据文档", "参考知识库", "RAG"},
		a2aKeywords:       []string{"委托", "协作", "Agent", "让另一个", "转交给", "协同", "团队", "多Agent"},
		hitlKeywords:      []string{"确认", "批准", "人机", "人工审核", "需要确认", "请确认", "危险操作", "高风险"},
	}
}

// NewIntentRouterWithLLM 创建带LLM辅助的意图路由器
func NewIntentRouterWithLLM(modelClient ModelClient) *IntentRouter {
	router := NewIntentRouter()
	router.llmAssisted = true
	router.modelClient = modelClient
	return router
}

// Route 路由意图 (关键词 + LLM辅助)
func (r *IntentRouter) Route(text string) IntentConfidence {
	text = strings.ToLower(text)

	// 按优先级检查 - RAG > HITL > A2A > 工具调用 > 知识问答 > 闲聊

	// 检查RAG意图
	if r.containsAny(text, r.ragKeywords) {
		return IntentConfidence{Intent: IntentRAG, Confidence: 0.9}
	}

	// 检查HITL意图
	if r.containsAny(text, r.hitlKeywords) {
		return IntentConfidence{Intent: IntentHITL, Confidence: 0.95}
	}

	// 检查A2A意图
	if r.containsAny(text, r.a2aKeywords) {
		return IntentConfidence{Intent: IntentA2A, Confidence: 0.85}
	}

	// 检查工具调用
	if r.containsAny(text, r.toolKeywords) {
		return IntentConfidence{Intent: IntentToolCall, Confidence: 0.85}
	}

	// 检查知识问答
	if r.containsAny(text, r.knowledgeKeywords) {
		return IntentConfidence{Intent: IntentChat, Confidence: 0.8}
	}

	// 默认闲聊
	return IntentConfidence{Intent: IntentChat, Confidence: 0.5}
}

// RouteWithLLMAssist 带LLM辅助的意图路由 (低置信度时启用)
func (r *IntentRouter) RouteWithLLMAssist(ctx context.Context, text string) (IntentConfidence, error) {
	conf := r.Route(text)

	// 置信度 >= 0.7 直接返回
	if conf.Confidence >= 0.7 {
		return conf, nil
	}

	// 置信度 < 0.7 且启用了LLM辅助
	if r.llmAssisted && r.modelClient != nil {
		llmIntent, llmConf, err := r.modelClient.ClassifyIntent(ctx, text)
		if err != nil {
			// LLM调用失败，返回基于关键词的结果
			return r.enrichWithClarification(conf), nil
		}

		// LLM置信度更高时采用LLM结果
		if llmConf > conf.Confidence {
			conf.Intent = llmIntent
			conf.Confidence = llmConf
		}
	}

	return r.enrichWithClarification(conf), nil
}

// enrichWithClarification 低置信度时添加澄清引导
func (r *IntentRouter) enrichWithClarification(conf IntentConfidence) IntentConfidence {
	if conf.Confidence < 0.5 {
		conf.NeedsClarify = true
		conf.ClarifyMsg = r.Clarify(conf)
	}
	return conf
}

// RouteWithContext 带上下文的路由
func (r *IntentRouter) RouteWithContext(ctx context.Context, text string, history []*MemoryMessage) IntentConfidence {
	// 先进行基础路由
	conf := r.Route(text)

	// 根据历史调整置信度
	if len(history) > 0 {
		lastMsg := history[len(history)-1]
		// 如果上一轮是工具执行，提高工具调用置信度
		if lastMsg.Type == MessageTypeTool {
			if conf.Intent == IntentToolCall {
				conf.Confidence = min(conf.Confidence+0.1, 1.0)
			}
		}
	}

	return conf
}

// containsAny 检查是否包含任意关键词
func (r *IntentRouter) containsAny(text string, keywords []string) bool {
	for _, kw := range keywords {
		if strings.Contains(text, kw) {
			return true
		}
	}
	return false
}

// min 返回最小值
func min(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

// Clarify 澄清意图（用于低置信度情况）
func (r *IntentRouter) Clarify(intent IntentConfidence) string {
	switch intent.Intent {
	case IntentUnknown, IntentChat:
		return "我不太确定您的意图，您是想聊天、查询知识还是需要我帮您执行操作呢？"
	case IntentRAG:
		return "您想从知识库中查找什么信息？"
	case IntentToolCall:
		return "您想让我帮您执行什么操作？（如搜索、计算、查询等）"
	case IntentA2A:
		return "您想让我和其他Agent协作完成什么任务？"
	case IntentHITL:
		return "您是否需要人工确认此操作？"
	default:
		return "请问有什么我可以帮您的？"
	}
}
