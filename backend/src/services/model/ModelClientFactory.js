/**
 * 模型客户端工厂
 *
 * 为什么需要工厂模式：
 * 调用方只需要知道"我要一个ChatModelClient"，不需要知道是MiniMax还是OpenAI。
 * 工厂根据配置创建对应的客户端实例，后续加新供应商只需注册新类。
 *
 * 不用工厂的问题：调用方需要知道所有模型供应商的构造函数，耦合严重。
 */

const MiniMaxChatClient = require('./clients/MiniMaxChatClient');
const AppError = require('../../common/errors/AppError');

// 客户端注册表
const clientRegistry = new Map();

/**
 * 注册模型客户端
 * @param {string} provider - 提供商名称
 * @param {Class} ClientClass - 客户端类
 */
function registerClient(provider, ClientClass) {
  clientRegistry.set(provider.toLowerCase(), ClientClass);
}

// 默认注册 MiniMax
registerClient('minimax', MiniMaxChatClient);

/**
 * 创建模型客户端
 * @param {string} provider - 提供商名称
 * @param {Object} options - 客户端配置
 * @returns {ChatModelClient}
 */
function createClient(provider, options = {}) {
  const Provider = provider.toLowerCase();
  const ClientClass = clientRegistry.get(Provider);

  if (!ClientClass) {
    const available = Array.from(clientRegistry.keys()).join(', ');
    throw AppError.internalError(`Unknown provider: ${provider}. Available: ${available}`);
  }

  return new ClientClass(options);
}

/**
 * 获取已注册的提供商列表
 */
function getAvailableProviders() {
  return Array.from(clientRegistry.keys());
}

module.exports = {
  registerClient,
  createClient,
  getAvailableProviders
};
