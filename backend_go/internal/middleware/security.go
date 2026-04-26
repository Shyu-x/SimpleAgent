/**
 * 安全中间件
 * 提供安全头、请求大小限制等功能
 * 注意: CORS功能已移至 cors.go
 */

package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// SecurityConfig 安全配置（不含CORS）
type SecurityConfig struct {
	// 请求限制
	MaxBodySize int64 // bytes
}

// DefaultSecurityConfig 默认安全配置
func DefaultSecurityConfig() SecurityConfig {
	return SecurityConfig{
		MaxBodySize: 10 * 1024 * 1024, // 10MB
	}
}

// getClientIP 获取客户端IP
func getClientIP(c *gin.Context) string {
	// 优先使用 X-Forwarded-For
	if xff := c.GetHeader("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	// 其次使用 X-Real-IP
	if xri := c.GetHeader("X-Real-IP"); xri != "" {
		return xri
	}
	return c.ClientIP()
}

// SecurityHeaders 安全头中间件
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		c.Next()
	}
}

// MaxBodySize 请求体大小限制中间件
func MaxBodySize(maxSize int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.ContentLength > maxSize {
			c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, gin.H{
				"code":    413,
				"message": "请求体过大",
				"data": gin.H{
					"detail": "请求体大小超过限制",
				},
			})
			return
		}

		// 限制body读取
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxSize)
		c.Next()
	}
}
