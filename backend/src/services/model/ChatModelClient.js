/**
 * 模型抽象层
 * 统一的聊天模型客户端接口，支持多种模型提供商
 */

/**
 * 聊天结果回调接口
 * @callback ChatResultCallback
 * @param {Object} chunk - 流式输出片段
 * @param {boolean} chunk.done - 是否完成
 * @param {string} chunk.content - 内容片段
 */

/**
 * 聊天选项
 * @typedef {Object} ChatOptions
 * @property {string} [model] - 模型ID
 * @property {number} [temperature] - 温度参数
 * @property {number} [maxTokens] - 最大token数
 * @property {ChatResultCallback} [onChunk] - 流式回调
 */

/**
 * 嵌入选项
 * @typedef {Object} EmbedOptions
 * @property {string} [model] - 嵌入模型
 * @property {string} [provider] - 提供商
 */

/**
 * 模型健康状态
 * @typedef {Object} ModelHealth
 * @property {boolean} available - 是否可用
 * @property {string} [error] - 错误信息
 * @property {number} [latency] - 延迟ms
 */

/**
 * 聊天模型客户端基类
 */
class ChatModelClient {
  /**
   * 发送聊天请求
   * @param {string} modelId - 模型ID
   * @param {Array} messages - 消息列表
   * @param {ChatOptions} options - 选项
   * @returns {Promise<Object>} 聊天结果
   */
  async chat(modelId, messages, options = {}) {
    throw new Error('chat() must be implemented by subclass');
  }

  /**
   * 发送流式聊天请求
   * @param {string} modelId - 模型ID
   * @param {Array} messages - 消息列表
   * @param {ChatOptions} options - 选项
   * @returns {Promise<void>}
   */
  async chatStream(modelId, messages, options = {}) {
    throw new Error('chatStream() must be implemented by subclass');
  }

  /**
   * 生成文本嵌入
   * @param {string|string[]} texts - 文本或文本列表
   * @param {EmbedOptions} options - 选项
   * @returns {Promise<number[][]>} 嵌入向量
   */
  async embed(texts, options = {}) {
    throw new Error('embed() must be implemented by subclass');
  }

  /**
   * 检查模型健康状态
   * @param {string} modelId - 模型ID
   * @returns {Promise<ModelHealth>} 健康状态
   */
  async getStatus(modelId) {
    throw new Error('getStatus() must be implemented by subclass');
  }

  /**
   * 获取提供商名称
   * @returns {string}
   */
  getProviderName() {
    return 'unknown';
  }
}

/**
 * MiniMax 聊天模型客户端实现
 */
class MiniMaxChatModelClient extends ChatModelClient {
  constructor(options = {}) {
    super();
    this.apiKey = options.apiKey || process.env.MINIMAX_API_KEY;
    this.baseURL = options.baseURL || process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/anthropic';
    this.defaultModel = options.defaultModel || 'MiniMax-M2.7';
  }

  getProviderName() {
    return 'minimax';
  }

  /**
   * 发送聊天请求
   */
  async chat(modelId, messages, options = {}) {
    const model = modelId || this.defaultModel;
    const url = `${this.baseURL}/v1/messages`;

    const body = {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 8192
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`MiniMax API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      usage: data.usage,
      model: data.model,
      stopReason: data.choices?.[0]?.finish_reason
    };
  }

  /**
   * 发送流式聊天请求
   */
  async chatStream(modelId, messages, options = {}) {
    const model = modelId || this.defaultModel;
    const url = `${this.baseURL}/v1/messages`;

    const body = {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 8192,
      stream: true
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`MiniMax API error: ${response.status} - ${error}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            if (options.onChunk) options.onChunk({ done: true, content: '' });
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (options.onChunk && content) {
              options.onChunk({ done: false, content });
            }
          } catch {}
        }
      }
    }
  }

  /**
   * 生成嵌入（简化实现）
   */
  async embed(texts, options = {}) {
    const textsArr = Array.isArray(texts) ? texts : [texts];
    // 返回零向量（简化实现）
    return textsArr.map(() => new Array(1024).fill(0));
  }

  /**
   * 检查模型健康状态
   */
  async getStatus(modelId) {
    const start = Date.now();
    try {
      await this.chat(modelId || this.defaultModel, [{ role: 'user', content: 'ping' }], { maxTokens: 1 });
      return { available: true, latency: Date.now() - start };
    } catch (error) {
      return { available: false, error: error.message, latency: Date.now() - start };
    }
  }
}

/**
 * 模型调用选项
 */
const ModelOptions = {
  TEMPERATURE_DEFAULT: 0.7,
  TEMPERATURE_CREATIVE: 0.9,
  TEMPERATURE_PRECISE: 0.3,
  MAX_TOKENS_DEFAULT: 8192,
  MAX_TOKENS_LONG: 32000,
  MAX_TOKENS_MAX: 100000,
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
  MiniMaxChatModelClient,
  ModelOptions,
  StreamEventType
};
