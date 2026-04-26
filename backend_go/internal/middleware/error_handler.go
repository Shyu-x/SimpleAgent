/**
 * 错误处理中间件
 * 统一错误处理、格式化响应、日志记录
 * @version 2.0.0 (2026-04-06)
 *
 * 统一响应格式: {success: bool, data: any, error: {code: string, message: string}, timestamp}
 */
package middleware

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"runtime/debug"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/ai-chat/backend_go/internal/common/errors"
)

// intToStringErrorCode 将整数错误码转换为字符串错误码
func intToStringErrorCode(code int) string {
	errorCodeMap := map[int]string{
		// VALIDATION (1000-1999)
		1000: "VAL_INVALID",
		1001: "VAL_MISSING_PARAM",
		1002: "VAL_INVALID_TYPE",
		1003: "VAL_INVALID_FORMAT",
		1004: "VAL_OUT_OF_RANGE",
		1005: "VAL_VALIDATION_FAILED",
		1100: "VAL_INVALID_BODY",
		1101: "VAL_INVALID_JSON",
		1102: "VAL_MISSING_HEADER",
		1103: "VAL_INVALID_HEADER",
		// AUTH (2000-2999)
		2000: "AUTH_UNAUTHORIZED",
		2001: "AUTH_INVALID_TOKEN",
		2002: "AUTH_TOKEN_EXPIRED",
		2003: "AUTH_TOKEN_MISSING",
		2004: "AUTH_FORBIDDEN",
		2005: "AUTH_INSUFFICIENT_PERM",
		2100: "AUTH_API_KEY_INVALID",
		2101: "AUTH_API_KEY_EXPIRED",
		2102: "AUTH_IP_NOT_ALLOWED",
		// AGENT (3000-3999)
		3000: "AGENT_ERROR",
		3001: "AGENT_INTENT_CLASSIFY_FAILED",
		3002: "AGENT_INTENT_UNSUPPORTED",
		3003: "AGENT_ROUTING_FAILED",
		3004: "AGENT_EXEC_TIMEOUT",
		3005: "AGENT_MAX_TURNS_EXCEEDED",
		3100: "AGENT_SESSION_NOT_FOUND",
		3101: "AGENT_SESSION_EXPIRED",
		3102: "AGENT_SESSION_CONFLICT",
		3200: "AGENT_MEMORY_ERROR",
		3201: "AGENT_MEMORY_SAVE_FAILED",
		3202: "AGENT_MEMORY_RECALL_FAILED",
		3300: "AGENT_CANCELLED",
		3301: "AGENT_ABORTED",
		// RAG (4000-4999)
		4000: "RAG_ERROR",
		4001: "RAG_QUERY_REWRITE_FAILED",
		4002: "RAG_QUERY_DECOMPOSE_FAILED",
		4003: "RAG_RETRIEVAL_FAILED",
		4004: "RAG_RERANK_FAILED",
		4005: "RAG_NO_RESULT",
		4006: "RAG_LOW_CONFIDENCE",
		4100: "RAG_INGESTION_FAILED",
		4101: "RAG_PARSE_FAILED",
		4102: "RAG_CHUNK_FAILED",
		4103: "RAG_EMBEDDING_FAILED",
		4104: "RAG_INDEX_FAILED",
		4200: "RAG_VECTOR_SEARCH_FAILED",
		4201: "RAG_KEYWORD_SEARCH_FAILED",
		4202: "RAG_HYBRID_SEARCH_FAILED",
		4300: "RAG_COLLECTION_NOT_FOUND",
		4301: "RAG_COLLECTION_EXISTS",
		// TOOL (5000-5999)
		5000: "TOOL_ERROR",
		5001: "TOOL_NOT_FOUND",
		5002: "TOOL_DISABLED",
		5003: "TOOL_EXEC_FAILED",
		5004: "TOOL_TIMEOUT",
		5005: "TOOL_PARAM_INVALID",
		5006: "TOOL_PARAM_MISSING",
		5007: "TOOL_NO_IMPLEMENTATION",
		5100: "TOOL_MCP_ERROR",
		5101: "TOOL_MCP_CONNECT_FAILED",
		5102: "TOOL_MCP_REQUEST_FAILED",
		5103: "TOOL_MCP_RESPONSE_INVALID",
		// INTERNAL (6000-6999)
		6000: "SYS_INTERNAL",
		6001: "SYS_UNAVAILABLE",
		6002: "SYS_REQUEST_TIMEOUT",
		6003: "SYS_NETWORK_ERROR",
		6004: "SYS_NOT_FOUND",
		6005: "SYS_METHOD_NOT_ALLOWED",
		6100: "SYS_DATABASE_ERROR",
		6101: "SYS_DB_CONNECTION_FAILED",
		6102: "SYS_DB_QUERY_FAILED",
		6103: "SYS_DB_WRITE_FAILED",
		6200: "SYS_CACHE_ERROR",
		6201: "SYS_REDIS_ERROR",
		6202: "SYS_REDIS_CONNECTION_FAILED",
		6300: "SYS_EXTERNAL_API_ERROR",
		6301: "SYS_EXTERNAL_API_TIMEOUT",
		6302: "SYS_MODEL_API_ERROR",
		6303: "SYS_MODEL_API_TIMEOUT",
		6400: "SYS_RATE_LIMIT_EXCEEDED",
		6401: "SYS_QUOTA_EXCEEDED",
		6402: "SYS_CIRCUIT_BREAKER_OPEN",
		6500: "SYS_CONFIG_ERROR",
		6501: "SYS_CONFIG_NOT_FOUND",
	}

	if codeStr, ok := errorCodeMap[code]; ok {
		return codeStr
	}
	return fmt.Sprintf("ERR_%d", code)
}

// ErrorHandler 错误处理中间件
func ErrorHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		// 检查是否有错误
		if len(c.Errors) > 0 {
			err := c.Errors.Last()
			handleError(c, err.Err, c.GetString("request_id"))
		}
	}
}

// RecoveryWithErrorHandler Panic恢复中间件（带错误处理）
func RecoveryWithErrorHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				requestID := GetRequestID(c)

				// 构建错误响应
				var stackTrace string
				if gin.Mode() != gin.ReleaseMode {
					stackTrace = string(debug.Stack())
					fmt.Printf("[PANIC RECOVERED] %v\n%s\n", r, stackTrace)
				}

				// 记录日志
				fmt.Fprintf(os.Stderr, "[PANIC] requestId=%s path=%s error=%v stack=%s\n",
					requestID, c.Request.URL.Path, r, stackTrace)

				// 返回错误响应
				timestamp := time.Now().Format(time.RFC3339)
				c.AbortWithStatusJSON(http.StatusInternalServerError, Response{
					Success:   false,
					Data:      nil,
					Error:     &ErrorInfo{Code: "SYS_INTERNAL", Message: "服务器内部错误"},
					Timestamp: timestamp,
				})
			}
		}()

		c.Next()
	}
}

// handleError 处理错误
func handleError(c *gin.Context, err error, requestID string) {
	if err == nil {
		return
	}

	// 提取时间戳
	timestamp := time.Now().Format(time.RFC3339)

	// 处理 AppError
	if appErr, ok := err.(*errors.AppError); ok {
		c.AbortWithStatusJSON(appErr.HttpStatus, Response{
			Success:   false,
			Data:      nil,
			Error:     &ErrorInfo{Code: intToStringErrorCode(appErr.Code), Message: appErr.Message},
			Timestamp: timestamp,
		})
		return
	}

	// 处理标准 error
	c.AbortWithStatusJSON(http.StatusInternalServerError, Response{
		Success:   false,
		Data:      nil,
		Error:     &ErrorInfo{Code: "SYS_INTERNAL", Message: err.Error()},
		Timestamp: timestamp,
	})
}

// NotFoundHandler 404处理中间件
// 注意：此中间件不再阻止请求，而是通过 c.Next() 让请求继续传递
// Gin会在没有路由匹配时调用 NoRoute 处理器
func NotFoundHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 先调用 c.Next() 让请求继续传递到路由
		// 如果有路由匹配，路由处理器会处理请求
		// 如果没有路由匹配，Gin会调用 NoRoute 处理器
		c.Next()

		// 只有在请求未被处理且状态码为404时才返回错误
		// c.Writer.Written() 检查是否已经有响应被写入
		if !c.Writer.Written() && c.Writer.Status() == http.StatusNotFound {
			timestamp := time.Now().Format(time.RFC3339)
			c.AbortWithStatusJSON(http.StatusNotFound, Response{
				Success:   false,
				Data:      nil,
				Error:     &ErrorInfo{Code: "SYS_NOT_FOUND", Message: fmt.Sprintf("路由 %s %s 不存在", c.Request.Method, c.Request.URL.Path)},
				Timestamp: timestamp,
			})
		}
	}
}

// logError 记录错误日志
func logError(c *gin.Context, err error, requestID string) {
	var code int
	var errorType errors.ErrorType
	var message string

	if appErr, ok := err.(*errors.AppError); ok {
		code = appErr.Code
		errorType = appErr.Type
		message = appErr.Message
	} else {
		code = errors.CodeInternalError
		errorType = errors.TypeInternal
		message = err.Error()
	}

	// 根据错误级别选择日志级别
	level := "ERROR"
	if appErr, ok := err.(*errors.AppError); ok {
		if appErr.Level == errors.LevelWarning {
			level = "WARN"
		}
	}

	logEntry := map[string]interface{}{
		"timestamp": time.Now().Format(time.RFC3339),
		"level":     level,
		"code":      code,
		"type":      errorType,
		"message":   message,
		"requestId": requestID,
		"path":      c.Request.URL.Path,
		"method":    c.Request.Method,
		"ip":        c.ClientIP(),
	}

	logEntryJSON, _ := json.Marshal(logEntry) // #nosec G307 - 日志记录安全
	fmt.Fprintf(os.Stderr, "%s\n", string(logEntryJSON))
}
