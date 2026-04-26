/**
 * 任务委托器
 * 负责任务分发、状态跟踪、协作执行
 */

package a2a

import (
	"sync"
	"time"
)

// TaskDelegate 任务委托器
type TaskDelegate struct {
	tasks      sync.Map // map[string]*A2ATask
	callbacks  sync.Map // map[string]func(*A2AMessage)
	mu         sync.RWMutex
	onTaskEvent func(*A2ATask, string)
	stopChan   chan struct{}
}

// NewTaskDelegate 创建任务委托器
func NewTaskDelegate() *TaskDelegate {
	return &TaskDelegate{
		stopChan: make(chan struct{}),
	}
}

// SetOnTaskEvent 设置任务事件回调
func (d *TaskDelegate) SetOnTaskEvent(callback func(*A2ATask, string)) {
	d.onTaskEvent = callback
}

// DelegateTask 委托任务
func (d *TaskDelegate) DelegateTask(task *A2ATask, broker *MessageBroker) *DelegateResult {
	if task.ID == "" {
		task.ID = generateTaskID()
	}
	task.Status = TaskStatusPending
	task.CreatedAt = time.Now().UnixMilli()

	d.tasks.Store(task.ID, task)

	// 发送任务消息
	msg := NewA2AMessage(MessageTypeTaskDelegate, task.From, task.To)
	msg.TaskID = task.ID
	msg.Payload = task.ToMap()

	result := broker.Send(msg)

	if result.Success {
		task.Status = TaskStatusRunning
		task.StartedAt = time.Now().UnixMilli()
		d.tasks.Store(task.ID, task)

		if d.onTaskEvent != nil {
			d.onTaskEvent(task, "task.started")
		}
	}

	return &DelegateResult{
		Task:    task,
		Message: msg,
		Success: result.Success,
	}
}

// ReturnResult 返回结果
func (d *TaskDelegate) ReturnResult(taskID string, result interface{}, status TaskStatus, metadata map[string]interface{}, broker *MessageBroker) *ReturnResult {
	task := d.GetTaskStatus(taskID)
	if task == nil {
		return &ReturnResult{
			Success: false,
			Error:   "task not found",
		}
	}

	task.Result = result
	task.Status = status
	task.CompletedAt = time.Now().UnixMilli()

	if metadata != nil {
		task.Metadata = metadata
	}

	d.tasks.Store(taskID, task)

	// 发送结果消息
	msg := NewA2AMessage(MessageTypeResultReturn, task.To, task.From)
	msg.TaskID = taskID
	msg.Payload = map[string]interface{}{
		"result": result,
		"status": status,
		"metadata": metadata,
	}

	broker.Send(msg)

	if d.onTaskEvent != nil {
		d.onTaskEvent(task, "task.completed")
	}

	// 触发回调
	if callback, ok := d.callbacks.Load(taskID); ok {
		go callback.(func(*A2AMessage))(msg)
		d.callbacks.Delete(taskID)
	}

	return &ReturnResult{
		Success: true,
		Message: msg,
	}
}

// SendProgress 发送进度
func (d *TaskDelegate) SendProgress(taskID string, progress int, metadata map[string]interface{}, broker *MessageBroker) *ProgressResult {
	task := d.GetTaskStatus(taskID)
	if task == nil {
		return &ProgressResult{
			Success: false,
			Error:   "task not found",
		}
	}

	task.Progress = progress
	if metadata != nil {
		task.Metadata = metadata
	}
	d.tasks.Store(taskID, task)

	// 发送进度消息
	msg := NewA2AMessage(MessageTypeProgressUpdate, task.To, task.From)
	msg.TaskID = taskID
	msg.Payload = map[string]interface{}{
		"progress": progress,
		"metadata": metadata,
	}

	broker.Send(msg)

	return &ProgressResult{
		Success:   true,
		MessageID: msg.ID,
	}
}

// GetTaskStatus 获取任务状态
func (d *TaskDelegate) GetTaskStatus(taskID string) *A2ATask {
	if val, ok := d.tasks.Load(taskID); ok {
		return val.(*A2ATask)
	}
	return nil
}

// ListTasks 列出任务
func (d *TaskDelegate) ListTasks(filter *TaskFilter) []*A2ATask {
	var result []*A2ATask

	d.tasks.Range(func(k, v interface{}) bool {
		task := v.(*A2ATask)

		if filter != nil {
			if filter.Status != "" && string(task.Status) != filter.Status {
				return true
			}
			if filter.From != "" && task.From != filter.From {
				return true
			}
			if filter.To != "" && task.To != filter.To {
				return true
			}
		}

		result = append(result, task)
		return true
	})

	if filter != nil && filter.Limit > 0 {
		if len(result) > filter.Limit {
			result = result[:filter.Limit]
		}
	}

	return result
}

// CancelTask 取消任务
func (d *TaskDelegate) CancelTask(taskID string, broker *MessageBroker) bool {
	task := d.GetTaskStatus(taskID)
	if task == nil {
		return false
	}

	task.Status = TaskStatusCancelled
	task.CompletedAt = time.Now().UnixMilli()
	d.tasks.Store(taskID, task)

	// 发送取消消息
	msg := NewA2AMessage(MessageTypeErrorNotify, task.To, task.From)
	msg.TaskID = taskID
	msg.Payload = map[string]interface{}{
		"error": "task cancelled",
	}

	broker.Send(msg)

	if d.onTaskEvent != nil {
		d.onTaskEvent(task, "task.cancelled")
	}

	return true
}

// RegisterCallback 注册任务回调
func (d *TaskDelegate) RegisterCallback(taskID string, callback func(*A2AMessage)) {
	d.callbacks.Store(taskID, callback)
}

// resolveCallbacks 触发回调
func (d *TaskDelegate) resolveCallbacks(taskID string, message *A2AMessage) {
	if callback, ok := d.callbacks.Load(taskID); ok {
		callback.(func(*A2AMessage))(message)
		d.callbacks.Delete(taskID)
	}
}

// GetStats 获取统计信息
func (d *TaskDelegate) GetStats() map[string]interface{} {
	var total, pending, running, completed, failed int

	d.tasks.Range(func(k, v interface{}) bool {
		total++
		task := v.(*A2ATask)
		switch task.Status {
		case TaskStatusPending:
			pending++
		case TaskStatusRunning:
			running++
		case TaskStatusCompleted:
			completed++
		case TaskStatusFailed:
			failed++
		}
		return true
	})

	return map[string]interface{}{
		"total":     total,
		"pending":   pending,
		"running":   running,
		"completed": completed,
		"failed":    failed,
	}
}
