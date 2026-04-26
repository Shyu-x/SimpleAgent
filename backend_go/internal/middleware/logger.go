/**
 * 请求日志中间件
 * 记录请求详情和响应信息
 */

package middleware

import (
	"fmt"
	"io"
	"os"
	"time"

	"github.com/gin-gonic/gin"
)

// LoggerConfig 日志配置
type LoggerConfig struct {
	// 日志输出位置
	Output io.Writer
	// 是否包含请求体
	IncludeBody bool
	// 是否包含响应体
	IncludeResponseBody bool
	// 日志格式: json | text
	Format string
}

// DefaultLoggerConfig 默认日志配置
func DefaultLoggerConfig() LoggerConfig {
	return LoggerConfig{
		Output:              os.Stdout,
		IncludeBody:         false,
		IncludeResponseBody: false,
		Format:              "text",
	}
}

// RequestLogger 请求日志中间件
func RequestLogger(config LoggerConfig) gin.HandlerFunc {
	if config.Output == nil {
		config.Output = os.Stdout
	}

	return func(c *gin.Context) {
		// 开始时间
		start := time.Now()

		// 请求路径
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		// 获取请求ID（如果存在）
		traceID := c.GetHeader("X-Trace-Id")
		if traceID == "" {
			traceID = c.GetHeader("X-Request-Id")
		}

		// 处理请求
		c.Next()

		// 结束时间
		end := time.Now()
		latency := end.Sub(start)

		// 状态码
		status := c.Writer.Status()

		// 客户端IP
		clientIP := c.ClientIP()

		// 方法
		method := c.Request.Method

		// 错误信息（如果有）
		var errMsg string
		if len(c.Errors) > 0 {
			errMsg = c.Errors.String()
		}

		// 构建日志格式
		if config.Format == "json" {
			// JSON格式日志
			logEntry := fmt.Sprintf(`{"time":"%s","trace_id":"%s","client_ip":"%s","method":"%s","path":"%s","query":"%s","status":%d,"latency_ms":%d,"error":"%s"}`,
				end.Format(time.RFC3339),
				traceID,
				clientIP,
				method,
				path,
				query,
				status,
				latency.Milliseconds(),
				errMsg,
			)
			fmt.Fprintln(config.Output, logEntry)
		} else {
			// Text格式日志
			logEntry := fmt.Sprintf("[%s] %s | %3d | %13v | %15s | %-7s %s",
				end.Format("2006-01-02 15:04:05"),
				traceID,
				status,
				latency,
				clientIP,
				method,
				path,
			)
			if query != "" {
				logEntry += fmt.Sprintf("?%s", query)
			}
			if errMsg != "" {
				logEntry += fmt.Sprintf(" | error: %s", errMsg)
			}
			fmt.Fprintln(config.Output, logEntry)
		}
	}
}

// DefaultRequestLogger 默认请求日志中间件
func DefaultRequestLogger() gin.HandlerFunc {
	return RequestLogger(DefaultLoggerConfig())
}

// DetailedRequestLogger 详细请求日志中间件
func DetailedRequestLogger() gin.HandlerFunc {
	config := DefaultLoggerConfig()
	config.IncludeBody = true
	config.IncludeResponseBody = true
	return RequestLogger(config)
}
