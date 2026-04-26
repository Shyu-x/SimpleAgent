/**
 * MCP 协议类型定义
 * Model Context Protocol 协议类型定义
 * 遵循 JSON-RPC 2.0 规范
 */

package mcp

import (
	"time"
)

// JSONRPCVersion JSON-RPC 版本
const JSONRPCVersion = "2.0"

// MCPRequest MCP 请求结构 (JSON-RPC 2.0)
type MCPRequest struct {
	JSONRPC string                 `json:"jsonrpc"` // JSON-RPC版本, 固定为"2.0"
	ID      string                 `json:"id"`      // 请求唯一标识
	Method  string                 `json:"method"`  // 方法名
	Params  map[string]interface{} `json:"params"`  // 方法参数
}

// MCPResponse MCP 响应结构 (JSON-RPC 2.0)
type MCPResponse struct {
	JSONRPC string     `json:"jsonrpc"` // JSON-RPC版本, 固定为"2.0"
	ID     string      `json:"id"`      // 对应请求的ID
	Result interface{} `json:"result"`  // 方法执行结果
	Error  *MCPError  `json:"error"`   // 错误信息
}

// MCPError MCP 错误结构
type MCPError struct {
	Code    int             `json:"code"`    // 错误码
	Message string          `json:"message"` // 错误信息
	Data    interface{}     `json:"data"`    // 附加数据
}

// ErrorCode 错误码定义
const (
	// 公共错误码
	ErrorCodeParseError     = -32700 // JSON解析错误
	ErrorCodeInvalidRequest = -32600 // 无效请求
	ErrorCodeMethodNotFound = -32601 // 方法不存在
	ErrorCodeInvalidParams  = -32602 // 参数无效
	ErrorCodeInternalError  = -32603 // 内部错误

	// MCP 特定错误码
	ErrorCodeToolNotFound    = -32000 // 工具不存在
	ErrorCodeToolExecution   = -32001 // 工具执行失败
	ErrorCodeConnectionError = -32002 // 连接错误
	ErrorCodeTimeout         = -32003 // 超时
	ErrorCodeAuthError       = -32004 // 认证错误
	ErrorCodeRateLimit       = -32005 // 速率限制
)

// MCPToolResult MCP 工具调用结果
type MCPToolResult struct {
	ID          string       `json:"id"`           // 调用ID
	Success     bool         `json:"success"`      // 是否成功
	Result      interface{}  `json:"result"`       // 执行结果
	Error       string       `json:"error"`        // 错误信息
	ErrorCode   int          `json:"errorCode"`    // 错误码
	ExecutionMs int64        `json:"executionMs"`  // 执行耗时(毫秒)
	Timestamp   time.Time    `json:"timestamp"`    // 执行时间
}

// MCPConnection MCP 连接状态
type MCPConnection struct {
	ServerName string    `json:"serverName"` // 服务器名称
	URL        string    `json:"url"`        // 连接URL
	Alive      bool      `json:"alive"`      // 是否存活
	CreatedAt  time.Time `json:"createdAt"`  // 创建时间
	LastPingAt time.Time `json:"lastPingAt"` // 最后心跳时间
	LatencyMs  int64     `json:"latencyMs"`  // 延迟(毫秒)
}

// MCPHealthResult MCP 健康检查结果
type MCPHealthResult struct {
	ServerName string    `json:"serverName"` // 服务器名称
	Healthy    bool      `json:"healthy"`   // 是否健康
	LatencyMs  int64     `json:"latencyMs"` // 延迟
	Error      string    `json:"error"`     // 错误信息
	CheckedAt  time.Time `json:"checkedAt"` // 检查时间
}

// MCPBatchOptions MCP 批量执行选项
type MCPBatchOptions struct {
	Parallel    bool          `json:"parallel"`    // 是否并行执行
	StopOnError bool          `json:"stopOnError"` // 失败时是否停止
	Timeout     time.Duration `json:"timeout"`      // 总体超时时间
}

// InputSchemaProperty 参数属性定义
type InputSchemaProperty struct {
	Type        string           `json:"type"`        // 参数类型: string, number, boolean, object, array
	Description string           `json:"description"` // 参数描述
	Default     interface{}      `json:"default"`     // 默认值
	Enum        []interface{}    `json:"enum"`        // 枚举值
	Required    bool             `json:"required"`    // 是否必需
}

// NewInputSchema 创建标准输入schema
func NewInputSchema(properties map[string]*InputSchemaProperty, required []string) map[string]interface{} {
	schema := map[string]interface{}{
		"type":       "object",
		"properties": properties,
	}
	if len(required) > 0 {
		schema["required"] = required
	}
	return schema
}

// MCPToolFilter 工具过滤条件
type MCPToolFilter struct {
	ServerName  string   `json:"serverName"`  // 服务器名称过滤
	NamePattern string   `json:"namePattern"` // 名称匹配模式
	Tags        []string `json:"tags"`        // 标签过滤
}
