/**
 * Agent注册表
 * 管理Agent注册、心跳、技能匹配
 */

package a2a

import (
	"sync"
	"time"
)

// AgentRegistry Agent注册表
type AgentRegistry struct {
	agents    sync.Map // map[string]*AgentInfo
	mu        sync.RWMutex
	stopChan  chan struct{}
	heartbeat chan string // agentID
}

// NewAgentRegistry 创建Agent注册表
func NewAgentRegistry() *AgentRegistry {
	registry := &AgentRegistry{
		stopChan:  make(chan struct{}),
		heartbeat: make(chan string, 100),
	}

	// 启动心跳检测goroutine
	go registry.heartbeatChecker()

	return registry
}

// Register 注册Agent
func (r *AgentRegistry) Register(info AgentInfo) *AgentInfo {
	info.RegisteredAt = time.Now().UnixMilli()
	info.LastSeen = info.RegisteredAt
	r.agents.Store(info.ID, &info)
	return &info
}

// Unregister 注销Agent
func (r *AgentRegistry) Unregister(agentID string) {
	r.agents.Delete(agentID)
}

// Heartbeat 更新Agent心跳
func (r *AgentRegistry) Heartbeat(agentID string) {
	select {
	case r.heartbeat <- agentID:
	default:
	}
}

// GetAgent 获取Agent信息
func (r *AgentRegistry) GetAgent(agentID string) *AgentInfo {
	if val, ok := r.agents.Load(agentID); ok {
		return val.(*AgentInfo)
	}
	return nil
}

// ListOnlineAgents 获取在线Agent列表
func (r *AgentRegistry) ListOnlineAgents() []*AgentInfo {
	var result []*AgentInfo
	threshold := time.Now().Add(-90 * time.Second).UnixMilli()

	r.agents.Range(func(k, v interface{}) bool {
		info := v.(*AgentInfo)
		if info.LastSeen >= threshold {
			result = append(result, info)
		}
		return true
	})

	return result
}

// MatchAgents 智能匹配Agent
func (r *AgentRegistry) MatchAgents(agentType string, capabilities []string) []*AgentInfo {
	var result []*AgentInfo
	threshold := time.Now().Add(-90 * time.Second).UnixMilli()

	r.agents.Range(func(k, v interface{}) bool {
		info := v.(*AgentInfo)
		if info.LastSeen < threshold {
			return true
		}

		// 匹配类型
		if agentType != "" && info.Type != agentType {
			return true
		}

		// 匹配能力
		if len(capabilities) > 0 {
			hasAll := true
			for _, cap := range capabilities {
				found := false
				for _, agentCap := range info.Capabilities {
					if cap == agentCap {
						found = true
						break
					}
				}
				if !found {
					hasAll = false
					break
				}
			}
			if !hasAll {
				return true
			}
		}

		result = append(result, info)
		return true
	})

	return result
}

// GetStats 获取统计信息
func (r *AgentRegistry) GetStats() map[string]interface{} {
	var total, online int
	threshold := time.Now().Add(-90 * time.Second).UnixMilli()

	r.agents.Range(func(k, v interface{}) bool {
		total++
		info := v.(*AgentInfo)
		if info.LastSeen >= threshold {
			online++
		}
		return true
	})

	return map[string]interface{}{
		"total":  total,
		"online": online,
	}
}

// Stop 停止注册表
func (r *AgentRegistry) Stop() {
	close(r.stopChan)
}

// heartbeatChecker 心跳检测
func (r *AgentRegistry) heartbeatChecker() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case agentID := <-r.heartbeat:
			if info := r.GetAgent(agentID); info != nil {
				info.LastSeen = time.Now().UnixMilli()
				r.agents.Store(agentID, info)
			}
		case <-ticker.C:
			// 超时检测
			threshold := time.Now().Add(-90 * time.Second).UnixMilli()
			r.agents.Range(func(k, v interface{}) bool {
				info := v.(*AgentInfo)
				if info.LastSeen < threshold {
					r.agents.Delete(k)
				}
				return true
			})
		case <-r.stopChan:
			return
		}
	}
}
