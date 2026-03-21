/**
 * ChatModelClient 接口 - 模型调用抽象
 *
 * 为什么需要这个接口：
 * 企业里需要能随时切换模型供应商（MiniMax → OpenAI → Claude等）
 * 如果硬编码，切换模型需要改核心代码，风险极高。
 *
 * 使用策略模式：不同模型供应商实现同一接口，调用方无需关心具体实现。
 * 不用这个模式的问题：每加一个模型就要改一堆地方，很容易引入bug。
 */

class ChatModelClient {
  /**
   * 发送聊天请求
   * @param {Object} request - 请求参数
   * @param {Array} request.messages - 消息列表
   * @param {Object} request.options - 选项 (temperature, max_tokens, stream等)
   * @returns {Promise<Object|Stream>} 返回解析后的响应或流
   */
  async chat(request) {
    throw new Error('ChatModelClient.chat() must be implemented');
  }

  /**
   * 流式聊天
   * @param {Object} request - 请求参数
   * @param {Function} onChunk - 流式回调 (chunk) => void
   * @param {Function} onComplete - 完成回调 () => void
   * @param {Function} onError - 错误回调 (error) => void
   */
  async chatStream(request, onChunk, onComplete, onError) {
    throw new Error('ChatModelClient.chatStream() must be implemented');
  }

  /**
   * 获取模型信息
   * @returns {Object} 模型配置信息
   */
  getModelInfo() {
    throw new Error('ChatModelClient.getModelInfo() must be implemented');
  }

  /**
   * 健康检查
   * @returns {Promise<boolean>} 是否健康
   */
  async healthCheck() {
    throw new Error('ChatModelClient.healthCheck() must be implemented');
  }
}

/**
 * 模型调用选项
 */
const ModelOptions = {
  // 温度参数
  TEMPERATURE_DEFAULT: 0.7,
  TEMPERATURE_CREATIVE: 0.9,
  TEMPERATURE_PRECISE: 0.3,

  // Token限制
  MAX_TOKENS_DEFAULT: 8192,
  MAX_TOKENS_LONG: 32000,
  MAX_TOKENS_MAX: 100000,

  // 超时 (ms)
  TIMEOUT_DEFAULT: 120000,
  TIMEOUT_SHORT: 30000,
  TIMEOUT_LONG: 300000
};

/**
 * 流式事件类型
 */
const StreamEventType = {
  TEXT_DELTA: 'text_delta',
  THINKING_DELTA: 'thinking_delta',
  MESSAGE_STOP: 'message_stop',
  ERROR: 'error'
};

module.exports = {
  ChatModelClient,
  ModelOptions,
  StreamEventType
};
