/**
 * 多模型路由服务
 * 根据任务类型自动选择最优LLM，支持负载均衡、失败重试和降级
 */

const EventEmitter = require('events');
const AppError = require('../common/errors/AppError');

// 生成简单UUID
const generateId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// 模型能力定义
const MODEL_CAPABILITIES = {
  'gpt-3.5-turbo': {
    provider: 'openai',
    capabilities: ['text_generation', 'conversation', 'code_generation'],
    maxTokens: 16384,
    costPer1kTokens: { input: 0.0015, output: 0.002 },
    avgLatency: 800,
    complexityLimit: 3, // 0-10, 支持的最大任务复杂度
    priority: 3,
    enabled: true
  },
  'gpt-4-turbo': {
    provider: 'openai',
    capabilities: ['text_generation', 'conversation', 'code_generation', 'reasoning', 'vision'],
    maxTokens: 128000,
    costPer1kTokens: { input: 0.01, output: 0.03 },
    avgLatency: 1500,
    complexityLimit: 10,
    priority: 1,
    enabled: true
  },
  'claude-3-sonnet': {
    provider: 'anthropic',
    capabilities: ['text_generation', 'conversation', 'code_generation', 'reasoning', 'vision'],
    maxTokens: 200000,
    costPer1kTokens: { input: 0.003, output: 0.015 },
    avgLatency: 1200,
    complexityLimit: 9,
    priority: 2,
    enabled: true
  },
  'claude-3-opus': {
    provider: 'anthropic',
    capabilities: ['text_generation', 'conversation', 'code_generation', 'reasoning', 'vision'],
    maxTokens: 200000,
    costPer1kTokens: { input: 0.015, output: 0.075 },
    avgLatency: 2000,
    complexityLimit: 10,
    priority: 0,
    enabled: true
  },
  'deepseek-chat': {
    provider: 'deepseek',
    capabilities: ['code_generation', 'text_generation'],
    maxTokens: 32768,
    costPer1kTokens: { input: 0.0005, output: 0.001 },
    avgLatency: 700,
    complexityLimit: 4,
    priority: 4,
    enabled: true
  },
  'minimax-abab6.5': {
    provider: 'minimax',
    capabilities: ['text_generation', 'conversation', 'creative'],
    maxTokens: 8192,
    costPer1kTokens: { input: 0.0001, output: 0.0002 },
    avgLatency: 600,
    complexityLimit: 2,
    priority: 5,
    enabled: true
  }
};

// 任务类型定义
const TASK_TYPES = {
  TEXT_GENERATION: 'text_generation',
  CODE_GENERATION: 'code_generation',
  REASONING: 'reasoning',
  VISION: 'vision',
  CREATIVE: 'creative',
  CONVERSATION: 'conversation'
};

// 路由策略
const ROUTING_STRATEGIES = {
  PERFORMANCE: 'performance', // 性能优先
  COST: 'cost', // 成本优先
  BALANCED: 'balanced' // 平衡模式
};

class MultiModelRouter extends EventEmitter {
  constructor(options = {}) {
    super();
    this.models = new Map(Object.entries(MODEL_CAPABILITIES));
    this.strategy = options.strategy || ROUTING_STRATEGIES.BALANCED;
    this.maxRetries = options.maxRetries || 2;
    this.fallbackEnabled = options.fallbackEnabled !== false;
    this.costSensitivity = options.costSensitivity || 0.5; // 0-1
    this.performanceSensitivity = options.performanceSensitivity || 0.5; // 0-1

    // 运行时统计
    this.stats = {
      totalRequests: 0,
      successRequests: 0,
      failedRequests: 0,
      modelUsage: new Map(),
      averageLatency: 0,
      totalCost: 0
    };

    // 模型状态
    this.modelStatus = new Map();
    for (const [modelId] of this.models) {
      this.modelStatus.set(modelId, {
        available: true,
        errorCount: 0,
        lastErrorTime: 0,
        currentLoad: 0
      });
    }
  }

  /**
   * 分类任务类型和复杂度
   * @param {Object} context - 任务上下文
   * @returns {Object} 任务分类结果
   */
  classifyTask(context) {
    const { messages, systemPrompt, tools } = context;
    const lastMessage = messages[messages.length - 1].content.toLowerCase();

    // 默认分类
    let taskType = TASK_TYPES.CONVERSATION;
    let complexity = 2;
    let requiredCapabilities = [];

    // 检测代码相关任务
    if (lastMessage.includes('代码') || lastMessage.includes('编程') || lastMessage.includes('函数') ||
        lastMessage.includes('debug') || lastMessage.includes('python') || lastMessage.includes('javascript')) {
      taskType = TASK_TYPES.CODE_GENERATION;
      complexity = 4;
      requiredCapabilities.push('code_generation');
    }

    // 检测推理相关任务
    if (lastMessage.includes('计算') || lastMessage.includes('分析') || lastMessage.includes('推理') ||
        lastMessage.includes('为什么') || lastMessage.includes('如何解决') || lastMessage.includes('方案')) {
      taskType = TASK_TYPES.REASONING;
      complexity = 7;
      requiredCapabilities.push('reasoning');
    }

    // 检测图像相关任务
    if (messages.some(m => Array.isArray(m.content) && m.content.some(c => c.type === 'image'))) {
      taskType = TASK_TYPES.VISION;
      complexity = 8;
      requiredCapabilities.push('vision');
    }

    // 检测创意相关任务
    if (lastMessage.includes('写') || lastMessage.includes('创作') || lastMessage.includes('设计') ||
        lastMessage.includes('故事') || lastMessage.includes('文案')) {
      taskType = TASK_TYPES.CREATIVE;
      complexity = 5;
      requiredCapabilities.push('creative');
    }

    // 根据消息长度调整复杂度
    const totalLength = messages.reduce((sum, msg) => sum + (msg.content.length || 0), 0);
    if (totalLength > 10000) complexity = Math.min(complexity + 2, 10);
    if (totalLength > 50000) complexity = Math.min(complexity + 3, 10);

    // 根据工具使用调整复杂度
    if (tools && tools.length > 3) complexity = Math.min(complexity + 2, 10);

    return {
      taskType,
      complexity,
      requiredCapabilities,
      estimatedTokens: Math.ceil(totalLength / 4) // 粗略估计token数
    };
  }

  /**
   * 选择最优模型
   * @param {Object} taskClassification - 任务分类结果
   * @param {Object} options - 选择选项
   * @returns {string|null} 模型ID
   */
  selectModel(taskClassification, options = {}) {
    const { taskType, complexity, requiredCapabilities } = taskClassification;
    const preferredModel = options.preferredModel;
    const strategy = options.strategy || this.strategy;

    // 如果指定了优先模型且可用，直接使用
    if (preferredModel && this.models.has(preferredModel)) {
      const model = this.models.get(preferredModel);
      const status = this.modelStatus.get(preferredModel);
      if (model.enabled && status.available &&
          (requiredCapabilities.every(cap => model.capabilities.includes(cap))) &&
          model.complexityLimit >= complexity) {
        return preferredModel;
      }
    }

    // 过滤符合条件的模型
    let candidateModels = Array.from(this.models.entries())
      .filter(([modelId, model]) => {
        const status = this.modelStatus.get(modelId);
        return model.enabled &&
               status.available &&
               requiredCapabilities.every(cap => model.capabilities.includes(cap)) &&
               model.complexityLimit >= complexity;
      })
      .map(([modelId, model]) => ({
        id: modelId,
        ...model,
        status: this.modelStatus.get(modelId)
      }));

    if (candidateModels.length === 0) {
      // 如果没有符合条件的模型，降级复杂度要求
      candidateModels = Array.from(this.models.entries())
        .filter(([modelId, model]) => {
          const status = this.modelStatus.get(modelId);
          return model.enabled && status.available;
        })
        .map(([modelId, model]) => ({
          id: modelId,
          ...model,
          status: this.modelStatus.get(modelId)
        }));

      if (candidateModels.length === 0) {
        throw AppError.internalError('No available models');
      }
    }

    // 根据策略排序
    switch (strategy) {
      case ROUTING_STRATEGIES.PERFORMANCE:
        // 性能优先：按延迟和优先级排序
        candidateModels.sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          return a.avgLatency - b.avgLatency;
        });
        break;

      case ROUTING_STRATEGIES.COST:
        // 成本优先：按成本排序
        candidateModels.sort((a, b) => {
          const costA = a.costPer1kTokens.input + a.costPer1kTokens.output;
          const costB = b.costPer1kTokens.input + b.costPer1kTokens.output;
          return costA - costB;
        });
        break;

      case ROUTING_STRATEGIES.BALANCED:
      default:
        // 平衡模式：综合考虑成本、性能、负载
        candidateModels.sort((a, b) => {
          const scoreA = this.calculateScore(a);
          const scoreB = this.calculateScore(b);
          return scoreB - scoreA;
        });
        break;
    }

    // 优先选择负载较低的模型
    const lowestLoad = Math.min(...candidateModels.map(m => m.status.currentLoad));
    const lowLoadModels = candidateModels.filter(m => m.status.currentLoad <= lowestLoad + 2);

    return lowLoadModels[0].id;
  }

  /**
   * 计算模型综合评分
   */
  calculateScore(model) {
    const costScore = 1 / (model.costPer1kTokens.input + model.costPer1kTokens.output + 0.0001);
    const latencyScore = 1000 / (model.avgLatency + 100);
    const loadScore = 10 / (model.status.currentLoad + 1);
    const priorityScore = 10 - model.priority;

    return (costScore * this.costSensitivity +
            latencyScore * this.performanceSensitivity +
            loadScore * 0.3 +
            priorityScore * 0.2);
  }

  /**
   * 执行LLM请求，带重试和降级
   * @param {Object} request - 请求参数
   * @returns {Object} 响应结果
   */
  async executeRequest(request) {
    const { messages, model: requestedModel, stream = false, options = {} } = request;
    const requestId = generateId();
    const startTime = Date.now();

    this.stats.totalRequests++;

    try {
      // 分类任务
      const taskClassification = this.classifyTask({ messages, tools: options.tools });

      let attempt = 0;
      let lastError = null;
      let usedModel = null;

      while (attempt < this.maxRetries + 1) {
        try {
          // 选择模型
          const modelId = requestedModel || this.selectModel(taskClassification, options);
          usedModel = modelId;

          // 更新模型负载
          const modelStatus = this.modelStatus.get(modelId);
          modelStatus.currentLoad++;

          try {
            // 执行请求
            const result = await this.callModelAPI(modelId, request);

            // 更新统计
            modelStatus.currentLoad--;
            modelStatus.errorCount = 0;
            this.updateStats(modelId, true, Date.now() - startTime, result.usage || {});

            this.emit('request:success', {
              requestId,
              model: modelId,
              taskClassification,
              latency: Date.now() - startTime,
              usage: result.usage
            });

            return {
              success: true,
              requestId,
              model: modelId,
              result,
              taskClassification
            };
          } catch (error) {
            modelStatus.currentLoad--;
            throw error;
          }

        } catch (error) {
          lastError = error;
          attempt++;

          // 记录模型错误
          if (usedModel) {
            const modelStatus = this.modelStatus.get(usedModel);
            modelStatus.errorCount++;
            modelStatus.lastErrorTime = Date.now();

            // 如果错误次数过多，暂时标记为不可用
            if (modelStatus.errorCount >= 5) {
              modelStatus.available = false;
              setTimeout(() => {
                modelStatus.available = true;
                modelStatus.errorCount = 0;
              }, 60000); // 1分钟后恢复
            }
          }

          this.emit('request:retry', {
            requestId,
            attempt,
            error: error.message,
            model: usedModel
          });

          // 最后一次尝试失败
          if (attempt >= this.maxRetries + 1) {
            break;
          }

          // 重试延迟
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }

      // 所有尝试失败，尝试降级到其他模型
      if (this.fallbackEnabled) {
        try {
          const fallbackModel = this.getFallbackModel(taskClassification);
          if (fallbackModel) {
            const result = await this.callModelAPI(fallbackModel, request);

            this.updateStats(fallbackModel, true, Date.now() - startTime, result.usage || {});

            this.emit('request:fallback', {
              requestId,
              originalModel: usedModel,
              fallbackModel,
              error: lastError.message
            });

            return {
              success: true,
              requestId,
              model: fallbackModel,
              result,
              taskClassification,
              fallback: true
            };
          }
        } catch (fallbackError) {
          lastError = fallbackError;
        }
      }

      // 全部失败
      this.stats.failedRequests++;
      this.emit('request:failed', {
        requestId,
        error: lastError.message,
        attempts: attempt
      });

      return {
        success: false,
        requestId,
        error: lastError.message,
        attempts: attempt
      };

    } catch (error) {
      this.stats.failedRequests++;
      return {
        success: false,
        requestId,
        error: error.message
      };
    }
  }

  /**
   * 获取降级模型
   */
  getFallbackModel(taskClassification) {
    const candidates = Array.from(this.models.entries())
      .filter(([modelId, model]) => {
        const status = this.modelStatus.get(modelId);
        return model.enabled && status.available;
      })
      .map(([modelId]) => modelId);

    return candidates.length > 0 ? candidates[0] : null;
  }

  /**
   * 调用模型API（代理到现有的proxy层）
   */
  async callModelAPI(modelId, request) {
    const model = this.models.get(modelId);
    const { messages, stream, temperature, max_tokens } = request;

    // 构建provider请求
    const providerConfig = this.getProviderConfig(model.provider);

    const response = await fetch(`${providerConfig.baseUrl}${providerConfig.chatEndpoint}`, {
      method: 'POST',
      headers: providerConfig.headers(process.env[`${model.provider.toUpperCase()}_API_KEY`], modelId),
      body: JSON.stringify(providerConfig.transformRequest({
        body: {
          model: modelId,
          messages,
          temperature: temperature || 0.7,
          max_tokens: max_tokens || 4096,
          stream
        }
      })),
      signal: AbortSignal.timeout(60000) // 60秒超时
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw AppError.internalError(`API Error: ${response.status} - ${errorText}`);
    }

    if (stream) {
      return response.body;
    } else {
      return await response.json();
    }
  }

  /**
   * 获取provider配置（复用现有proxy中的配置）
   */
  getProviderConfig(provider) {
    const PROVIDERS = {
      openai: {
        baseUrl: 'https://api.openai.com/v1',
        chatEndpoint: '/chat/completions',
        headers: (apiKey) => ({
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }),
        transformRequest: (req) => req.body
      },
      anthropic: {
        baseUrl: 'https://api.anthropic.com/v1',
        chatEndpoint: '/messages',
        headers: (apiKey) => ({
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        }),
        transformRequest: (req) => {
          const { messages, model, max_tokens, temperature } = req.body;
          return {
            model,
            messages,
            max_tokens,
            temperature
          };
        }
      },
      deepseek: {
        baseUrl: 'https://api.deepseek.com/v1',
        chatEndpoint: '/chat/completions',
        headers: (apiKey) => ({
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }),
        transformRequest: (req) => req.body
      },
      minimax: {
        baseUrl: process.env.MINIMAX_API_HOST || 'https://api.minimaxi.com',
        chatEndpoint: '/v1/text/chatcompletion_pro',
        headers: (apiKey) => ({
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }),
        transformRequest: (req) => req.body
      }
    };

    return PROVIDERS[provider];
  }

  /**
   * 更新统计信息
   */
  updateStats(modelId, success, latency, usage) {
    if (success) {
      this.stats.successRequests++;
    }

    // 更新模型使用统计
    if (!this.stats.modelUsage.has(modelId)) {
      this.stats.modelUsage.set(modelId, { count: 0, totalLatency: 0, totalCost: 0 });
    }
    const modelStats = this.stats.modelUsage.get(modelId);
    modelStats.count++;
    modelStats.totalLatency += latency;

    // 计算成本
    if (usage) {
      const model = this.models.get(modelId);
      const cost = (usage.prompt_tokens / 1000 * model.costPer1kTokens.input) +
                   (usage.completion_tokens / 1000 * model.costPer1kTokens.output);
      modelStats.totalCost += cost;
      this.stats.totalCost += cost;
    }

    // 更新平均延迟
    this.stats.averageLatency = (this.stats.averageLatency * (this.stats.totalRequests - 1) + latency) / this.stats.totalRequests;
  }

  /**
   * 获取路由统计
   */
  getStats() {
    return {
      ...this.stats,
      modelUsage: Object.fromEntries(this.stats.modelUsage),
      modelStatus: Object.fromEntries(this.modelStatus)
    };
  }

  /**
   * 注册新模型
   */
  registerModel(modelId, config) {
    this.models.set(modelId, config);
    this.modelStatus.set(modelId, {
      available: true,
      errorCount: 0,
      lastErrorTime: 0,
      currentLoad: 0
    });
    return this;
  }

  /**
   * 更新模型配置
   */
  updateModel(modelId, config) {
    if (this.models.has(modelId)) {
      this.models.set(modelId, { ...this.models.get(modelId), ...config });
    }
    return this;
  }
}

module.exports = {
  MultiModelRouter,
  ROUTING_STRATEGIES,
  TASK_TYPES,
  MODEL_CAPABILITIES
};