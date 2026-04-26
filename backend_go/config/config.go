package config

import (
	"fmt"
	"os"
	"strings"
	"sync"

	"github.com/spf13/viper"
)

// Config 全局配置实例
var (
	Config *viper.Viper
	once   sync.Once
)

// ConfigStruct 配置结构体
type ConfigStruct struct {
	App       AppConfig       `mapstructure:"app"`
	Database  DatabaseConfig  `mapstructure:"database"`
	Redis     RedisConfig     `mapstructure:"redis"`
	MiniMax   MiniMaxConfig   `mapstructure:"minimax"`
	Server    ServerConfig    `mapstructure:"server"`
	Metrics   MetricsConfig   `mapstructure:"metrics"`
	Log       LogConfig       `mapstructure:"log"`
	RateLimiter RateLimiterConfig `mapstructure:"rate_limiter"`
	CircuitBreaker CircuitBreakerConfig `mapstructure:"circuit_breaker"`
	CORS      CORSConfig      `mapstructure:"cors"`
	RAG       RAGConfig       `mapstructure:"rag"`
	Agent     AgentConfig     `mapstructure:"agent"`
	Qdrant    QdrantConfig    `mapstructure:"qdrant"`
}

// AppConfig 应用配置
type AppConfig struct {
	Env string `mapstructure:"env"`
	Name string `mapstructure:"name"`
	Host string `mapstructure:"host"`
	Port int    `mapstructure:"port"`
}

// DatabaseConfig 数据库配置
type DatabaseConfig struct {
	Host           string `mapstructure:"host"`
	Port           int    `mapstructure:"port"`
	User           string `mapstructure:"user"`
	Password       string `mapstructure:"password"`
	Name           string `mapstructure:"name"`
	SSLMode        string `mapstructure:"ssl_mode"`
	MaxConnections int    `mapstructure:"max_connections"`
}

// RedisConfig Redis配置
type RedisConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	Password string `mapstructure:"password"`
	DB       int    `mapstructure:"db"`
	PoolSize int    `mapstructure:"pool_size"`
}

// MiniMaxConfig MiniMax API配置
type MiniMaxConfig struct {
	APIKey  string `mapstructure:"api_key"`
	BaseURL string `mapstructure:"base_url"`
	Model   string `mapstructure:"model"`
	Timeout int    `mapstructure:"timeout"`
}

// ServerConfig 服务器配置
type ServerConfig struct {
	Host string `mapstructure:"host"`
	Port int    `mapstructure:"port"`
	Mode string `mapstructure:"mode"`
}

// MetricsConfig 指标配置
type MetricsConfig struct {
	Enabled bool   `mapstructure:"enabled"`
	Port    int    `mapstructure:"port"`
	Path    string `mapstructure:"path"`
}

// LogConfig 日志配置
type LogConfig struct {
	Level  string `mapstructure:"level"`
	Format string `mapstructure:"format"`
	Output string `mapstructure:"output"`
}

// RateLimiterConfig 限流器配置
type RateLimiterConfig struct {
	Enabled    bool    `mapstructure:"enabled"`
	Capacity   int     `mapstructure:"capacity"`
	RefillRate int     `mapstructure:"refill_rate"`
	Window     float64 `mapstructure:"window"`
}

// CircuitBreakerConfig 熔断器配置
type CircuitBreakerConfig struct {
	Enabled          bool   `mapstructure:"enabled"`
	FailureThreshold int    `mapstructure:"failure_threshold"`
	SuccessThreshold int    `mapstructure:"success_threshold"`
	Timeout          int    `mapstructure:"timeout"`
}

// CORSConfig CORS配置
type CORSConfig struct {
	Enabled        bool     `mapstructure:"enabled"`
	AllowedOrigins []string `mapstructure:"allowed_origins"`
	AllowedMethods []string `mapstructure:"allowed_methods"`
	AllowedHeaders []string `mapstructure:"allowed_headers"`
}

// RAGConfig RAG配置
type RAGConfig struct {
	ChunkSize    int  `mapstructure:"chunk_size"`
	ChunkOverlap int  `mapstructure:"chunk_overlap"`
	TopK         int  `mapstructure:"top_k"`
	Rerank       bool `mapstructure:"rerank"`
	RerankTopK   int  `mapstructure:"rerank_top_k"`
}

// AgentConfig Agent配置
type AgentConfig struct {
	MaxIterations int   `mapstructure:"max_iterations"`
	Timeout       int   `mapstructure:"timeout"`
	Tools         []struct {
		Name    string `mapstructure:"name"`
		Enabled bool   `mapstructure:"enabled"`
	} `mapstructure:"tools"`
}

// QdrantConfig Qdrant向量数据库配置
type QdrantConfig struct {
	Host       string `mapstructure:"host"`
	Port       int    `mapstructure:"port"`
	Collection string `mapstructure:"collection"`
	Dimension  int    `mapstructure:"dimension"`
}

// InitConfig 初始化配置（单例模式）
func InitConfig(configPath string) error {
	var initErr error
	once.Do(func() {
		Config = viper.New()

		// 设置配置文件
		if configPath != "" {
			Config.SetConfigFile(configPath)
		} else {
			Config.SetConfigName("config")
			Config.AddConfigPath(".")
			Config.AddConfigPath("./config")
		}
		Config.SetConfigType("yaml")

		// 环境变量前缀
		Config.SetEnvPrefix("APP")
		Config.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

		// 自动环境变量映射
		Config.AutomaticEnv()

		// 设置默认值
		setDefaults()

		// 读取配置文件
		if err := Config.ReadInConfig(); err != nil {
			if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
				initErr = fmt.Errorf("读取配置文件失败: %w", err)
				return
			}
		}

		// 处理环境变量替换
		processEnvVars()

		// 验证配置
		if err := validateConfig(); err != nil {
			initErr = fmt.Errorf("配置验证失败: %w", err)
			return
		}
	})
	return initErr
}

// InitConfigWithEnv 初始化配置并指定环境
func InitConfigWithEnv(configPath, env string) error {
	// 设置环境变量
	if env != "" {
		os.Setenv("APP_ENV", env)
	}

	// 加载配置
	if err := InitConfig(configPath); err != nil {
		return err
	}

	// 根据环境覆盖配置
	if env != "" {
		Config.Set("app.env", env)
	}

	return nil
}

// setDefaults 设置默认值
func setDefaults() {
	// 应用默认值
	Config.SetDefault("app.env", "development")
	Config.SetDefault("app.name", "ai-chat-backend")
	Config.SetDefault("app.host", "0.0.0.0")
	Config.SetDefault("app.port", 30000)

	// 服务器默认值
	Config.SetDefault("server.port", 30000)
	Config.SetDefault("server.mode", "debug")

	// MiniMax默认值
	Config.SetDefault("minimax.api_key", "")
	Config.SetDefault("minimax.base_url", "https://api.minimaxi.com/anthropic")
	Config.SetDefault("minimax.model", "MiniMax-M2.7")
	Config.SetDefault("minimax.timeout", 60)

	// 数据库默认值
	Config.SetDefault("database.host", "localhost")
	Config.SetDefault("database.port", 5432)
	Config.SetDefault("database.user", "postgres")
	Config.SetDefault("database.password", "postgres")
	Config.SetDefault("database.name", "ai_chat")
	Config.SetDefault("database.ssl_mode", "disable")
	Config.SetDefault("database.max_connections", 20)

	// Redis默认值
	Config.SetDefault("redis.host", "localhost")
	Config.SetDefault("redis.port", 6379)
	Config.SetDefault("redis.db", 0)
	Config.SetDefault("redis.pool_size", 10)

	// Qdrant默认值
	Config.SetDefault("qdrant.host", "localhost")
	Config.SetDefault("qdrant.port", 6333)
	Config.SetDefault("qdrant.collection", "chat_documents")
	Config.SetDefault("qdrant.dimension", 1024)

	// 日志默认值
	Config.SetDefault("log.level", "info")
	Config.SetDefault("log.format", "json")
	Config.SetDefault("log.output", "stdout")

	// 限流器默认值
	Config.SetDefault("rate_limiter.enabled", true)
	Config.SetDefault("rate_limiter.capacity", 100)
	Config.SetDefault("rate_limiter.refill_rate", 50)
	Config.SetDefault("rate_limiter.window", 1.0)

	// 熔断器默认值
	Config.SetDefault("circuit_breaker.enabled", true)
	Config.SetDefault("circuit_breaker.failure_threshold", 5)
	Config.SetDefault("circuit_breaker.success_threshold", 2)
	Config.SetDefault("circuit_breaker.timeout", 60)

	// CORS默认值
	Config.SetDefault("cors.enabled", true)
	Config.SetDefault("cors.allowed_origins", []string{"http://localhost:8080", "http://localhost:3000"})
	Config.SetDefault("cors.allowed_methods", []string{"GET", "POST", "PUT", "DELETE"})
	Config.SetDefault("cors.allowed_headers", []string{"*"})

	// RAG默认值
	Config.SetDefault("rag.chunk_size", 512)
	Config.SetDefault("rag.chunk_overlap", 50)
	Config.SetDefault("rag.top_k", 5)
	Config.SetDefault("rag.rerank", true)
	Config.SetDefault("rag.rerank_top_k", 10)

	// Agent默认值
	Config.SetDefault("agent.max_iterations", 10)
	Config.SetDefault("agent.timeout", 120)

	// 指标默认值
	Config.SetDefault("metrics.enabled", true)
	Config.SetDefault("metrics.port", 9090)
	Config.SetDefault("metrics.path", "/metrics")
}

// processEnvVars 处理环境变量替换
func processEnvVars() {
	for _, key := range Config.AllKeys() {
		value := Config.GetString(key)
		if strings.HasPrefix(value, "${") && strings.HasSuffix(value, "}") {
			envKey := value[2 : len(value)-1]
			if envValue := os.Getenv(envKey); envValue != "" {
				Config.Set(key, envValue)
			}
		}
	}
}

// validateConfig 验证配置
func validateConfig() error {
	// MiniMax API Key 验证
	if Config.GetString("minimax.api_key") == "" {
		return fmt.Errorf("minimax.api_key 不能为空，请设置 MINIMAX_API_KEY 环境变量")
	}

	// 端口验证
	if Config.GetInt("app.port") <= 0 || Config.GetInt("app.port") > 65535 {
		return fmt.Errorf("app.port 必须介于 1-65535 之间")
	}

	// 环境验证
	env := Config.GetString("app.env")
	if env != "development" && env != "production" && env != "test" {
		return fmt.Errorf("app.env 必须为 development, production 或 test")
	}

	return nil
}

// GetConfig 获取配置结构体
func GetConfig() *ConfigStruct {
	var cfg ConfigStruct
	if err := Config.Unmarshal(&cfg); err != nil {
		panic(fmt.Errorf("配置反序列化失败: %w", err))
	}
	return &cfg
}

// GetString 获取字符串配置
func GetString(key string) string {
	return Config.GetString(key)
}

// GetInt 获取整数配置
func GetInt(key string) int {
	return Config.GetInt(key)
}

// GetBool 获取布尔配置
func GetBool(key string) bool {
	return Config.GetBool(key)
}

// GetFloat64 获取浮点数配置
func GetFloat64(key string) float64 {
	return Config.GetFloat64(key)
}

// GetServerAddr 获取服务器地址
func GetServerAddr() string {
	host := Config.GetString("app.host")
	port := Config.GetInt("app.port")
	return fmt.Sprintf("%s:%d", host, port)
}

// GetEnv 获取当前环境
func GetEnv() string {
	return Config.GetString("app.env")
}

// IsDevelopment 检查是否为开发环境
func IsDevelopment() bool {
	return GetEnv() == "development"
}

// IsProduction 检查是否为生产环境
func IsProduction() bool {
	return GetEnv() == "production"
}

// IsTest 检查是否为测试环境
func IsTest() bool {
	return GetEnv() == "test"
}

// ReloadConfig 热重载配置
// viper的WatchConfig是设置配置变更回调的函数，无返回值
// 重新读取配置文件以实现热重载
func ReloadConfig() error {
	return Config.ReadInConfig()
}

// GetMiniMaxConfig 获取MiniMax配置
func GetMiniMaxConfig() MiniMaxConfig {
	return MiniMaxConfig{
		APIKey:  Config.GetString("minimax.api_key"),
		BaseURL: Config.GetString("minimax.base_url"),
		Model:   Config.GetString("minimax.model"),
		Timeout: Config.GetInt("minimax.timeout"),
	}
}

// GetRedisConfig 获取Redis配置
func GetRedisConfig() RedisConfig {
	return RedisConfig{
		Host:     Config.GetString("redis.host"),
		Port:     Config.GetInt("redis.port"),
		Password: Config.GetString("redis.password"),
		DB:       Config.GetInt("redis.db"),
		PoolSize: Config.GetInt("redis.pool_size"),
	}
}

// GetDatabaseConfig 获取数据库配置
func GetDatabaseConfig() DatabaseConfig {
	return DatabaseConfig{
		Host:           Config.GetString("database.host"),
		Port:           Config.GetInt("database.port"),
		User:           Config.GetString("database.user"),
		Password:       Config.GetString("database.password"),
		Name:           Config.GetString("database.name"),
		SSLMode:        Config.GetString("database.ssl_mode"),
		MaxConnections: Config.GetInt("database.max_connections"),
	}
}
