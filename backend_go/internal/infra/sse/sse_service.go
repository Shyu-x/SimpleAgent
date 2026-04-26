// Package sse SSE服务实现
package sse

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	_ "net/http"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

// Client SSE客户端
type Client struct {
	ID       string
	Chan     chan []byte
	ctx      context.Context
	cancel   context.CancelFunc
	metadata map[string]interface{}
}

// SSEService SSE服务
type SSEService struct {
	clients    map[string]*Client
	mu         sync.RWMutex
	register   chan *Client
	unregister chan *Client
	broadcast  chan []byte
	eventChan  chan *Event
	ctx        context.Context
	cancel     context.CancelFunc
}

// Event SSE事件
type Event struct {
	Type      string      `json:"type"`
	Data      interface{} `json:"data"`
	Timestamp time.Time   `json:"timestamp"`
	ClientID  string      `json:"client_id,omitempty"`
}

// NewSSEService 创建SSE服务
func NewSSEService() *SSEService {
	ctx, cancel := context.WithCancel(context.Background())
	s := &SSEService{
		clients:    make(map[string]*Client),
		register:   make(chan *Client, 100),
		unregister: make(chan *Client, 100),
		broadcast:  make(chan []byte, 1000),
		eventChan:  make(chan *Event, 1000),
		ctx:        ctx,
		cancel:     cancel,
	}
	go s.run()
	return s
}

func (s *SSEService) run() {
	for {
		select {
		case client := <-s.register:
			s.mu.Lock()
			s.clients[client.ID] = client
			s.mu.Unlock()
			log.Info().Str("client_id", client.ID).Msg("SSE客户端连接")
		case client := <-s.unregister:
			s.mu.Lock()
			if _, ok := s.clients[client.ID]; ok {
				delete(s.clients, client.ID)
				close(client.Chan)
			}
			s.mu.Unlock()
			log.Info().Str("client_id", client.ID).Msg("SSE客户端断开")
		case data := <-s.broadcast:
			s.mu.RLock()
			for _, client := range s.clients {
				select {
				case client.Chan <- data:
				default:
					close(client.Chan)
					delete(s.clients, client.ID)
				}
			}
			s.mu.RUnlock()
		case event := <-s.eventChan:
			s.handleEvent(event)
		case <-s.ctx.Done():
			return
		}
	}
}

func (s *SSEService) handleEvent(event *Event) {
	data, err := json.Marshal(event)
	if err != nil {
		log.Error().Err(err).Msg("SSE事件序列化失败")
		return
	}
	s.mu.RLock()
	for _, client := range s.clients {
		if event.ClientID == "" || event.ClientID == client.ID {
			select {
			case client.Chan <- data:
			default:
			}
		}
	}
	s.mu.RUnlock()
}

// RegisterClient 注册客户端
func (s *SSEService) RegisterClient(id string, metadata map[string]interface{}) *Client {
	ctx, cancel := context.WithCancel(context.Background())
	client := &Client{
		ID:       id,
		Chan:     make(chan []byte, 256),
		ctx:      ctx,
		cancel:   cancel,
		metadata: metadata,
	}
	s.register <- client
	return client
}

// UnregisterClient 注销客户端
func (s *SSEService) UnregisterClient(id string) {
	s.mu.RLock()
	if client, ok := s.clients[id]; ok {
		client.cancel()
		s.unregister <- client
	}
	s.mu.RUnlock()
}

// SendToClient 发送消息到指定客户端
func (s *SSEService) SendToClient(clientID string, eventType string, data interface{}) error {
	s.mu.RLock()
	client, ok := s.clients[clientID]
	s.mu.RUnlock()
	if !ok {
		return fmt.Errorf("客户端不存在: %s", clientID)
	}
	event := Event{
		Type:      eventType,
		Data:      data,
		Timestamp: time.Now(),
		ClientID:  clientID,
	}
	dataBytes, err := json.Marshal(event)
	if err != nil {
		return err
	}
	select {
	case client.Chan <- dataBytes:
		return nil
	default:
		return fmt.Errorf("发送通道已满")
	}
}

// Broadcast 广播消息
func (s *SSEService) Broadcast(eventType string, data interface{}) {
	event := Event{
		Type:      eventType,
		Data:      data,
		Timestamp: time.Now(),
	}
	dataBytes, err := json.Marshal(event)
	if err != nil {
		log.Error().Err(err).Msg("SSE事件序列化失败")
		return
	}
	select {
	case s.broadcast <- dataBytes:
	default:
		log.Warn().Msg("广播通道已满")
	}
}

// PublishEvent 发布事件
func (s *SSEService) PublishEvent(event *Event) {
	select {
	case s.eventChan <- event:
	default:
		log.Warn().Msg("事件通道已满")
	}
}

// SendStreamResult 发送流式结果
func (s *SSEService) SendStreamResult(clientID string, result string) error {
	return s.SendToClient(clientID, "stream", map[string]string{"content": result})
}

// SendError 发送错误
func (s *SSEService) SendError(clientID string, err error) error {
	return s.SendToClient(clientID, "error", map[string]string{"message": err.Error()})
}

// SendComplete 发送完成消息
func (s *SSEService) SendComplete(clientID string) error {
	return s.SendToClient(clientID, "complete", nil)
}

// GetClientCount 获取客户端数量
func (s *SSEService) GetClientCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.clients)
}

// GetClient 获取客户端
func (s *SSEService) GetClient(id string) (*Client, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	client, ok := s.clients[id]
	return client, ok
}

// Close 关闭服务
func (s *SSEService) Close() error {
	s.cancel()
	s.mu.Lock()
	for _, client := range s.clients {
		close(client.Chan)
	}
	s.clients = make(map[string]*Client)
	s.mu.Unlock()
	return nil
}

// ServeHTTP 实现http.Handler接口
func (s *SSEService) ServeHTTP(client *Client, w io.Writer) {
	clientChan := client.Chan
	for {
		select {
		case data, ok := <-clientChan:
			if !ok {
				return
			}
			fmt.Fprintf(w, "data: %s\n\n", data)
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
		case <-client.ctx.Done():
			return
		}
	}
}
