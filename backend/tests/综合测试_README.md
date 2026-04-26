# AI Chat 项目 - 综合测试文档

## 测试概览

本目录包含 AI Chat 项目的综合测试用例，覆盖以下测试领域：

| 测试文件 | 描述 | 测试数量 |
|---------|------|----------|
| `综合测试_API端点.test.js` | API 端点功能与错误处理 | ~40 |
| `综合测试_RAG检索与向量处理.test.js` | RAG Pipeline 组件测试 | ~50 |
| `综合测试_工具执行系统.test.js` | 工具注册、执行、超时控制 | ~40 |
| `综合测试_SSE流式响应.test.js` | SSE 流式响应与状态管理 | ~40 |
| `综合测试_运行器.js` | 统一运行所有测试 | - |
| `E2E聊天功能测试.js` | Playwright E2E 测试 | ~25 |

## 运行测试

### 后端单元测试

```bash
# 运行单个测试文件
cd backend/tests
node 综合测试_API端点.test.js

# 运行所有综合测试
node 综合测试_运行器.js

# 运行 RAG Pipeline 测试
node 综合测试_RAG检索与向量处理.test.js

# 运行工具执行系统测试
node 综合测试_工具执行系统.test.js

# 运行 SSE 流式响应测试
node 综合测试_SSE流式响应.test.js
```

### 前端 E2E 测试

```bash
# 确保前端服务已启动 (http://localhost:3001)
cd frontend

# 运行 E2E 聊天测试
node tests/E2E聊天功能测试.js

# 或使用 Playwright CLI
npx playwright test
```

## 测试覆盖范围

### 1. API 端点测试

- [x] 健康检查端点
- [x] Chat API 端点
- [x] RAG API 端点（知识库 CRUD、检索）
- [x] Agent API 端点
- [x] HITL API 端点
- [x] 工具管理 API
- [x] 指标 API
- [x] 搜索 API
- [x] 内存 API
- [x] 错误处理与边界测试

### 2. RAG Pipeline 测试

- [x] 问题重写服务（QueryRewriteService）
- [x] 问题拆分服务（QueryDecomposeService）
- [x] 相似度计算（余弦相似度、词重叠）
- [x] 检索通道（SearchChannel）
- [x] 重排序服务（RerankerService）
- [x] RAG Pipeline 集成
- [x] 引用组装服务（CitationAssembler）

### 3. 工具执行系统测试

- [x] 工具注册表（ToolRegistry）
- [x] 工具执行器（ToolExecutor）
- [x] 参数验证（ParameterValidator）
- [x] MCP 工具执行器
- [x] 工具结果合并（ToolResultMerger）
- [x] 超时控制（TimeoutController）

### 4. SSE 流式响应测试

- [x] SSE 事件解析
- [x] SSE 连接状态管理
- [x] SSE 事件缓冲
- [x] SSE 流式处理器
- [x] 首包探测（FirstChunkProbe）
- [x] SSE 错误分类
- [x] SSE 流式响应模拟
- [x] SSE 请求验证

### 5. E2E 测试

- [x] 页面加载与初始化
- [x] 聊天输入与发送
- [x] AI 响应验证
- [x] 侧边栏与对话历史
- [x] 模式切换（聊天/Agent）
- [x] 知识库面板
- [x] 设置面板
- [x] 快捷键功能
- [x] 响应式布局（桌面/平板/手机）
- [x] 错误处理

## 测试工具

测试使用原生 JavaScript 实现，无需 Jest/Vitest 等测试框架依赖。测试包含：

- `assertEqual(actual, expected, message)` - 值相等断言
- `assertTrue(condition, message)` - 条件为真断言
- `assertThrows(fn, message)` - 异常抛出断言
- `assertArrayContains(array, item, message)` - 数组包含断言

## 测试原则

1. **独立性**：每个测试用例可独立运行
2. **可重复性**：测试结果稳定，可重复执行
3. **清晰性**：测试名称使用中文描述
4. **覆盖性**：覆盖正常路径和边界条件
5. **隔离性**：测试间无依赖关系

## 持续集成

建议在 CI/CD 流程中运行测试：

```yaml
# .github/workflows/test.yml 示例
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v2
    - name: Run backend tests
      run: |
        cd backend/tests
        node 综合测试_运行器.js
    - name: Run frontend tests
      run: |
        cd frontend
        node tests/E2E聊天功能测试.js
```

## 测试报告

测试运行后会输出：

```
========================================
测试完成: XX 通过, XX 失败
========================================
```

E2E 测试会生成截图保存在 `test-results/` 目录。

## 注意事项

1. 运行后端测试需要先启动后端服务 (`npm start`)
2. 运行 E2E 测试需要先启动前端服务 (`npm run dev`)
3. 部分 API 测试需要有效的 MiniMax API Key
4. E2E 测试需要安装 Playwright (`npm install playwright`)
