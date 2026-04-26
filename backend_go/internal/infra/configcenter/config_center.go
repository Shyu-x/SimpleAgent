// Package configcenter 配置中心
package configcenter

import (
	"context"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/spf13/viper"

	"github.com/rs/zerolog/log"
)

// ConfigChangeHandler 配置变更处理器
type ConfigChangeHandler func(key string, value interface{})

// ConfigCenter 配置中心
type ConfigCenter struct {
	viper       *viper.Viper
	handlers    map[string][]ConfigChangeHandler
	mu          sync.RWMutex
	ctx         context.Context
	cancel      context.CancelFunc
}

// Config 配置项
type Config struct {
	Name      string
	Type      string
	Value     interface{}
	Timestamp time.Time
}

// New 创建配置中心
func New(configPath string) (*ConfigCenter, error) {
	ctx, cancel := context.WithCancel(context.Background())
	cc := &ConfigCenter{
		viper:    viper.New(),
		handlers: make(map[string][]ConfigChangeHandler),
		ctx:      ctx,
		cancel:   cancel,
	}
	cc.viper.SetConfigFile(configPath)
	cc.viper.SetConfigType("yaml")
	if err := cc.viper.ReadInConfig(); err != nil {
		log.Warn().Err(err).Msg("配置文件读取失败，使用默认配置")
	}
	cc.viper.WatchConfig()
	cc.viper.OnConfigChange(func(e fsnotify.Event) {
		log.Info().Str("file", e.Name).Msg("配置文件变更")
		cc.notifyHandlers()
	})
	go cc.watchChanges()
	return cc, nil
}

func (cc *ConfigCenter) watchChanges() {
	ticker := time.NewTicker(30 * time.Second)
	for {
		select {
		case <-ticker.C:
			cc.notifyHandlers()
		case <-cc.ctx.Done():
			return
		}
	}
}

func (cc *ConfigCenter) notifyHandlers() {
	cc.mu.RLock()
	defer cc.mu.RUnlock()
	for key, handlers := range cc.handlers {
		value := cc.viper.Get(key)
		for _, handler := range handlers {
			go handler(key, value)
		}
	}
}

// Get 获取配置值
func (cc *ConfigCenter) Get(key string) interface{} {
	return cc.viper.Get(key)
}

// GetString 获取字符串配置
func (cc *ConfigCenter) GetString(key string) string {
	return cc.viper.GetString(key)
}

// GetInt 获取整数配置
func (cc *ConfigCenter) GetInt(key string) int {
	return cc.viper.GetInt(key)
}

// GetFloat64 获取浮点数配置
func (cc *ConfigCenter) GetFloat64(key string) float64 {
	return cc.viper.GetFloat64(key)
}

// GetBool 获取布尔配置
func (cc *ConfigCenter) GetBool(key string) bool {
	return cc.viper.GetBool(key)
}

// GetDuration 获取时间配置
func (cc *ConfigCenter) GetDuration(key string) time.Duration {
	return cc.viper.GetDuration(key)
}

// Set 设置配置值
func (cc *ConfigCenter) Set(key string, value interface{}) error {
	cc.viper.Set(key, value)
	return cc.viper.WriteConfig()
}

// SetDefault 设置默认配置
func (cc *ConfigCenter) SetDefault(key string, value interface{}) {
	cc.viper.SetDefault(key, value)
}

// Subscribe 订阅配置变更
func (cc *ConfigCenter) Subscribe(key string, handler ConfigChangeHandler) {
	cc.mu.Lock()
	defer cc.mu.Unlock()
	cc.handlers[key] = append(cc.handlers[key], handler)
}

// Unsubscribe 取消订阅
func (cc *ConfigCenter) Unsubscribe(key string) {
	cc.mu.Lock()
	defer cc.mu.Unlock()
	delete(cc.handlers, key)
}

// GetAll 获取所有配置
func (cc *ConfigCenter) GetAll() map[string]interface{} {
	return cc.viper.AllSettings()
}

// Close 关闭配置中心
func (cc *ConfigCenter) Close() error {
	cc.cancel()
	return nil
}
