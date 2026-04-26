// Package errors 统一错误体系 v2.0
// 错误码定义 (1000-9999)
// 分类:
//   1xxx  - VALIDATION (参数校验)
//   2xxx  - AUTH (认证授权)
//   3xxx  - AGENT (Agent执行)
//   4xxx  - RAG (知识检索)
//   5xxx  - TOOL (工具调用)
//   6xxx  - INTERNAL (系统级)
package errors

import (
	"fmt"
	"net/http"
	"runtime"
	"time"
)

// 错误码常量定义
const (
	// ========== VALIDATION (1000-1999) ==========
	CodeInvalidParam         = 1000 // 参数错误
	CodeMissingParam         = 1001 // 缺少必需参数
	CodeInvalidType         = 1002 // 参数类型错误
	CodeInvalidFormat       = 1003 // 参数格式错误
	CodeParamOutOfRange     = 1004 // 参数超出范围
	CodeValidationFailed    = 1005 // 校验失败
	CodeInvalidRequestBody  = 1100 // 请求体格式错误
	CodeInvalidJSON         = 1101 // JSON解析失败
	CodeMissingHeader       = 1102 // 缺少必需请求头
	CodeInvalidHeader       = 1103 // 请求头格式错误

	// ========== AUTH (2000-2999) ==========
	CodeUnauthorized        = 2000 // 未授权访问
	CodeInvalidToken        = 2001 // 认证令牌无效
	CodeTokenExpired        = 2002 // 认证已过期
	CodeTokenMissing        = 2003 // 缺少认证令牌
	CodeForbidden           = 2004 // 无权限访问
	CodeInsufficientPerm    = 2005 // 权限不足
	CodeAPIKeyInvalid       = 2100 // API Key无效
	CodeAPIKeyExpired       = 2101 // API Key已过期
	CodeIPNotAllowed        = 2102 // IP地址不允许

	// ========== AGENT (3000-3999) ==========
	CodeAgentError          = 3000 // Agent执行错误
	CodeIntentClassifyFailed= 3001 // 意图分类失败
	CodeIntentUnsupported   = 3002 // 不支持的意图类型
	CodeRoutingFailed       = 3003 // 路由分发失败
	CodeExecutionTimeout    = 3004 // Agent执行超时
	CodeMaxTurnsExceeded    = 3005 // 超出最大轮次
	CodeSessionNotFound     = 3100 // 会话不存在
	CodeSessionExpired      = 3101 // 会话已过期
	CodeSessionVersionConflict= 3102 // 会话版本冲突
	CodeMemoryError         = 3200 // 记忆系统错误
	CodeMemorySaveFailed   = 3201 // 记忆保存失败
	CodeMemoryRecallFailed  = 3202 // 记忆召回失败
	CodeCancelled           = 3300 // 任务已取消
	CodeAborted             = 3301 // 任务已中止

	// ========== RAG (4000-4999) ==========
	CodeRAGError            = 4000 // RAG系统错误
	CodeQueryRewriteFailed  = 4001 // 问题改写失败
	CodeQueryDecomposeFailed= 4002 // 问题拆分失败
	CodeRetrievalFailed     = 4003 // 检索失败
	CodeRerankFailed        = 4004 // 重排序失败
	CodeNoResult            = 4005 // 检索无结果
	CodeLowConfidence       = 4006 // 检索置信度低
	CodeIngestionFailed     = 4100 // 文档摄取失败
	CodeParseFailed         = 4101 // 文档解析失败
	CodeChunkFailed         = 4102 // 文档分块失败
	CodeEmbeddingFailed     = 4103 // 向量化失败
	CodeIndexFailed         = 4104 // 索引写入失败
	CodeVectorSearchFailed  = 4200 // 向量搜索失败
	CodeKeywordSearchFailed = 4201 // 关键词搜索失败
	CodeHybridSearchFailed  = 4202 // 混合搜索失败
	CodeCollectionNotFound  = 4300 // 集合不存在
	CodeCollectionExists    = 4301 // 集合已存在

	// ========== TOOL (5000-5999) ==========
	CodeToolError           = 5000 // 工具系统错误
	CodeToolNotFound        = 5001 // 工具不存在
	CodeToolDisabled        = 5002 // 工具已禁用
	CodeToolExecFailed      = 5003 // 工具执行失败
	CodeToolTimeout         = 5004 // 工具执行超时
	CodeToolParamInvalid    = 5005 // 工具参数无效
	CodeToolParamMissing    = 5006 // 工具参数缺失
	CodeToolNoImplementation= 5007 // 工具未实现
	CodeMCPError            = 5100 // MCP协议错误
	CodeMCPConnectFailed    = 5101 // MCP连接失败
	CodeMCPRequestFailed    = 5102 // MCP请求失败
	CodeMCPResponseInvalid  = 5103 // MCP响应无效

	// ========== INTERNAL (6000-6999) ==========
	CodeInternalError       = 6000 // 内部服务器错误
	CodeServiceUnavailable  = 6001 // 服务不可用
	CodeRequestTimeout      = 6002 // 请求超时
	CodeNetworkError        = 6003 // 网络错误
	CodeNotFound            = 6004 // 资源不存在
	CodeMethodNotAllowed    = 6005 // 方法不允许
	CodeDatabaseError       = 6100 // 数据库错误
	CodeDBConnectionFailed  = 6101 // 数据库连接失败
	CodeDBQueryFailed       = 6102 // 数据库查询失败
	CodeDBWriteFailed       = 6103 // 数据库写入失败
	CodeCacheError          = 6200 // 缓存错误
	CodeRedisError          = 6201 // Redis错误
	CodeRedisConnectionFailed= 6202 // Redis连接失败
	CodeExternalAPIError    = 6300 // 外部API调用失败
	CodeExternalAPITimeout = 6301 // 外部API超时
	CodeModelAPIError       = 6302 // 模型API调用失败
	CodeModelAPITimeout     = 6303 // 模型API超时
	CodeRateLimitExceeded   = 6400 // 超出速率限制
	CodeQuotaExceeded       = 6401 // 超出配额限制
	CodeCircuitBreakerOpen   = 6402 // 熔断器已开启
	CodeConfigError         = 6500 // 配置错误
	CodeConfigNotFound      = 6501 // 配置不存在
)

// ErrorType 错误类型
type ErrorType string

const (
	TypeValidation  ErrorType = "VALIDATION"
	TypeAuth        ErrorType = "AUTH"
	TypeAgent       ErrorType = "AGENT"
	TypeRAG         ErrorType = "RAG"
	TypeTool        ErrorType = "TOOL"
	TypeInternal    ErrorType = "INTERNAL"
)

// ErrorLevel 错误级别
type ErrorLevel int

const (
	LevelInfo     ErrorLevel = iota // 信息
	LevelWarning                    // 警告
	LevelError                      // 错误
	LevelCritical                   // 严重
)

// AppError 应用错误结构
type AppError struct {
	Code       int         `json:"code"`        // 错误码
	Type       ErrorType   `json:"type"`        // 错误类型
	Message    string      `json:"message"`     // 错误信息
	Detail     string      `json:"detail,omitempty"` // 详细描述
	Level      ErrorLevel  `json:"level"`       // 错误级别
	HttpStatus int         `json:"-"`           // HTTP状态码
	Err        error       `json:"-"`           // 原始错误
	Timestamp  time.Time   `json:"timestamp"`   // 时间戳
	Stack      string      `json:"stack,omitempty"` // 堆栈信息
}

// New 创建新的应用错误
func New(code int, message string, err error) *AppError {
	return &AppError{
		Code:       code,
		Type:       getErrorType(code),
		Message:    message,
		Level:      LevelError,
		HttpStatus: getHttpStatus(code),
		Err:        err,
		Timestamp:  time.Now(),
		Stack:      getStack(),
	}
}

// NewWithDetail 创建带详细信息的错误
func NewWithDetail(code int, message, detail string, err error) *AppError {
	return &AppError{
		Code:       code,
		Type:       getErrorType(code),
		Message:    message,
		Detail:     detail,
		Level:      LevelError,
		HttpStatus: getHttpStatus(code),
		Err:        err,
		Timestamp:  time.Now(),
		Stack:      getStack(),
	}
}

// getErrorType 根据错误码获取错误类型
func getErrorType(code int) ErrorType {
	switch {
	case code >= 1000 && code < 2000:
		return TypeValidation
	case code >= 2000 && code < 3000:
		return TypeAuth
	case code >= 3000 && code < 4000:
		return TypeAgent
	case code >= 4000 && code < 5000:
		return TypeRAG
	case code >= 5000 && code < 6000:
		return TypeTool
	default:
		return TypeInternal
	}
}

// getHttpStatus 根据错误码获取HTTP状态码
func getHttpStatus(code int) int {
	switch code {
	case 1000, 1001, 1002, 1003, 1004, 1005, 1100, 1101, 1102, 1103:
		return http.StatusBadRequest
	case 2000, 2001, 2002, 2003, 2100, 2101:
		return http.StatusUnauthorized
	case 2004, 2005, 2102:
		return http.StatusForbidden
	case 3001, 3002, 3003, 3005, 3300, 3301:
		return http.StatusBadRequest
	case 3004, 5004, 6002, 6301, 6303:
		return http.StatusGatewayTimeout
	case 3100, 4005, 4300, 6004:
		return http.StatusNotFound
	case 3102, 4301:
		return http.StatusConflict
	case 5000, 5001, 5002, 5005, 5006, 5007, 5100, 5101, 5102, 5103:
		return http.StatusInternalServerError
	case 6001, 6101, 6202, 6402:
		return http.StatusServiceUnavailable
	case 6400, 6401:
		return http.StatusTooManyRequests
	default:
		if code >= 6000 {
			return http.StatusInternalServerError
		}
		return http.StatusBadRequest
	}
}

// Error 实现error接口
func (e *AppError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("[%d] %s: %v", e.Code, e.Message, e.Err)
	}
	return fmt.Sprintf("[%d] %s", e.Code, e.Message)
}

// Unwrap 解包原始错误
func (e *AppError) Unwrap() error {
	return e.Err
}

// WithLevel 设置错误级别
func (e *AppError) WithLevel(level ErrorLevel) *AppError {
	e.Level = level
	return e
}

// WithHttpStatus 设置HTTP状态码
func (e *AppError) WithHttpStatus(status int) *AppError {
	e.HttpStatus = status
	return e
}

// WithDetail 设置详细信息
func (e *AppError) WithDetail(detail string) *AppError {
	e.Detail = detail
	return e
}

// ToMap 转换为map
func (e *AppError) ToMap() map[string]interface{} {
	m := map[string]interface{}{
		"code":      e.Code,
		"type":      e.Type,
		"message":   e.Message,
		"level":     e.Level,
		"timestamp": e.Timestamp.Format(time.RFC3339),
	}
	if e.Detail != "" {
		m["detail"] = e.Detail
	}
	if e.Stack != "" {
		m["stack"] = e.Stack
	}
	return m
}

// getStack 获取堆栈信息
func getStack() string {
	buf := make([]byte, 4096)
	n := runtime.Stack(buf, false)
	return string(buf[:n])
}

// 预定义错误实例

// ErrInternal 内部错误
var ErrInternal = New(CodeInternalError, "内部服务器错误", nil)

// ErrNetwork 网络错误
var ErrNetwork = New(CodeNetworkError, "网络错误", nil)

// ErrTimeout 超时错误
var ErrTimeout = New(CodeRequestTimeout, "请求超时", nil)

// ErrNotFound 资源不存在
var ErrNotFound = NewWithDetail(CodeNotFound, "资源不存在", "", nil)

// ErrUnauthorized 未授权
var ErrUnauthorized = NewWithDetail(CodeUnauthorized, "未授权访问", "", nil)

// ErrForbidden 禁止访问
var ErrForbidden = NewWithDetail(CodeForbidden, "禁止访问", "", nil)

// ErrRateLimit 限流
var ErrRateLimit = NewWithDetail(CodeRateLimitExceeded, "请求过于频繁", "", nil).
	WithLevel(LevelWarning)

// ErrCircuitOpen 熔断开启
var ErrCircuitOpen = NewWithDetail(CodeCircuitBreakerOpen, "服务暂时不可用", "熔断器已开启", nil).
	WithLevel(LevelWarning)

// ErrInvalidParameter 参数错误
func ErrInvalidParameter(detail string) *AppError {
	return NewWithDetail(CodeInvalidParam, "参数错误", detail, nil).
		WithHttpStatus(http.StatusBadRequest)
}

// ErrModel 模型错误
func ErrModel(message string, err error) *AppError {
	return NewWithDetail(CodeModelAPIError, "模型错误", message, err).
		WithLevel(LevelError)
}

// ErrTool 工具错误
func ErrTool(toolName string, err error) *AppError {
	return NewWithDetail(CodeToolExecFailed, "工具执行失败", fmt.Sprintf("工具: %s", toolName), err).
		WithLevel(LevelWarning)
}

// ErrRAG RAG错误
func ErrRAG(message string, err error) *AppError {
	return NewWithDetail(CodeRetrievalFailed, "RAG检索错误", message, err).
		WithLevel(LevelWarning)
}

// ErrAgent Agent错误
func ErrAgent(message string, err error) *AppError {
	return NewWithDetail(CodeAgentError, "Agent执行错误", message, err)
}

// ErrSession 会话错误
func ErrSession(message string, err error) *AppError {
	return NewWithDetail(CodeSessionNotFound, "会话错误", message, err)
}

// ErrMessage 消息错误
func ErrMessage(message string, err error) *AppError {
	return NewWithDetail(CodeInvalidParam, "消息错误", message, err)
}

// ErrExternalAPI 外部API错误
func ErrExternalAPI(apiName string, err error) *AppError {
	return NewWithDetail(CodeExternalAPIError, "外部API错误", fmt.Sprintf("API: %s", apiName), err).
		WithLevel(LevelWarning)
}

// ErrRedis Redis错误
func ErrRedis(message string, err error) *AppError {
	return NewWithDetail(CodeRedisError, "Redis错误", message, err)
}

// ErrDatabase 数据库错误
func ErrDatabase(message string, err error) *AppError {
	return NewWithDetail(CodeDatabaseError, "数据库错误", message, err)
}

// ErrSessionVersionConflict 会话版本冲突错误
var ErrSessionVersionConflict = NewWithDetail(CodeSessionVersionConflict, "会话版本冲突", "乐观锁版本号不匹配", nil)

// IsSessionVersionConflict 检查是否为会话版本冲突错误
func IsSessionVersionConflict(err error) bool {
	if err == nil {
		return false
	}
	if appErr, ok := err.(*AppError); ok {
		return appErr.Code == CodeSessionVersionConflict
	}
	return false
}
