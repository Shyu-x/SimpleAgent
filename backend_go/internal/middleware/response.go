/**
 * 统一响应格式中间件
 * 标准化所有 API 响应格式为: {success: bool, data: any, error: {code, message}, timestamp}
 */

package middleware

import (
	"fmt"
	"net/http"
	"runtime/debug"
	"time"

	"github.com/gin-gonic/gin"
)

// Response 统一响应结构
type Response struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   *ErrorInfo  `json:"error,omitempty"`
	Timestamp string   `json:"timestamp"`
}

// ErrorInfo 错误信息结构
type ErrorInfo struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// SuccessResponse 返回成功响应
func SuccessResponse(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, Response{
		Success:   true,
		Data:      data,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
}

// CreatedResponse 返回创建成功响应
func CreatedResponse(c *gin.Context, data interface{}) {
	c.JSON(http.StatusCreated, Response{
		Success:   true,
		Data:      data,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
}

// ErrorResponse 返回错误响应
func ErrorResponse(c *gin.Context, status int, code, message string) {
	c.AbortWithStatusJSON(status, Response{
		Success:   false,
		Error:     &ErrorInfo{Code: code, Message: message},
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
}

// BadRequestError 返回 400 错误
func BadRequestError(c *gin.Context, message string) {
	ErrorResponse(c, http.StatusBadRequest, "VAL_INVALID", message)
}

// BadRequestResponse 返回 400 错误响应 (带详情)
func BadRequestResponse(c *gin.Context, message string, detail string) {
	ErrorResponse(c, http.StatusBadRequest, "VAL_INVALID", fmt.Sprintf("%s: %s", message, detail))
}

// NotFoundResponse 返回 404 错误响应
func NotFoundResponse(c *gin.Context, message string, detail string) {
	ErrorResponse(c, http.StatusNotFound, "SYS_NOT_FOUND", fmt.Sprintf("%s: %s", message, detail))
}

// SuccessResponseWithMessage 返回成功响应 (带额外消息)
func SuccessResponseWithMessage(c *gin.Context, message string, data interface{}) {
	c.JSON(http.StatusOK, Response{
		Success:   true,
		Data:      data,
		Error:     &ErrorInfo{Code: "MSG", Message: message},
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
}

// UnauthorizedError 返回 401 错误
func UnauthorizedError(c *gin.Context, message string) {
	ErrorResponse(c, http.StatusUnauthorized, "AUTH_INVALID", message)
}

// ForbiddenError 返回 403 错误
func ForbiddenError(c *gin.Context, message string) {
	ErrorResponse(c, http.StatusForbidden, "AUTH_FORBIDDEN", message)
}

// NotFoundError 返回 404 错误
func NotFoundError(c *gin.Context, message string) {
	ErrorResponse(c, http.StatusNotFound, "SYS_NOT_FOUND", message)
}

// InternalServerError 返回 500 错误
func InternalServerError(c *gin.Context, message string) {
	ErrorResponse(c, http.StatusInternalServerError, "SYS_INTERNAL", message)
}

// ResponseWrapper 响应包装中间件 (用于包装非标准响应)
func ResponseWrapper() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		// 如果已经发送响应，则不处理
		if c.Writer.Written() {
			return
		}

		// 对于 404 响应
		if c.Writer.Status() == http.StatusNotFound {
			ErrorResponse(c, http.StatusNotFound, "SYS_NOT_FOUND", fmt.Sprintf("路由 %s %s 不存在", c.Request.Method, c.Request.URL.Path))
		}
	}
}

// RecoveryWithResponse Panic恢复中间件 (统一响应格式)
func RecoveryWithResponse() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				stack := string(debug.Stack())
				fmt.Printf("[PANIC RECOVERED] %v\n%s\n", err, stack)

				c.AbortWithStatusJSON(http.StatusInternalServerError, Response{
					Success:   false,
					Error:     &ErrorInfo{Code: "SYS_INTERNAL", Message: "服务器内部错误"},
					Timestamp: time.Now().UTC().Format(time.RFC3339),
				})
			}
		}()

		c.Next()
	}
}

// GetRequestID 获取请求ID
func GetRequestID(c *gin.Context) string {
	if id := c.GetHeader("X-Request-ID"); id != "" {
		return id
	}
	if id := c.GetHeader("X-Trace-ID"); id != "" {
		return id
	}
	return ""
}
