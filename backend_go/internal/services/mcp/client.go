/**
 * MCP 客户端
 * Model Context Protocol 协议客户端实现
 * 支持工具发现、调用和健康管理
 */

package mcp

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

// MCPConfig MCP配置
type MCPConfig struct {
	Name        string            `json:"name"`        // MCP服务器名称
	URL         string            `json:"url"`         // MCP服务器URL
	APIKey      string            `json:"apiKey"`      // API密钥
	Timeout     int64             `json:"timeout"`     // 超时时间(ms)
	Headers     map[string]string `json:"headers"`     // 自定义请求头
	Enabled     bool              `json:"enabled"`     // 是否启用
}

// MCPTool MCP工具定义
type MCPTool struct {
	Name        string                 `json:"name"`        // 工具名称
	Description string                 `json:"description"` // 工具描述
	InputSchema map[string]interface{} `json:"inputSchema"` // 输入参数schema
	Annotations map[string]interface{} `json:"annotations"` // 注解
	MCPServer   string                 `json:"mcpServer"`   // 所属MCP服务器
}

// MCPToolCall MCP工具调用
type MCPToolCall struct {
	Name      string                 `json:"name"`      // 工具名称
	Arguments map[string]interface{} `json:"arguments"` // 工具参数
}

// MCPResult MCP调用结果
type MCPResult struct {
	Success       bool                   `json:"success"`        // 是否成功
	Tool         string                 `json:"tool"`           // 工具名称
	Result       interface{}            `json:"result"`         // 执行结果
	Error        string                 `json:"error"`          // 错误信息
	ErrorType    string                 `json:"errorType"`      // 错误类型
	ExecutionTime int64                 `json:"executionTime"`  // 执行时间(ms)
}

// MCPClient MCP客户端
type MCPClient struct {
	name        string
	timeout     int64
	config      *MCPConfig
	tools       map[string][]*MCPTool   // 工具缓存: serverName -> tools
	connections map[string]*Connection  // 连接缓存
	cacheTTL    int64                  // 缓存过期时间(ms)
	httpClient  *http.Client
	mu          sync.RWMutex
	onError     func(err error)        // 错误回调
}

// Connection MCP连接
type Connection struct {
	Type      string                  `json:"type"`       // 连接类型: http/websocket
	URL       string                  `json:"url"`        // 连接URL
	Headers   map[string]string       `json:"headers"`    // 请求头
	Alive     bool                    `json:"alive"`      // 是否存活
	CreatedAt int64                   `json:"createdAt"`  // 创建时间
	SendRequest func(req *Request) (*Response, error) // 发送请求函数
}

// Request MCP请求
type Request struct {
	JSONRPC string                 `json:"jsonrpc"` // JSON-RPC版本
	ID      string                 `json:"id"`      // 请求ID
	Method  string                 `json:"method"`  // 方法名
	Params  map[string]interface{} `json:"params"`  // 参数
}

// Response MCP响应
type Response struct {
	JSONRPC string                 `json:"jsonrpc"` // JSON-RPC版本
	ID      string                 `json:"id"`      // 请求ID
	Result  interface{}            `json:"result"` // 结果
	Error   *ResponseError        `json:"error"`  // 错误
}

// ResponseError 响应错误
type ResponseError struct {
	Code    int    `json:"code"`    // 错误码
	Message string `json:"message"` // 错误信息
	Data    interface{} `json:"data"` // 错误数据
}

// NewMCPClient 创建MCP客户端
func NewMCPClient(name string, config *MCPConfig) *MCPClient {
	timeout := int64(30000) // 默认30秒
	if config.Timeout > 0 {
		timeout = config.Timeout
	}

	return &MCPClient{
		name:        name,
		timeout:     timeout,
		config:      config,
		tools:       make(map[string][]*MCPTool),
		connections: make(map[string]*Connection),
		cacheTTL:    5 * 60 * 1000, // 5分钟
		httpClient: &http.Client{
			Timeout: time.Duration(timeout) * time.Millisecond,
		},
	}
}

// ExecuteMCP 执行MCP工具调用
func (c *MCPClient) ExecuteMCP(toolCall *MCPToolCall, mcpConfig *MCPConfig, ctx map[string]interface{}) *MCPResult {
	startTime := time.Now().UnixMilli()

	// 获取或创建连接
	conn, err := c.getConnection(mcpConfig)
	if err != nil {
		return &MCPResult{
			Success:       false,
			Tool:         toolCall.Name,
			Error:        err.Error(),
			ErrorType:    "connection",
			ExecutionTime: time.Now().UnixMilli() - startTime,
		}
	}

	// 构建请求
	request := &Request{
		JSONRPC: "2.0",
		ID:      c.generateRequestID(),
		Method:  "tools/call",
		Params: map[string]interface{}{
			"name":      toolCall.Name,
			"arguments": toolCall.Arguments,
		},
	}

	// 发送请求
	response, err := conn.SendRequest(request)
	if err != nil {
		return &MCPResult{
			Success:       false,
			Tool:         toolCall.Name,
			Error:        err.Error(),
			ErrorType:    c.classifyError(err),
			ExecutionTime: time.Now().UnixMilli() - startTime,
		}
	}

	// 处理响应
	if response.Error != nil {
		return &MCPResult{
			Success:       false,
			Tool:         toolCall.Name,
			Error:        response.Error.Message,
			ErrorType:    "execution",
			ExecutionTime: time.Now().UnixMilli() - startTime,
		}
	}

	return &MCPResult{
		Success:       true,
		Tool:         toolCall.Name,
		Result:       response.Result,
		ExecutionTime: time.Now().UnixMilli() - startTime,
	}
}

// ListTools 列出MCP服务器上的所有工具
func (c *MCPClient) ListTools(mcpConfig *MCPConfig) []*MCPTool {
	// 检查缓存
	cacheKey := c.getCacheKey(mcpConfig)
	if cached := c.getCachedTools(cacheKey); cached != nil {
		return cached
	}

	// 获取连接
	conn, err := c.getConnection(mcpConfig)
	if err != nil {
		return []*MCPTool{}
	}

	// 构建请求
	request := &Request{
		JSONRPC: "2.0",
		ID:      c.generateRequestID(),
		Method:  "tools/list",
		Params:  map[string]interface{}{},
	}

	// 发送请求
	response, err := conn.SendRequest(request)
	if err != nil {
		return []*MCPTool{}
	}

	// 解析工具列表
	tools := c.parseToolList(response, mcpConfig)

	// 缓存结果
	c.cacheTools(cacheKey, tools)

	return tools
}

// GetToolSchema 获取工具的schema定义
func (c *MCPClient) GetToolSchema(toolName string, mcpConfig *MCPConfig) *MCPTool {
	tools := c.ListTools(mcpConfig)

	for _, tool := range tools {
		if tool.Name == toolName {
			return tool
		}
	}

	return nil
}

// ExecuteBatch 批量执行MCP工具
func (c *MCPClient) ExecuteBatch(toolCalls []*MCPToolCall, mcpConfig *MCPConfig, options *BatchOptions) []*MCPResult {
	parallel := true
	if options != nil && !options.Parallel {
		parallel = false
	}

	results := make([]*MCPResult, len(toolCalls))

	if parallel {
		// 并行执行
		var wg sync.WaitGroup
		for i, tc := range toolCalls {
			wg.Add(1)
			go func(index int, toolCall *MCPToolCall) {
				defer wg.Done()
				results[index] = c.ExecuteMCP(toolCall, mcpConfig, nil)
			}(i, tc)
		}
		wg.Wait()
	} else {
		// 串行执行
		for i, tc := range toolCalls {
			results[i] = c.ExecuteMCP(tc, mcpConfig, nil)

			// 如果失败且配置停止，则中断
			if options != nil && !results[i].Success && options.StopOnError {
				break
			}
		}
	}

	return results
}

// BatchOptions 批量执行选项
type BatchOptions struct {
	Parallel    bool // 是否并行执行
	StopOnError bool // 失败时是否停止
	Context     map[string]interface{} // 上下文
}

// HealthCheck 健康检查
func (c *MCPClient) HealthCheck(mcpConfig *MCPConfig) *HealthResult {
	startTime := time.Now().UnixMilli()

	conn, err := c.getConnection(mcpConfig)
	if err != nil {
		return &HealthResult{
			Healthy:    false,
			LatencyMs: time.Now().UnixMilli() - startTime,
			Error:     err.Error(),
		}
	}

	// 发送ping请求
	request := &Request{
		JSONRPC: "2.0",
		ID:      c.generateRequestID(),
		Method:  "ping",
		Params:  map[string]interface{}{},
	}

	_, err = conn.SendRequest(request)
	if err != nil {
		return &HealthResult{
			Healthy:    false,
			LatencyMs: time.Now().UnixMilli() - startTime,
			Error:     err.Error(),
		}
	}

	return &HealthResult{
		Healthy:    true,
		LatencyMs: time.Now().UnixMilli() - startTime,
	}
}

// HealthResult 健康检查结果
type HealthResult struct {
	Healthy   bool
	LatencyMs int64
	Error     string
}

// getConnection 获取或创建连接
func (c *MCPClient) getConnection(mcpConfig *MCPConfig) (*Connection, error) {
	key := c.getCacheKey(mcpConfig)

	c.mu.RLock()
	if conn, ok := c.connections[key]; ok && conn.Alive {
		c.mu.RUnlock()
		return conn, nil
	}
	c.mu.RUnlock()

	// 创建新连接
	conn, err := c.establishConnection(mcpConfig)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	c.connections[key] = conn
	c.mu.Unlock()

	return conn, nil
}

// establishConnection 建立连接
func (c *MCPClient) establishConnection(mcpConfig *MCPConfig) (*Connection, error) {
	url := mcpConfig.URL

	if strings.HasPrefix(url, "ws://") || strings.HasPrefix(url, "wss://") {
		return c.createWebSocketConnection(mcpConfig)
	} else {
		return c.createHTTPConnection(mcpConfig)
	}
}

// createHTTPConnection 创建HTTP连接
func (c *MCPClient) createHTTPConnection(mcpConfig *MCPConfig) (*Connection, error) {
	headers := map[string]string{
		"Content-Type": "application/json",
	}

	for k, v := range mcpConfig.Headers {
		headers[k] = v
	}

	if mcpConfig.APIKey != "" {
		headers["Authorization"] = "Bearer " + mcpConfig.APIKey
	}

	conn := &Connection{
		Type:    "http",
		URL:     mcpConfig.URL,
		Headers: headers,
		Alive:   true,
		CreatedAt: time.Now().UnixMilli(),
		SendRequest: func(req *Request) (*Response, error) {
			jsonData, err := json.Marshal(req)
			if err != nil {
				return nil, err
			}

			httpReq, err := http.NewRequest("POST", mcpConfig.URL, strings.NewReader(string(jsonData)))
			if err != nil {
				return nil, err
			}

			for k, v := range headers {
				httpReq.Header.Set(k, v)
			}

			httpResp, err := c.httpClient.Do(httpReq)
			if err != nil {
				return nil, err
			}
			defer httpResp.Body.Close()

			var response Response
			if err := json.NewDecoder(httpResp.Body).Decode(&response); err != nil {
				return nil, err
			}

			return &response, nil
		},
	}

	return conn, nil
}

// createWebSocketConnection 创建WebSocket连接
func (c *MCPClient) createWebSocketConnection(mcpConfig *MCPConfig) (*Connection, error) {
	// 注意：这里需要引入 gorilla/websocket 包
	// 为了简化，暂时返回错误
	return nil, fmt.Errorf("WebSocket connection not implemented yet")
}

// parseToolList 解析工具列表响应
func (c *MCPClient) parseToolList(response *Response, mcpConfig *MCPConfig) []*MCPTool {
	tools := []*MCPTool{}

	if response.Result == nil {
		return tools
	}

	// 支持多种响应格式
	resultMap, ok := response.Result.(map[string]interface{})
	if !ok {
		return tools
	}

	toolsData, ok := resultMap["tools"].([]interface{})
	if !ok {
		return tools
	}

	for _, toolData := range toolsData {
		toolMap, ok := toolData.(map[string]interface{})
		if !ok {
			continue
		}

		tool := &MCPTool{
			Name:        getStringValue(toolMap, "name"),
			Description: getStringValue(toolMap, "description"),
			InputSchema: getMapValue(toolMap, "inputSchema"),
			Annotations: getMapValue(toolMap, "annotations"),
			MCPServer:   mcpConfig.Name,
		}

		if tool.InputSchema == nil {
			tool.InputSchema = getMapValue(toolMap, "parameters")
		}
		if tool.InputSchema == nil {
			tool.InputSchema = map[string]interface{}{"type": "object", "properties": map[string]interface{}{}}
		}

		tools = append(tools, tool)
	}

	return tools
}

// classifyError 分类错误类型
func (c *MCPClient) classifyError(err error) string {
	errMsg := err.Error()
	if strings.Contains(errMsg, "timeout") {
		return "timeout"
	}
	if strings.Contains(errMsg, "401") || strings.Contains(errMsg, "403") {
		return "auth"
	}
	if strings.Contains(errMsg, "429") {
		return "rate_limit"
	}
	if strings.Contains(errMsg, "ECONNREFUSED") {
		return "network"
	}
	return "execution"
}

// getCacheKey 获取缓存键
func (c *MCPClient) getCacheKey(mcpConfig *MCPConfig) string {
	return fmt.Sprintf("%s:%s", mcpConfig.Name, mcpConfig.URL)
}

// getCachedTools 从缓存获取工具列表
func (c *MCPClient) getCachedTools(cacheKey string) []*MCPTool {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if tools, ok := c.tools[cacheKey]; ok {
		return tools
	}
	return nil
}

// cacheTools 缓存工具列表
func (c *MCPClient) cacheTools(cacheKey string, tools []*MCPTool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.tools[cacheKey] = tools
}

// generateRequestID 生成请求ID
func (c *MCPClient) generateRequestID() string {
	return fmt.Sprintf("mcp_%d_%s", time.Now().UnixMilli(), randomString(8))
}

// RemoveConnection 移除指定MCP连接
func (c *MCPClient) RemoveConnection(name, url string) {
	key := fmt.Sprintf("%s:%s", name, url)
	c.mu.Lock()
	defer c.mu.Unlock()

	if _, ok := c.connections[key]; ok {
		delete(c.connections, key)
	}
	delete(c.tools, key)
}

// Close 关闭所有连接
func (c *MCPClient) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.connections = make(map[string]*Connection)
	c.tools = make(map[string][]*MCPTool)
}

// SetOnError 设置错误回调
func (c *MCPClient) SetOnError(callback func(err error)) {
	c.onError = callback
}

// randomString 生成随机字符串
func randomString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[time.Now().UnixNano()%int64(len(letters))]
	}
	return string(b)
}

// getStringValue 安全获取字符串值
func getStringValue(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

// getMapValue 安全获取map值
func getMapValue(m map[string]interface{}, key string) map[string]interface{} {
	if v, ok := m[key].(map[string]interface{}); ok {
		return v
	}
	return nil
}

// MCPToolExecutorInterface MCP工具执行器接口
type MCPToolExecutorInterface interface {
	ExecuteMCP(toolCall *MCPToolCall, mcpConfig *MCPConfig, ctx map[string]interface{}) *MCPResult
	ListTools(mcpConfig *MCPConfig) []*MCPTool
	ExecuteBatch(toolCalls []*MCPToolCall, mcpConfig *MCPConfig, options *BatchOptions) []*MCPResult
	HealthCheck(mcpConfig *MCPConfig) *HealthResult
	Close()
}

// 确保MCPClient实现了MCPToolExecutorInterface
var _ MCPToolExecutorInterface = (*MCPClient)(nil)

// CreateMCPToolExecutor 创建MCP执行器实例
func CreateMCPToolExecutor(name string, config *MCPConfig) *MCPClient {
	return NewMCPClient(name, config)
}
