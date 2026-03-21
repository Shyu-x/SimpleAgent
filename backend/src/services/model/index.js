/**
 * 模型层统一导出
 *
 * 企业级设计：通过统一的接口抽象，模型供应商逻辑与业务逻辑解耦。
 * 调用方只需使用 ChatModelClient 接口，无需关心具体实现。
 */

const { ChatModelClient, ModelOptions, StreamEventType } = require('./ChatModelClient');
const { createClient, registerClient, getAvailableProviders } = require('./ModelClientFactory');
const MiniMaxChatClient = require('./clients/MiniMaxChatClient');

module.exports = {
  // 核心接口
  ChatModelClient,
  ModelOptions,
  StreamEventType,

  // 工厂
  createClient,
  registerClient,
  getAvailableProviders,

  // 默认实现
  MiniMaxChatClient
};
