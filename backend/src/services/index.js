/**
 * Agent 增强模块整合
 * 统一导出所有增强功能
 */

// 核心引擎
const AgentEngine = require('./agentEngine');
const { EnhancedAgentEngine, CheckpointManager, DualMemorySystem, HumanInTheLoopManager } = require('./enhancedAgentEngine');

// 记忆系统
const MemoryService = require('./memory');
const { EnhancedMemoryService, MemoryType, MemoryPriority } = require('./enhancedMemory');

// 错误处理
const {
  ErrorCodes,
  AgentError,
  RetryStrategy,
  RecoveryManager,
  GlobalErrorHandler,
  globalErrorHandler,
  recoveryManager
} = require('./errorHandler');

// 状态持久化
const { StatePersistence, CheckpointStatus } = require('./statePersistence');

// 回滚管理
const {
  RollbackManager,
  RollbackRecord,
  RollbackType,
  TransactionManager,
  createRollbackableOperation
} = require('./rollbackManager');

// 性能监控
const {
  PerformanceMonitor,
  ResourceMonitor,
  MetricType,
  globalMonitor
} = require('./performanceMonitor');

// 工具调度
const { ToolScheduler, SmartToolSelector, Priority } = require('./toolScheduler');

// MCP 协议
const { MCPService, mcpTool } = require('./mcp');

// 工具系统
const {
  ToolRegistry,
  createDefaultToolRegistry,
  TOOL_CATEGORIES
} = require('./tools');

// 聊天服务
const chatService = require('./chatService');

/**
 * 创建增强版 Agent
 */
function createEnhancedAgent(options = {}) {
  const engine = new EnhancedAgentEngine({
    maxIterations: options.maxIterations || 10,
    enableCheckpoints: options.enableCheckpoints !== false,
    enableHumanLoop: options.enableHumanLoop !== false,
    toolOptions: options.toolOptions || {},
    memoryOptions: options.memoryOptions || {}
  });

  // 注入性能监控
  if (options.enableMonitoring !== false) {
    const monitor = new PerformanceMonitor();
    engine.monitor = monitor;

    // 包装执行方法
    const originalExecute = engine.execute.bind(engine);
    engine.execute = async function(task, context) {
      const sessionId = engine.sessionId;
      monitor.startSession(sessionId);

      try {
        const result = await originalExecute(task, context);
        monitor.endSession(sessionId, result);
        return result;
      } catch (error) {
        monitor.endSession(sessionId, { error: error.message });
        throw error;
      }
    };
  }

  return engine;
}

/**
 * Agent 系统健康检查
 */
async function healthCheck() {
  const results = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    components: {}
  };

  // 检查内存系统
  try {
    const memory = new MemoryService();
    results.components.memory = { status: 'ok', type: 'basic' };
  } catch (error) {
    results.components.memory = { status: 'error', message: error.message };
    results.status = 'degraded';
  }

  // 检查工具注册
  try {
    const registry = createDefaultToolRegistry();
    const tools = registry.listTools();
    results.components.tools = { status: 'ok', count: tools.length };
  } catch (error) {
    results.components.tools = { status: 'error', message: error.message };
    results.status = 'degraded';
  }

  // 检查状态持久化
  try {
    const persistence = new StatePersistence();
    results.components.persistence = { status: 'ok' };
  } catch (error) {
    results.components.persistence = { status: 'error', message: error.message };
    results.status = 'degraded';
  }

  // 检查 MCP
  try {
    const mcp = new MCPService();
    results.components.mcp = { status: 'ok' };
  } catch (error) {
    results.components.mcp = { status: 'error', message: error.message };
    results.status = 'degraded';
  }

  return results;
}

/**
 * 获取系统统计
 */
function getSystemStats() {
  const mem = process.memoryUsage();

  return {
    memory: {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      rss: mem.rss
    },
    uptime: process.uptime(),
    nodeVersion: process.version,
    platform: process.platform
  };
}

module.exports = {
  // 引擎
  AgentEngine,
  EnhancedAgentEngine,

  // 记忆
  MemoryService,
  EnhancedMemoryService,
  MemoryType,
  MemoryPriority,

  // 检查点
  CheckpointManager,
  StatePersistence,
  CheckpointStatus,

  // 回滚管理
  RollbackManager,
  RollbackRecord,
  RollbackType,
  TransactionManager,
  createRollbackableOperation,

  // 错误处理
  ErrorCodes,
  AgentError,
  RetryStrategy,
  RecoveryManager,
  recoveryManager,

  // 人机协作
  HumanInTheLoopManager,

  // 性能监控
  PerformanceMonitor,
  ResourceMonitor,
  MetricType,
  globalMonitor,

  // 工具调度
  ToolScheduler,
  SmartToolSelector,
  Priority,

  // MCP
  MCPService,
  mcpTool,

  // 工具注册
  ToolRegistry,
  createDefaultToolRegistry,
  TOOL_CATEGORIES,

  // 工厂函数
  createEnhancedAgent,

  // 工具函数
  healthCheck,
  getSystemStats,

  // 聊天服务
  chatService
};