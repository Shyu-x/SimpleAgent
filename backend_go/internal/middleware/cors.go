/**
 * CORS 中间件
 * 跨域资源共享配置
 */

package middleware

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// CORSConfig CORS配置
type CORSConfig struct {
	// 允许的来源列表
	AllowedOrigins []string
	// 允许的方法
	AllowedMethods []string
	// 允许的头部
	AllowedHeaders []string
	// 是否允许携带凭据
	AllowCredentials bool
	// 预检请求缓存时间
	MaxAge int
	// 暴露的头部
	ExposedHeaders []string
}

// DefaultCORSConfig 默认CORS配置
func DefaultCORSConfig() CORSConfig {
	return CORSConfig{
		AllowedOrigins: []string{
			"http://localhost:8080",
			"http://localhost:3000",
			"http://127.0.0.1:8080",
			"http://127.0.0.1:3000",
		},
		AllowedMethods: []string{
			http.MethodGet,
			http.MethodPost,
			http.MethodPut,
			http.MethodDelete,
			http.MethodPatch,
			http.MethodOptions,
		},
		AllowedHeaders: []string{
			"Origin",
			"Content-Type",
			"Accept",
			"Authorization",
			"X-Requested-With",
			"X-Trace-Id",
			"X-Span-Id",
			"X-Client-Id",
		},
		AllowCredentials: true,
		MaxAge:           86400,
		ExposedHeaders: []string{
			"X-Trace-Id",
			"X-RateLimit-Limit",
			"X-RateLimit-Remaining",
			"X-RateLimit-Reset",
		},
	}
}

// DevelopmentCORSConfig 开发环境CORS配置（允许所有来源）
func DevelopmentCORSConfig() CORSConfig {
	config := DefaultCORSConfig()
	config.AllowedOrigins = []string{"*"}
	config.AllowCredentials = false
	return config
}

// ProductionCORSConfig 生产环境CORS配置
func ProductionCORSConfig(allowedOrigins []string) CORSConfig {
	config := DefaultCORSConfig()
	config.AllowedOrigins = allowedOrigins
	config.MaxAge = 3600
	return config
}

// CORS CORS中间件
func CORS(config CORSConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")

		// 检查origin是否在允许列表中
		allowed := isOriginAllowed(origin, config.AllowedOrigins)

		// 如果没有origin（如Postman/curl），允许
		if origin == "" {
			allowed = true
		}

		// 开发环境或设置了通配符，允许
		if !allowed && len(config.AllowedOrigins) == 1 && config.AllowedOrigins[0] == "*" {
			allowed = true
		}

		if allowed {
			// 设置CORS头
			if config.AllowCredentials {
				c.Header("Access-Control-Allow-Credentials", "true")
			}

			if origin != "" && origin != "*" {
				c.Header("Access-Control-Allow-Origin", origin)
			} else if origin == "*" {
				// 严格模式下不允许credentials with *
				if !config.AllowCredentials {
					c.Header("Access-Control-Allow-Origin", "*")
				}
			}

			c.Header("Access-Control-Allow-Methods", strings.Join(config.AllowedMethods, ", "))
			c.Header("Access-Control-Allow-Headers", strings.Join(config.AllowedHeaders, ", "))
			c.Header("Access-Control-Max-Age", strconv.Itoa(config.MaxAge))

			if len(config.ExposedHeaders) > 0 {
				c.Header("Access-Control-Expose-Headers", strings.Join(config.ExposedHeaders, ", "))
			}
		}

		// 处理预检请求
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

// isOriginAllowed 检查origin是否允许
func isOriginAllowed(origin string, allowedOrigins []string) bool {
	if origin == "" {
		return false
	}

	for _, allowed := range allowedOrigins {
		if allowed == "*" {
			return true
		}
		if allowed == origin {
			return true
		}
		// 支持子域名匹配
		if strings.HasPrefix(allowed, "http://") || strings.HasPrefix(allowed, "https://") {
			if strings.HasPrefix(origin, allowed) {
				return true
			}
		}
	}
	return false
}

// DefaultCORS 默认CORS中间件
func DefaultCORS() gin.HandlerFunc {
	return CORS(DefaultCORSConfig())
}

// DevelopmentCORS 开发环境CORS中间件
func DevelopmentCORS() gin.HandlerFunc {
	return CORS(DevelopmentCORSConfig())
}

// ProductionCORS 生产环境CORS中间件
func ProductionCORS(allowedOrigins []string) gin.HandlerFunc {
	return CORS(ProductionCORSConfig(allowedOrigins))
}
