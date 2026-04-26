/**
 * Agent执行引擎 - 智能化升级版本
 * 核心循环：思考(Reason) -> 行动(Act) -> 观察(Observe) -> 反思(Reflect) -> 决策(Continue)
 * 支持LLM推理、ReAct模式、反思机制
 *
 * 借鉴 MiniMax Mini-Agent 的设计:
 * - 结构化日志 (AgentLogger)
 * - 重试机制 (withRetry, withTimeout)
 * - Session Note Tool 持久化记忆
 */

const ToolRegistry = require('./tools/toolRegistry');
const FileSystemTool = require('./tools/fileSystemTool');
const ShellTool = require('./tools/shellTool');
const WebSearchTool = require('./tools/webSearchTool');
const HttpRequestTool = require('./tools/httpRequestTool');
const DataProcessingTool = require('./tools/dataProcessingTool');
const CalculatorTool = require('./tools/calculatorTool');
const DateTimeTool = require('./tools/dateTimeTool');
const CodeExecutionTool = require('./tools/codeExecutionTool');
const MemoryService = require('./memory');
const SemanticMemory = require('./SemanticMemory');
const { StatePersistence, CheckpointStatus } = require('./statePersistence');
const { LLMIntentClassifier } = require('./llmIntentClassifier');
const FileCheckpointManager = require('./FileCheckpointManager');
const { hitlManager, CheckpointType } = require('../routes/hitl');
const { A2AService, A2A_MESSAGE_TYPES, A2A_TASK_STATUS } = require('./a2aService');
const { AgentLogger, formatConsole } = require('./AgentLogger');
const { withRetry, withTimeout, sleep, TimeoutConfig } = require('../utils/retry');
const SessionNoteTool = require('./tools/SessionNoteTool');
const MiniMaxSearchTool = require('./miniMaxSearchTool');
const DuckDuckGoSearchTool = require('./duckduckgoSearchTool');
const GitHubTool = require('./tools/githubTool');

// ReAct阶段
const REACT_PHASES = {
  REASON: 'reason',
  ACT: 'act',
  OBSERVE: 'observe',
  REFLECT: 'reflect',
  CONTINUE: 'continue'
};

// 错误分类 - 用于结构化错误恢复
const ERROR_CLASSIFICATION = {
  TRANSIENT: 'transient',       // 临时错误（网络超时等），可重试
  RESOURCE: 'resource',         // 资源错误（内存不足等），可重试但需降级
  PARAMETER: 'parameter',        // 参数错误，不应重试
  AUTHENTICATION: 'auth',        // 认证错误，不应重试
  RATE_LIMIT: 'rate_limit',     // 限流错误，可重试但需退避
  UNKNOWN: 'unknown'            // 未知错误，根据情况判断
};

// 工具执行结果质量等级
const RESULT_QUALITY = {
  EXCELLENT: 'excellent',       // 结果完美，无需处理
  GOOD: 'good',                // 结果可用，接受
  INCOMPLETE: 'incomplete',    // 结果不完整，可能需要补充
  ERROR: 'error',              // 执行出错，需要处理
  EMPTY: 'empty'               // 结果为空，需要处理
};

// 重试策略配置
const RETRY_STRATEGY = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  exponentialBase: 2,
  // 不同错误类型的重试配置
  errorTypes: {
    [ERROR_CLASSIFICATION.TRANSIENT]: { maxRetries: 3, backoffMultiplier: 1 },
    [ERROR_CLASSIFICATION.RESOURCE]: { maxRetries: 2, backoffMultiplier: 1.5 },
    [ERROR_CLASSIFICATION.RATE_LIMIT]: { maxRetries: 5, backoffMultiplier: 2 }
  }
};

// 最大反思次数
const MAX_REFLECTIONS = 3;

class AgentEngine {
  constructor(options = {}) {
    this.maxIterations = options.maxIterations || 10;
    this.toolRegistry = new ToolRegistry();
    this.memory = new MemoryService(options.memoryOptions || {});
    this.sessionId = options.sessionId || `agent_${Date.now()}`;

    // 语义记忆实例（支持 MiniMax embeddings 或 mock embeddings）
    this.semanticMemory = new SemanticMemory({
      storageDir: options.semanticMemoryDir || './data/semantic-memory',
      embeddingProvider: options.embeddingProvider || (process.env.MINIMAX_API_KEY ? 'minimax' : 'mock'),
      apiKey: process.env.MINIMAX_API_KEY
    });

    // LLM推理支持
    this.modelRouter = options.modelRouter || null;
    this.llmModelId = options.llmModelId || 'MiniMax-M2.7';
    this.llmEnabled = options.llmEnabled !== false;
    this.llmIntentClassifier = null;

    // 初始化LLM分类器
    if (this.modelRouter && this.llmEnabled) {
      this.llmIntentClassifier = new LLMIntentClassifier({
        modelRouter: this.modelRouter,
        modelId: this.llmModelId,
        confidenceThreshold: 0.5
      });
      // 设置给toolRegistry
      this.toolRegistry.setLLMClassifier(this.llmIntentClassifier);
    }

    // 反思配置
    this.maxReflections = options.maxReflections || MAX_REFLECTIONS;
    this.reflectionThreshold = options.reflectionThreshold || 0.6;

    // 状态持久化支持
    this.persistence = new StatePersistence(options.persistenceOptions || {});
    this.autoCheckpoint = options.autoCheckpoint !== false; // 默认开启自动检查点
    this.checkpointEvery = options.checkpointEvery || 1; // 每N次迭代保存一次

    // 文件检查点管理器（持久化到文件系统）
    this.fileCheckpoint = new FileCheckpointManager({
      checkpointDir: options.checkpointDir || './data/checkpoints',
      maxCheckpoints: options.maxCheckpoints || 100,
      maxAge: options.checkpointTtlHours ? options.checkpointTtlHours * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
    });

    // 人机确认配置
    this.humanConfirmationEnabled = options.humanConfirmationEnabled !== false; // 默认开启
    this.confirmationTimeout = options.confirmationTimeout || 60000; // 默认60秒
    // 确认场景配置
    this.confirmationSettings = {
      dangerousOps: options.confirmationSettings?.dangerousOps !== false, // 危险操作（删除文件等）
      irreversibleOps: options.confirmationSettings?.irreversibleOps !== false, // 不可逆操作
      expensiveCalls: options.confirmationSettings?.expensiveCalls !== false, // 高费用API调用
      externalCalls: options.confirmationSettings?.externalCalls || false, // 外部调用（默认不确认）
      minCostThreshold: options.confirmationSettings?.minCostThreshold || 1.0 // 费用阈值（美元）
    };

    // A2A 协议配置
    this.a2aEnabled = options.a2aEnabled !== false; // 默认开启 A2A
    this.a2aAgentId = options.a2aAgentId || `agent_${this.sessionId}`;
    this.a2aService = options.a2aService || null; // 外部注入的 A2A 服务实例
    this._a2aPendingCallbacks = new Map(); // taskId -> callback
    this._a2aResultHandlers = new Map(); // taskId -> result handler

    // 日志系统 (借鉴 MiniMax Mini-Agent)
    this.logger = new AgentLogger({
      logDir: options.logDir || './logs/agent'
    });

    // Token管理配置 (借鉴 MiniMax Mini-Agent)
    this.tokenLimit = options.tokenLimit || 80000; // 超过此值触发摘要
    this.apiTotalTokens = 0; // API报告的token数
    this._skipNextTokenCheck = false; // 防连续触发摘要

    // Session Note Tool (借鉴 MiniMax Mini-Agent)
    this.sessionNoteTool = new SessionNoteTool({
      memoryFile: options.memoryFile || './workspace/.agent_memory.json'
    });

    // 取消事件 (借鉴 MiniMax Mini-Agent)
    this.cancelEvent = null;
    this._cancelCallback = null;

    this.state = {
      status: 'idle', // idle, running, paused, completed, error
      iteration: 0,
      tools: [],
      history: [],
      context: {},
      toolResults: [],
      pendingAction: null,
      // ReAct状态
      reactPhase: REACT_PHASES.REASON,
      reflectionCount: 0,
      lastToolSuccess: null
    };

    // 注册默认工具
    this.registerDefaultTools(options.toolOptions || {});
  }

  // ==================== 取消机制 (借鉴 MiniMax Mini-Agent) ====================

  /**
   * 创建取消事件
   */
  createCancelEvent() {
    this.cancelEvent = { cancelled: false };
    return this.cancelEvent;
  }

  /**
   * 触发取消
   */
  cancel() {
    if (this.cancelEvent) {
      this.cancelEvent.cancelled = true;
    }
  }

  /**
   * 检查是否已取消
   */
  _checkCancelled() {
    if (this.cancelEvent && this.cancelEvent.cancelled) {
      return true;
    }
    return false;
  }

  /**
   * 设置取消回调
   */
  onCancel(callback) {
    this._cancelCallback = callback;
  }

  /**
   * 清理不完整消息 (取消后调用，保留已完成步骤)
   */
  _cleanupIncompleteMessages(messages) {
    if (!messages || !Array.isArray(messages)) return [];
    // 找到最后一个完整的 assistant 消息
    let lastCompleteIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].content) {
        lastCompleteIdx = i;
        break;
      }
    }
    return messages.slice(0, lastCompleteIdx + 1);
  }

  // ==================== 错误分类与结构化错误恢复 ====================

  /**
   * 分类错误类型 - 用于决定重试策略
   * @param {Error|string} error - 错误对象或错误消息
   * @returns {string} 错误分类
   */
  _classifyError(error) {
    if (!error) return ERROR_CLASSIFICATION.UNKNOWN;

    const errorMsg = typeof error === 'string' ? error : error.message || '';
    const errorCode = typeof error === 'object' ? (error.code || error.errno || '') : '';
    const statusCode = typeof error === 'object' ? (error.status || error.statusCode || '') : '';

    // 认证相关错误 - 不应重试
    if (errorMsg.includes('401') || errorMsg.includes('403') ||
        errorMsg.includes('unauthorized') || errorMsg.includes('forbidden') ||
        errorMsg.includes('authentication') || errorMsg.includes('api key')) {
      return ERROR_CLASSIFICATION.AUTHENTICATION;
    }

    // 参数错误 - 不应重试
    if (errorMsg.includes('invalid') || errorMsg.includes('parameter') ||
        errorMsg.includes('argument') || errorMsg.includes('schema') ||
        errorMsg.includes('validation')) {
      return ERROR_CLASSIFICATION.PARAMETER;
    }

    // 限流错误 - 可重试但需要更长退避
    if (statusCode === 429 || errorMsg.includes('rate limit') ||
        errorMsg.includes('too many requests') || errorMsg.includes('quota')) {
      return ERROR_CLASSIFICATION.RATE_LIMIT;
    }

    // 网络临时错误 - 可重试
    if (errorCode === 'ECONNRESET' || errorCode === 'ETIMEDOUT' ||
        errorCode === 'ENOTFOUND' || errorCode === 'ECONNREFUSED' ||
        errorMsg.includes('timeout') || errorMsg.includes('network') ||
        errorMsg.includes('ECONNREFUSED')) {
      return ERROR_CLASSIFICATION.TRANSIENT;
    }

    // 资源错误 - 可重试但可能需要降级
    if (errorMsg.includes('memory') || errorMsg.includes('disk') ||
        errorMsg.includes('storage') || errorMsg.includes('resource')) {
      return ERROR_CLASSIFICATION.RESOURCE;
    }

    // 500/502/503/504 服务器错误 - 临时错误
    if (statusCode >= 500 && statusCode < 600) {
      return ERROR_CLASSIFICATION.TRANSIENT;
    }

    return ERROR_CLASSIFICATION.UNKNOWN;
  }

  /**
   * 根据错误类型获取重试配置
   * @param {string} errorType - 错误分类
   * @returns {Object} 重试配置
   */
  _getRetryConfigForError(errorType) {
    const defaultConfig = {
      maxRetries: RETRY_STRATEGY.maxRetries,
      delayMs: RETRY_STRATEGY.initialDelayMs,
      backoffMultiplier: 1
    };

    const errorConfig = RETRY_STRATEGY.errorTypes[errorType];
    if (!errorConfig) {
      // UNKNOWN 或 PARAMETER/AUTH 类型使用默认配置
      if (errorType === ERROR_CLASSIFICATION.UNKNOWN) {
        return { maxRetries: 1, delayMs: 1000, backoffMultiplier: 1 };
      }
      return defaultConfig;
    }

    return {
      maxRetries: errorConfig.maxRetries,
      delayMs: RETRY_STRATEGY.initialDelayMs,
      backoffMultiplier: errorConfig.backoffMultiplier
    };
  }

  /**
   * 计算退避延迟
   * @param {number} attempt - 当前重试次数
   * @param {number} baseDelay - 基础延迟
   * @param {number} multiplier - 退避倍数
   * @returns {number} 延迟毫秒数
   */
  _calculateBackoffDelay(attempt, baseDelay, multiplier) {
    const delay = baseDelay * Math.pow(multiplier, attempt);
    return Math.min(delay, RETRY_STRATEGY.maxDelayMs);
  }

  /**
   * 评估工具执行结果质量
   * @param {Object} output - 工具执行结果
   * @returns {Object} { quality: string, reason: string, suggestion: string }
   */
  _evaluateResultQuality(output) {
    if (!output) {
      return { quality: RESULT_QUALITY.EMPTY, reason: '结果为空', suggestion: '检查工具是否正确执行' };
    }

    const resultText = typeof output === 'string'
      ? output
      : JSON.stringify(output);

    // 检查成功标记
    if (output.success === false) {
      const errorType = this._classifyError(output.error);
      if (errorType === ERROR_CLASSIFICATION.AUTHENTICATION) {
        return { quality: RESULT_QUALITY.ERROR, reason: '认证错误', suggestion: '检查 API 密钥配置' };
      }
      if (errorType === ERROR_CLASSIFICATION.PARAMETER) {
        return { quality: RESULT_QUALITY.ERROR, reason: '参数错误', suggestion: '检查输入参数是否正确' };
      }
      return { quality: RESULT_QUALITY.ERROR, reason: output.error || '执行失败', suggestion: '可能需要重试或使用替代工具' };
    }

    // 检查结果内容
    if (!resultText || resultText === '{}' || resultText === '[]' || resultText === '""') {
      return { quality: RESULT_QUALITY.EMPTY, reason: '结果为空', suggestion: '检查工具是否返回了有效数据' };
    }

    // 检查是否包含错误关键词
    const errorPatterns = ['error', 'failed', 'failure', '错误', '失败', '无法', 'exception'];
    const lowerText = resultText.toLowerCase();
    for (const pattern of errorPatterns) {
      if (lowerText.includes(pattern) && !lowerText.includes('error handling')) {
        return { quality: RESULT_QUALITY.INCOMPLETE, reason: '结果包含错误信息', suggestion: '分析错误原因并决定是否需要重试' };
      }
    }

    // 检查结果长度是否合理
    if (resultText.length < 10) {
      return { quality: RESULT_QUALITY.INCOMPLETE, reason: '结果过短', suggestion: '可能需要更多信息或使用其他工具' };
    }

    return { quality: RESULT_QUALITY.GOOD, reason: '结果正常', suggestion: '' };
  }

  /**
   * 使用退避策略重试工具执行
   * @param {string} toolName - 工具名称
   * @param {Object} input - 工具输入参数
   * @param {Object} options - 重试选项 { maxRetries, delayMs, backoffMultiplier }
   * @returns {Promise<Object>} 执行结果
   */
  async _retryToolExecution(toolName, input, options = {}) {
    const {
      maxRetries = RETRY_STRATEGY.maxRetries,
      delayMs = RETRY_STRATEGY.initialDelayMs,
      backoffMultiplier = 1
    } = options;

    let lastError = null;
    let tool = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 获取工具
        if (!tool) {
          tool = this.toolRegistry.get(toolName);
          if (!tool) {
            return { success: false, error: `Tool not found: ${toolName}` };
          }
        }

        // 执行工具
        const result = await withTimeout(
          tool.execute(input),
          TimeoutConfig.execute,
          `Tool ${toolName} execution timeout`
        );

        // 评估结果质量
        const quality = this._evaluateResultQuality(result);

        // 如果结果质量为 ERROR，检查是否可重试
        if (quality.quality === RESULT_QUALITY.ERROR) {
          const errorType = this._classifyError(result.error);

          // 认证和参数错误不重试
          if (errorType === ERROR_CLASSIFICATION.AUTHENTICATION ||
              errorType === ERROR_CLASSIFICATION.PARAMETER) {
            return result;
          }

          // 达到最大重试次数
          if (attempt >= maxRetries) {
            return result;
          }
        }

        // 如果质量不是 ERROR 或 EMPTY，认为成功
        if (quality.quality !== RESULT_QUALITY.ERROR && quality.quality !== RESULT_QUALITY.EMPTY) {
          return result;
        }

        // 记录质量问题和重试意图
        lastError = result.error || quality.reason;

      } catch (error) {
        lastError = error;

        // 检查错误是否可重试
        const errorType = this._classifyError(error);

        // 认证和参数错误不重试
        if (errorType === ERROR_CLASSIFICATION.AUTHENTICATION ||
            errorType === ERROR_CLASSIFICATION.PARAMETER) {
          return { success: false, error: error.message };
        }

        // 达到最大重试次数
        if (attempt >= maxRetries) {
          return { success: false, error: error.message };
        }
      }

      // 计算下一次延迟
      const delay = this._calculateBackoffDelay(attempt, delayMs, backoffMultiplier);
      // Operational log - using formatConsole for colored output

      // 等待后重试
      await sleep(delay);
    }

    return { success: false, error: `All ${maxRetries + 1} attempts failed. Last error: ${lastError}` };
  }

  /**
   * 查找替代工具
   * @param {string} failedTool - 失败的工具名称
   * @param {string} error - 错误信息
   * @returns {string|null} 替代工具名称
   */
  async _findAlternativeTool(failedTool, error) {
    const availableTools = this.toolRegistry.listTools();
    const errorType = this._classifyError(error);

    // 根据错误类型选择替代策略
    if (errorType === ERROR_CLASSIFICATION.RATE_LIMIT) {
      // 限流错误：优先选择同一类别但不同的工具
      const failedToolInfo = this.toolRegistry.get(failedTool);
      const category = failedToolInfo?.category || 'general';

      const sameCategory = availableTools.filter(t =>
        t.category === category && t.name !== failedTool
      );

      if (sameCategory.length > 0) {
        // 选择同类别第一个可用工具
        return sameCategory[0].name;
      }
    }

    // 通用策略：按优先级选择替代工具
    const searchTools = availableTools.filter(t =>
      t.name.includes('search') || t.name.includes('web') || t.name.includes('find')
    );

    if (failedTool !== 'web_search' && searchTools.length > 0) {
      return searchTools[0].name;
    }

    // 默认：返回第一个可用工具
    const otherTools = availableTools.filter(t => t.name !== failedTool);
    return otherTools.length > 0 ? otherTools[0].name : null;
  }

  // ==================== Token管理 (借鉴 MiniMax Mini-Agent) ====================

  /**
   * 估算消息列表的token数 (简单估算)
   */
  _estimateTokens() {
    if (!this.messages) return 0;
    const text = JSON.stringify(this.messages);
    // 粗略估算：中文约2字符/token，英文约4字符/token
    return Math.ceil(text.length / 3);
  }

  /**
   * 检查是否需要摘要
   * 触发条件：context利用率达到80%即触发compact
   */
  _shouldSummarize() {
    const estimatedTokens = this._estimateTokens();
    const utilization = estimatedTokens / this.tokenLimit;
    return utilization >= 0.8;
  }

  /**
   * 摘要消息列表 (保留用户消息，压缩assistant过程)
   */
  async _summarizeMessages() {
    if (!this._shouldSummarize() || this._skipNextTokenCheck) {
      this._skipNextTokenCheck = false;
      return;
    }

    if (!this.messages || this.messages.length < 4) return;

    // Token management log - operational info

    // 策略：保留 system 和 user 消息，将中间的 assistant 消息压缩为摘要
    const summarizedMessages = [];
    const messagesToSummarize = [];

    for (const msg of this.messages) {
      if (msg.role === 'system') {
        summarizedMessages.push(msg);
      } else if (msg.role === 'user') {
        summarizedMessages.push(msg);
      } else if (msg.role === 'assistant') {
        messagesToSummarize.push(msg);
      }
    }

    // 对需要摘要的消息生成摘要
    if (messagesToSummarize.length > 0 && this.modelRouter) {
      try {
        const summaryPrompt = `请将以下对话历史压缩为简洁的摘要，保留关键信息和工具执行结果:

${messagesToSummarize.map(m => `[${m.role}]: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n\n')}

请返回JSON格式:
{
  "summary": "压缩后的摘要内容",
  "keyPoints": ["关键点1", "关键点2"]
}`;

        const summaryResult = await this._callLLM(summaryPrompt);
        const parsed = this._parseJSONResponse(summaryResult);

        summarizedMessages.push({
          role: 'assistant',
          content: `[对话摘要] ${parsed.summary || '之前的对话已压缩'}`
        });
      } catch (e) {
        console.warn('[Token] 摘要生成失败，使用默认摘要');
        summarizedMessages.push({
          role: 'assistant',
          content: `[对话摘要] 已完成 ${messagesToSummarize.length} 轮对话`
        });
      }
    }

    this.messages = summarizedMessages;
    this._skipNextTokenCheck = true; // 防止连续触发摘要
    // Token summary complete - operational info
  }

  /**
   * 注册默认工具
   */
  registerDefaultTools(toolOptions = {}) {
    // 文件系统工具
    this.toolRegistry.register(new FileSystemTool(toolOptions.fileSystem || {}));

    // Shell 工具
    this.toolRegistry.register(new ShellTool(toolOptions.shell || {}));

    // Web 搜索工具
    this.toolRegistry.register(new WebSearchTool(toolOptions.webSearch || {}));

    // HTTP 请求工具
    this.toolRegistry.register(new HttpRequestTool(toolOptions.httpRequest || {}));

    // 数据处理工具
    this.toolRegistry.register(new DataProcessingTool(toolOptions.dataProcessing || {}));

    // 计算器工具
    this.toolRegistry.register(new CalculatorTool(toolOptions.calculator || {}));

    // 日期时间工具
    this.toolRegistry.register(new DateTimeTool(toolOptions.datetime || {}));

    // 代码执行工具（可选）
    if (toolOptions.enableCodeExecution) {
      try {
        this.toolRegistry.register(new CodeExecutionTool(toolOptions.codeExecution || {}));
      } catch (e) {
        console.warn('CodeExecutionTool not loaded:', e.message);
      }
    }

    // MiniMax 联网搜索工具 (需要 API Key)
    this.toolRegistry.register(new MiniMaxSearchTool({
      apiKey: process.env.MINIMAX_API_KEY,
      baseUrl: process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/anthropic'
    }));

    // DuckDuckGo 免费搜索工具 (无需 API Key)
    this.toolRegistry.register(new DuckDuckGoSearchTool());

    // GitHub 工具 (使用 gh CLI)
    this.toolRegistry.register(new GitHubTool());

    // Session Note Tool (借鉴 MiniMax Mini-Agent)
    // 提供 record_note 和 recall_notes 功能
    const noteDef = this.sessionNoteTool.getDefinition();
    const recallDef = this.sessionNoteTool.getRecallDefinition();
    this.toolRegistry.register({
      name: noteDef.name,
      description: noteDef.description,
      parameters: noteDef.input_schema,
      execute: async (args) => {
        const result = await this.sessionNoteTool.recordNote(args.content, args.category);
        return result;
      }
    });
    this.toolRegistry.register({
      name: recallDef.name,
      description: recallDef.description,
      parameters: recallDef.input_schema,
      execute: async (args) => {
        const result = await this.sessionNoteTool.recallNotes(args.category);
        return result;
      }
    });
  }

  /**
   * 注册工具
   */
  registerTool(tool) {
    this.toolRegistry.register(tool);
  }

  /**
   * 执行Agent循环（带持久化支持）
   * @param {string} task - 任务描述
   * @param {object} context - 执行上下文
   * @param {string} resumeSessionId - 可选，要恢复的会话ID
   */
  async execute(task, context = {}, resumeSessionId = null) {
    // 如果提供了 resumeSessionId，从检查点恢复
    if (resumeSessionId) {
      return this.resumeFromCheckpoint(resumeSessionId);
    }

    // 创建新的持久化会话
    const session = await this.persistence.createSession(task, context);
    this.sessionId = session.id;

    // 启动日志记录 (借鉴 MiniMax Mini-Agent)
    this.logger.startNewRun();
    // Agent log file path - operational info

    this.state.status = 'running';
    this.state.iteration = 0;
    this.state.history = [];
    this.state.context = context;
    this.state.toolResults = [];
    this.apiTotalTokens = 0; // 重置token计数

    // 初始化消息列表 (用于Token管理)
    this.messages = [
      { role: 'system', content: this.buildSystemPrompt(context) },
      { role: 'user', content: task }
    ];

    // 将任务添加到记忆
    await this.memory.addMessage({
      role: 'user',
      content: task
    });

    const results = {
      success: false,
      finalResult: null,
      iterations: 0,
      toolCalls: [],
      error: null,
      sessionId: this.sessionId
    };

    try {
      // 启动自动检查点保存
      if (this.autoCheckpoint) {
        this.persistence.startAutoSave(() => ({
          iteration: this.state.iteration,
          status: this.state.status,
          context: this.state.context,
          toolResults: this.state.toolResults,
          pendingAction: this.state.pendingAction
        }));
      }

      // 获取系统提示
      const systemPrompt = this.buildSystemPrompt(context);

      // 初始化上下文
      let currentContext = {
        task,
        system: systemPrompt,
        history: [],
        toolResults: []
      };

      // Agent循环
      for (let i = 0; i < this.maxIterations; i++) {
        // 取消检查 (借鉴 MiniMax Mini-Agent)
        if (this._checkCancelled()) {
          // Task cancelled - operational info
          this._cleanupIncompleteMessages(this.messages);
          if (this._cancelCallback) {
            this._cancelCallback();
          }
          results.finalResult = 'Task cancelled';
          results.cancelled = true;
          this.state.status = 'idle';
          break;
        }

        // Token摘要检查
        await this._summarizeMessages();

        // 检查是否暂停
        if (this.state.status === 'paused') {
          await this.saveCheckpoint(currentContext, i);
          results.finalResult = '任务已暂停，可以稍后恢复';
          results.paused = true;
          break;
        }

        this.state.iteration = i + 1;
        results.iterations = i + 1;

        // 步骤1: 思考 - 生成下一步行动
        const thought = await this.think(currentContext);

        // 步骤2: 决策 - 判断是结束还是继续
        if (thought.type === 'finish') {
          results.success = true;
          results.finalResult = thought.content;
          this.state.status = 'completed';
          break;
        }

        if (thought.type === 'action') {
          // 步骤3: 执行行动
          const actionResult = await this.act(thought.tool, thought.input);
          results.toolCalls.push({
            tool: thought.tool,
            input: thought.input,
            output: actionResult,
            reasoning: thought.reasoning
          });

          // 步骤4: 观察 - 记录结果到上下文
          currentContext.toolResults.push({
            tool: thought.tool,
            input: thought.input,
            output: actionResult,
            timestamp: Date.now()
          });

          // 步骤5: 反思 - 评估结果并决定下一步
          if (this.llmEnabled) {
            const reflection = await this.reflect(thought.tool, thought.input, actionResult);

            if (reflection.action === 'retry' && reflection.newTool) {
              // 重试新工具
              const retryResult = await this.act(reflection.newTool, thought.input);
              currentContext.toolResults.push({
                tool: reflection.newTool,
                input: thought.input,
                output: retryResult,
                timestamp: Date.now(),
                isRetry: true,
                originalTool: thought.tool
              });
              results.toolCalls.push({
                tool: reflection.newTool,
                input: thought.input,
                output: retryResult,
                isRetry: true,
                originalTool: thought.tool
              });

              // 文件检查点：重试成功后保存
              await this.saveFileCheckpoint(currentContext);
            } else if (reflection.action === 'stop') {
              // 停止执行
              results.success = false;
              results.finalResult = reflection.response;
              this.state.status = 'completed';
              break;
            } else if (reflection.action === 'finish') {
              // 完成
              results.success = true;
              results.finalResult = reflection.response;
              this.state.status = 'completed';
              break;
            }
          }

          // 更新状态
          this.state.toolResults = currentContext.toolResults;

          // 文件检查点：每次 act 成功后保存
          await this.saveFileCheckpoint(currentContext);

          // 将工具结果添加到记忆
          await this.memory.addMessage({
            role: 'system',
            content: `[Tool: ${thought.tool}] ${JSON.stringify(actionResult)}`
          });
        }

        // 定期保存检查点
        if (this.autoCheckpoint && (i + 1) % this.checkpointEvery === 0) {
          await this.saveCheckpoint(currentContext, i + 1);
        }
      }

      if (this.state.status !== 'completed' && this.state.status !== 'paused') {
        results.finalResult = '达到最大迭代次数，任务未完成';
        this.state.status = 'completed';
      }

    } catch (error) {
      results.error = error.message;
      this.state.status = 'error';
      console.error('Agent execution error:', error);

      // 保存错误状态的检查点，支持恢复
      await this.persistence.createCheckpoint(this.sessionId, {
        iteration: this.state.iteration,
        status: CheckpointStatus.ERROR,
        context: this.state.context,
        toolResults: this.state.toolResults,
        error: error.message
      });
    } finally {
      // 停止自动保存
      this.persistence.stopAutoSave();

      // 语义记忆：将对话存入语义记忆
      try {
        await this._storeSemanticMemory(task, results.finalResult, results.success);
      } catch (err) {
        console.warn('[AgentEngine] 语义记忆存储失败:', err.message);
      }
    }

    this.state.history = [...results.toolCalls];
    return results;
  }

  /**
   * 保存检查点
   */
  async saveCheckpoint(context, iteration) {
    await this.persistence.createCheckpoint(this.sessionId, {
      iteration,
      status: this.state.status,
      context: this.state.context,
      toolResults: context.toolResults || [],
      pendingAction: this.state.pendingAction
    });
  }

  /**
   * 保存文件检查点（FileCheckpointManager）
   */
  async saveFileCheckpoint(context) {
    try {
      const state = {
        iteration: this.state.iteration,
        status: this.state.status,
        context: this.state.context,
        toolResults: context.toolResults || [],
        pendingAction: this.state.pendingAction,
        reactPhase: this.state.reactPhase,
        reflectionCount: this.state.reflectionCount,
        lastToolSuccess: this.state.lastToolSuccess
      };
      await this.fileCheckpoint.save(this.sessionId, state);
    } catch (error) {
      console.warn('[AgentEngine] 文件检查点保存失败:', error.message);
    }
  }

  /**
   * 从检查点恢复执行
   */
  async resumeFromCheckpoint(sessionId) {
    // Resuming from checkpoint - operational info

    // 优先从 StatePersistence 恢复
    let restoredState = await this.persistence.restoreFromCheckpoint(sessionId);

    // 若 StatePersistence 无数据，尝试从文件检查点恢复
    if (!restoredState) {
      // StatePersistence fallback - operational info
      const fileCheckpoint = await this.fileCheckpoint.getLatest(sessionId);
      if (fileCheckpoint && fileCheckpoint.state) {
        restoredState = fileCheckpoint.state;
        // File checkpoint restored - operational info
      }
    }

    if (!restoredState) {
      throw new Error(`Failed to restore session: ${sessionId}`);
    }

    this.sessionId = sessionId;
    this.state.status = 'running';
    this.state.iteration = restoredState.iteration || 0;
    this.state.context = restoredState.context || {};
    this.state.toolResults = restoredState.toolResults || [];
    this.state.reactPhase = restoredState.reactPhase || REACT_PHASES.REASON;
    this.state.reflectionCount = restoredState.reflectionCount || 0;
    this.state.lastToolSuccess = restoredState.lastToolSuccess || null;

    const results = {
      success: false,
      finalResult: null,
      iterations: restoredState.iteration || 0,
      toolCalls: [],
      error: null,
      sessionId: this.sessionId,
      resumed: true
    };

    try {
      // 获取系统提示
      const systemPrompt = this.buildSystemPrompt(restoredState.context);

      // 恢复上下文
      let currentContext = {
        task: restoredState.task,
        system: systemPrompt,
        history: [],
        toolResults: restoredState.toolResults || []
      };

      // 从恢复点继续执行
      for (let i = this.state.iteration; i < this.maxIterations; i++) {
        if (this.state.status === 'paused') {
          await this.saveCheckpoint(currentContext, i);
          results.finalResult = '任务已暂停';
          results.paused = true;
          break;
        }

        this.state.iteration = i + 1;
        results.iterations = i + 1;

        const thought = await this.think(currentContext);

        if (thought.type === 'finish') {
          results.success = true;
          results.finalResult = thought.content;
          this.state.status = 'completed';
          break;
        }

        if (thought.type === 'action') {
          const actionResult = await this.act(thought.tool, thought.input);
          results.toolCalls.push({
            tool: thought.tool,
            input: thought.input,
            output: actionResult
          });

          currentContext.toolResults.push({
            tool: thought.tool,
            input: thought.input,
            output: actionResult,
            timestamp: Date.now()
          });

          this.state.toolResults = currentContext.toolResults;

          // 文件检查点：恢复后每次 act 成功后保存
          await this.saveFileCheckpoint(currentContext);

          await this.memory.addMessage({
            role: 'system',
            content: `[Tool: ${thought.tool}] ${JSON.stringify(actionResult)}`
          });
        }

        if (this.autoCheckpoint && (i + 1) % this.checkpointEvery === 0) {
          await this.saveCheckpoint(currentContext, i + 1);
        }
      }

      if (this.state.status !== 'completed' && this.state.status !== 'paused') {
        results.finalResult = '达到最大迭代次数，任务未完成';
        this.state.status = 'completed';
      }

    } catch (error) {
      results.error = error.message;
      this.state.status = 'error';
      console.error('Agent resume error:', error);

      await this.persistence.createCheckpoint(this.sessionId, {
        iteration: this.state.iteration,
        status: CheckpointStatus.ERROR,
        context: this.state.context,
        toolResults: this.state.toolResults,
        error: error.message
      });
    }

    this.state.history = [...results.toolCalls];
    return results;
  }

  /**
   * 获取可恢复的会话列表
   */
  async getRecoverableSessions() {
    return this.persistence.getRecoverableSessions();
  }

  /**
   * 获取所有会话
   */
  async listSessions() {
    return this.persistence.listSessions();
  }

  /**
   * 思考阶段 - 分析上下文并决定下一步行动
   * 实现ReAct循环：Reason -> Act -> Observe -> Reflect -> Continue
   */
  async think(context) {
    const { task, toolResults = [], history = [] } = context;

    // 重置ReAct状态
    this.state.reactPhase = REACT_PHASES.REASON;

    // 如果有LLM，使用LLM进行推理
    if (this.llmIntentClassifier && this.llmEnabled) {
      return await this._thinkWithLLM(context);
    }

    // 回退到规则匹配
    return this._thinkWithRules(context);
  }

  /**
   * 使用LLM进行推理（ReAct核心）
   */
  async _thinkWithLLM(context) {
    const { task, toolResults = [], history = [] } = context;

    // 1. Reason - 分析任务
    const reasoning = await this.reason(task, toolResults);

    // 2. 决定是结束还是继续
    if (reasoning.shouldFinish) {
      return {
        type: 'finish',
        content: reasoning.response,
        reasoning: reasoning.explanation
      };
    }

    // 3. 选择工具
    const toolSelection = await this._selectToolWithLLM(task, reasoning, toolResults);

    if (!toolSelection.tool) {
      return {
        type: 'finish',
        content: reasoning.response || '我理解了您的任务。' + (reasoning.suggestion || ''),
        reasoning: reasoning.explanation
      };
    }

    // 4. Act - 返回行动
    return {
      type: 'action',
      tool: toolSelection.tool,
      input: toolSelection.parameters,
      reasoning: reasoning.explanation,
      confidence: toolSelection.confidence
    };
  }

  /**
   * Reason - 分析任务并决定下一步
   */
  async reason(task, toolResults) {
    // 构建上下文
    const contextText = toolResults.length > 0
      ? `\n\n之前的工具执行结果:\n${toolResults.map(r => `[${r.tool}]: ${JSON.stringify(r.output)}`).join('\n')}`
      : '';

    const prompt = `你是一个智能助手，正在帮助用户完成任务。

用户任务: ${task}
${contextText}

请分析当前情况并决定下一步行动。

以JSON格式返回分析结果:
{
  "shouldFinish": true/false,
  "response": "如果应该结束，返回最终响应",
  "explanation": "你的推理过程",
  "suggestion": "如果需要更多信息，给出建议"
}

只返回JSON，不要其他内容。`;

    try {
      // 记录LLM请求
      this.logger.logRequest([{ role: 'user', content: prompt }], []);

      const result = await this._callLLM(prompt);
      const parsed = this._parseJSONResponse(result);

      // 记录LLM响应
      this.logger.logResponse({ content: result });

      return {
        shouldFinish: parsed.shouldFinish || false,
        response: parsed.response || '',
        explanation: parsed.explanation || '',
        suggestion: parsed.suggestion || ''
      };
    } catch (error) {
      // LLM失败，回退到规则
      this.logger.logError(error, { context: 'reason' });
      return this._reasonWithRules(task, toolResults);
    }
  }

  /**
   * 使用LLM选择工具
   */
  async _selectToolWithLLM(task, reasoning, toolResults) {
    try {
      const availableTools = this.toolRegistry.listTools();

      // 构建上下文
      const context = {
        task,
        toolResults,
        reasoning: reasoning.explanation
      };

      const result = await this.llmIntentClassifier.selectTool(task, availableTools, context);

      return {
        tool: result.selectedTool,
        parameters: result.parameters || {},
        confidence: result.confidence,
        reasoning: result.reasoning
      };
    } catch (error) {
      // 回退到关键词
      return this._selectToolWithRules(task);
    }
  }

  /**
   * Act - 执行行动
   */
  async act(toolName, input) {
    // 记录行动
    this.state.reactPhase = REACT_PHASES.ACT;

    try {
      const tool = this.toolRegistry.get(toolName);
      if (!tool) {
        this.state.lastToolSuccess = false;
        return { success: false, error: `Tool not found: ${toolName}` };
      }

      this.state.tools.push(toolName);

      // 人机确认检测
      if (this.humanConfirmationEnabled) {
        const confirmation = this._needsHumanConfirmation(toolName, input, tool);
        if (confirmation.needsConfirmation) {
          // Human confirmation required - operational info

          // 发送确认请求到前端（SSE广播）
          const checkpoint = hitlManager.createCheckpoint({
            type: confirmation.type || CheckpointType.HIGH_RISK,
            title: confirmation.title,
            description: confirmation.message,
            context: {
              toolName,
              input,
              toolCategory: tool.category,
              reason: confirmation.reason,
              sessionId: this.sessionId
            },
            options: [
              { label: '确认执行', value: 'confirm', description: '允许此操作继续执行' },
              { label: '取消操作', value: 'cancel', description: '阻止此操作' }
            ],
            timeout: this.confirmationTimeout,
            required: true
          });

          // 等待用户响应
          const result = await hitlManager.waitForCheckpoint(checkpoint.id, this.confirmationTimeout);

          if (!result.success || result.checkpoint?.status === 'timeout') {
            this.state.lastToolSuccess = false;
            // 超时或拒绝：记录并返回取消结果
            // Confirmation timeout or rejected - operational info
            return {
              success: false,
              error: `操作已取消：用户未在${Math.round(this.confirmationTimeout / 1000)}秒内确认`,
              cancelled: true,
              confirmationId: checkpoint.id,
              confirmed: false
            };
          }

          // 用户批准，继续执行
          // Confirmation approved - operational info
        }
      }

      // 执行前观察
      this.state.reactPhase = REACT_PHASES.OBSERVE;

      // 记录工具调用 (借鉴 MiniMax Mini-Agent)
      // Tool call - operational info
      this.logger.logToolResult(toolName, input, true, '');

      // 使用增强的重试机制执行工具（带退避策略）
      const result = await this._retryToolExecution(toolName, input);

      // 记录结果
      this.state.lastToolSuccess = result.success !== false;
      this.logger.logToolResult(toolName, input, result.success !== false, result.content || result.error, result.error);

      return result;

    } catch (error) {
      this.state.lastToolSuccess = false;
      this.logger.logToolResult(toolName, input, false, '', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 检测操作是否需要用户确认
   * @returns {Object} { needsConfirmation, reason, type, title, message }
   */
  _needsHumanConfirmation(toolName, input, tool) {
    const settings = this.confirmationSettings;
    const toolNameLower = toolName.toLowerCase();
    const inputStr = typeof input === 'string' ? input : JSON.stringify(input);

    // 1. 危险文件操作检测
    if (settings.dangerousOps) {
      const dangerousPatterns = [
        // 文件删除
        { pattern: /(rm|del|delete|remove).*(file|dir|folder|path)/i, reason: '检测到文件删除操作' },
        { pattern: /unlink|rmdir|rm -/i, reason: '检测到危险文件操作命令' },
        // 格式化/清空
        { pattern: /format|truncate|empty.*dir/i, reason: '检测到格式化或清空操作' },
        // 写入敏感路径
        { pattern: /system[\\/]|\.env|credentials|config.*secret/i, reason: '检测到写入系统或敏感文件' }
      ];

      for (const { pattern, reason } of dangerousPatterns) {
        if (pattern.test(inputStr) || pattern.test(toolNameLower)) {
          return {
            needsConfirmation: true,
            reason,
            type: CheckpointType.HIGH_RISK,
            title: '危险操作确认',
            message: `工具 "${toolName}" 准备执行危险操作：\n\n${reason}\n\n输入内容：${inputStr.substring(0, 200)}${inputStr.length > 200 ? '...' : ''}`
          };
        }
      }
    }

    // 2. 不可逆操作检测
    if (settings.irreversibleOps) {
      const irreversiblePatterns = [
        { pattern: /drop|truncate|delete.*where|delete.*without.*condition/i, reason: '检测到数据库删除操作' },
        { pattern: /overwrite.*all|replace.*all|bulk.*update/i, reason: '检测到批量覆盖操作' }
      ];

      for (const { pattern, reason } of irreversiblePatterns) {
        if (pattern.test(inputStr)) {
          return {
            needsConfirmation: true,
            reason,
            type: CheckpointType.ACTION,
            title: '不可逆操作确认',
            message: `工具 "${toolName}" 准备执行不可逆操作：\n\n${reason}\n\n此操作无法撤销，请确认是否继续。`
          };
        }
      }
    }

    // 3. 高费用API调用检测
    if (settings.expensiveCalls) {
      const expensivePatterns = [
        { pattern: /gpt-4|gpt-5|claude-.*opus|gemini.*pro/i, reason: '检测到高费用模型调用' },
        { pattern: /image.*generat|video.*generat|tts.*hd|speech.*hd/i, reason: '检测到高费用多媒体生成' }
      ];

      for (const { pattern, reason } of expensivePatterns) {
        if (pattern.test(inputStr) || pattern.test(toolNameLower)) {
          return {
            needsConfirmation: true,
            reason,
            type: CheckpointType.COST_LIMIT,
            title: '高费用操作确认',
            message: `工具 "${toolName}" 准备执行高费用操作：\n\n${reason}\n\n此操作可能产生较高费用，请确认是否继续。`
          };
        }
      }
    }

    // 4. 外部调用检测（可选，默认关闭）
    if (settings.externalCalls) {
      const externalPatterns = [
        { pattern: /http|fetch|request|webhook|callback/i, reason: '检测到外部网络请求' }
      ];

      for (const { pattern, reason } of externalPatterns) {
        if (pattern.test(inputStr) && toolNameLower.includes('http')) {
          return {
            needsConfirmation: true,
            reason,
            type: CheckpointType.DATA_ACCESS,
            title: '外部调用确认',
            message: `工具 "${toolName}" 准备发起外部网络请求：\n\n${reason}\n\n请确认是否允许此外部调用。`
          };
        }
      }
    }

    return { needsConfirmation: false };
  }

  /**
   * Reflect - 反思工具执行结果
   */
  async reflect(toolName, input, output) {
    this.state.reactPhase = REACT_PHASES.REFLECT;
    this.state.reflectionCount++;

    // 使用增强的结果质量评估
    const quality = this._evaluateResultQuality(output);
    const errorType = this._classifyError(output.error);

    // 检查是否成功
    if (output.success === false) {
      // 工具执行失败
      const shouldRetry = this.state.reflectionCount < this.maxReflections &&
        errorType !== ERROR_CLASSIFICATION.AUTHENTICATION &&
        errorType !== ERROR_CLASSIFICATION.PARAMETER;

      if (shouldRetry) {
        // 根据错误类型调整重试策略
        const retryConfig = this._getRetryConfigForError(errorType);
        // Tool execution failed - operational warning

        return {
          shouldContinue: true,
          action: 'retry',
          reason: `工具执行失败 (${errorType}): ${output.error}，尝试其他方法`,
          newTool: await this._findAlternativeTool(toolName, output.error),
          errorType,
          retryConfig
        };
      }

      return {
        shouldContinue: false,
        action: 'stop',
        reason: `工具多次失败 (${errorType}): ${output.error}`,
        response: `抱歉，工具执行遇到问题: ${output.error}`
      };
    }

    // 检查结果质量
    if (quality.quality === RESULT_QUALITY.GOOD || quality.quality === RESULT_QUALITY.EXCELLENT) {
      return {
        shouldContinue: false,
        action: 'finish',
        reason: '工具执行成功',
        response: this.formatResult(output)
      };
    }

    // 结果不够好，可能需要继续
    if (this.state.reflectionCount < this.maxReflections) {
      return {
        shouldContinue: true,
        action: 'refine',
        reason: quality.reason,
        suggestion: quality.suggestion
      };
    }

    return {
      shouldContinue: false,
      action: 'finish',
      reason: '达到最大反思次数',
      response: this.formatResult(output)
    };
  }

  /**
   * ShouldContinue - 判断是否继续
   */
  shouldContinue(reflectionResult) {
    this.state.reactPhase = REACT_PHASES.CONTINUE;
    return reflectionResult.shouldContinue;
  }

  /**
   * 检查结果质量
   */
  async _checkResultQuality(output) {
    const resultText = typeof output === 'string'
      ? output
      : JSON.stringify(output);

    // 简单检查：结果是否为空或错误
    if (!resultText || resultText === '{}' || resultText === '[]') {
      return { isGood: false, reason: '结果为空', suggestion: '尝试其他工具或参数' };
    }

    // 检查错误标记
    if (resultText.toLowerCase().includes('error') ||
        resultText.toLowerCase().includes('失败') ||
        resultText.toLowerCase().includes('无法')) {
      return { isGood: false, reason: '结果包含错误信息', suggestion: '检查输入参数或尝试其他方法' };
    }

    // 使用LLM评估质量
    if (this.llmIntentClassifier && resultText.length > 100) {
      try {
        const prompt = `评估以下工具执行结果的质量:

结果: ${resultText.substring(0, 500)}

以JSON格式返回评估:
{
  "isGood": true/false,
  "reason": "评估理由",
  "suggestion": "如果不够好，建议"
}

只返回JSON。`;

        const llmResult = await this._callLLM(prompt);
        const parsed = this._parseJSONResponse(llmResult);
        return parsed;
      } catch {
        // LLM评估失败，使用默认判断
      }
    }

    return { isGood: true, reason: '结果看起来正常' };
  }

  /**
   * 查找替代工具
   */
  async _findAlternativeTool(failedTool, error) {
    const availableTools = this.toolRegistry.listTools();

    // 简单策略：返回另一个同类别的工具
    const failedToolInfo = this.toolRegistry.get(failedTool);
    const category = failedToolInfo?.category || 'general';

    const alternatives = availableTools.filter(t =>
      t.category === category && t.name !== failedTool
    );

    if (alternatives.length > 0) {
      return alternatives[0].name;
    }

    return null;
  }

  /**
   * 规则匹配推理（回退方案）
   */
  _thinkWithRules(context) {
    const { task, toolResults = [] } = context;

    // 如果是第一次迭代，生成初始响应
    if (toolResults.length === 0) {
      // 检查任务是否包含工具调用意图
      const taskLower = task.toLowerCase();

      // 搜索类任务
      if (taskLower.includes('搜索') || taskLower.includes('查找') || taskLower.includes('search') ||
          taskLower.includes('天气') || taskLower.includes('weather')) {
        const searchQuery = this.extractSearchQuery(task);
        return {
          type: 'action',
          tool: 'web_search',
          input: { query: searchQuery }
        };
      }

      // 文件操作类任务
      if (taskLower.includes('读取') || taskLower.includes('写') || taskLower.includes('文件')) {
        return {
          type: 'action',
          tool: 'file_operations',
          input: this.parseFileOperation(task)
        };
      }

      // Shell命令类任务
      if (taskLower.includes('执行') || taskLower.includes('运行') || taskLower.includes('命令')) {
        return {
          type: 'action',
          tool: 'shell',
          input: this.parseShellCommand(task)
        };
      }

      // 计算类任务
      if (taskLower.includes('计算') || taskLower.includes('等于') || taskLower.includes('+') ||
          taskLower.includes('-') || taskLower.includes('*') || taskLower.includes('/')) {
        return {
          type: 'action',
          tool: 'calculator',
          input: { expression: task }
        };
      }

      // 默认结束
      return {
        type: 'finish',
        content: `我理解了您的任务：${task}。请告诉我更多细节以便更好地帮助您。`
      };
    }

    // 检查最近的工具结果，判断是否需要继续
    if (toolResults.length > 0) {
      const lastResult = toolResults[toolResults.length - 1];
      // 如果工具执行成功，结束
      if (lastResult.output && (lastResult.output.success !== false)) {
        return {
          type: 'finish',
          content: this.formatResult(lastResult.output)
        };
      }
    }

    return {
      type: 'finish',
      content: '任务处理完成'
    };
  }

  /**
   * 规则匹配选择工具
   */
  _selectToolWithRules(task) {
    const taskLower = task.toLowerCase();

    if (taskLower.includes('搜索') || taskLower.includes('查找') || taskLower.includes('search')) {
      return { tool: 'web_search', parameters: { query: this.extractSearchQuery(task) }, confidence: 0.8 };
    }
    if (taskLower.includes('计算')) {
      return { tool: 'calculator', parameters: { expression: task }, confidence: 0.9 };
    }
    if (taskLower.includes('文件') || taskLower.includes('读取') || taskLower.includes('写入')) {
      return { tool: 'file_operations', parameters: this.parseFileOperation(task), confidence: 0.7 };
    }

    return { tool: null, parameters: {}, confidence: 0 };
  }

  /**
   * 规则推理（回退）
   */
  _reasonWithRules(task, toolResults) {
    if (toolResults.length > 0) {
      const lastResult = toolResults[toolResults.length - 1];
      if (lastResult.output && lastResult.output.success !== false) {
        return { shouldFinish: true, response: this.formatResult(lastResult.output), explanation: '工具执行成功' };
      }
    }

    return { shouldFinish: false, explanation: '需要继续执行工具' };
  }

  /**
   * 调用LLM
   */
  async _callLLM(prompt) {
    if (!this.modelRouter) {
      throw new Error('No model router available');
    }

    const messages = [
      { role: 'system', content: '你是一个JSON生成助手，只返回有效的JSON。' },
      { role: 'user', content: prompt }
    ];

    const result = await this.modelRouter.callAPI(this.llmModelId, {
      messages,
      temperature: 0.3,
      max_tokens: 1000
    });

    if (result.choices && result.choices[0]) {
      return result.choices[0].message.content;
    }

    if (result.content) {
      return result.content;
    }

    throw new Error('Invalid LLM response');
  }

  /**
   * 解析JSON响应 - 改进版，解析失败时抛出错误
   */
  _parseJSONResponse(response) {
    if (!response || typeof response !== 'string') {
      throw new Error('Invalid response type: expected string');
    }

    try {
      // 尝试提取JSON对象
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;

      const parsed = JSON.parse(jsonStr);

      // 验证解析结果
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid JSON structure: expected object');
      }

      return parsed;
    } catch (error) {
      // 记录详细错误信息以便调试
      console.error('[AgentEngine] JSON解析失败:', {
        error: error.message,
        responsePreview: response.substring(0, 200),
        responseLength: response.length
      });
      throw error;  // 不要静默失败，让调用者知道解析出问题了
    }
  }

  /**
   * 构建系统提示
   */
  buildSystemPrompt(context = {}) {
    const availableTools = this.toolRegistry.listTools();
    return `
你是一个智能助手，可以帮助用户完成各种任务。

可用工具：
${availableTools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

指导原则：
1. 分析用户请求，理解意图
2. 选择合适的工具完成任务
3. 逐步执行，提供清晰的结果
4. 如果遇到错误，尝试其他方法
${context.customPrompt || ''}
`.trim();
  }

  /**
   * 提取搜索查询
   */
  extractSearchQuery(task) {
    // 简单实现：提取引号内的内容或去除动词
    const match = task.match(/["'](.+?)["']/);
    if (match) return match[1];

    const removeWords = ['搜索', '查找', '帮我', '请', 'search', 'find'];
    let query = task;
    removeWords.forEach(word => {
      query = query.replace(new RegExp(word, 'gi'), '');
    });
    return query.trim();
  }

  /**
   * 解析文件操作
   */
  parseFileOperation(task) {
    // 简单实现：提取文件路径
    const pathMatch = task.match(/[./\\]+[\w-]+(\.[\w]+)?/);
    return {
      operation: task.includes('写') || task.includes('创建') ? 'write' : 'read',
      path: pathMatch ? pathMatch[0] : 'unknown.txt',
      content: task.includes('写') ? this.extractContent(task) : null
    };
  }

  /**
   * 解析Shell命令
   */
  parseShellCommand(task) {
    // 提取命令部分
    const cmdMatch = task.match(/(?:运行|执行|cmd|shell)[:\s]+(.+)/i);
    return {
      command: cmdMatch ? cmdMatch[1].trim() : task
    };
  }

  /**
   * 提取内容
   */
  extractContent(task) {
    const match = task.match(/[:：]\s*(.+)$/);
    return match ? match[1] : 'Default content';
  }

  /**
   * 格式化结果
   */
  formatResult(output) {
    if (typeof output === 'string') return output;
    if (output.data) return JSON.stringify(output.data, null, 2);
    if (output.result) return output.result;
    return JSON.stringify(output);
  }

  /**
   * 存储对话到语义记忆
   */
  async _storeSemanticMemory(task, result, success) {
    if (!task) return;

    // 存储用户任务
    await this.semanticMemory.add({
      type: 'conversation',
      role: 'user',
      content: task,
      importance: success ? 0.7 : 0.5
    });

    // 存储 AI 回复
    if (result) {
      await this.semanticMemory.add({
        type: 'conversation',
        role: 'assistant',
        content: result,
        importance: success ? 0.7 : 0.4
      });
    }

    // Semantic memory stored - operational info
  }

  /**
   * 检索相关语义记忆
   * @param {string} query - 查询文本
   * @param {number} limit - 返回数量上限
   * @returns {Array} 相关记忆列表
   */
  async retrieveRelevantMemories(query, limit = 5) {
    try {
      const results = await this.semanticMemory.search(query, { limit });
      return results.map(r => ({
        content: r.content,
        role: r.role,
        score: r.score,
        source: r.source
      }));
    } catch (err) {
      console.warn('[AgentEngine] 语义记忆检索失败:', err.message);
      return [];
    }
  }

  /**
   * 注册到 A2A 服务（使当前 Agent 可被发现和通信）
   */
  registerToA2A(a2aService) {
    if (!this.a2aEnabled) {
      // A2A disabled - operational info
      return null;
    }

    this.a2aService = a2aService;

    const agentInfo = a2aService.registerAgent({
      id: this.a2aAgentId,
      name: options.name || `Agent-${this.sessionId}`,
      type: 'react',
      capabilities: this.toolRegistry.listTools().map(t => t.name),
      metadata: {
        sessionId: this.sessionId,
        llmEnabled: this.llmEnabled,
        model: this.llmModelId
      }
    });

    // A2A registered - operational info
    return agentInfo;
  }

  /**
   * 从 A2A 服务注销
   */
  unregisterFromA2A() {
    if (this.a2aService) {
      this.a2aService.unregisterAgent(this.a2aAgentId);
      // A2A unregistered - operational info
    }
  }

  /**
   * 委托任务给其他 Agent
   */
  async delegateToAgent(targetAgentId, task, options = {}) {
    if (!this.a2aService) {
      throw new Error('A2A service not available. Call registerToA2A first.');
    }

    const { priority = 0, timeout = 5 * 60 * 1000 } = options;

    const result = this.a2aService.delegateTask({
      from: this.a2aAgentId,
      to: targetAgentId,
      title: task.title || 'Agent Task',
      description: task.description || '',
      input: task.input || task,
      priority,
      tags: task.tags || [],
      metadata: {
        sourceSession: this.sessionId,
        ...task.metadata
      },
      timeout
    });

    // A2A task delegated - operational info
    return result;
  }

  /**
   * 等待其他 Agent 返回结果
   */
  async waitForResult(taskId, timeout = 5 * 60 * 1000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._a2aPendingCallbacks.delete(taskId);
        reject(new Error(`A2A result timeout for task: ${taskId}`));
      }, timeout);

      this._a2aPendingCallbacks.set(taskId, (message) => {
        clearTimeout(timer);
        resolve(message.payload);
      });
    });
  }

  /**
   * 处理接收到的 A2A 消息
   */
  async handleA2AMessage(message) {
    if (!message || !this.a2aService) return;

    const { type, payload, from, taskId } = message;

    switch (type) {
      case A2A_MESSAGE_TYPES.TASK_DELEGATE: {
        // 收到任务委托
        const { task, input } = payload || {};
        // A2A task received - operational info

        this.state.status = 'running';

        try {
          // 执行任务
          const execResult = await this.execute(
            input.description || JSON.stringify(input),
            { ...input, a2aTaskId: taskId, delegatedFrom: from }
          );

          // 返回结果
          await this.a2aService.returnResult(
            taskId,
            {
              success: execResult.success,
              result: execResult.finalResult,
              iterations: execResult.iterations,
              toolCalls: execResult.toolCalls
            },
            execResult.success ? A2A_TASK_STATUS.COMPLETED : A2A_TASK_STATUS.FAILED
          );
        } catch (err) {
          await this.a2aService.returnResult(taskId, { success: false, error: err.message }, A2A_TASK_STATUS.FAILED);
        }

        this.state.status = 'idle';
        break;
      }

      case A2A_MESSAGE_TYPES.RESULT_RETURN: {
        // 收到结果回传
        const callback = this._a2aPendingCallbacks.get(taskId);
        if (callback) {
          callback(payload);
          this._a2aPendingCallbacks.delete(taskId);
        }

        // 触发注册的 handler
        const handler = this._a2aResultHandlers.get(taskId);
        if (handler) {
          handler(payload);
        }
        break;
      }

      case A2A_MESSAGE_TYPES.PROGRESS_UPDATE: {
        // 收到进度更新
        // A2A progress update - operational info
        this.emit('a2a:progress', { taskId, progress: payload.progress, metadata: payload.metadata });
        break;
      }

      case A2A_MESSAGE_TYPES.STATUS_SYNC: {
        // 收到状态同步
        // A2A status sync - operational info
        this.emit('a2a:statusSync', { from, status: payload.status, metadata: payload.metadata });
        break;
      }

      case A2A_MESSAGE_TYPES.ERROR_NOTIFY: {
        // 收到错误通知
        console.error(`[AgentEngine] A2A error from ${from} for ${taskId}:`, payload);
        this.emit('a2a:error', { taskId, from, error: payload });
        break;
      }

      default:
        // Unknown A2A message - operational warning
    }
  }

  /**
   * 轮询接收 A2A 消息
   */
  async pollA2AMessages(clearReceived = true) {
    if (!this.a2aService) return [];

    const messages = this.a2aService.receiveMessages(this.a2aAgentId, {
      limit: 20,
      clearReceived
    });

    for (const msg of messages) {
      await this.handleA2AMessage(msg);
    }

    return messages;
  }

  /**
   * 注册 A2A 结果处理器
   */
  onA2AResult(taskId, handler) {
    this._a2aResultHandlers.set(taskId, handler);
  }

  /**
   * 发送 A2A 心跳
   */
  sendA2AHeartbeat() {
    if (this.a2aService) {
      this.a2aService.agentHeartbeat(this.a2aAgentId);
    }
  }

  /**
   * 获取A2A状态
   */
  getA2AState() {
    return {
      enabled: this.a2aEnabled,
      agentId: this.a2aAgentId,
      registered: !!this.a2aService,
      pendingCallbacks: this._a2aPendingCallbacks.size,
      registeredHandlers: this._a2aResultHandlers.size
    };
  }

  /**
   * 获取Agent状态
   */
  getState() {
    return {
      ...this.state,
      sessionId: this.sessionId,
      memory: this.memory.getStats(),
      semanticMemory: this.semanticMemory.getStats(),
      persistence: {
        enabled: this.autoCheckpoint,
        currentSession: this.persistence.currentSession?.id || null
      },
      fileCheckpoint: {
        enabled: true,
        checkpointDir: this.fileCheckpoint.checkpointDir,
        maxCheckpoints: this.fileCheckpoint.maxCheckpoints
      },
      llm: {
        enabled: this.llmEnabled,
        model: this.llmModelId,
        maxReflections: this.maxReflections,
        reflectionCount: this.state.reflectionCount
      },
      humanConfirmation: {
        enabled: this.humanConfirmationEnabled,
        timeout: this.confirmationTimeout,
        settings: this.confirmationSettings,
        pendingCheckpoints: hitlManager.getPendingCheckpoints().filter(
          cp => cp.context?.sessionId === this.sessionId
        ).length
      },
      a2a: this.getA2AState(),
      // MiniAgent 优化特性
      miniAgentOptimizations: {
        tokenManagement: {
          enabled: true,
          tokenLimit: this.tokenLimit,
          currentEstimate: this._estimateTokens(),
          apiTotalTokens: this.apiTotalTokens
        },
        cancellation: {
          enabled: true,
          hasCancelEvent: !!this.cancelEvent,
          isCancelled: this._checkCancelled()
        },
        structuredLogging: {
          enabled: true,
          logFile: this.logger.getLogFilePath()
        },
        sessionNotes: {
          enabled: true,
          memoryFile: this.sessionNoteTool.memoryFile
        }
      }
    };
  }

  /**
   * 暂停执行
   */
  async pause() {
    this.state.status = 'paused';
    // 保存检查点
    if (this.sessionId) {
      await this.persistence.createCheckpoint(this.sessionId, {
        iteration: this.state.iteration,
        status: CheckpointStatus.PAUSED,
        context: this.state.context,
        toolResults: this.state.toolResults,
        pendingAction: this.state.pendingAction
      });
      // 同时保存文件检查点
      await this.fileCheckpoint.save(this.sessionId, {
        iteration: this.state.iteration,
        status: CheckpointStatus.PAUSED,
        context: this.state.context,
        toolResults: this.state.toolResults,
        pendingAction: this.state.pendingAction,
        reactPhase: this.state.reactPhase,
        reflectionCount: this.state.reflectionCount,
        lastToolSuccess: this.state.lastToolSuccess
      });
    }
  }

  /**
   * 恢复执行
   */
  resume() {
    this.state.status = 'running';
  }

  /**
   * 清理资源
   */
  async cleanup() {
    await this.memory.clear();
    this.persistence.stopAutoSave();
    this.state.status = 'idle';
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId) {
    return this.persistence.deleteSession(sessionId);
  }

  /**
   * 清理过期会话
   */
  async cleanupExpiredSessions(maxAge) {
    return this.persistence.cleanupExpiredSessions(maxAge);
  }
}

module.exports = AgentEngine;
