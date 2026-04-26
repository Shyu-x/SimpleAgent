/**
 * 统一响应格式
 * 定义标准的 API 响应结构
 * 格式: {success: bool, data: any, error: {code: string, message: string}, timestamp}
 *
 * 错误码格式: VAL_INVALID, AUTH_UNAUTHORIZED, AGENT_ERROR, RAG_ERROR, TOOL_ERROR, SYS_INTERNAL
 */

package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// Response 统一响应格式
type Response struct {
	Success   bool        `json:"success"`
	Data      interface{} `json:"data,omitempty"`
	Error     *ErrorInfo  `json:"error,omitempty"`
	Timestamp string      `json:"timestamp"`
}

// ErrorInfo 错误信息结构
type ErrorInfo struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// SuccessResponse 成功响应
func SuccessResponse(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, Response{
		Success:   true,
		Data:      data,
		Timestamp: time.Now().Format(time.RFC3339),
	})
}

// SuccessResponseWithMessage 成功响应（自定义消息）
func SuccessResponseWithMessage(c *gin.Context, message string, data interface{}) {
	c.JSON(http.StatusOK, Response{
		Success:   true,
		Data:      data,
		Timestamp: time.Now().Format(time.RFC3339),
	})
}

// CreatedResponse 创建成功响应
func CreatedResponse(c *gin.Context, data interface{}) {
	c.JSON(http.StatusCreated, Response{
		Success:   true,
		Data:      data,
		Timestamp: time.Now().Format(time.RFC3339),
	})
}

// ErrorResponseFromCode 使用错误码创建错误响应
func ErrorResponseFromCode(c *gin.Context, httpStatus int, code string, message string) {
	c.JSON(httpStatus, Response{
		Success: false,
		Data:   nil,
		Error: &ErrorInfo{
			Code:    code,
			Message: message,
		},
		Timestamp: time.Now().Format(time.RFC3339),
	})
}

// BadRequestResponse 400 错误响应（支持详情）
func BadRequestResponse(c *gin.Context, message string, detail string) {
	if detail != "" {
		ErrorResponseFromCode(c, http.StatusBadRequest, "VAL_INVALID", message+": "+detail)
	} else {
		ErrorResponseFromCode(c, http.StatusBadRequest, "VAL_INVALID", message)
	}
}

// UnauthorizedResponse 401 错误响应
func UnauthorizedResponse(c *gin.Context, message string) {
	ErrorResponseFromCode(c, http.StatusUnauthorized, "AUTH_UNAUTHORIZED", message)
}

// ForbiddenResponse 403 错误响应
func ForbiddenResponse(c *gin.Context, message string) {
	ErrorResponseFromCode(c, http.StatusForbidden, "AUTH_FORBIDDEN", message)
}

// NotFoundResponse 404 错误响应（支持详情）
func NotFoundResponse(c *gin.Context, message string, detail string) {
	if detail != "" {
		ErrorResponseFromCode(c, http.StatusNotFound, "SYS_NOT_FOUND", message+": "+detail)
	} else {
		ErrorResponseFromCode(c, http.StatusNotFound, "SYS_NOT_FOUND", message)
	}
}

// TooManyRequestsResponse 429 错误响应
func TooManyRequestsResponse(c *gin.Context, message string) {
	ErrorResponseFromCode(c, http.StatusTooManyRequests, "SYS_RATE_LIMIT_EXCEEDED", message)
}

// InternalServerErrorResponse 500 错误响应
func InternalServerErrorResponse(c *gin.Context, message string) {
	ErrorResponseFromCode(c, http.StatusInternalServerError, "SYS_INTERNAL", message)
}

// PageResponse 分页响应
type PageResponse struct {
	Items      interface{} `json:"items"`
	Total      int64      `json:"total"`
	Page       int        `json:"page"`
	PageSize   int        `json:"page_size"`
	TotalPages int        `json:"total_pages"`
}

// PaginatedResponse 分页响应
func PaginatedResponse(c *gin.Context, items interface{}, total int64, page, pageSize int) {
	totalPages := int(total) / pageSize
	if int(total)%pageSize > 0 {
		totalPages++
	}

	SuccessResponse(c, PageResponse{
		Items:      items,
		Total:      total,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: totalPages,
	})
}

// HealthResponse 健康检查响应
type HealthResponse struct {
	Status    string `json:"status"`
	Service   string `json:"service"`
	Version   string `json:"version"`
	Timestamp string `json:"timestamp"`
}

// HealthCheckResponse 健康检查响应
func HealthCheckResponse(c *gin.Context, service, version string) {
	c.JSON(http.StatusOK, HealthResponse{
		Status:    "ok",
		Service:   service,
		Version:   version,
		Timestamp: time.Now().Format(time.RFC3339),
	})
}
