/**
 * 超时中间件
 * 提供请求超时控制
 */

package middleware

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// TimeoutConfig 超时配置
type TimeoutConfig struct {
	// 默认超时时间
	DefaultTimeout time.Duration
	// 按路径配置的超时时间
	PathTimeouts map[string]time.Duration
}

// DefaultTimeoutConfig 默认超时配置
func DefaultTimeoutConfig() TimeoutConfig {
	return TimeoutConfig{
		DefaultTimeout: 30 * time.Second,
		PathTimeouts:   make(map[string]time.Duration),
	}
}

// Timeout 超时中间件
func Timeout(config TimeoutConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 获取路径对应的超时时间
		timeout := config.DefaultTimeout
		if pathTimeout, ok := config.PathTimeouts[c.FullPath()]; ok {
			timeout = pathTimeout
		}

		// 创建超时上下文
		ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
		defer cancel()

		// 替换请求上下文
		c.Request = c.Request.WithContext(ctx)

		// 创建响应状态通道
		done := make(chan struct{})

		// 启动请求处理
		go func() {
			c.Next()
			close(done)
		}()

		// 等待响应或超时
		select {
		case <-done:
			// 请求处理完成
			return
		case <-ctx.Done():
			// 超时
			c.AbortWithStatusJSON(http.StatusGatewayTimeout, gin.H{
				"code":    504,
				"message": "请求超时",
				"data": gin.H{
					"detail": "请求处理超时，请稍后重试",
				},
			})
		}
	}
}

// TimeoutWithCancel 超时中间件（支持取消）
func TimeoutWithCancel(timeout time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
		defer cancel()

		c.Request = c.Request.WithContext(ctx)

		done := make(chan struct{})

		go func() {
			c.Next()
			close(done)
		}()

		select {
		case <-done:
			return
		case <-ctx.Done():
			c.AbortWithStatusJSON(http.StatusGatewayTimeout, gin.H{
				"code":    504,
				"message": "请求超时",
				"data": gin.H{
					"detail": "请求处理超时，请稍后重试",
				},
			})
		}
	}
}
