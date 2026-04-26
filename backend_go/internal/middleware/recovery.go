/**
 * Panic恢复中间件
 * 捕获Panic并返回统一错误响应
 * 注意: Response和ErrorInfo类型已移至response.go
 */

package middleware

import (
	"fmt"
	"net/http"
	"runtime/debug"
	"time"

	"github.com/gin-gonic/gin"
)

// RecoveryConfig 恢复中间件配置
type RecoveryConfig struct {
	// 是否打印堆栈
	PrintStack bool
	// 自定义错误消息
	ErrorMessage string
}

// DefaultRecoveryConfig 默认恢复配置
func DefaultRecoveryConfig() RecoveryConfig {
	return RecoveryConfig{
		PrintStack:   true,
		ErrorMessage: "内部服务器错误",
	}
}

// Recovery Panic恢复中间件
func Recovery(config RecoveryConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				// 获取堆栈信息
				stack := string(debug.Stack())

				// 记录错误日志
				if config.PrintStack {
					fmt.Printf("[PANIC RECOVERED] %v\n%s\n", err, stack)
				}

				// 返回统一错误响应
				c.AbortWithStatusJSON(http.StatusInternalServerError, Response{
					Success: false,
					Error: &ErrorInfo{
						Code:    "SYS_INTERNAL",
						Message: config.ErrorMessage,
					},
					Timestamp: time.Now().UTC().Format(time.RFC3339),
				})
			}
		}()

		c.Next()
	}
}

// DefaultRecovery 默认恢复中间件（使用默认配置）
func DefaultRecovery() gin.HandlerFunc {
	return Recovery(DefaultRecoveryConfig())
}

// RecoveryWithLogger 带日志的恢复中间件
func RecoveryWithLogger(logger func(format string, args ...interface{})) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				stack := string(debug.Stack())
				logger("[PANIC] %v\n%s", err, stack)

				c.AbortWithStatusJSON(http.StatusInternalServerError, Response{
					Success: false,
					Error: &ErrorInfo{
						Code:    "SYS_INTERNAL",
						Message: "内部服务器错误",
					},
					Timestamp: time.Now().UTC().Format(time.RFC3339),
				})
			}
		}()

		c.Next()
	}
}
