package channels

import (
	"context"
	"regexp"
	"strings"

	"github.com/ai-chat/backend_go/internal/domain/rag"
)

// KeywordSearchChannel 关键词检索通道
type KeywordSearchChannel struct {
	name   string
	client KeywordStoreClient
	topK   int
}

// KeywordStoreClient 关键词存储客户端接口
type KeywordStoreClient interface {
	Search(ctx context.Context, keywords []string, topK int) ([]*rag.SearchResult, error)
}

// NewKeywordSearchChannel 创建关键词检索通道
func NewKeywordSearchChannel(name string, client KeywordStoreClient, topK int) *KeywordSearchChannel {
	return &KeywordSearchChannel{
		name:   name,
		client: client,
		topK:   topK,
	}
}

// Name 获取通道名称
func (c *KeywordSearchChannel) Name() string {
	return c.name
}

// Search 执行搜索
func (c *KeywordSearchChannel) Search(ctx context.Context, query string, topK int) ([]*rag.SearchResult, error) {
	if topK <= 0 {
		topK = c.topK
	}

	// 提取关键词
	keywords := extractKeywords(query)

	if len(keywords) == 0 {
		return []*rag.SearchResult{}, nil
	}

	return c.client.Search(ctx, keywords, topK)
}

// extractKeywords 提取关键词
func extractKeywords(query string) []string {
	// 简单分词
	words := regexp.MustCompile(`[\w]+`).FindAllString(query, -1)

	// 停用词
	stopWords := map[string]bool{
		"的": true, "了": true, "是": true, "在": true, "我": true,
		"有": true, "和": true, "就": true, "不": true, "人": true,
		"都": true, "一": true, "一个": true, "上": true, "也": true,
		"很": true, "到": true, "说": true, "要": true, "去": true,
		"你": true, "会": true, "着": true, "没有": true, "看": true,
		"好": true, "自己": true, "这": true, "那": true,
	}

	var keywords []string
	for _, w := range words {
		w = strings.ToLower(w)
		if len(w) > 1 && !stopWords[w] {
			keywords = append(keywords, w)
		}
	}

	return keywords
}

// Weight 获取通道权重
func (c *KeywordSearchChannel) Weight() float64 {
	return 0.3
}
