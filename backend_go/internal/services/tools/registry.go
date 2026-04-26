package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// ToolDefinition 工具定义
type ToolDefinition struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Parameters  map[string]interface{} `json:"parameters"`
}

// ToolResult 工具执行结果
type ToolResult struct {
	ToolName string                 `json:"tool_name"`
	Args     map[string]interface{} `json:"args"`
	Result   interface{}            `json:"result"`
	Error    error                  `json:"error"`
	Duration time.Duration          `json:"duration"`
}

// ToolFunc 工具处理函数类型
type ToolFunc func(ctx context.Context, args map[string]interface{}) (interface{}, error)

// ToolRegistry 工具注册表
type ToolRegistry struct {
	tools     map[string]ToolDefinition
	handlers  map[string]ToolFunc
}

// NewToolRegistry 创建工具注册表
func NewToolRegistry() *ToolRegistry {
	registry := &ToolRegistry{
		tools:    make(map[string]ToolDefinition),
		handlers: make(map[string]ToolFunc),
	}

	// 注册内置工具
	registry.registerBuiltinTools()

	return registry
}

// Register 注册工具
func (r *ToolRegistry) Register(definition ToolDefinition, handler ToolFunc) {
	r.tools[definition.Name] = definition
	r.handlers[definition.Name] = handler
}

// Execute 执行工具
func (r *ToolRegistry) Execute(ctx context.Context, toolName string, args map[string]interface{}) (*ToolResult, error) {
	handler, ok := r.handlers[toolName]
	if !ok {
		return nil, fmt.Errorf("tool not found: %s", toolName)
	}

	start := time.Now()
	result, err := handler(ctx, args)
	duration := time.Since(start)

	return &ToolResult{
		ToolName: toolName,
		Args:     args,
		Result:   result,
		Error:    err,
		Duration: duration,
	}, nil
}

// ListTools 列出所有工具
func (r *ToolRegistry) ListTools() []ToolDefinition {
	result := make([]ToolDefinition, 0, len(r.tools))
	for _, tool := range r.tools {
		result = append(result, tool)
	}
	return result
}

// GetTool 获取工具定义
func (r *ToolRegistry) GetTool(name string) (ToolDefinition, bool) {
	tool, ok := r.tools[name]
	return tool, ok
}

// ExecuteWithTimeout 执行工具（带超时控制）
func (r *ToolRegistry) ExecuteWithTimeout(ctx context.Context, toolName string, args map[string]interface{}, timeout time.Duration) (*ToolResult, error) {
	// 创建超时上下文
	execCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// 执行工具
	result, err := r.Execute(execCtx, toolName, args)
	if err != nil {
		return result, err
	}

	// 检查是否超时
	select {
	case <-execCtx.Done():
		return &ToolResult{
			ToolName: toolName,
			Args:     args,
			Result:   nil,
			Error:    fmt.Errorf("tool execution timeout after %v", timeout),
			Duration: timeout,
		}, nil
	default:
		return result, nil
	}
}

// ValidateArgs 验证工具参数
func (r *ToolRegistry) ValidateArgs(toolName string, args map[string]interface{}) error {
	tool, ok := r.GetTool(toolName)
	if !ok {
		return fmt.Errorf("tool not found: %s", toolName)
	}

	// 检查必需参数
	for paramName, paramSpec := range tool.Parameters {
		if spec, ok := paramSpec.(map[string]interface{}); ok {
			paramType, _ := spec["type"].(string)
			// 检查必需参数（非 default）
			if _, hasDefault := spec["default"]; !hasDefault && paramType != "" {
				if _, present := args[paramName]; !present {
					return fmt.Errorf("missing required parameter: %s", paramName)
				}
			}
		}
	}

	return nil
}

// registerBuiltinTools 注册内置工具
func (r *ToolRegistry) registerBuiltinTools() {
	// 搜索工具
	r.Register(ToolDefinition{
		Name:        "web_search",
		Description: "搜索互联网获取最新信息",
		Parameters: map[string]interface{}{
			"query":      map[string]string{"type": "string", "description": "搜索关键词"},
			"max_results": map[string]interface{}{"type": "integer", "description": "最大结果数", "default": 5},
		},
	}, r.webSearchTool)

	// 计算器工具
	r.Register(ToolDefinition{
		Name:        "calculator",
		Description: "执行数学计算",
		Parameters: map[string]interface{}{
			"expression": map[string]string{"type": "string", "description": "数学表达式"},
		},
	}, r.calculatorTool)

	// 天气工具
	r.Register(ToolDefinition{
		Name:        "weather",
		Description: "查询天气信息",
		Parameters: map[string]interface{}{
			"city": map[string]string{"type": "string", "description": "城市名称"},
		},
	}, r.weatherTool)
}

// ========== 内置工具实现 ==========

// webSearchTool 搜索工具实现
func (r *ToolRegistry) webSearchTool(ctx context.Context, args map[string]interface{}) (interface{}, error) {
	query, _ := args["query"].(string)
	if query == "" {
		return nil, fmt.Errorf("query is required")
	}

	maxResults := 5
	if mr, ok := args["max_results"].(float64); ok {
		maxResults = int(mr)
	}

	return map[string]interface{}{
		"query":       query,
		"max_results": maxResults,
		"results":     []string{},
		"message":     fmt.Sprintf("搜索结果: 找到关于 '%s' 的 %d 条结果", query, maxResults),
	}, nil
}

// calculatorTool 计算器工具实现
func (r *ToolRegistry) calculatorTool(ctx context.Context, args map[string]interface{}) (interface{}, error) {
	expr, _ := args["expression"].(string)
	if expr == "" {
		return nil, fmt.Errorf("expression is required")
	}

	// 简单的数学表达式计算
	result := r.evaluateExpression(expr)

	return map[string]interface{}{
		"expression": expr,
		"result":     result,
	}, nil
}

// weatherTool 天气工具实现
func (r *ToolRegistry) weatherTool(ctx context.Context, args map[string]interface{}) (interface{}, error) {
	city, _ := args["city"].(string)
	if city == "" {
		return nil, fmt.Errorf("city is required")
	}

	return map[string]interface{}{
		"city":      city,
		"temperature": "25°C",
		"condition":  "晴朗",
		"humidity":   "60%",
		"message":    fmt.Sprintf("%s 当前天气：晴朗，气温25°C，湿度60%%", city),
	}, nil
}

// evaluateExpression 简单数学表达式求值
func (r *ToolRegistry) evaluateExpression(expr string) float64 {
	expr = strings.ReplaceAll(expr, " ", "")

	// 处理加减乘除
	var num float64 = 0
	var op byte = '+'
	i := 0

	for i < len(expr) {
		c := expr[i]
		if c >= '0' && c <= '9' || c == '.' {
			start := i
			for i < len(expr) && ((expr[i] >= '0' && expr[i] <= '9') || expr[i] == '.') {
				i++
			}
			val := r.parseFloat(expr[start:i])

			switch op {
			case '+':
				num += val
			case '-':
				num -= val
			case '*':
				num *= val
			case '/':
				if val != 0 {
					num /= val
				}
			}
		} else if c == '+' || c == '-' || c == '*' || c == '/' {
			op = c
			i++
		} else {
			i++
		}
	}

	return num
}

func (r *ToolRegistry) parseFloat(s string) float64 {
	val := 0.0
	decimal := false
	divisor := 1.0

	for _, c := range s {
		if c == '.' {
			decimal = true
			continue
		}
		if c >= '0' && c <= '9' {
			if decimal {
				divisor *= 10
				val += float64(c-'0') / divisor
			} else {
				val = val*10 + float64(c-'0')
			}
		}
	}

	return val
}

// ========== HTTP相关工具 ==========

// httpGetTool HTTP GET请求工具
func (r *ToolRegistry) httpGetTool(ctx context.Context, args map[string]interface{}) (interface{}, error) {
	urlStr, _ := args["url"].(string)
	if urlStr == "" {
		return nil, fmt.Errorf("url is required")
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(urlStr)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	return map[string]interface{}{
		"status_code": resp.StatusCode,
		"url":         urlStr,
	}, nil
}

// ========== 字符串处理工具 ==========

// stringTool 字符串处理工具
func (r *ToolRegistry) stringTool(ctx context.Context, args map[string]interface{}) (interface{}, error) {
	text, _ := args["text"].(string)
	operation, _ := args["operation"].(string)

	if text == "" {
		return nil, fmt.Errorf("text is required")
	}

	var result string
	switch operation {
	case "upper":
		result = strings.ToUpper(text)
	case "lower":
		result = strings.ToLower(text)
	case "len":
		return map[string]interface{}{"length": len(text)}, nil
	default:
		result = text
	}

	return map[string]interface{}{
		"original":  text,
		"result":   result,
		"operation": operation,
	}, nil
}

// ========== JSON处理工具 ==========

// jsonTool JSON处理工具
func (r *ToolRegistry) jsonTool(ctx context.Context, args map[string]interface{}) (interface{}, error) {
	input, _ := args["input"].(string)
	operation, _ := args["operation"].(string)

	if input == "" {
		return nil, fmt.Errorf("input is required")
	}

	switch operation {
	case "parse":
		var result interface{}
		if err := json.Unmarshal([]byte(input), &result); err != nil {
			return nil, err
		}
		return result, nil
	case "stringify":
		var obj interface{}
		if err := json.Unmarshal([]byte(input), &obj); err != nil {
			return nil, err
		}
		result, _ := json.Marshal(obj)
		return string(result), nil
	default:
		return nil, fmt.Errorf("unknown operation: %s", operation)
	}
}

// ========== 转换工具 ==========

// convertTool 转换工具
func (r *ToolRegistry) convertTool(ctx context.Context, args map[string]interface{}) (interface{}, error) {
	value, _ := args["value"]
	toType, _ := args["to"].(string)

	if value == nil {
		return nil, fmt.Errorf("value is required")
	}

	switch toType {
	case "string":
		return fmt.Sprintf("%v", value), nil
	case "int":
		switch v := value.(type) {
		case float64:
			return int(v), nil
		case string:
			i, _ := strconv.Atoi(v)
			return i, nil
		}
	case "float":
		switch v := value.(type) {
		case float64:
			return v, nil
		case string:
			f, _ := strconv.ParseFloat(v, 64)
			return f, nil
		}
	}

	return value, nil
}

// randomNumberTool 生成随机数工具
func (r *ToolRegistry) randomNumberTool(ctx context.Context, args map[string]interface{}) (interface{}, error) {
	minVal := 0
	maxVal := 100

	if min, ok := args["min"].(float64); ok {
		minVal = int(min)
	}
	if max, ok := args["max"].(float64); ok {
		maxVal = int(max)
	}

	if minVal >= maxVal {
		return nil, fmt.Errorf("min must be less than max")
	}

	result := minVal + int(float64(maxVal-minVal) * rand.Float64())

	return map[string]interface{}{
		"min":   minVal,
		"max":   maxVal,
		"result": result,
	}, nil
}

// currentTimeTool 获取当前时间工具
func (r *ToolRegistry) currentTimeTool(ctx context.Context, args map[string]interface{}) (interface{}, error) {
	format, _ := args["format"].(string)
	if format == "" {
		format = "2006-01-02 15:04:05"
	}

	now := time.Now()
	return map[string]interface{}{
		"timestamp": now.Unix(),
		"datetime":  now.Format(format),
		"iso":       now.Format(time.RFC3339),
	}, nil
}
