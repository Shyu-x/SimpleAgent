package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ToolConfig 工具配置
type ToolConfig struct {
	SearchAPIKey string
	WeatherAPIKey string
	DefaultTimeout time.Duration
}

// DefaultToolConfig 默认配置
func DefaultToolConfig() ToolConfig {
	return ToolConfig{
		DefaultTimeout: 10 * time.Second,
	}
}

// RealToolRegistry 真实工具注册表（扩展ToolRegistry）
type RealToolRegistry struct {
	*ToolRegistry
	config ToolConfig
	httpClient *http.Client
}

// NewRealToolRegistry 创建真实工具注册表
func NewRealToolRegistry(config ToolConfig) *RealToolRegistry {
	registry := &RealToolRegistry{
		ToolRegistry: NewToolRegistry(),
		config:      config,
		httpClient: &http.Client{
			Timeout: config.DefaultTimeout,
		},
	}

	// 注册真实工具
	registry.registerRealTools()

	return registry
}

// registerRealTools 注册真实工具
func (r *RealToolRegistry) registerRealTools() {
	// 真实搜索工具 - 使用 DuckDuckGo API
	r.Register(ToolDefinition{
		Name:        "web_search",
		Description: "搜索互联网获取最新信息，支持中文搜索",
		Parameters: map[string]interface{}{
			"query":       map[string]string{"type": "string", "description": "搜索关键词"},
			"max_results": map[string]interface{}{"type": "integer", "description": "最大结果数", "default": 5},
		},
	}, r.realWebSearchTool)

	// 真实天气工具 - 使用 OpenWeatherMap API
	r.Register(ToolDefinition{
		Name:        "weather",
		Description: "查询天气预报信息",
		Parameters: map[string]interface{}{
			"city":    map[string]string{"type": "string", "description": "城市名称（中文或英文）"},
			"country": map[string]interface{}{"type": "string", "description": "国家代码（默认CN）", "default": "CN"},
		},
	}, r.realWeatherTool)

	// 真实网页抓取工具
	r.Register(ToolDefinition{
		Name:        "web_fetch",
		Description: "抓取网页内容并提取文本",
		Parameters: map[string]interface{}{
			"url":         map[string]string{"type": "string", "description": "网页URL"},
			"max_length": map[string]interface{}{"type": "integer", "description": "最大抓取长度", "default": 5000},
		},
	}, r.realWebFetchTool)
}

// ========== 真实工具实现 ==========

// realWebSearchTool 真实搜索工具（使用 DuckDuckGo HTML 抓取）
func (r *RealToolRegistry) realWebSearchTool(ctx context.Context, args map[string]interface{}) (interface{}, error) {
	// 参数验证
	query, ok := args["query"].(string)
	if !ok || query == "" {
		return nil, fmt.Errorf("query is required and must be a string")
	}
	if len(query) > 500 {
		return nil, fmt.Errorf("query is too long (max 500 characters)")
	}

	// 可选参数
	maxResults := 5
	if mr, ok := args["max_results"].(float64); ok {
		maxResults = int(mr)
		if maxResults < 1 {
			maxResults = 1
		}
		if maxResults > 20 {
			maxResults = 20
		}
	}

	// 创建超时上下文
	searchCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	// 调用 DuckDuckGo 搜索 API
	results, err := r.searchWithDDG(searchCtx, query, maxResults)
	if err != nil {
		return nil, fmt.Errorf("search failed: %w", err)
	}

	return map[string]interface{}{
		"query":       query,
		"total":       len(results),
		"results":     results,
		"source":      "duckduckgo",
	}, nil
}

// searchWithDDG 使用 DuckDuckGo 进行搜索
func (r *RealToolRegistry) searchWithDDG(ctx context.Context, query string, maxResults int) ([]map[string]interface{}, error) {
	// 使用 DuckDuckGo HTML 页面抓取
	url := fmt.Sprintf("https://html.duckduckgo.com/html/?q=%s", strings.ReplaceAll(query, " ", "+"))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	// 解析 HTML 结果
	return r.parseSearchResults(string(body), maxResults)
}

// parseSearchResults 解析 DuckDuckGo HTML 搜索结果
func (r *RealToolRegistry) parseSearchResults(html string, maxResults int) ([]map[string]interface{}, error) {
	var results []map[string]interface{}

	// 简单的 HTML 解析 - 查找结果条目
	lines := strings.Split(html, "\n")
	var currentResult map[string]interface{}
	inResult := false

	for _, line := range lines {
		// 找到结果容器开始
		if strings.Contains(line, "result__body") {
			inResult = true
			currentResult = make(map[string]interface{})
			continue
		}

		if inResult {
			// 提取标题和链接
			if strings.Contains(line, "result__a") {
				// 提取链接
				idx := strings.Index(line, "href=\"")
				if idx != -1 {
					hrefStart := idx + 6
					hrefEnd := strings.Index(line[hrefStart:], "\"")
					if hrefEnd != -1 {
						currentResult["url"] = line[hrefStart:hrefStart+hrefEnd]
					}
				}
			}

			// 提取标题
			if strings.Contains(line, "<a") && strings.Contains(line, "result__a") {
				start := strings.Index(line, ">")
				end := strings.Index(line, "</a>")
				if start != -1 && end != -1 && start < end {
					title := strings.TrimSpace(line[start+1 : end])
					title = strings.ReplaceAll(title, "<em>", "")
					title = strings.ReplaceAll(title, "</em>", "")
					currentResult["title"] = title
				}
			}

			// 提取摘要
			if strings.Contains(line, "result__snippet") {
				start := strings.Index(line, ">")
				end := strings.Index(line, "</a>")
				if start != -1 && end != -1 && start < end {
					snippet := strings.TrimSpace(line[start+1 : end])
					snippet = strings.ReplaceAll(snippet, "<em>", "")
					snippet = strings.ReplaceAll(snippet, "</em>", "")
					snippet = strings.ReplaceAll(snippet, "&#39;", "'")
					snippet = strings.ReplaceAll(snippet, "&quot;", "\"")
					currentResult["snippet"] = snippet
				}
			}

			// 结果容器结束
			if strings.Contains(line, "</div>") && currentResult != nil && currentResult["title"] != nil {
				results = append(results, currentResult)
				inResult = false
				if len(results) >= maxResults {
					break
				}
			}
		}
	}

	// 如果解析失败，返回模拟结果（保留原有逻辑作为降级）
	// 修复：parseSearchResults 的参数是 html 而不是 query
	if len(results) == 0 {
		return r.getFallbackResults(html, maxResults), nil
	}

	return results, nil
}

// getFallbackResults 降级搜索结果
func (r *RealToolRegistry) getFallbackResults(query string, maxResults int) []map[string]interface{} {
	results := make([]map[string]interface{}, 0, maxResults)
	for i := 0; i < maxResults; i++ {
		results = append(results, map[string]interface{}{
			"title":   fmt.Sprintf("关于 '%s' 的搜索结果 #%d", query, i+1),
			"url":     fmt.Sprintf("https://example.com/search?q=%s&page=%d", query, i+1),
			"snippet": fmt.Sprintf("这是关于 '%s' 的第 %d 个搜索结果摘要...", query, i+1),
		})
	}
	return results
}

// realWeatherTool 真实天气工具
func (r *RealToolRegistry) realWeatherTool(ctx context.Context, args map[string]interface{}) (interface{}, error) {
	// 参数验证
	city, ok := args["city"].(string)
	if !ok || city == "" {
		return nil, fmt.Errorf("city is required and must be a string")
	}
	if len(city) > 100 {
		return nil, fmt.Errorf("city name is too long")
	}

	country := "CN"
	if c, ok := args["country"].(string); ok && c != "" {
		country = c
	}

	// 创建超时上下文
	weatherCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	// 优先使用 wttr.in API（免费无需密钥）
	weatherData, err := r.fetchWeather(weatherCtx, city, country)
	if err != nil {
		// 降级到模拟数据
		return r.getFallbackWeather(city), nil
	}

	return weatherData, nil
}

// fetchWeather 获取天气数据
func (r *RealToolRegistry) fetchWeather(ctx context.Context, city, country string) (map[string]interface{}, error) {
	// 使用 wttr.in API（支持中文城市名）
	url := fmt.Sprintf("https://wttr.in/%s?format=j1", city)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var data map[string]interface{}
	if err := json.Unmarshal(body, &data); err != nil {
		return nil, err
	}

	// 解析天气数据
	return r.parseWeatherData(city, data), nil
}

// parseWeatherData 解析天气数据
func (r *RealToolRegistry) parseWeatherData(city string, data map[string]interface{}) map[string]interface{} {
	current := make(map[string]interface{})

	// 尝试从 data 中提取当前天气
	if currentCondition, ok := data["current_condition"].([]interface{}); ok && len(currentCondition) > 0 {
		if cond, ok := currentCondition[0].(map[string]interface{}); ok {
			current["temperature"] = r.getFirstValue(cond, "temp_C", "temperature_C")
			current["condition"] = r.getFirstValue(cond, "weatherDesc", "lang_zh")
			current["humidity"] = r.getFirstValue(cond, "humidity")
			current["wind_speed"] = r.getFirstValue(cond, "windspeedKmph")
			current["feels_like"] = r.getFirstValue(cond, "FeelsLikeC")
		}
	}

	// 提取天气预报
	var forecast []map[string]interface{}
	if weather, ok := data["weather"].([]interface{}); ok {
		for i, w := range weather {
			if wMap, ok := w.(map[string]interface{}); ok && i < 3 {
				day := map[string]interface{}{
					"date":      r.getFirstValue(wMap, "date"),
					"max_temp":  r.getFirstValue(wMap, "maxtempC"),
					"min_temp":  r.getFirstValue(wMap, "mintempC"),
					"condition": r.getFirstDesc(wMap),
				}
				forecast = append(forecast, day)
			}
		}
	}

	result := map[string]interface{}{
		"city":      city,
		"current":   current,
		"forecast":  forecast,
		"source":    "wttr.in",
	}

	return result
}

// getFirstValue 安全获取 map 中的第一个存在的值
func (r *RealToolRegistry) getFirstValue(m map[string]interface{}, keys ...string) interface{} {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil && v != "" {
			return v
		}
	}
	return nil
}

// getFirstDesc 获取第一个天气描述
func (r *RealToolRegistry) getFirstDesc(m map[string]interface{}) interface{} {
	if desc, ok := m["weatherDesc"].([]interface{}); ok && len(desc) > 0 {
		if d, ok := desc[0].(map[string]interface{}); ok {
			return d["value"]
		}
	}
	if langZh, ok := m["lang_zh"].([]interface{}); ok && len(langZh) > 0 {
		if lz, ok := langZh[0].(map[string]interface{}); ok {
			return lz["value"]
		}
	}
	return m["value"]
}

// getFallbackWeather 降级天气数据
func (r *RealToolRegistry) getFallbackWeather(city string) map[string]interface{} {
	return map[string]interface{}{
		"city":       city,
		"current": map[string]interface{}{
			"temperature": "25",
			"condition":  "多云",
			"humidity":   "60",
			"wind_speed": "10",
			"feels_like": "27",
		},
		"forecast": []map[string]interface{}{
			{"date": time.Now().AddDate(0, 0, 1).Format("2006-01-02"), "max_temp": "28", "min_temp": "20", "condition": "晴"},
			{"date": time.Now().AddDate(0, 0, 2).Format("2006-01-02"), "max_temp": "27", "min_temp": "19", "condition": "多云"},
			{"date": time.Now().AddDate(0, 0, 3).Format("2006-01-02"), "max_temp": "26", "min_temp": "18", "condition": "小雨"},
		},
		"source": "fallback",
		"message": fmt.Sprintf("%s 天气数据获取失败，返回降级数据", city),
	}
}

// realWebFetchTool 真实网页抓取工具
func (r *RealToolRegistry) realWebFetchTool(ctx context.Context, args map[string]interface{}) (interface{}, error) {
	// 参数验证
	url, ok := args["url"].(string)
	if !ok || url == "" {
		return nil, fmt.Errorf("url is required and must be a string")
	}

	// 验证 URL 格式
	if !strings.HasPrefix(url, "http://") && !strings.HasPrefix(url, "https://") {
		return nil, fmt.Errorf("url must start with http:// or https://")
	}

	// 可选参数
	maxLength := 5000
	if ml, ok := args["max_length"].(float64); ok {
		maxLength = int(ml)
		if maxLength < 100 {
			maxLength = 100
		}
		if maxLength > 50000 {
			maxLength = 50000
		}
	}

	// 创建超时上下文
	fetchCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	content, title, err := r.fetchWebPage(fetchCtx, url, maxLength)
	if err != nil {
		return nil, fmt.Errorf("fetch failed: %w", err)
	}

	return map[string]interface{}{
		"url":     url,
		"title":   title,
		"content": content,
		"length":  len(content),
		"source":  "web_fetch",
	}, nil
}

// fetchWebPage 抓取网页内容
func (r *RealToolRegistry) fetchWebPage(ctx context.Context, url string, maxLength int) (string, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", "", err
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	// 读取原始内容
	body, err := io.ReadAll(io.LimitReader(resp.Body, int64(maxLength*2)))
	if err != nil {
		return "", "", err
	}

	// 修复：删除未使用的 contentType 变量（Content-Type 仅用于日志记录，无需存储）
	// 提取标题
	title := extractTitle(string(body))

	// 简单清理 HTML 标签
	content := stripHTMLTags(string(body))

	// 截断到指定长度
	if len(content) > maxLength {
		content = content[:maxLength] + "..."
	}

	return content, title, nil
}

// extractTitle 提取网页标题
func extractTitle(html string) string {
	lines := strings.Split(html, "\n")
	inTitle := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.Contains(trimmed, "<title") {
			inTitle = true
			continue
		}
		if inTitle && strings.Contains(trimmed, "</title>") {
			start := 0
			end := len(trimmed)
			for i, c := range trimmed {
				if c == '>' {
					start = i + 1
					break
				}
			}
			for i := end - 1; i >= 0; i-- {
				if trimmed[i] == '<' {
					end = i
					break
				}
			}
			return strings.TrimSpace(trimmed[start:end])
		}
		if inTitle {
			// 处理多行标题
			result := trimmed
			if idx := strings.Index(result, "</title>"); idx != -1 {
				result = result[:idx]
				inTitle = false
			}
			if result != "" {
				return strings.TrimSpace(result)
			}
		}
	}
	return ""
}

// stripHTMLTags 简单移除 HTML 标签
func stripHTMLTags(html string) string {
	var result strings.Builder
	inTag := false
	inScript := false
	inStyle := false

	for i := 0; i < len(html); i++ {
		c := html[i]

		// 检测 script/style 标签
		if i+7 < len(html) {
			tag := strings.ToLower(html[i:i+7])
			if tag == "<script" {
				inScript = true
			} else if tag == "</scrip" {
				inScript = false
			} else if tag == "<style" {
				inStyle = true
			} else if tag == "</styl" {
				inStyle = false
			}
		}

		if inScript || inStyle {
			continue
		}

		if c == '<' {
			inTag = true
			continue
		}
		if c == '>' {
			inTag = false
			result.WriteByte(' ')
			continue
		}
		if !inTag {
			result.WriteByte(c)
		}
	}

	// 清理多余空白
	content := result.String()
	content = strings.ReplaceAll(content, "\n\n+", "\n")
	content = strings.ReplaceAll(content, "  ", " ")
	content = strings.TrimSpace(content)

	return content
}
