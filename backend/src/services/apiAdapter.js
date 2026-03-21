// API适配层 - 参考One API设计
// 统一多平台调用格式，支持OpenAI兼容接口

const { channels } = require('../data/mockData');

// 渠道管理服务
class ChannelService {
  // 获取所有渠道
  static getAllChannels() {
    return channels;
  }

  // 获取启用的渠道
  static getEnabledChannels() {
    return channels.filter(c => c.enabled);
  }

  // 获取指定渠道
  static getChannel(channelId) {
    return channels.find(c => c.id === channelId);
  }

  // 切换渠道状态
  static toggleChannel(channelId) {
    const channel = channels.find(c => c.id === channelId);
    if (channel) {
      channel.enabled = !channel.enabled;
      return channel;
    }
    return null;
  }

  // 更新渠道API配置
  static updateChannel(channelId, config) {
    const channel = channels.find(c => c.id === channelId);
    if (channel) {
      Object.assign(channel, config);
      return channel;
    }
    return null;
  }
}

// 统一API适配器 - 将请求转换为各平台格式
class APIAdapter {
  // OpenAI格式转换为目标平台格式
  static adaptRequest(channelId, openaiRequest) {
    const channel = ChannelService.getChannel(channelId);
    if (!channel) {
      throw new Error(`渠道 ${channelId} 不存在`);
    }

    const { model, messages, stream, temperature, max_tokens } = openaiRequest;

    // 统一的请求格式
    const adaptedRequest = {
      model: model || channel.defaultModel,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      stream: stream !== false,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 4096
    };

    return {
      channel,
      adaptedRequest
    };
  }

  // 处理流式响应 - 转换为OpenAI格式
  static formatStreamChunk(channelId, chunk) {
    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-4o',
      choices: [{
        index: 0,
        delta: {
          content: chunk
        },
        finish_reason: null
      }]
    };
  }

  // 处理非流式响应
  static formatResponse(channelId, content) {
    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-4o',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: content
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 0,
        completion_tokens: content.length,
        total_tokens: content.length
      }
    };
  }
}

// 令牌桶 - 简单的速率限制（可选扩展）
class TokenBucket {
  constructor(capacity = 100, refillRate = 10) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  consume(tokens = 1) {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }

  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = elapsed * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + newTokens);
    this.lastRefill = now;
  }
}

module.exports = {
  ChannelService,
  APIAdapter,
  TokenBucket
};
