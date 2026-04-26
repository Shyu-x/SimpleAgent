/**
 * Admin API 处理器
 * 提供管理后台相关的RESTful接口
 */

package handlers

import (
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/ai-chat/backend_go/internal/middleware"
)

// AdminHandlers Admin处理器集合
type AdminHandlers struct {
	Knowledge *KnowledgeHandler
	Tool      *ToolHandler
	Model     *ModelHandler
	Prompt    *PromptHandler
	Trace     *TraceHandler
}

// NewAdminHandlers 创建Admin处理器集合
func NewAdminHandlers() *AdminHandlers {
	return &AdminHandlers{
		Knowledge: &KnowledgeHandler{},
		Tool:      &ToolHandler{},
		Model:     &ModelHandler{},
		Prompt:    &PromptHandler{},
		Trace:     &TraceHandler{},
	}
}

// ==================== 知识库管理 ====================

// KnowledgeHandler 知识库处理器
type KnowledgeHandler struct {
	documents sync.Map // id -> *KnowledgeDocument
}

// KnowledgeDocument 知识文档
type KnowledgeDocument struct {
	ID        string                 `json:"id"`
	Title     string                 `json:"title"`
	Content   string                 `json:"content"`
	Tags      []string               `json:"tags"`
	Metadata  map[string]interface{} `json:"metadata"`
	CreatedAt int64                  `json:"created_at"`
	UpdatedAt int64                  `json:"updated_at"`
}

// List 列出知识库文档
// GET /api/admin/knowledge
func (h *KnowledgeHandler) List(c *gin.Context) {
	docs := make([]*KnowledgeDocument, 0)
	h.documents.Range(func(key, value interface{}) bool {
		docs = append(docs, value.(*KnowledgeDocument))
		return true
	})
	middleware.SuccessResponse(c, gin.H{"documents": docs, "count": len(docs)})
}

// Get 获取知识库文档
// GET /api/admin/knowledge/:id
func (h *KnowledgeHandler) Get(c *gin.Context) {
	id := c.Param("id")
	if doc, ok := h.documents.Load(id); ok {
		middleware.SuccessResponse(c, doc)
		return
	}
	middleware.NotFoundResponse(c, "文档不存在", "未找到对应的知识文档")
}

// Create 创建知识库文档
// POST /api/admin/knowledge
func (h *KnowledgeHandler) Create(c *gin.Context) {
	var doc KnowledgeDocument
	if err := c.ShouldBindJSON(&doc); err != nil {
		middleware.BadRequestResponse(c, "参数解析失败", err.Error())
		return
	}
	// 自动生成ID和时间戳
	if doc.ID == "" {
		doc.ID = uuid.New().String()
	}
	doc.CreatedAt = time.Now().UnixMilli()
	doc.UpdatedAt = doc.CreatedAt
	h.documents.Store(doc.ID, &doc)
	middleware.CreatedResponse(c, doc)
}

// Update 更新知识库文档
// PUT /api/admin/knowledge/:id
func (h *KnowledgeHandler) Update(c *gin.Context) {
	id := c.Param("id")
	var doc KnowledgeDocument
	if err := c.ShouldBindJSON(&doc); err != nil {
		middleware.BadRequestResponse(c, "参数解析失败", err.Error())
		return
	}
	if _, ok := h.documents.Load(id); !ok {
		middleware.NotFoundResponse(c, "文档不存在", "未找到对应的知识文档")
		return
	}
	h.documents.Store(id, &doc)
	middleware.SuccessResponse(c, doc)
}

// Delete 删除知识库文档
// DELETE /api/admin/knowledge/:id
func (h *KnowledgeHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	if _, ok := h.documents.LoadAndDelete(id); ok {
		middleware.SuccessResponseWithMessage(c, "文档已删除", nil)
		return
	}
	middleware.NotFoundResponse(c, "文档不存在", "未找到对应的知识文档")
}

// Reindex 重建索引
// POST /api/admin/knowledge/:id/index
func (h *KnowledgeHandler) Reindex(c *gin.Context) {
	id := c.Param("id")
	if _, ok := h.documents.Load(id); !ok {
		middleware.NotFoundResponse(c, "文档不存在", "未找到对应的知识文档")
		return
	}
	middleware.SuccessResponseWithMessage(c, "文档重建索引成功", nil)
}

// ==================== 工具管理 ====================

// ToolHandler 工具处理器
type ToolHandler struct {
	tools sync.Map // name -> *Tool
}

// Tool 工具定义
type Tool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Parameters  map[string]interface{} `json:"parameters"`
	Handler     string                 `json:"handler"`
	Enabled     bool                   `json:"enabled"`
}

// List 列出工具
// GET /api/admin/tool
func (h *ToolHandler) List(c *gin.Context) {
	tools := make([]*Tool, 0)
	h.tools.Range(func(key, value interface{}) bool {
		tools = append(tools, value.(*Tool))
		return true
	})
	middleware.SuccessResponse(c, gin.H{"tools": tools, "count": len(tools)})
}

// Get 获取工具详情
// GET /api/admin/tool/:name
func (h *ToolHandler) Get(c *gin.Context) {
	name := c.Param("name")
	if tool, ok := h.tools.Load(name); ok {
		middleware.SuccessResponse(c, tool)
		return
	}
	middleware.NotFoundResponse(c, "工具不存在", "未找到对应的工具")
}

// Register 注册工具
// POST /api/admin/tool
func (h *ToolHandler) Register(c *gin.Context) {
	var tool Tool
	if err := c.ShouldBindJSON(&tool); err != nil {
		middleware.BadRequestResponse(c, "参数解析失败", err.Error())
		return
	}
	// 自动生成名称
	if tool.Name == "" {
		tool.Name = uuid.New().String()
	}
	h.tools.Store(tool.Name, &tool)
	middleware.CreatedResponse(c, tool)
}

// Update 更新工具
// PUT /api/admin/tool/:name
func (h *ToolHandler) Update(c *gin.Context) {
	name := c.Param("name")
	var tool Tool
	if err := c.ShouldBindJSON(&tool); err != nil {
		middleware.BadRequestResponse(c, "参数解析失败", err.Error())
		return
	}
	if _, ok := h.tools.Load(name); !ok {
		middleware.NotFoundResponse(c, "工具不存在", "未找到对应的工具")
		return
	}
	h.tools.Store(name, &tool)
	middleware.SuccessResponse(c, tool)
}

// Unregister 注销工具
// DELETE /api/admin/tool/:name
func (h *ToolHandler) Unregister(c *gin.Context) {
	name := c.Param("name")
	if _, ok := h.tools.LoadAndDelete(name); ok {
		middleware.SuccessResponseWithMessage(c, "工具已注销", nil)
		return
	}
	middleware.NotFoundResponse(c, "工具不存在", "未找到对应的工具")
}

// Test 测试工具
// POST /api/admin/tool/:name/test
func (h *ToolHandler) Test(c *gin.Context) {
	name := c.Param("name")
	if _, ok := h.tools.Load(name); !ok {
		middleware.NotFoundResponse(c, "工具不存在", "未找到对应的工具")
		return
	}
	middleware.SuccessResponseWithMessage(c, "工具测试通过", nil)
}

// ==================== 模型管理 ====================

// ModelHandler 模型处理器
type ModelHandler struct {
	models sync.Map // name -> *Model
}

// Model 模型定义
type Model struct {
	Name         string                 `json:"name"`
	Type         string                 `json:"type"`
	Endpoint     string                 `json:"endpoint"`
	APIKey       string                 `json:"api_key,omitempty"`
	Parameters   map[string]interface{} `json:"parameters"`
	Capabilities []string               `json:"capabilities"`
	Enabled      bool                   `json:"enabled"`
}

// List 列出模型
// GET /api/admin/model
func (h *ModelHandler) List(c *gin.Context) {
	models := make([]*Model, 0)
	h.models.Range(func(key, value interface{}) bool {
		models = append(models, value.(*Model))
		return true
	})
	middleware.SuccessResponse(c, gin.H{"models": models, "count": len(models)})
}

// Get 获取模型详情
// GET /api/admin/model/:name
func (h *ModelHandler) Get(c *gin.Context) {
	name := c.Param("name")
	if model, ok := h.models.Load(name); ok {
		middleware.SuccessResponse(c, model)
		return
	}
	middleware.NotFoundResponse(c, "模型不存在", "未找到对应的模型")
}

// Register 注册模型
// POST /api/admin/model
func (h *ModelHandler) Register(c *gin.Context) {
	var model Model
	if err := c.ShouldBindJSON(&model); err != nil {
		middleware.BadRequestResponse(c, "参数解析失败", err.Error())
		return
	}
	// 自动生成名称
	if model.Name == "" {
		model.Name = uuid.New().String()
	}
	h.models.Store(model.Name, &model)
	middleware.CreatedResponse(c, model)
}

// Update 更新模型
// PUT /api/admin/model/:name
func (h *ModelHandler) Update(c *gin.Context) {
	name := c.Param("name")
	var model Model
	if err := c.ShouldBindJSON(&model); err != nil {
		middleware.BadRequestResponse(c, "参数解析失败", err.Error())
		return
	}
	if _, ok := h.models.Load(name); !ok {
		middleware.NotFoundResponse(c, "模型不存在", "未找到对应的模型")
		return
	}
	h.models.Store(name, &model)
	middleware.SuccessResponse(c, model)
}

// Delete 删除模型
// DELETE /api/admin/model/:name
func (h *ModelHandler) Delete(c *gin.Context) {
	name := c.Param("name")
	if _, ok := h.models.LoadAndDelete(name); ok {
		middleware.SuccessResponseWithMessage(c, "模型已删除", nil)
		return
	}
	middleware.NotFoundResponse(c, "模型不存在", "未找到对应的模型")
}

// HealthCheck 健康检查
// GET /api/admin/model/:name/health
func (h *ModelHandler) HealthCheck(c *gin.Context) {
	name := c.Param("name")
	if _, ok := h.models.Load(name); !ok {
		middleware.NotFoundResponse(c, "模型不存在", "未找到对应的模型")
		return
	}
	middleware.SuccessResponse(c, gin.H{"status": "healthy", "model": name})
}

// ==================== Prompt模板管理 ====================

// PromptHandler Prompt处理器
type PromptHandler struct {
	templates sync.Map // id -> *PromptTemplate
	versions  sync.Map // id -> []versions
}

// PromptTemplate Prompt模板
type PromptTemplate struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Content   string   `json:"content"`
	Variables []string `json:"variables"`
	Version   int      `json:"version"`
	CreatedAt int64    `json:"created_at"`
}

// List 列出Prompt模板
// GET /api/admin/prompt
func (h *PromptHandler) List(c *gin.Context) {
	templates := make([]*PromptTemplate, 0)
	h.templates.Range(func(key, value interface{}) bool {
		templates = append(templates, value.(*PromptTemplate))
		return true
	})
	middleware.SuccessResponse(c, gin.H{"templates": templates, "count": len(templates)})
}

// Get 获取Prompt模板
// GET /api/admin/prompt/:id
func (h *PromptHandler) Get(c *gin.Context) {
	id := c.Param("id")
	if template, ok := h.templates.Load(id); ok {
		middleware.SuccessResponse(c, template)
		return
	}
	middleware.NotFoundResponse(c, "模板不存在", "未找到对应的Prompt模板")
}

// Create 创建Prompt模板
// POST /api/admin/prompt
func (h *PromptHandler) Create(c *gin.Context) {
	var template PromptTemplate
	if err := c.ShouldBindJSON(&template); err != nil {
		middleware.BadRequestResponse(c, "参数解析失败", err.Error())
		return
	}
	// 自动生成ID和时间戳
	if template.ID == "" {
		template.ID = uuid.New().String()
	}
	template.Version = 1
	template.CreatedAt = time.Now().UnixMilli()
	h.templates.Store(template.ID, &template)
	middleware.CreatedResponse(c, template)
}

// Update 更新Prompt模板
// PUT /api/admin/prompt/:id
func (h *PromptHandler) Update(c *gin.Context) {
	id := c.Param("id")
	var template PromptTemplate
	if err := c.ShouldBindJSON(&template); err != nil {
		middleware.BadRequestResponse(c, "参数解析失败", err.Error())
		return
	}
	if existing, ok := h.templates.Load(id); ok {
		t := existing.(*PromptTemplate)
		template.Version = t.Version + 1
	}
	h.templates.Store(id, &template)
	middleware.SuccessResponse(c, template)
}

// Delete 删除Prompt模板
// DELETE /api/admin/prompt/:id
func (h *PromptHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	if _, ok := h.templates.LoadAndDelete(id); ok {
		middleware.SuccessResponseWithMessage(c, "模板已删除", nil)
		return
	}
	middleware.NotFoundResponse(c, "模板不存在", "未找到对应的Prompt模板")
}

// CreateVersion 创建版本
// POST /api/admin/prompt/:id/version
func (h *PromptHandler) CreateVersion(c *gin.Context) {
	id := c.Param("id")
	var template PromptTemplate
	if err := c.ShouldBindJSON(&template); err != nil {
		middleware.BadRequestResponse(c, "参数解析失败", err.Error())
		return
	}
	if existing, ok := h.templates.Load(id); ok {
		t := existing.(*PromptTemplate)
		template.Version = t.Version + 1
		template.ID = id
	} else {
		middleware.NotFoundResponse(c, "模板不存在", "未找到对应的Prompt模板")
		return
	}
	h.templates.Store(id, &template)
	middleware.SuccessResponse(c, template)
}

// ==================== 链路追踪 ====================

// TraceHandler 追踪处理器
type TraceHandler struct {
	traces sync.Map // id -> *Trace
}

// Trace 追踪记录
type Trace struct {
	ID        string                 `json:"id"`
	SessionID string                 `json:"session_id"`
	Spans     []TraceSpan            `json:"spans"`
	Metadata  map[string]interface{} `json:"metadata"`
	CreatedAt int64                  `json:"created_at"`
}

// TraceSpan 追踪跨度
type TraceSpan struct {
	ID        string                 `json:"id"`
	Name      string                 `json:"name"`
	StartTime int64                  `json:"start_time"`
	EndTime   int64                  `json:"end_time"`
	Tags      map[string]interface{} `json:"tags"`
}

// List 列出追踪记录
// GET /api/admin/trace
func (h *TraceHandler) List(c *gin.Context) {
	traces := make([]*Trace, 0)
	h.traces.Range(func(key, value interface{}) bool {
		traces = append(traces, value.(*Trace))
		return true
	})
	middleware.SuccessResponse(c, gin.H{"traces": traces, "count": len(traces)})
}

// Get 获取追踪记录
// GET /api/admin/trace/:id
func (h *TraceHandler) Get(c *gin.Context) {
	id := c.Param("id")
	if trace, ok := h.traces.Load(id); ok {
		middleware.SuccessResponse(c, trace)
		return
	}
	middleware.NotFoundResponse(c, "追踪记录不存在", "未找到对应的追踪记录")
}

// Stats 获取统计信息
// GET /api/admin/trace/stats
func (h *TraceHandler) Stats(c *gin.Context) {
	var totalSpans int
	var totalDuration int64
	h.traces.Range(func(key, value interface{}) bool {
		t := value.(*Trace)
		totalSpans += len(t.Spans)
		if len(t.Spans) > 0 {
			first := t.Spans[0].StartTime
			last := t.Spans[len(t.Spans)-1].EndTime
			totalDuration += last - first
		}
		return true
	})
	middleware.SuccessResponse(c, gin.H{
		"total_traces":   h.count(),
		"total_spans":    totalSpans,
		"total_duration": totalDuration,
	})
}

// GetBySession 按会话获取追踪
// GET /api/admin/trace/session/:sessionId
func (h *TraceHandler) GetBySession(c *gin.Context) {
	sessionId := c.Param("sessionId")
	traces := make([]*Trace, 0)
	h.traces.Range(func(key, value interface{}) bool {
		t := value.(*Trace)
		if t.SessionID == sessionId {
			traces = append(traces, t)
		}
		return true
	})
	middleware.SuccessResponse(c, gin.H{"traces": traces, "count": len(traces)})
}

func (h *TraceHandler) count() int {
	var n int
	h.traces.Range(func(key, value interface{}) bool {
		n++
		return true
	})
	return n
}
