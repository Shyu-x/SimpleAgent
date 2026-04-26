/**
 * 模型路由模块导出
 * @description 多模型路由、健康检查、故障转移和统一模型接口
 */

const {
  ModelRouter,
  MiniMaxModelRouter,
  RouterStrategy,
  RouterEvent
} = require('./ModelRouter');

const {
  HealthChecker,
  ModelHealthCheckerFactory,
  HealthStatus,
  CheckStrategy
} = require('./HealthChecker');

const {
  BaseChatModelClient,
  MiniMaxChatModelClient,
  ChatModelClientFactory,
  StreamingCallback,
  ModelErrorType,
  TimeoutConfig
} = require('./ChatModelClient');

module.exports = {
  // 路由核心
  ModelRouter,
  MiniMaxModelRouter,
  RouterStrategy,
  RouterEvent,

  // 健康检查
  HealthChecker,
  ModelHealthCheckerFactory,
  HealthStatus,
  CheckStrategy,

  // 模型客户端 (统一接口)
  BaseChatModelClient,
  MiniMaxChatModelClient,
  ChatModelClientFactory,
  StreamingCallback,
  ModelErrorType,
  TimeoutConfig
};
