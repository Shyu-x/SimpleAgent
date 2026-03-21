/**
 * MiniMax 单一架构 - 模型路由器
 * 仅支持 MiniMax 模型
 */

const EventEmitter = require('events');

// MiniMax 模型配置
const MINIMAX_MODELS = {
  'MiniMax-M2.7-highspeed': {
    name: 'MiniMax M2.7 高速',
    capabilities: ['text', 'vision', 'code', 'reasoning'],
    maxTokens: 100000,
    priority: 0
  },
  'MiniMax-M2.7': {
    name: 'MiniMax M2.7 旗舰编程',
    capabilities: ['text', 'vision', 'code', 'reasoning'],
    maxTokens: 100000,
    priority: 1
  },
  'MiniMax-M2.5': {
    name: 'MiniMax M2.5',
    capabilities: ['text', 'code', 'reasoning'],
    maxTokens: 100000,
    priority: 2
  },
  'MiniMax-VL-01': {
    name: 'MiniMax VL 01 多模态',
    capabilities: ['text', 'vision'],
    maxTokens: 32000,
    priority: 3
  },
  'MiniMax-Text-01': {
    name: 'MiniMax Text 01',
    capabilities: ['text'],
    maxTokens: 400000,
    priority: 4
  }
};

// 默认模型
const DEFAULT_MODEL = 'MiniMax-M2.7-highspeed';

class MiniMaxRouter extends EventEmitter {
  constructor(options = {}) {
    super();
    this.models = new Map(Object.entries(MINIMAX_MODELS));
    this.defaultModel = options.defaultModel || DEFAULT_MODEL;
    this.stats = {
      totalRequests: 0,
      successRequests: 0,
      failedRequests: 0
    };
  }

  /**
   * 获取路由信息
   */
  route(preferredModel) {
    const modelId = preferredModel || this.defaultModel;
    const model = this.models.get(modelId);

    if (!model) {
      return { model: this.defaultModel };
    }

    return { model: modelId };
  }

  /**
   * 执行请求
   */
  async execute(request) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    this.stats.totalRequests++;

    const { messages, model: preferredModel, stream = false, options = {} } = request;

    try {
      const routing = this.route(preferredModel || this.defaultModel);
      const result = await this.callAPI(routing.model, {
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 8192,
        stream,
        reasoning_split: options.reasoning_split,
        thinking_budget: options.thinking_budget
      });

      this.stats.successRequests++;
      return {
        success: true,
        requestId,
        model: routing.model,
        result
      };
    } catch (error) {
      this.stats.failedRequests++;
      this.emit('request:failed', { requestId, error: error.message });
      return {
        success: false,
        requestId,
        error: error.message
      };
    }
  }

  /**
   * 调用 MiniMax API
   */
  async callAPI(modelId, request) {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      throw new Error('MINIMAX_API_KEY not configured');
    }

    const baseUrl = process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/anthropic';

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelId,
        messages: request.messages,
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        stream: request.stream !== false,
        ...(request.reasoning_split && {
          thinking: {
            type: 'enabled',
            budget_tokens: request.thinking_budget || 4000
          }
        })
      }),
      signal: AbortSignal.timeout(120000)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`MiniMax API Error ${response.status}: ${error}`);
    }

    if (request.stream) {
      return response.body;
    }

    return await response.json();
  }

  /**
   * 获取统计
   */
  getStats() {
    return {
      ...this.stats,
      models: Object.fromEntries(this.models),
      defaultModel: this.defaultModel
    };
  }

  /**
   * 获取可用模型列表
   */
  getAvailableModels() {
    return Array.from(this.models.entries()).map(([id, config]) => ({
      id,
      ...config
    }));
  }
}

// 单例
const router = new MiniMaxRouter();

module.exports = {
  MiniMaxRouter,
  router,
  MINIMAX_MODELS,
  DEFAULT_MODEL
};
