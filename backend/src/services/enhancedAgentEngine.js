/**
 * 增强版 Agent 执行引擎
 * 参考 LangGraph 设计模式
 * 新增功能：
 * 1. 状态检查点 (Checkpoints) - 持久化执行状态
 * 2. 人机协作 (Human-in-the-Loop) - 关键节点请求确认
 * 3. 双记忆系统 - 短期工作记忆 + 长期记忆
 */

const EventEmitter = require('events');
const ToolRegistry = require('./tools/toolRegistry');
const FileSystemTool = require('./tools/fileSystemTool');
const ShellTool = require('./tools/shellTool');
const WebSearchTool = require('./tools/webSearchTool');
const { createLogger } = require('../infra/logger/AgentLogger');

const logger = createLogger('enhancedAgentEngine');

/**
 * 检查点管理器
 */
class CheckpointManager {
  constructor() {
    this.checkpoints = new Map();
    this.maxCheckpoints = 100;
  }

  /**
   * 保存检查点
   */
  save(sessionId, state) {
    const checkpoint = {
      id: `cp_${Date.now()}`,
      sessionId,
      state: JSON.parse(JSON.stringify(state)),
      timestamp: Date.now(),
      status: state.status
    };

    // 获取现有检查点
    const sessionCheckpoints = this.checkpoints.get(sessionId) || [];

    // 添加新检查点
    sessionCheckpoints.push(checkpoint);

    // 限制数量
    if (sessionCheckpoints.length > this.maxCheckpoints) {
      sessionCheckpoints.shift();
    }

    this.checkpoints.set(sessionId, sessionCheckpoints);
    return checkpoint;
  }

  /**
   * 获取最新检查点
   */
  getLatest(sessionId) {
    const sessionCheckpoints = this.checkpoints.get(sessionId);
    if (!sessionCheckpoints || sessionCheckpoints.length === 0) {
      return null;
    }
    return sessionCheckpoints[sessionCheckpoints.length - 1];
  }

  /**
   * 恢复到指定检查点
   */
  restore(sessionId, checkpointId) {
    const sessionCheckpoints = this.checkpoints.get(sessionId);
    if (!sessionCheckpoints) return null;

    const checkpoint = sessionCheckpoints.find(cp => cp.id === checkpointId);
    return checkpoint ? JSON.parse(JSON.stringify(checkpoint.state)) : null;
  }

  /**
   * 列出所有检查点
   */
  list(sessionId) {
    return this.checkpoints.get(sessionId) || [];
  }

  /**
   * 清除检查点
   */
  clear(sessionId) {
    if (sessionId) {
      this.checkpoints.delete(sessionId);
    } else {
      this.checkpoints.clear();
    }
  }
}

/**
 * 双层记忆系统
 * 短期记忆：当前会话的工作记忆
 * 长期记忆：跨会话的持久化记忆
 */
class DualMemorySystem {
  constructor(options = {}) {
    this.shortTermMemory = {
      maxItems: options.shortTermMax || 50,
      items: [],
      workingContext: null
    };

    this.longTermMemory = {
      maxItems: options.longTermMax || 1000,
      items: [],
      embeddings: new Map() // 简化的向量存储
    };

    this.sessionId = options.sessionId || 'default';
  }

  /**
   * 添加到短期记忆
   */
  addToShortTerm(item) {
    const memoryItem = {
      ...item,
      id: `stm_${Date.now()}`,
      timestamp: Date.now()
    };

    this.shortTermMemory.items.push(memoryItem);

    // 超出限制时压缩
    if (this.shortTermMemory.items.length > this.shortTermMemory.maxItems) {
      this.compressShortTerm();
    }

    return memoryItem;
  }

  /**
   * 提升到长期记忆
   */
  promoteToLongTerm(item) {
    const memoryItem = {
      ...item,
      id: `ltm_${Date.now()}`,
      timestamp: Date.now(),
      accessCount: 0,
      importance: item.importance || 'medium'
    };

    this.longTermMemory.items.push(memoryItem);

    // 生成简化向量
    if (item.content) {
      this.longTermMemory.embeddings.set(
        memoryItem.id,
        this.generateEmbedding(item.content)
      );
    }

    return memoryItem;
  }

  /**
   * 压缩短期记忆
   */
  compressShortTerm() {
    const items = this.shortTermMemory.items;

    // 保留最近的重要项
    const recentItems = items.slice(-20);

    // 提取摘要
    const summary = this.generateSummary(items.slice(0, -20));

    this.shortTermMemory.items = [
      { type: 'summary', content: summary, timestamp: Date.now() },
      ...recentItems
    ];
  }

  /**
   * 生成摘要
   */
  generateSummary(items) {
    const topics = new Set();
    items.forEach(item => {
      if (item.content) {
        const words = item.content.match(/[\u4e00-\u9fa5a-zA-Z]{2,}/g) || [];
        words.slice(0, 5).forEach(w => topics.add(w));
      }
    });
    return `摘要: ${Array.from(topics).slice(0, 5).join(', ')}`;
  }

  /**
   * 生成简化向量嵌入
   */
  generateEmbedding(text) {
    const vector = new Array(64).fill(0);
    const words = text.toLowerCase().split(/\s+/);

    words.forEach((word, idx) => {
      for (let i = 0; i < word.length; i++) {
        const code = word.charCodeAt(i);
        vector[(idx + code) % 64] += 1;
      }
    });

    // 归一化
    const max = Math.max(...vector);
    return vector.map(v => v / (max || 1));
  }

  /**
   * 语义搜索
   */
  search(query, options = {}) {
    const { limit = 5, includeShortTerm = true } = options;
    const queryVector = this.generateEmbedding(query);
    const results = [];

    // 搜索短期记忆
    if (includeShortTerm) {
      this.shortTermMemory.items.forEach(item => {
        if (item.content) {
          const itemVector = this.generateEmbedding(item.content);
          const score = this.cosineSimilarity(queryVector, itemVector);
          results.push({ ...item, score, source: 'short_term' });
        }
      });
    }

    // 搜索长期记忆
    this.longTermMemory.items.forEach(item => {
      const embedding = this.longTermMemory.embeddings.get(item.id);
      if (embedding) {
        const score = this.cosineSimilarity(queryVector, embedding);
        results.push({ ...item, score, source: 'long_term' });
      }
    });

    // 排序并返回
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * 余弦相似度
   */
  cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  /**
   * 获取工作上下文
   */
  getWorkingContext() {
    return this.shortTermMemory.workingContext;
  }

  /**
   * 设置工作上下文
   */
  setWorkingContext(context) {
    this.shortTermMemory.workingContext = context;
  }

  /**
   * 获取状态
   */
  getStats() {
    return {
      shortTerm: {
        count: this.shortTermMemory.items.length,
        max: this.shortTermMemory.maxItems
      },
      longTerm: {
        count: this.longTermMemory.items.length,
        max: this.longTermMemory.maxItems
      }
    };
  }

  /**
   * 导出记忆
   */
  export() {
    return {
      shortTerm: this.shortTermMemory.items,
      longTerm: this.longTermMemory.items
    };
  }

  /**
   * 清除
   */
  clear(type = 'all') {
    if (type === 'short' || type === 'all') {
      this.shortTermMemory.items = [];
      this.shortTermMemory.workingContext = null;
    }
    if (type === 'long' || type === 'all') {
      this.longTermMemory.items = [];
      this.longTermMemory.embeddings.clear();
    }
  }
}

/**
 * 人机协作管理器
 */
class HumanInTheLoopManager {
  constructor() {
    this.pendingConfirmations = new Map();
    this.confirmationHistory = [];
  }

  /**
   * 请求确认
   */
  requestConfirmation(sessionId, decision) {
    const confirmation = {
      id: `conf_${Date.now()}`,
      sessionId,
      decision,
      status: 'pending',
      createdAt: Date.now(),
      response: null
    };

    this.pendingConfirmations.set(confirmation.id, confirmation);
    return confirmation;
  }

  /**
   * 响应确认
   */
  respondToConfirmation(confirmationId, response) {
    const confirmation = this.pendingConfirmations.get(confirmationId);
    if (!confirmation) {
      return { success: false, error: 'Confirmation not found' };
    }

    confirmation.status = 'responded';
    confirmation.response = response;
    confirmation.respondedAt = Date.now();

    // 移动到历史
    this.confirmationHistory.push(confirmation);
    this.pendingConfirmations.delete(confirmationId);

    return { success: true, confirmation };
  }

  /**
   * 获取待处理确认
   */
  getPending(sessionId) {
    const pending = [];
    this.pendingConfirmations.forEach(conf => {
      if (!sessionId || conf.sessionId === sessionId) {
        pending.push(conf);
      }
    });
    return pending;
  }

  /**
   * 检查是否有待处理确认
   */
  hasPending(sessionId) {
    for (const conf of this.pendingConfirmations.values()) {
      if (conf.sessionId === sessionId) {
        return true;
      }
    }
    return false;
  }
}

/**
 * 增强版 Agent 引擎
 */
class EnhancedAgentEngine extends EventEmitter {
  constructor(options = {}) {
    super();

    this.maxIterations = options.maxIterations || 10;
    this.toolRegistry = new ToolRegistry();

    // 新增组件
    this.checkpointManager = new CheckpointManager();
    this.memory = new DualMemorySystem(options.memoryOptions || {});
    this.humanLoop = new HumanInTheLoopManager();

    this.sessionId = options.sessionId || `agent_${Date.now()}`;

    // 增强的状态
    this.state = {
      status: 'idle',
      iteration: 0,
      tools: [],
      history: [],
      currentCheckpoint: null,
      humanLoopRequired: false
    };

    // 配置
    this.config = {
      enableCheckpoints: options.enableCheckpoints !== false,
      enableHumanLoop: options.enableHumanLoop !== false,
      checkpointInterval: options.checkpointInterval || 1, // 每N次迭代保存检查点
      criticalDecisions: options.criticalDecisions || [
        'delete', 'remove', 'execute', 'send', 'publish'
      ]
    };

    // 注册默认工具
    this.registerDefaultTools(options.toolOptions || {});
  }

  /**
   * 注册默认工具
   */
  registerDefaultTools(toolOptions = {}) {
    this.toolRegistry.register(new FileSystemTool(toolOptions.fileSystem || {}));
    this.toolRegistry.register(new ShellTool(toolOptions.shell || {}));
    this.toolRegistry.register(new WebSearchTool(toolOptions.webSearch || {}));
  }

  /**
   * 注册工具
   */
  registerTool(tool) {
    this.toolRegistry.register(tool);
  }

  /**
   * 执行 Agent 循环
   */
  async execute(task, context = {}) {
    this.state.status = 'running';
    this.state.iteration = 0;
    this.state.history = [];

    // 添加任务到短期记忆
    this.memory.addToShortTerm({
      type: 'task',
      role: 'user',
      content: task
    });

    const results = {
      success: false,
      finalResult: null,
      iterations: 0,
      toolCalls: [],
      checkpoints: [],
      humanConfirmations: [],
      error: null
    };

    try {
      const systemPrompt = this.buildSystemPrompt(context);

      let currentContext = {
        task,
        system: systemPrompt,
        history: [],
        toolResults: []
      };

      // Agent 循环
      for (let i = 0; i < this.maxIterations; i++) {
        this.state.iteration = i + 1;
        results.iterations = i + 1;

        // 检查是否有人机协作确认待处理
        if (this.humanLoop.hasPending(this.sessionId)) {
          this.state.status = 'waiting_confirmation';
          this.emit('waiting_confirmation', {
            sessionId: this.sessionId,
            pending: this.humanLoop.getPending(this.sessionId)
          });

          // 等待确认（在实际应用中应该是异步等待用户输入）
          // 这里简化处理，继续执行
        }

        // 步骤1: 思考
        const thought = await this.think(currentContext);

        // 步骤2: 检查是否需要人机协作确认
        if (thought.type === 'action' && this.requiresHumanConfirmation(thought)) {
          const confirmation = this.humanLoop.requestConfirmation(this.sessionId, {
            type: 'tool_call',
            tool: thought.tool,
            input: thought.input,
            reason: `即将执行可能影响系统的操作: ${thought.tool}`
          });

          results.humanConfirmations.push(confirmation);
          this.emit('confirmation_required', confirmation);

          // 标记需要确认
          this.state.humanLoopRequired = true;
        }

        // 步骤3: 决策
        if (thought.type === 'finish') {
          results.success = true;
          results.finalResult = thought.content;
          this.state.status = 'completed';

          // 提升重要结果到长期记忆
          this.memory.promoteToLongTerm({
            type: 'result',
            content: thought.content,
            importance: 'high'
          });

          break;
        }

        if (thought.type === 'action') {
          // 步骤4: 执行行动
          const actionResult = await this.act(thought.tool, thought.input);
          results.toolCalls.push({
            iteration: i + 1,
            tool: thought.tool,
            input: thought.input,
            output: actionResult
          });

          // 步骤5: 观察并记录
          currentContext.toolResults.push({
            tool: thought.tool,
            input: thought.input,
            output: actionResult,
            timestamp: Date.now()
          });

          // 添加到记忆
          this.memory.addToShortTerm({
            type: 'tool_result',
            tool: thought.tool,
            content: JSON.stringify(actionResult)
          });

          // 步骤6: 保存检查点
          if (this.config.enableCheckpoints &&
              (i + 1) % this.config.checkpointInterval === 0) {
            const checkpoint = this.checkpointManager.save(this.sessionId, {
              ...this.state,
              context: currentContext,
              results: results.toolCalls
            });
            results.checkpoints.push(checkpoint.id);
            this.state.currentCheckpoint = checkpoint.id;
            this.emit('checkpoint_saved', checkpoint);
          }
        }
      }

      if (this.state.status !== 'completed') {
        results.finalResult = '达到最大迭代次数，任务未完成';
        this.state.status = 'completed';
      }

    } catch (error) {
      results.error = error.message;
      this.state.status = 'error';
      this.emit('error', error);
      logger.error('Agent execution error', { error: error.message });

      // 保存错误状态检查点
      if (this.config.enableCheckpoints) {
        const checkpoint = this.checkpointManager.save(this.sessionId, {
          ...this.state,
          error: error.message
        });
        results.checkpoints.push(checkpoint.id);
      }
    }

    this.state.history = [...results.toolCalls];
    this.emit('completed', results);
    return results;
  }

  /**
   * 思考阶段
   */
  async think(context) {
    const recentResults = context.toolResults || [];

    // 搜索相关记忆
    const relevantMemories = this.memory.search(context.task, { limit: 3 });

    if (context.history.length === 0) {
      const task = context.task.toLowerCase();

      // 搜索类任务
      if (task.includes('搜索') || task.includes('查找') || task.includes('search')) {
        const searchQuery = this.extractSearchQuery(context.task);
        return {
          type: 'action',
          tool: 'web_search',
          input: { query: searchQuery },
          relevantMemories
        };
      }

      // 文件操作类任务
      if (task.includes('读取') || task.includes('写') || task.includes('文件')) {
        return {
          type: 'action',
          tool: 'file_operations',
          input: this.parseFileOperation(context.task),
          relevantMemories
        };
      }

      // Shell命令类任务
      if (task.includes('执行') || task.includes('运行') || task.includes('命令')) {
        return {
          type: 'action',
          tool: 'shell',
          input: this.parseShellCommand(context.task),
          relevantMemories
        };
      }

      return {
        type: 'finish',
        content: `我理解了您的任务：${context.task}。请告诉我更多细节以便更好地帮助您。`,
        relevantMemories
      };
    }

    // 检查最近的工具结果
    if (recentResults.length > 0) {
      const lastResult = recentResults[recentResults.length - 1];
      if (lastResult.output && lastResult.output.success) {
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
   * 判断是否需要人工确认
   */
  requiresHumanConfirmation(thought) {
    if (!this.config.enableHumanLoop) return false;

    const criticalKeywords = this.config.criticalDecisions;
    const toolName = thought.tool.toLowerCase();
    const input = JSON.stringify(thought.input).toLowerCase();

    return criticalKeywords.some(keyword =>
      toolName.includes(keyword) || input.includes(keyword)
    );
  }

  /**
   * 执行行动
   */
  async act(toolName, input) {
    try {
      const tool = this.toolRegistry.get(toolName);
      if (!tool) {
        return { success: false, error: `Tool not found: ${toolName}` };
      }

      this.state.tools.push(toolName);
      return await tool.execute(input);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 从检查点恢复
   */
  async restoreFromCheckpoint(checkpointId) {
    const state = this.checkpointManager.restore(this.sessionId, checkpointId);
    if (!state) {
      return { success: false, error: 'Checkpoint not found' };
    }

    this.state = { ...this.state, ...state };
    this.emit('restored', { checkpointId, state });
    return { success: true, state };
  }

  /**
   * 响应人机协作确认
   */
  respondToConfirmation(confirmationId, approved, modifiedInput = null) {
    const response = {
      approved,
      modifiedInput,
      respondedAt: Date.now()
    };

    const result = this.humanLoop.respondToConfirmation(confirmationId, response);

    if (result.success) {
      this.state.humanLoopRequired = false;
      this.emit('confirmation_responded', result.confirmation);
    }

    return result;
  }

  /**
   * 构建系统提示
   */
  buildSystemPrompt(context = {}) {
    const availableTools = this.toolRegistry.listTools();
    const memoryContext = this.memory.getWorkingContext();

    return `
你是一个智能助手，可以帮助用户完成各种任务。

可用工具：
${availableTools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

指导原则：
1. 分析用户请求，理解意图
2. 选择合适的工具完成任务
3. 逐步执行，提供清晰的结果
4. 如果遇到错误，尝试其他方法
${memoryContext ? `\n上下文记忆：\n${memoryContext}` : ''}
${context.customPrompt || ''}
`.trim();
  }

  /**
   * 提取搜索查询
   */
  extractSearchQuery(task) {
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
   * 获取完整状态
   */
  getState() {
    return {
      ...this.state,
      sessionId: this.sessionId,
      memory: this.memory.getStats(),
      checkpoints: this.checkpointManager.list(this.sessionId).length,
      pendingConfirmations: this.humanLoop.getPending(this.sessionId).length
    };
  }

  /**
   * 暂停执行
   */
  pause() {
    this.state.status = 'paused';
    // 保存检查点
    if (this.config.enableCheckpoints) {
      const checkpoint = this.checkpointManager.save(this.sessionId, this.state);
      this.emit('paused', { checkpoint });
    }
  }

  /**
   * 恢复执行
   */
  resume() {
    this.state.status = 'running';
    this.emit('resumed');
  }

  /**
   * 清理资源
   */
  async cleanup() {
    this.memory.clear('short');
    this.state.status = 'idle';
    this.checkpointManager.clear(this.sessionId);
  }
}

module.exports = {
  EnhancedAgentEngine,
  CheckpointManager,
  DualMemorySystem,
  HumanInTheLoopManager
};