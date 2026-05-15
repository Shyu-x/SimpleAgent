# Plan: 日志系统规范化

## 前置信息

- **Phase:** logging-standardization
- **Plan:** 01
- **Type:** refactor
- **Autonomous:** true
- **Wave:** 1
- **Tags:** logging, refactor, console-replacement

## 目标

统一 AI Chat 玩具项目的日志格式和级别，用 `createLogger` 工厂函数替换所有 `console.log/error/warn`。

## 上下文

- **现状分析:**
  - 已有两个 AgentLogger 实现:
    1. `src/infra/logger/AgentLogger.js` - 通用结构化日志 (生产级)
    2. `src/services/AgentLogger.js` - MiniMax Mini-Agent 风格 (Agent专用)
  - 36 个文件已导入 `AgentLogger`
  - 但仍有 **98 个文件** 使用 `console.log/error/warn` (共 411+ 处)

- **已有日志规范:**
  - 格式: `[LEVEL] [TIMESTAMP] [MODULE] message`
  - JSON 结构化输出
  - 支持日志级别: DEBUG/INFO/WARN/ERROR/FATAL
  - 支持文件滚动

## 任务

### Task 1: 创建统一日志工厂 (type: auto)

**行为:**
1. 在 `src/common/` 创建 `logger.js` 作为统一入口
2. 导出 `createLogger(serviceName, options)` 工厂函数
3. 支持级别配置 (环境变量 `LOG_LEVEL`)
4. 文档化日志规范

**验证:**
- 文件创建成功
- 导出正确

### Task 2: 替换 routes 层 console 调用 (type: auto)

**行为:**
1. 遍历 `src/routes/` 下所有文件
2. 替换 `console.log/error/warn` 为 `logger.info/error/warn`
3. 导入 `createLogger` 并创建模块级 logger

**文件列表:**
- `admin/model.js`
- `a2a.js`
- `chat.js`
- `hitl.js`
- `hitlSSE.js`
- `memories.js`
- `missionControl.js`
- `plugins.js`
- `proxy.js`
- `rag.js`
- `search.js`
- `searchEnhanced.js`
- `mcp.js`
- `minimaxMcp.js`

**验证:**
- `grep -c "console\." src/routes/*.js` 应为 0

### Task 3: 替换 services 层 console 调用 (type: auto)

**行为:**
1. 遍历 `src/services/` 下所有文件
2. 替换 `console.log/error/warn` 为 `logger.info/error/warn`

**验证:**
- `grep -c "console\." src/services/*.js` 应为 0

### Task 4: 替换 domain 层 console 调用 (type: auto)

**行为:**
1. 遍历 `src/domain/` 下所有文件
2. 替换 `console.log/error/warn` 为 `logger.info/error/warn`

**验证:**
- `grep -c "console\." src/domain/**/*.js` 应为 0

### Task 5: 替换 infra 层 console 调用 (type: auto)

**行为:**
1. 遍历 `src/infra/` 下所有文件
2. 替换 `console.log/error/warn` 为 `logger.info/error/warn`

**验证:**
- `grep -c "console\." src/infra/**/*.js` 应为 0

### Task 6: 保留的文件例外处理 (type: auto)

**行为:**
1. 确认以下文件可以保留 `console.*` (测试/示例/独立脚本):
   - `di-example.js`, `di-test.js` - 测试文件
   - `browser.js` - Playwright 浏览器自动化
   - `enhancedMemory.js`, `enhancedAgentEngine.js` - 备选实现
   - `n8n.js`, `multiagent.js` - 独立集成
   - `circuitBreakerExample.js` - 示例代码
   - `config/index.js` - 启动配置

2. 验证这些文件确实是有意保留

**验证:**
- 文档化例外文件列表
- 确认例外文件不在核心业务逻辑路径

### Task 7: 最终验证 (type: auto)

**行为:**
1. 统计剩余 `console.*` 数量
2. 验证 `createLogger` 导出正确
3. 运行基本功能测试

**验证:**
- 核心文件无 `console.*`
- 日志文件正确输出到 `./logs/`
- 项目能正常启动

## 输出规范

创建 `logging-standardization-01-SUMMARY.md`:
- 完成的任务列表
- 替换的文件数/行数
- 例外文件及原因
- 新的日志规范说明