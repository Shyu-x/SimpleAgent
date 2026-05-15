/**
 * QueryDecomposeService - 依赖注入配置文件
 *
 * 企业级设计：
 * - 将 Domain 层的 QueryDecomposeService 与 Infrastructure 层的 MiniMaxChatClient 解耦
 * - 通过 DI 容器统一管理依赖注入
 * - 符合分层架构原则：Domain 层不直接依赖 Services 层
 *
 * 使用方式：
 * // 在应用启动时注册
 * const container = require('./container');
 * require('./QueryDecomposeService.di').register(container);
 *
 * // 解析使用
 * const service = container.resolve('queryDecomposeService');
 */

const { QueryDecomposeService } = require('./QueryDecomposeService');
const { MiniMaxChatClient } = require('../../services/model');

/**
 * 注册 QueryDecomposeService 到 DI 容器
 *
 * @param {Object} container - DI 容器实例
 * @param {Object} options - 可选的默认配置
 */
function register(container, options = {}) {
  // 注册 modelClient 为单例
  container.register('modelClient', () => {
    return new MiniMaxChatClient({
      apiKey: process.env.MINIMAX_API_KEY,
      baseUrl: process.env.MINIMAX_BASE_URL,
      defaultModel: 'MiniMax-M2.7',
    });
  }, { singleton: true });

  // 注册 QueryDecomposeService，注入 modelClient
  container.register('queryDecomposeService', () => {
    return new QueryDecomposeService({
      modelClient: container.resolve('modelClient'),
      defaultModel: options.defaultModel || 'MiniMax-M2.7',
      maxSubQuestions: options.maxSubQuestions || 5,
      confidenceThreshold: options.confidenceThreshold || 0.5,
      enableLLMDetect: options.enableLLMDetect !== false,
    });
  }, { singleton: true });
}

module.exports = {
  register,
  QueryDecomposeService,
};