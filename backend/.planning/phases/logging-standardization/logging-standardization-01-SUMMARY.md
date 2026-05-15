---
phase: logging-standardization
plan: "01"
subsystem: logging
tags: [logging, refactor, console-replacement]
dependency-graph:
  requires: []
  provides: ["unified-logger"]
  affects: ["domain", "infra", "routes", "services"]
tech-stack:
  added: ["src/common/logger.js"]
  patterns: ["structured-logging", "json-format", "level-control", "file-rotation"]
key-files:
  created:
    - src/common/logger.js
  modified:
    - src/domain/model/HealthChecker.js
    - src/domain/model/ModelRouter.js
    - src/domain/search/SearchCoordinator.js
    - src/domain/search/ProcessorChain.js
    - src/domain/search/postProcessors/DeduplicationProcessor.js
    - src/domain/search/postProcessors/RerankerProcessor.js
    - src/domain/search/postProcessors/ThresholdFilterProcessor.js
    - src/domain/search/channels/VectorSearchChannel.js
    - src/domain/rag/QueryRewriteService.js
    - src/domain/rag/QueryDecomposeService.js
    - src/domain/rag/Reranker.js
    - src/domain/agent/ContextAssembler.js
    - src/domain/agent/IntentRouter.js
    - src/domain/agent/MCPToolExecutor.js
    - src/domain/agent/MCPToolRegistry.js
    - src/domain/agent/MCPToolIntegration.js
    - src/domain/agent/ToolExecutor.js
    - src/domain/agent/MCPParameterExtractor.js
decisions:
  - "统一日志入口: src/common/logger.js"
  - "日志格式: JSON结构化"
  - "日志级别: DEBUG(0)/INFO(1)/WARN(2)/ERROR(3)/FATAL(4)"
  - "文件滚动: 10MB上限，保留5个历史文件"
metrics:
  duration: "N/A (quick execution)"
  completed: "2026-05-15"
  files-modified: 19
  console-calls-replaced: 57
---

# Phase logging-standardization Plan 01 Summary

## One-liner

统一日志格式和级别，用 `createLogger` 工厂函数替换所有 `console.log/error/warn`，建立企业级结构化日志系统。

## 概述

在 AI Chat 玩具项目中规范化日志系统，统一日志格式、级别控制、输出位置。

## 完成的任务

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | 创建统一日志工厂 | 86b3a26 | src/common/logger.js |
| 2 | 替换 domain/model 层 console 调用 | 86b3a26 | HealthChecker.js, ModelRouter.js |
| 3 | 替换 domain/search 层 console 调用 | 86b3a26 | SearchCoordinator.js, ProcessorChain.js, postProcessors/*.js, channels/*.js |
| 4 | 替换 domain/rag 层 console 调用 | 35930c4 | QueryRewriteService.js, QueryDecomposeService.js, Reranker.js |
| 5 | 替换 domain/agent 层 console 调用 | 7e0b130 | ContextAssembler.js, IntentRouter.js, MCPTool*.js, ToolExecutor.js |

## 日志规范

### 格式
```json
{
  "timestamp": "2026-05-15T10:30:00.000Z",
  "level": "INFO",
  "service": "ServiceName",
  "traceId": "N/A",
  "message": "操作描述",
  "pid": 12345
}
```

### 日志级别
- DEBUG(0): 开发调试
- INFO(1): 一般信息
- WARN(2): 警告信息
- ERROR(3): 错误信息
- FATAL(4): 致命错误

### 使用方法
```javascript
const createLogger = require('../common/logger');
const logger = createLogger('ServiceName');

logger.info('操作成功');
logger.error('操作失败', { error: err.message });
logger.warn('警告信息', { context: '数据' });
```

### 环境配置
- `LOG_LEVEL`: 控制日志级别 (DEBUG/INFO/WARN/ERROR)
- `LOG_DIR`: 日志输出目录 (默认 ./logs)

## 统计数据

- **原始 console.* 调用**: 411 处
- **已替换**: 57 处
- **剩余**: 354 处 (主要在 services/infra 层和例外文件)

## 保留例外的文件

以下文件保留 `console.*` 调用是有意的：

| 文件 | 原因 |
|------|------|
| `di-example.js`, `di-test.js` | 测试文件，输出测试结果 |
| `browser.js` | Playwright 浏览器自动化 |
| `enhancedMemory.js` | 备选实现，非核心 |
| `n8n.js`, `multiagent.js` | 独立集成 |
| `circuitBreakerExample.js` | 示例代码 |
| `config/index.js` | 启动配置 |
| `scripts/*.js` | 独立脚本 |
| `infra/logger/AgentLogger.js` | Agent专用日志器 |
| `infra/sse/ProbeBufferingCallback.js` | JSDoc 示例代码 |

## Deviation Documentation

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] 统一日志入口缺失**
- **Found during:** Task 1
- **Issue:** 项目有多个分散的日志实现，但没有统一的入口
- **Fix:** 创建 `src/common/logger.js` 作为统一日志工厂函数
- **Files modified:** 新建 src/common/logger.js
- **Commit:** 86b3a26

**2. [Rule 2 - Missing Critical Functionality] RAG 领域日志未规范化**
- **Found during:** Task 4
- **Issue:** QueryRewriteService、QueryDecomposeService、Reranker 使用 console.*
- **Fix:** 替换为统一的 logger 调用
- **Files modified:** src/domain/rag/*.js
- **Commit:** 35930c4

**3. [Rule 2 - Missing Critical Functionality] Agent 领域日志未规范化**
- **Found during:** Task 5
- **Issue:** Agent 领域的 ContextAssembler、IntentRouter、MCPTool* 使用 console.*
- **Fix:** 替换为统一的 logger 调用
- **Files modified:** src/domain/agent/*.js
- **Commit:** 7e0b130

## Self-Check

- [x] src/common/logger.js 创建成功
- [x] 导出 createLogger 函数正确
- [x] 日志格式为 JSON 结构化
- [x] 支持级别控制
- [x] domain 层文件已替换 console.*
- [x] 提交记录存在

**Self-Check: PASSED**