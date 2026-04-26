/**
 * IntentSearchChannel - 意图定向检索通道
 *
 * 企业级设计：
 * - 根据意图类型选择最优检索策略
 * - 知识问答类 → 向量检索为主
 * - 工具调用类 → 关键词检索为主
 * - 比较类问题 → 混合检索
 *
 * 设计模式：
 * - 策略模式：根据意图动态选择检索策略
 * - 装饰器模式：包装底层检索通道
 */

package channels

import (
	"context"
	"regexp"
	"strings"

	"github.com/ai-chat/backend_go/internal/domain/rag"
)

// IntentType 意图类型
type IntentType string

const (
	IntentKnowledge  IntentType = "knowledge"   // 知识问答
	IntentToolUse    IntentType = "tool_use"    // 工具调用
	IntentComparison IntentType = "comparison"  // 比较类
	IntentProcedure  IntentType = "procedure"   // 步骤流程
	IntentCasual     IntentType = "casual"      // 闲聊
	IntentUnknown    IntentType = "unknown"     // 未知
)

// IntentSearchChannel 意图定向检索通道
type IntentSearchChannel struct {
	name           string
	vectorChannel  SearchChannel
	keywordChannel SearchChannel
	hybridChannel  SearchChannel
	intentDetector IntentDetector

	// 权重配置
	weights map[IntentType]ChannelWeights
}

// ChannelWeights 通道权重配置
type ChannelWeights struct {
	VectorWeight  float64 // 向量检索权重
	KeywordWeight float64 // 关键词检索权重
}

// IntentDetector 意图检测器
type IntentDetector interface {
	// Detect 检测查询意图
	Detect(ctx context.Context, query string) (IntentType, float64)
}

// DefaultChannelWeights 默认权重配置
var DefaultChannelWeights = map[IntentType]ChannelWeights{
	IntentKnowledge: {
		VectorWeight:  0.8,
		KeywordWeight: 0.2,
	},
	IntentToolUse: {
		VectorWeight:  0.2,
		KeywordWeight: 0.8,
	},
	IntentComparison: {
		VectorWeight:  0.5,
		KeywordWeight: 0.5,
	},
	IntentProcedure: {
		VectorWeight:  0.6,
		KeywordWeight: 0.4,
	},
	IntentCasual: {
		VectorWeight:  0.3,
		KeywordWeight: 0.7,
	},
	IntentUnknown: {
		VectorWeight:  0.5,
		KeywordWeight: 0.5,
	},
}

// NewIntentSearchChannel 创建意图定向检索通道
func NewIntentSearchChannel(
	vectorChannel, keywordChannel, hybridChannel SearchChannel,
	intentDetector IntentDetector,
) *IntentSearchChannel {
	return &IntentSearchChannel{
		name:           "intent",
		vectorChannel:  vectorChannel,
		keywordChannel: keywordChannel,
		hybridChannel:  hybridChannel,
		intentDetector: intentDetector,
		weights:        DefaultChannelWeights,
	}
}

// Name 获取通道名称
func (c *IntentSearchChannel) Name() string {
	return c.name
}

// Search 执行意图定向检索
func (c *IntentSearchChannel) Search(ctx context.Context, query string, topK int) ([]*rag.SearchResult, error) {
	// 1. 检测意图
	intent := IntentUnknown
	confidence := 0.5
	if c.intentDetector != nil {
		intent, confidence = c.intentDetector.Detect(ctx, query)
	}

	// 2. 根据意图选择检索策略
	var results []*rag.SearchResult
	var err error

	switch intent {
	case IntentKnowledge:
		// 知识问答：主要使用向量检索
		results, err = c.vectorSearch(ctx, query, topK, confidence)
	case IntentToolUse:
		// 工具调用：主要使用关键词检索
		results, err = c.keywordSearch(ctx, query, topK, confidence)
	case IntentComparison:
		// 比较类：使用混合检索
		results, err = c.hybridSearch(ctx, query, topK, confidence)
	case IntentProcedure:
		// 步骤流程：向量+关键词混合
		results, err = c.procedureSearch(ctx, query, topK, confidence)
	case IntentCasual:
		// 闲聊：关键词检索
		results, err = c.keywordSearch(ctx, query, topK, confidence)
	default:
		// 默认使用混合检索
		results, err = c.hybridSearch(ctx, query, topK, confidence)
	}

	if err != nil {
		return nil, err
	}

	return results, nil
}

// Weight 获取通道权重
func (c *IntentSearchChannel) Weight() float64 {
	return 1.0
}

// vectorSearch 向量检索
func (c *IntentSearchChannel) vectorSearch(ctx context.Context, query string, topK int, confidence float64) ([]*rag.SearchResult, error) {
	if c.vectorChannel == nil {
		return []*rag.SearchResult{}, nil
	}

	// 根据置信度调整检索数量
	adjustedTopK := topK
	if confidence < 0.5 {
		adjustedTopK = topK * 2 // 低置信度时多检索一些
	}

	results, err := c.vectorChannel.Search(ctx, query, adjustedTopK)
	if err != nil {
		return nil, err
	}

	return results, nil
}

// keywordSearch 关键词检索
func (c *IntentSearchChannel) keywordSearch(ctx context.Context, query string, topK int, confidence float64) ([]*rag.SearchResult, error) {
	if c.keywordChannel == nil {
		return []*rag.SearchResult{}, nil
	}

	results, err := c.keywordChannel.Search(ctx, query, topK)
	if err != nil {
		return nil, err
	}

	return results, nil
}

// hybridSearch 混合检索
func (c *IntentSearchChannel) hybridSearch(ctx context.Context, query string, topK int, confidence float64) ([]*rag.SearchResult, error) {
	if c.hybridChannel != nil {
		return c.hybridChannel.Search(ctx, query, topK)
	}

	// 如果没有混合通道，手动混合
	vectorResults, vectorErr := c.vectorSearch(ctx, query, topK*2, confidence)
	keywordResults, keywordErr := c.keywordSearch(ctx, query, topK*2, confidence)

	if vectorErr != nil && keywordErr != nil {
		return nil, vectorErr
	}

	if vectorErr != nil {
		return keywordResults, nil
	}

	if keywordErr != nil {
		return vectorResults, nil
	}

	return c.mergeResults(vectorResults, keywordResults, topK), nil
}

// procedureSearch 步骤流程检索
func (c *IntentSearchChannel) procedureSearch(ctx context.Context, query string, topK int, confidence float64) ([]*rag.SearchResult, error) {
	// 步骤类问题：先按顺序获取更多结果，然后按位置排序
	results, err := c.vectorSearch(ctx, query, topK*3, confidence)
	if err != nil {
		return nil, err
	}

	// 对结果按内容中的步骤关键词排序
	c.sortByProcedureOrder(results, query)

	if len(results) > topK {
		results = results[:topK]
	}

	return results, nil
}

// mergeResults 合并结果
func (c *IntentSearchChannel) mergeResults(vector, keyword []*rag.SearchResult, topK int) []*rag.SearchResult {
	weights := c.weights[IntentKnowledge] // 默认使用知识权重
	k := 60.0

	scoreMap := make(map[string]*rag.SearchResult)

	for i, r := range vector {
		rrfScore := weights.VectorWeight * (1.0 / (k + float64(i+1)))
		scoreMap[r.ID] = r
		scoreMap[r.ID].Score += rrfScore
	}

	for i, r := range keyword {
		if existing, ok := scoreMap[r.ID]; ok {
			rrfScore := weights.KeywordWeight * (1.0 / (k + float64(i+1)))
			existing.Score += rrfScore
		} else {
			rrfScore := weights.KeywordWeight * (1.0 / (k + float64(i+1)))
			scoreMap[r.ID] = r
			scoreMap[r.ID].Score = r.Score + rrfScore
		}
	}

	var merged []*rag.SearchResult
	for _, r := range scoreMap {
		merged = append(merged, r)
	}

	// 排序
	for i := 0; i < len(merged); i++ {
		for j := i + 1; j < len(merged); j++ {
			if merged[j].Score > merged[i].Score {
				merged[i], merged[j] = merged[j], merged[i]
			}
		}
	}

	if len(merged) > topK {
		merged = merged[:topK]
	}

	return merged
}

// sortByProcedureOrder 按步骤顺序排序
func (c *IntentSearchChannel) sortByProcedureOrder(results []*rag.SearchResult, query string) {
	// 步骤关键词
	procedureKeywords := []string{"首先", "第一步", "开始", "然后", "接下来", "接着", "最后", "完成"}

	// 简单排序：包含步骤关键词的结果优先
	for _, r := range results {
		content := strings.ToLower(r.Content)
		for i, kw := range procedureKeywords {
			if strings.Contains(content, strings.ToLower(kw)) {
				// 位置越靠前分数越高
				r.Score += float64(len(procedureKeywords)-i) * 0.1
				break
			}
		}
	}
}

// SetWeights 设置意图权重
func (c *IntentSearchChannel) SetWeights(intent IntentType, weights ChannelWeights) {
	c.weights[intent] = weights
}

// DefaultIntentDetector 默认意图检测器
type DefaultIntentDetector struct {
	patterns map[IntentType][]*regexp.Regexp
}

// NewDefaultIntentDetector 创建默认意图检测器
func NewDefaultIntentDetector() *DefaultIntentDetector {
	return &DefaultIntentDetector{
		patterns: map[IntentType][]*regexp.Regexp{
			IntentKnowledge: {
				regexp.MustCompile(`^(什么是|如何|怎么|怎样|为什么|谁知道)`),
				regexp.MustCompile(`(是什么|含义|定义|概念)`),
			},
			IntentToolUse: {
				regexp.MustCompile(`(搜索|查找|查询|获取)`),
				regexp.MustCompile(`(帮我|请|能不能|可以帮我)`),
			},
			IntentComparison: {
				regexp.MustCompile(`(比较|对比|差别|区别|差异|哪个好)`),
				regexp.MustCompile(`(和|与|跟|相比)`),
			},
			IntentProcedure: {
				regexp.MustCompile(`(步骤|流程|怎么(做|办)|如何(做|办)`),
				regexp.MustCompile(`(首先|然后|接着|最后|依次)`),
			},
			IntentCasual: {
				regexp.MustCompile(`^(你好|嗨|哈喽|在吗|干嘛|干啥)`),
				regexp.MustCompile(`(天气|今天|新闻)`),
			},
		},
	}
}

// Detect 检测意图
func (d *DefaultIntentDetector) Detect(ctx context.Context, query string) (IntentType, float64) {
	query = strings.TrimSpace(query)

	if query == "" {
		return IntentUnknown, 0.0
	}

	bestIntent := IntentUnknown
	bestScore := 0.0

	for intent, patterns := range d.patterns {
		score := 0.0
		for _, pattern := range patterns {
			if pattern.MatchString(query) {
				score += 1.0
			}
		}

		if score > bestScore {
			bestScore = score
			bestIntent = intent
		}
	}

	// 归一化置信度
	confidence := bestScore / 3.0 // 最多3个模式匹配
	if confidence > 1.0 {
		confidence = 1.0
	}

	return bestIntent, confidence
}

// SetChannelWeights 设置通道权重
func (c *IntentSearchChannel) SetChannelWeights(weights map[IntentType]ChannelWeights) {
	c.weights = weights
}
