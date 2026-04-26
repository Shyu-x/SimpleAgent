// Package alert 告警管理
// 支持可配置触发条件的告警系统
package alert

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/rs/zerolog/log"
)

// AlertLevel 告警级别
type AlertLevel int

const (
	LevelInfo     AlertLevel = iota // 信息
	LevelWarning                    // 警告
	LevelCritical                   // 严重
)

// String 转换为字符串
func (l AlertLevel) String() string {
	switch l {
	case LevelInfo:
		return "info"
	case LevelWarning:
		return "warning"
	case LevelCritical:
		return "critical"
	default:
		return "unknown"
	}
}

// Alert 告警结构
type Alert struct {
	ID        string                 `json:"id"`
	Level     AlertLevel             `json:"level"`
	Title     string                 `json:"title"`
	Message   string                 `json:"message"`
	Source    string                 `json:"source"`
	Timestamp time.Time              `json:"timestamp"`
	Metadata  map[string]interface{} `json:"metadata"`
	Resolved  bool                   `json:"resolved"`
}

// AlertHandler 告警处理器接口
type AlertHandler interface {
	Handle(*Alert) error
}

// TriggerCondition 触发条件
type TriggerCondition struct {
	// 监控指标名称
	MetricName string
	// 操作符: >, <, >=, <=, ==, !=
	Operator string
	// 阈值
	Threshold float64
	// 持续时间(秒)，指标超过阈值持续此时间才触发
	Duration int
	// 冷却时间(秒)，触发后等待此时间才能再次触发
	Cooldown int
	// 告警级别
	Level AlertLevel
	// 启用状态
	Enabled bool
}

// TriggerState 触发状态
type TriggerState struct {
	Condition   *TriggerCondition
	FirstSeen   time.Time
	LastTrigger time.Time
	Triggered   bool
}

// AlertManager 告警管理器
type AlertManager struct {
	handlers       []AlertHandler
	alerts         []*Alert
	mu             sync.RWMutex
	maxAlerts      int
	alertCounter   int64
	ctx            context.Context
	cancel         context.CancelFunc
	triggers       map[string]*TriggerState
	triggerMu      sync.RWMutex
	lastMetricVals map[string]float64
	metricMu       sync.RWMutex
}

// 全局Prometheus指标
var (
	alertsSentTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "alerts_sent_total",
		Help: "Total number of alerts sent",
	}, []string{"level", "source"})

	alertsResolvedTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "alerts_resolved_total",
		Help: "Total number of alerts resolved",
	}, []string{"level", "source"})

	alertTriggersTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "alert_triggers_total",
		Help: "Total number of alert triggers",
	}, []string{"trigger_name"})

	activeAlertsGauge = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "active_alerts",
		Help: "Current number of active alerts",
	}, []string{"level"})
)

// NewAlertManager 创建告警管理器
func NewAlertManager() *AlertManager {
	ctx, cancel := context.WithCancel(context.Background())
	am := &AlertManager{
		handlers:       make([]AlertHandler, 0),
		alerts:          make([]*Alert, 0),
		maxAlerts:       1000,
		ctx:             ctx,
		cancel:          cancel,
		triggers:        make(map[string]*TriggerState),
		lastMetricVals:  make(map[string]float64),
	}
	go am.monitorTriggers()
	return am
}

// RegisterHandler 注册告警处理器
func (am *AlertManager) RegisterHandler(handler AlertHandler) {
	am.handlers = append(am.handlers, handler)
}

// SendAlert 发送告警
func (am *AlertManager) SendAlert(level AlertLevel, title, message, source string, metadata map[string]interface{}) {
	alert := &Alert{
		ID:        fmt.Sprintf("alert-%d", am.alertCounter),
		Level:     level,
		Title:     title,
		Message:   message,
		Source:    source,
		Timestamp: time.Now(),
		Metadata:  metadata,
		Resolved:  false,
	}
	am.alertCounter++
	am.addAlert(alert)
	am.notifyHandlers(alert)
	am.logAlert(alert)

	// Prometheus指标
	alertsSentTotal.WithLabelValues(level.String(), source).Inc()
	activeAlertsGauge.WithLabelValues(level.String()).Inc()
}

func (am *AlertManager) addAlert(alert *Alert) {
	am.mu.Lock()
	defer am.mu.Unlock()
	am.alerts = append(am.alerts, alert)
	if len(am.alerts) > am.maxAlerts {
		am.alerts = am.alerts[len(am.alerts)-am.maxAlerts:]
	}
}

func (am *AlertManager) notifyHandlers(alert *Alert) {
	for _, handler := range am.handlers {
		go func(h AlertHandler) {
			defer func() {
				if r := recover(); r != nil {
					log.Error().Interface("panic", r).Str("alert_id", alert.ID).Msg("Alert handler panicked")
				}
			}()
			if err := h.Handle(alert); err != nil {
				log.Error().Err(err).Str("alert_id", alert.ID).Msg("告警处理失败")
			}
		}(handler)
	}
}

func (am *AlertManager) logAlert(alert *Alert) {
	event := log.Info()
	switch alert.Level {
	case LevelCritical:
		event = log.Error()
	case LevelWarning:
		event = log.Warn()
	}

	event.
		Str("source", alert.Source).
		Str("title", alert.Title).
		Str("alert_id", alert.ID).
		Interface("metadata", alert.Metadata).
		Msg(alert.Message)
}

// SendInfo 发送信息告警
func (am *AlertManager) SendInfo(title, message, source string) {
	am.SendAlert(LevelInfo, title, message, source, nil)
}

// SendWarning 发送警告告警
func (am *AlertManager) SendWarning(title, message, source string) {
	am.SendAlert(LevelWarning, title, message, source, nil)
}

// SendCritical 发送严重告警
func (am *AlertManager) SendCritical(title, message, source string) {
	am.SendAlert(LevelCritical, title, message, source, nil)
}

// SendInfoWithMeta 发送带元数据的信息告警
func (am *AlertManager) SendInfoWithMeta(title, message, source string, metadata map[string]interface{}) {
	am.SendAlert(LevelInfo, title, message, source, metadata)
}

// SendWarningWithMeta 发送带元数据的警告告警
func (am *AlertManager) SendWarningWithMeta(title, message, source string, metadata map[string]interface{}) {
	am.SendAlert(LevelWarning, title, message, source, metadata)
}

// SendCriticalWithMeta 发送带元数据的严重告警
func (am *AlertManager) SendCriticalWithMeta(title, message, source string, metadata map[string]interface{}) {
	am.SendAlert(LevelCritical, title, message, source, metadata)
}

// ResolveAlert 解决告警
func (am *AlertManager) ResolveAlert(alertID string) error {
	am.mu.Lock()
	defer am.mu.Unlock()
	for _, alert := range am.alerts {
		if alert.ID == alertID {
			alert.Resolved = true
			alertsResolvedTotal.WithLabelValues(alert.Level.String(), alert.Source).Inc()
			activeAlertsGauge.WithLabelValues(alert.Level.String()).Dec()
			return nil
		}
	}
	return fmt.Errorf("告警不存在: %s", alertID)
}

// ResolveAlertsBySource 根据来源解决告警
func (am *AlertManager) ResolveAlertsBySource(source string) int {
	am.mu.Lock()
	defer am.mu.Unlock()
	count := 0
	for _, alert := range am.alerts {
		if alert.Source == source && !alert.Resolved {
			alert.Resolved = true
			count++
			alertsResolvedTotal.WithLabelValues(alert.Level.String(), alert.Source).Inc()
		}
	}
	activeAlertsGauge.WithLabelValues("critical").Sub(float64(count))
	return count
}

// GetAlerts 获取告警列表
func (am *AlertManager) GetAlerts(level *AlertLevel, resolved *bool, limit int) []*Alert {
	am.mu.RLock()
	defer am.mu.RUnlock()
	alerts := make([]*Alert, 0)
	for _, alert := range am.alerts {
		if level != nil && alert.Level != *level {
			continue
		}
		if resolved != nil && alert.Resolved != *resolved {
			continue
		}
		alerts = append(alerts, alert)
		if limit > 0 && len(alerts) >= limit {
			break
		}
	}
	return alerts
}

// GetUnresolvedAlerts 获取未解决的告警
func (am *AlertManager) GetUnresolvedAlerts() []*Alert {
	return am.GetAlerts(nil, boolPtr(false), 0)
}

// GetUnresolvedAlertsByLevel 获取指定级别的未解决告警
func (am *AlertManager) GetUnresolvedAlertsByLevel(level AlertLevel) []*Alert {
	return am.GetAlerts(&level, boolPtr(false), 0)
}

func boolPtr(b bool) *bool { return &b }

// GetAlertStats 获取告警统计
func (am *AlertManager) GetAlertStats() map[string]interface{} {
	am.mu.RLock()
	defer am.mu.RUnlock()
	stats := map[string]interface{}{
		"total":      len(am.alerts),
		"info":       0,
		"warning":    0,
		"critical":   0,
		"resolved":   0,
		"unresolved": 0,
	}
	for _, alert := range am.alerts {
		switch alert.Level {
		case LevelInfo:
			stats["info"] = stats["info"].(int) + 1
		case LevelWarning:
			stats["warning"] = stats["warning"].(int) + 1
		case LevelCritical:
			stats["critical"] = stats["critical"].(int) + 1
		}
		if alert.Resolved {
			stats["resolved"] = stats["resolved"].(int) + 1
		} else {
			stats["unresolved"] = stats["unresolved"].(int) + 1
		}
	}
	return stats
}

// ClearResolved 清除已解决的告警
func (am *AlertManager) ClearResolved() {
	am.mu.Lock()
	defer am.mu.Unlock()
	alerts := make([]*Alert, 0)
	for _, alert := range am.alerts {
		if !alert.Resolved {
			alerts = append(alerts, alert)
		}
	}
	am.alerts = alerts
}

// Close 关闭告警管理器
func (am *AlertManager) Close() error {
	am.cancel()
	return nil
}

// ============ 触发条件管理 ============

// RegisterTrigger 注册触发条件
func (am *AlertManager) RegisterTrigger(name string, condition *TriggerCondition) {
	am.triggerMu.Lock()
	defer am.triggerMu.Unlock()
	am.triggers[name] = &TriggerState{
		Condition: condition,
	}
	log.Info().
		Str("trigger", name).
		Str("metric", condition.MetricName).
		Str("operator", condition.Operator).
		Float64("threshold", condition.Threshold).
		Int("duration", condition.Duration).
		Int("cooldown", condition.Cooldown).
		Msg("告警触发器注册")
}

// UnregisterTrigger 注销触发条件
func (am *AlertManager) UnregisterTrigger(name string) {
	am.triggerMu.Lock()
	defer am.triggerMu.Unlock()
	delete(am.triggers, name)
}

// UpdateMetric 更新监控指标
func (am *AlertManager) UpdateMetric(metricName string, value float64) {
	am.metricMu.Lock()
	defer am.metricMu.Unlock()
	am.lastMetricVals[metricName] = value
}

// GetMetric 获取指标值
func (am *AlertManager) GetMetric(metricName string) (float64, bool) {
	am.metricMu.RLock()
	defer am.metricMu.RUnlock()
	val, ok := am.lastMetricVals[metricName]
	return val, ok
}

// monitorTriggers 定期检查触发条件
func (am *AlertManager) monitorTriggers() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			am.checkTriggers()
		case <-am.ctx.Done():
			return
		}
	}
}

// checkTriggers 检查所有触发条件
func (am *AlertManager) checkTriggers() {
	am.triggerMu.Lock()
	defer am.triggerMu.Unlock()
	am.metricMu.RLock()
	defer am.metricMu.RUnlock()

	now := time.Now()

	for name, state := range am.triggers {
		condition := state.Condition
		if !condition.Enabled {
			continue
		}

		value, ok := am.lastMetricVals[condition.MetricName]
		if !ok {
			continue
		}

		// 检查是否满足条件
		triggered := am.evaluateCondition(value, condition.Operator, condition.Threshold)

		if triggered && !state.Triggered {
			// 首次触发
			if condition.Duration > 0 {
				if state.FirstSeen.IsZero() {
					state.FirstSeen = now
				}
				// 检查持续时间
				if now.Sub(state.FirstSeen) < time.Duration(condition.Duration)*time.Second {
					continue
				}
			}

			// 检查冷却时间
			if !state.LastTrigger.IsZero() && condition.Cooldown > 0 {
				if now.Sub(state.LastTrigger) < time.Duration(condition.Cooldown)*time.Second {
					continue
				}
			}

			// 触发告警
			state.Triggered = true
			state.LastTrigger = now
			am.sendTriggerAlert(name, condition, value)
			alertTriggersTotal.WithLabelValues(name).Inc()

		} else if !triggered && state.Triggered {
			// 条件不再满足，重置触发状态
			state.Triggered = false
			state.FirstSeen = time.Time{}
		}
	}
}

func (am *AlertManager) evaluateCondition(value float64, operator string, threshold float64) bool {
	switch operator {
	case ">":
		return value > threshold
	case "<":
		return value < threshold
	case ">=":
		return value >= threshold
	case "<=":
		return value <= threshold
	case "==":
		return value == threshold
	case "!=":
		return value != threshold
	default:
		return false
	}
}

func (am *AlertManager) sendTriggerAlert(name string, condition *TriggerCondition, currentValue float64) {
	level := condition.Level
	if level == 0 {
		level = LevelWarning
	}

	title := fmt.Sprintf("告警触发: %s", name)
	message := fmt.Sprintf("指标 %s (当前值: %.2f) %s %.2f",
		condition.MetricName, currentValue, condition.Operator, condition.Threshold)

	metadata := map[string]interface{}{
		"trigger_name": name,
		"metric_name":  condition.MetricName,
		"current_value": currentValue,
		"operator":     condition.Operator,
		"threshold":    condition.Threshold,
	}

	am.SendAlert(level, title, message, "trigger:"+name, metadata)
}

// SetTriggerEnabled 设置触发器启用状态
func (am *AlertManager) SetTriggerEnabled(name string, enabled bool) {
	am.triggerMu.Lock()
	defer am.triggerMu.Unlock()
	if state, ok := am.triggers[name]; ok {
		state.Condition.Enabled = enabled
	}
}

// GetTriggerState 获取触发器状态
func (am *AlertManager) GetTriggerState(name string) (*TriggerState, bool) {
	am.triggerMu.RLock()
	defer am.triggerMu.RUnlock()
	state, ok := am.triggers[name]
	return state, ok
}

// GetAllTriggerStates 获取所有触发器状态
func (am *AlertManager) GetAllTriggerStates() map[string]*TriggerState {
	am.triggerMu.RLock()
	defer am.triggerMu.RUnlock()
	result := make(map[string]*TriggerState)
	for k, v := range am.triggers {
		// 复制一份避免锁竞争
		result[k] = &TriggerState{
			Condition:   v.Condition,
			FirstSeen:   v.FirstSeen,
			LastTrigger: v.LastTrigger,
			Triggered:   v.Triggered,
		}
	}
	return result
}

// ============ 预设触发条件 ============

// CommonTriggers 常用触发条件预设
var CommonTriggers = map[string]*TriggerCondition{
	"high_error_rate": {
		MetricName: "error_rate",
		Operator:   ">",
		Threshold: 0.05,
		Duration:  60,
		Cooldown:  300,
		Level:     LevelCritical,
		Enabled:   true,
	},
	"high_latency": {
		MetricName: "request_duration_p99",
		Operator:   ">",
		Threshold:  2.0,
		Duration:  120,
		Cooldown:  300,
		Level:     LevelWarning,
		Enabled:   true,
	},
	"circuit_breaker_open": {
		MetricName: "circuit_breaker_state",
		Operator:   "==",
		Threshold:  1.0,
		Duration:  10,
		Cooldown:  60,
		Level:     LevelCritical,
		Enabled:   true,
	},
	"queue_overflow": {
		MetricName: "queue_size",
		Operator:   ">",
		Threshold:  1000,
		Duration:  60,
		Cooldown:  300,
		Level:     LevelWarning,
		Enabled:   true,
	},
	"low_rate_limit": {
		MetricName: "ratelimit_remaining",
		Operator:   "<",
		Threshold:  10,
		Duration:  60,
		Cooldown:  300,
		Level:     LevelInfo,
		Enabled:   true,
	},
}

// RegisterCommonTriggers 注册常用触发条件
func (am *AlertManager) RegisterCommonTriggers() {
	for name, condition := range CommonTriggers {
		am.RegisterTrigger(name, condition)
	}
}

// ConsoleHandler 控制台告警处理器
type ConsoleHandler struct{}

// NewConsoleHandler 创建控制台处理器
func NewConsoleHandler() *ConsoleHandler { return &ConsoleHandler{} }

func (h *ConsoleHandler) Handle(alert *Alert) error {
	levelStr := "[INFO] "
	switch alert.Level {
	case LevelCritical:
		levelStr = "[CRITICAL] "
	case LevelWarning:
		levelStr = "[WARNING] "
	}

	fmt.Printf("%s%s: %s (%s)\n", levelStr, alert.Title, alert.Message, alert.Source)
	if alert.Metadata != nil {
		fmt.Printf("  Metadata: %+v\n", alert.Metadata)
	}
	return nil
}

// WebhookHandler Webhook告警处理器
type WebhookHandler struct {
	URL    string
	Client *http.Client
}

// NewWebhookHandler 创建Webhook处理器
func NewWebhookHandler(url string) *WebhookHandler {
	return &WebhookHandler{
		URL: url,
		Client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (h *WebhookHandler) Handle(alert *Alert) error {
	data, err := json.Marshal(alert)
	if err != nil {
		return err
	}

	resp, err := h.Client.Post(h.URL, "application/json", bytes.NewBuffer(data))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("webhook returned status %d", resp.StatusCode)
	}
	return nil
}
