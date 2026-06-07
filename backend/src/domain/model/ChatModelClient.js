/**
 * ChatModelClient 接口
 * 统一的聊天模型调用接口，支持多提供商抽象
 *
 * 设计目标：
 * 1. 提供统一的模型调用接口
 * 2. 支持模型提供商可插拔
 * 3. 内置熔断、重试、超时控制
 * 4. 流式输出支持
 *
 * @author AI Chat 玩具团队
 * @date 2026-04-01
 */

const { withRetry, withTimeout, TimeoutConfig } = require('../../utils/retry');
const EventEmitter = require('events');
const AppError = require('../../common/errors/AppError');
const { ERROR_CLASSIFICATION, classifyRetryableError } = require('../../common/errors/errorClassifier');

// 向后兼容的错误类型别名
const ModelErrorType = {
  TRANSIENT: ERROR_CLASSIFICATION.TRANSIENT,
  AUTHENTICATION: ERROR_CLASSIFICATION.AUTHENTICATION,
  RATE_LIMIT: ERROR_CLASSIFICATION.RATE_LIMIT,
  PARAMETER: ERROR_CLASSIFICATION.PARAMETER,
  NETWORK: ERROR_CLASSIFICATION.TRANSIENT,  // NETWORK 映射到 TRANSIENT
  UNKNOWN: ERROR_CLASSIFICATION.UNKNOWN
};

// 流式回调接口
class StreamingCallback {
  constructor(onChunk, onComplete, onError) {
    this.onChunk = onChunk || (() => {});
    this.onComplete = onComplete || (() => {});
    this.onError = onError || (() => {});
    this.fullContent = '';
  }

  chunk(content) {
    this.fullContent += content;
    this.onChunk(content);
  }

  complete() {
    this.onComplete(this.fullContent);
  }

  error(err) {
    this.onError(err);
  }
}

/**
 * 基础模型客户端抽象类
 */
class BaseChatModelClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.name = options.name || 'BaseChatModel';
    this.timeout = options.timeout || TimeoutConfig.DEFAULT_TIMEOUT;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;

    // 熔断器状态
    this.circuitState = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000;
    this.lastFailureTime = null;
  }

  /**
   * 同步调用 - 子类实现
   */
  async chat(messages, options = {}) {
    throw AppError.internalError('chat() must be implemented by subclass');
  }

  /**
   * 流式调用 - 子类实现
   */
  async chatStream(messages, options = {}, callback = null) {
    throw AppError.internalError('chatStream() must be implemented by subclass');
  }

  /**
   * 带重试和超时的聊天调用
   */
  async invoke(messages, options = {}) {
    // 检查熔断器
    if (this._isCircuitOpen()) {
      throw AppError.internalError(`Circuit breaker is OPEN for ${this.name}`);
    }

    try {
      const result = await withTimeout(
        withRetry(
          () => this.chat(messages, options),
          {
            maxRetries: this.maxRetries,
            initialDelayMs: this.retryDelay,
            retryableErrors: [ModelErrorType.TRANSIENT, ModelErrorType.NETWORK, ModelErrorType.RATE_LIMIT]
          }
        ),
        options.timeout || this.timeout
      );

      // 成功，重置熔断器
      this._onSuccess();
      return result;

    } catch (error) {
      // 失败，记录并可能打开熔断器
      this._onFailure(error);
      throw error;
    }
  }

  /**
   * 带重试和超时的流式聊天调用
   */
  async invokeStream(messages, options = {}, callback = null) {
    if (this._isCircuitOpen()) {
      throw AppError.internalError(`Circuit breaker is OPEN for ${this.name}`);
    }

    const streamingCb = callback || new StreamingCallback();

    try {
      await withTimeout(
        withRetry(
          () => this.chatStream(messages, options, streamingCb),
          {
            maxRetries: this.maxRetries,
            initialDelayMs: this.retryDelay,
            retryableErrors: [ModelErrorType.TRANSIENT, ModelErrorType.NETWORK]
          }
        ),
        options.timeout || this.timeout
      );

      this._onSuccess();
      streamingCb.complete();

    } catch (error) {
      this._onFailure(error);
      streamingCb.error(error);
      throw error;
    }
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      await this.invoke([{ role: 'user', content: 'ping' }], { maxTokens: 5 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取客户端元信息
   */
  getMetadata() {
    return {
      name: this.name,
      circuitState: this.circuitState,
      failureCount: this.failureCount
    };
  }

  // ==================== 熔断器逻辑 ====================

  _isCircuitOpen() {
    if (this.circuitState === 'CLOSED') return false;

    if (this.circuitState === 'OPEN') {
      // 检查是否超时可以进入 HALF_OPEN
      if (this.lastFailureTime &&
          Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.circuitState = 'HALF_OPEN';
        return false;
      }
      return true;
    }

    return false; // HALF_OPEN 允许尝试
  }

  _onSuccess() {
    this.failureCount = 0;
    this.circuitState = 'CLOSED';
  }

  _onFailure(error) {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.circuitState = 'OPEN';
      this.emit('circuit_open', { model: this.name, failureCount: this.failureCount });
    }
  }

  /**
   * 手动重置熔断器
   */
  resetCircuit() {
    this.circuitState = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
  }

  /**
   * 分类错误类型
   */
  static classifyError(error) {
    return classifyRetryableError(error);
  }
}

/**
 * MiniMax 模型客户端
 */
class MiniMaxChatModelClient extends BaseChatModelClient {
  constructor(options = {}) {
    super({ name: 'MiniMax', ...options });
    this.apiKey = options.apiKey || process.env.MINIMAX_API_KEY;
    this.baseURL = options.baseURL || 'https://api.minimaxi.com/anthropic';
    this.model = options.model || 'MiniMax-M2.7';
  }

  async chat(messages, options = {}) {
    const response = await fetch(`${this.baseURL}/v1/text/chatcompletion_v2`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        ...options
      })
    });

    if (!response.ok) {
      const error = new Error(`MiniMax API error: ${response.status}`);
      error.type = MiniMaxChatModelClient.classifyError(error);
      throw error;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async chatStream(messages, options = {}, callback = null) {
    const response = await fetch(`${this.baseURL}/v1/text/chatcompletion_v2`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: true,
        ...options
      })
    });

    if (!response.ok) {
      const error = new Error(`MiniMax API error: ${response.status}`);
      error.type = MiniMaxChatModelClient.classifyError(error);
      throw error;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.choices?.[0]?.delta?.content) {
            callback?.chunk(data.choices[0].delta.content);
          }
        }
      }
    }
  }

  async healthCheck() {
    try {
      await this.invoke([{ role: 'user', content: 'ping' }], { maxTokens: 5 });
      return true;
    } catch {
      return false;
    }
  }

  getMetadata() {
    return {
      ...super.getMetadata(),
      model: this.model,
      baseURL: this.baseURL
    };
  }
}

/**
 * 模型客户端工厂
 */
class ChatModelClientFactory {
  static create(type, options = {}) {
    switch (type) {
      case 'minimax':
        return new MiniMaxChatModelClient(options);

      // 未来可扩展其他提供商
      // case 'openai':
      //   return new OpenAIChatModelClient(options);
      // case 'anthropic':
      //   return new AnthropicChatModelClient(options);

      default:
        throw AppError.internalError(`Unknown model client type: ${type}`);
    }
  }

  static createMiniMax(options = {}) {
    return new MiniMaxChatModelClient(options);
  }
}

module.exports = {
  BaseChatModelClient,
  MiniMaxChatModelClient,
  ChatModelClientFactory,
  StreamingCallback,
  ModelErrorType,
  TimeoutConfig
};
