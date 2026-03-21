# API 集成测试

## 测试文件

| 文件 | 描述 | 测试路由 |
|------|------|----------|
| `api_chat.test.js` | 聊天接口测试 | `/api/chat` |
| `api_search.test.js` | 搜索接口测试 | `/api/search` |
| `api_agent.test.js` | Agent接口测试 (A2A) | `/api/agent` |
| `api_rag.test.js` | RAG知识库接口测试 | `/api/rag` |
| `api_config.test.js` | 配置接口测试 | `/api/config` |

## 运行测试

### 前置条件
1. 后端服务必须运行在 `http://localhost:30000`
2. 确保所有依赖已安装

### 启动后端
```bash
cd backend
npm start
```

### 运行所有测试
```bash
cd backend/tests
node run_tests.js
```

### 运行单个测试
```bash
node run_tests.js chat      # 只测试聊天接口
node run_tests.js search    # 只测试搜索接口
node run_tests.js agent     # 只测试Agent接口
node run_tests.js rag       # 只测试RAG接口
node run_tests.js config    # 只测试配置接口
```

## 测试覆盖

### Chat API (`/api/chat`)
- [x] messages 参数必填验证
- [x] 空消息数组验证
- [x] message 字符串参数支持
- [x] 消息数量限制 (100条)
- [x] stream 参数处理
- [x] 停止生成接口 (`/api/chat/stop`)
- [x] 请求体大小限制
- [x] 异常请求错误处理
- [x] XSS 恶意输入处理

### Search API (`/api/search`)
- [x] query 参数必填验证
- [x] source 参数验证
- [x] limit 参数边界值测试
- [x] format 参数 (json/markdown)
- [x] 获取搜索配置 (`/api/search/config`)
- [x] 获取搜索源列表 (`/api/search/providers`)
- [x] 测试搜索源 (`/api/search/test`)
- [x] 健康检查 (`/api/search/health`)
- [x] 空 query 验证
- [x] 超长 query 处理

### Agent API (`/api/agent`)
- [x] 获取 Agent 列表
- [x] 获取单个 Agent (404)
- [x] 发送消息参数验证
- [x] 心跳检测接口
- [x] SSE 订阅
- [x] 空消息体处理
- [x] 超长消息处理

### RAG API (`/api/rag`)
- [x] 创建知识库 (name 必填)
- [x] 列出所有知识库
- [x] 获取知识库详情 (404)
- [x] 删除知识库
- [x] 添加文档 (content 必填)
- [x] 检索知识 (query 必填)
- [x] 获取上下文 (query 必填)
- [x] 获取统计信息
- [x] topK 参数边界值
- [x] similarityThreshold 范围验证

### Config API (`/api/config`)
- [x] 获取所有配置
- [x] 获取渠道列表
- [x] 获取/更新指定渠道
- [x] 切换渠道启用状态
- [x] API Key 管理 (GET/POST)
- [x] 默认配置 (GET/PUT)
- [x] 无效 provider 处理
- [x] 无效 channel 处理

## 测试方法

测试使用原生 `http` 模块发起请求，不依赖外部测试框架：

```javascript
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    // 使用 http.request 发起请求
    // 返回 { status, headers, body }
  });
}
```

## 预期结果

- 所有测试应返回预期的 HTTP 状态码
- 错误响应应包含 `error` 字段
- 成功响应应包含 `success: true` 或对应数据字段
