package agent

import (
	"context"
	"fmt"
	"math"
	"strings"
)

// IntentCategory 意图类目
type IntentCategory struct {
	Name        string           `json:"name"`        // 类目名称
	Keywords    []string         `json:"keywords"`    // 关键词列表
	SubTopics   []*IntentTopic   `json:"sub_topics"`  // 子话题
	Weight      float64          `json:"weight"`      // 权重
}

// IntentTopic 意图话题
type IntentTopic struct {
	Name        string           `json:"name"`        // 话题名称
	Keywords    []string         `json:"keywords"`    // 关键词列表
	Weight      float64          `json:"weight"`      // 权重
}

// ResolvedIntent 已解析的意图
type ResolvedIntent struct {
	Domain      string           `json:"domain"`       // 领域
	Category    string           `json:"category"`     // 类目
	Topic       string           `json:"topic"`       // 话题
	Confidence  float64          `json:"confidence"`   // 置信度
	Reasoning   string           `json:"reasoning"`    // 推理过程
}

// IntentResolver 意图解析器 - 多级意图分类
type IntentResolver struct {
	domains    []*IntentDomain
	maxResults int
}

// IntentDomain 意图领域
type IntentDomain struct {
	Name       string           `json:"name"`        // 领域名称
	Keywords   []string         `json:"keywords"`   // 关键词列表
	Categories []*IntentCategory `json:"categories"`  // 类目列表
	Weight     float64          `json:"weight"`      // 权重
}

// NewIntentResolver 创建意图解析器
func NewIntentResolver() *IntentResolver {
	return &IntentResolver{
		domains:    initIntentDomains(),
		maxResults: 3,
	}
}

// initIntentDomains 初始化意图领域
func initIntentDomains() []*IntentDomain {
	return []*IntentDomain{
		{
			Name:     "knowledge",
			Keywords: []string{"是什么", "为什么", "如何", "怎么", "谁知道", "请问", "告诉我", "解释", "概念", "定义", "原理"},
			Weight:   1.0,
			Categories: []*IntentCategory{
				{
					Name:     "definition",
					Keywords: []string{"是什么", "定义", "概念", "定义是"},
					Weight:   1.0,
					SubTopics: []*IntentTopic{
						{Name: "技术概念", Keywords: []string{"算法", "架构", "协议", "框架"}, Weight: 1.0},
						{Name: "科学概念", Keywords: []string{"物理", "化学", "生物", "数学"}, Weight: 1.0},
						{Name: "商业概念", Keywords: []string{"商业模式", "策略", "市场", "运营"}, Weight: 1.0},
					},
				},
				{
					Name:     "explanation",
					Keywords: []string{"为什么", "原因", "解释", "原理", "机制"},
					Weight:   1.0,
					SubTopics: []*IntentTopic{
						{Name: "技术原理", Keywords: []string{"工作原理", "实现原理", "技术原理"}, Weight: 1.0},
						{Name: "因果分析", Keywords: []string{"原因", "导致", "造成", "引起"}, Weight: 1.0},
					},
				},
				{
					Name:     "guide",
					Keywords: []string{"如何", "怎么", "方法", "步骤", "教程"},
					Weight:   1.0,
					SubTopics: []*IntentTopic{
						{Name: "操作指南", Keywords: []string{"操作", "使用", "安装", "配置", "设置"}, Weight: 1.0},
						{Name: "学习指南", Keywords: []string{"学习", "入门", "教程", "课程"}, Weight: 1.0},
					},
				},
			},
		},
		{
			Name:     "tool_use",
			Keywords: []string{"搜索", "查询", "计算", "转换", "获取", "打开", "关闭", "发送", "调用", "执行", "操作", "帮我", "请"},
			Weight:   1.0,
			Categories: []*IntentCategory{
				{
					Name:     "information_query",
					Keywords: []string{"搜索", "查询", "查找", "获取信息"},
					Weight:   1.0,
					SubTopics: []*IntentTopic{
						{Name: "网页搜索", Keywords: []string{"搜索网页", "网上搜索", "搜索一下"}, Weight: 1.0},
						{Name: "数据查询", Keywords: []string{"查询", "查找", "获取"}, Weight: 1.0},
						{Name: "知识检索", Keywords: []string{"检索", "在知识库中找"}, Weight: 1.0},
					},
				},
				{
					Name:     "action_execution",
					Keywords: []string{"执行", "操作", "调用", "运行", "帮我做"},
					Weight:   1.0,
					SubTopics: []*IntentTopic{
						{Name: "工具调用", Keywords: []string{"调用", "执行", "运行", "操作"}, Weight: 1.0},
						{Name: "任务完成", Keywords: []string{"帮我", "请帮我", "完成", "处理"}, Weight: 1.0},
					},
				},
				{
					Name:     "conversion",
					Keywords: []string{"转换", "换算", "翻译", "编码"},
					Weight:   1.0,
					SubTopics: []*IntentTopic{
						{Name: "格式转换", Keywords: []string{"转换", "转成", "转为"}, Weight: 1.0},
						{Name: "语言翻译", Keywords: []string{"翻译", "翻译成", "英文"}, Weight: 1.0},
					},
				},
			},
		},
		{
			Name:     "chat",
			Keywords: []string{"你好", "嗨", "在吗", "聊聊天", "随便聊聊"},
			Weight:   1.0,
			Categories: []*IntentCategory{
				{
					Name:     "greeting",
					Keywords: []string{"你好", "嗨", "哈喽", "在吗", "hi", "hello"},
					Weight:   1.0,
					SubTopics: []*IntentTopic{
						{Name: "打招呼", Keywords: []string{"你好", "嗨", "哈喽"}, Weight: 1.0},
						{Name: "问候", Keywords: []string{"早安", "晚安", "最近怎样"}, Weight: 1.0},
					},
				},
				{
					Name:     "casual_talk",
					Keywords: []string{"聊聊天", "随便聊聊", "说说话", "谈谈心"},
					Weight:   1.0,
					SubTopics: []*IntentTopic{
						{Name: "闲聊", Keywords: []string{"闲聊", "随便", "聊天"}, Weight: 1.0},
						{Name: "情感交流", Keywords: []string{"谈谈心", "说说话", "倾诉"}, Weight: 1.0},
					},
				},
			},
		},
		{
			Name:     "creative",
			Keywords: []string{"写", "创作", "生成", "画", "编", "设计", "想象", "创作"},
			Weight:   1.0,
			Categories: []*IntentCategory{
				{
					Name:     "writing",
					Keywords: []string{"写", "创作", "编写", "撰写"},
					Weight:   1.0,
					SubTopics: []*IntentTopic{
						{Name: "文章写作", Keywords: []string{"文章", "作文", "散文", "小说"}, Weight: 1.0},
						{Name: "代码编写", Keywords: []string{"代码", "程序", "脚本", "编写代码"}, Weight: 1.0},
						{Name: "文案创作", Keywords: []string{"文案", "广告", "宣传", "营销"}, Weight: 1.0},
					},
				},
				{
					Name:     "design",
					Keywords: []string{"设计", "策划", "规划", "创意"},
					Weight:   1.0,
					SubTopics: []*IntentTopic{
						{Name: "UI设计", Keywords: []string{"界面", "UI", "界面设计"}, Weight: 1.0},
						{Name: "架构设计", Keywords: []string{"架构", "系统设计", "架构设计"}, Weight: 1.0},
					},
				},
				{
					Name:     "image_generation",
					Keywords: []string{"画", "生成图片", "画一个", "画一幅"},
					Weight:   1.0,
					SubTopics: []*IntentTopic{
						{Name: "图像生成", Keywords: []string{"画", "图片", "图像", "生成图像"}, Weight: 1.0},
					},
				},
			},
		},
		{
			Name:     "task",
			Keywords: []string{"帮我", "请", "做", "完成", "处理", "整理", "分析", "解决"},
			Weight:   1.0,
			Categories: []*IntentCategory{
				{
					Name:     "task_execution",
					Keywords: []string{"帮我", "请帮我", "完成", "执行"},
					Weight:   1.0,
					SubTopics: []*IntentTopic{
						{Name: "多步骤任务", Keywords: []string{"帮我完成", "请帮我做", "处理这个"}, Weight: 1.0},
						{Name: "数据分析", Keywords: []string{"分析", "统计", "整理数据"}, Weight: 1.0},
					},
				},
				{
					Name:     "problem_solving",
					Keywords: []string{"解决", "问题", "修复", "排查"},
					Weight:   1.0,
					SubTopics: []*IntentTopic{
						{Name: "故障排查", Keywords: []string{"问题", "故障", "报错", "排查"}, Weight: 1.0},
						{Name: "方案解决", Keywords: []string{"解决", "方案", "怎么处理"}, Weight: 1.0},
					},
				},
			},
		},
	}
}

// Resolve 解析意图
func (r *IntentResolver) Resolve(text string) ResolvedIntent {
	textLower := strings.ToLower(text)
	var bestIntent ResolvedIntent
	bestScore := 0.0

	// 遍历领域
	for _, domain := range r.domains {
		domainScore := r.calculateDomainScore(textLower, domain)
		if domainScore > bestScore {
			bestScore = domainScore
			bestIntent.Domain = domain.Name
			bestIntent.Confidence = domainScore

			// 遍历类目
			var bestCategory *IntentCategory
			categoryScore := 0.0
			for _, category := range domain.Categories {
				catScore := r.calculateCategoryScore(textLower, category)
				if catScore > categoryScore {
					categoryScore = catScore
					bestCategory = category
				}
			}
			if bestCategory != nil {
				bestIntent.Category = bestCategory.Name

				// 遍历话题
				var bestTopic *IntentTopic
				topicScore := 0.0
				for _, topic := range bestCategory.SubTopics {
					tScore := r.calculateTopicScore(textLower, topic)
					if tScore > topicScore {
						topicScore = tScore
						bestTopic = topic
					}
				}
				if bestTopic != nil {
					bestIntent.Topic = bestTopic.Name
				}
			}
		}
	}

	// 如果没有匹配到任何领域，默认为闲聊
	if bestIntent.Domain == "" {
		bestIntent.Domain = "chat"
		bestIntent.Category = "casual_talk"
		bestIntent.Confidence = 0.5
	}

	bestIntent.Reasoning = r.generateReasoning(text, bestIntent)
	return bestIntent
}

// ResolveWithContext 带上下文的意图解析
func (r *IntentResolver) ResolveWithContext(ctx context.Context, text string, history []*MemoryMessage) ResolvedIntent {
	intent := r.Resolve(text)

	// 根据历史调整置信度
	if len(history) > 0 {
		lastMsg := history[len(history)-1]

		// 如果上一轮是工具执行，本轮提高工具调用相关置信度
		if lastMsg.Type == MessageTypeTool {
			if intent.Domain == "tool_use" {
				intent.Confidence = math.Min(intent.Confidence+0.1, 1.0)
			}
		}

		// 如果上一轮是知识问答，本轮提高知识相关置信度
		if lastMsg.Type == MessageTypeAssistant {
			if strings.Contains(lastMsg.Content, "知识") || strings.Contains(lastMsg.Content, "信息") {
				if intent.Domain == "knowledge" {
					intent.Confidence = math.Min(intent.Confidence+0.1, 1.0)
				}
			}
		}
	}

	return intent
}

// calculateDomainScore 计算领域得分
func (r *IntentResolver) calculateDomainScore(text string, domain *IntentDomain) float64 {
	score := 0.0

	// 关键词匹配
	for _, kw := range domain.Keywords {
		if strings.Contains(text, kw) {
			score += 0.3
		}
	}

	// 权重调整
	score *= domain.Weight

	return math.Min(score, 1.0)
}

// calculateCategoryScore 计算类目得分
func (r *IntentResolver) calculateCategoryScore(text string, category *IntentCategory) float64 {
	score := 0.0

	// 关键词匹配
	for _, kw := range category.Keywords {
		if strings.Contains(text, kw) {
			score += 0.4
		}
	}

	// 权重调整
	score *= category.Weight

	return math.Min(score, 1.0)
}

// calculateTopicScore 计算话题得分
func (r *IntentResolver) calculateTopicScore(text string, topic *IntentTopic) float64 {
	score := 0.0

	// 关键词匹配
	for _, kw := range topic.Keywords {
		if strings.Contains(text, kw) {
			score += 0.5
		}
	}

	// 权重调整
	score *= topic.Weight

	return math.Min(score, 1.0)
}

// generateReasoning 生成推理过程
func (r *IntentResolver) generateReasoning(text string, intent ResolvedIntent) string {
	var parts []string

	if intent.Domain != "" {
		parts = append(parts, "识别的领域: "+intent.Domain)
	}
	if intent.Category != "" {
		parts = append(parts, "类目: "+intent.Category)
	}
	if intent.Topic != "" {
		parts = append(parts, "话题: "+intent.Topic)
	}
	parts = append(parts, fmt.Sprintf("置信度: %.2f", intent.Confidence))

	return strings.Join(parts, ", ")
}
