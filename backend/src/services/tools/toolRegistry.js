/**
 * 工具注册中心
 * 管理所有可用工具的注册和调用
 * 支持关键词匹配 + LLM语义匹配
 * 参考 ragent 的 MCP 工具集成设计
 *
 * @author AI Chat 玩具团队
 * @date 2026-04-01 (添加超时控制和参数验证)
 */

const createLogger = require('../../common/logger');
const logger = createLogger('ToolRegistry');
const DEFAULT_TIMEOUT = 30000; // 30秒
const TOOL_TIMEOUTS = {
  web_search: 15000,
  http_request: 10000,
  code_execution: 30000,
  file_operations: 5000,
  calculator: 1000,
  default: DEFAULT_TIMEOUT
};

// 工具执行错误
class ToolExecutionError extends Error {
  constructor(message, toolName, originalError = null) {
    super(message);
    this.name = 'ToolExecutionError';
    this.toolName = toolName;
    this.originalError = originalError;
    this.timestamp = Date.now();
  }
}

// 工具超时错误
class ToolTimeoutError extends ToolExecutionError {
  constructor(toolName, timeout) {
    super(`Tool "${toolName}" execution timeout after ${timeout}ms`, toolName);
    this.name = 'ToolTimeoutError';
    this.timeout = timeout;
  }
}

// 工具参数验证错误
class ToolValidationError extends ToolExecutionError {
  constructor(message, toolName, validationErrors = []) {
    super(message, toolName);
    this.name = 'ToolValidationError';
    this.validationErrors = validationErrors;
  }
}

class ToolRegistry {
  constructor(options = {}) {
    this.tools = new Map();
    // 工具意图映射 - 用于智能推荐
    this.intentToolMapping = new Map();
    // LLM语义匹配器
    this.llmClassifier = null;
    // 语义匹配阈值
    this.semanticThreshold = options.semanticThreshold || 0.6;
    // 全局默认超时
    this.defaultTimeout = options.defaultTimeout || DEFAULT_TIMEOUT;
    // 工具超时配置
    this.toolTimeouts = new Map(Object.entries(TOOL_TIMEOUTS));
    // 工具执行统计
    this.executionStats = new Map();
    this._initIntentMapping();
  }

  /**
   * 设置LLM分类器
   */
  setLLMClassifier(classifier) {
    this.llmClassifier = classifier;
    return this;
  }

  /**
   * 初始化意图-工具映射
   */
  _initIntentMapping() {
    // 基于 ragent 设计的意图定向检索
    this.intentToolMapping = {
      // 搜索相关意图 -> 网页搜索工具
      'search': ['web_search', 'http_request'],
      'find': ['web_search', 'http_request'],
      '查询': ['web_search', 'http_request'],
      '搜索': ['web_search'],

      // 代码相关意图 -> 代码执行工具
      'code': ['code_execution'],
      '编程': ['code_execution'],
      '运行': ['code_execution'],
      '执行': ['code_execution'],

      // 计算相关意图 -> 计算器工具
      'calculate': ['calculator'],
      '计算': ['calculator'],
      '等于': ['calculator'],
      '加': ['calculator'],
      '减': ['calculator'],
      '乘': ['calculator'],
      '除': ['calculator'],

      // 文件相关意图 -> 文件系统工具
      'file': ['file_operations'],
      '文件': ['file_operations'],
      '读取': ['file_operations'],
      '写入': ['file_operations'],

      // 数据处理意图 -> 数据处理工具
      'data': ['data_processing'],
      '分析': ['data_processing'],
      '处理': ['data_processing'],

      // 日期时间意图 -> 日期时间工具
      'datetime': ['datetime'],
      '时间': ['datetime'],
      '日期': ['datetime'],

      // 天气相关意图 -> Web搜索
      'weather': ['web_search'],
      '天气': ['web_search'],
    };
  }

  /**
   * 注册工具
   */
  register(tool) {
    if (!tool.name || !tool.execute) {
      throw AppError.validationError('name and execute', 'Tool must have name and execute function');
    }

    this.tools.set(tool.name, {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.parameters || {},
      execute: tool.execute.bind(tool),
      category: tool.category || 'general',
      // 扩展属性
      keywords: tool.keywords || [],
      examples: tool.examples || []
    });

    return this;
  }

  /**
   * 批量注册工具
   */
  registerMany(tools) {
    tools.forEach(tool => this.register(tool));
    return this;
  }

  /**
   * 获取工具
   */
  get(name) {
    return this.tools.get(name);
  }

  /**
   * 列出所有工具
   */
  listTools() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      category: tool.category,
      keywords: tool.keywords,
      examples: tool.examples
    }));
  }

  /**
   * 获取分类工具
   */
  getByCategory(category) {
    return Array.from(this.tools.values())
      .filter(tool => tool.category === category);
  }

  /**
   * 检查工具是否存在
   */
  has(name) {
    return this.tools.has(name);
  }

  /**
   * 移除工具
   */
  unregister(name) {
    return this.tools.delete(name);
  }

  /**
   * 清除所有工具
   */
  clear() {
    this.tools.clear();
  }

  /**
   * 智能工具推荐 - 参考 ragent 的意图定向检索
   * @param {Object} context - 上下文信息
   * @returns {Array} 推荐的工具列表
   */
  recommendTools(context) {
    const { query, intent, messages } = context;
    const recommendations = [];

    if (!query && !intent) {
      return recommendations;
    }

    const queryLower = (query || '').toLowerCase();

    // 1. 基于查询关键词推荐工具
    for (const [keyword, toolNames] of Object.entries(this.intentToolMapping)) {
      if (queryLower.includes(keyword)) {
        for (const toolName of toolNames) {
          const tool = this.tools.get(toolName);
          if (tool && !recommendations.find(t => t.name === toolName)) {
            recommendations.push({
              name: tool.name,
              description: tool.description,
              reason: `关键词 "${keyword}" 匹配`,
              confidence: 0.8
            });
          }
        }
      }
    }

    // 2. 基于意图类型推荐
    if (intent) {
      const intentToolMap = {
        'tool_use': ['web_search', 'calculator', 'code_execution'],
        'knowledge': ['web_search', 'http_request'],
        'creative': [],
        'task': ['web_search', 'data_processing'],
        'conversation': []
      };

      const intentTools = intentToolMap[intent.type] || [];
      for (const toolName of intentTools) {
        const tool = this.tools.get(toolName);
        if (tool && !recommendations.find(t => t.name === toolName)) {
          recommendations.push({
            name: tool.name,
            description: tool.description,
            reason: `意图 "${intent.name}" 匹配`,
            confidence: 0.7
          });
        }
      }
    }

    return recommendations;
  }

  /**
   * 自动选择最佳工具
   * @param {Object} context - 上下文信息
   * @returns {Object|null} 最佳工具或null
   */
  selectBestTool(context) {
    const recommendations = this.recommendTools(context);

    if (recommendations.length === 0) {
      return null;
    }

    // 按置信度排序
    recommendations.sort((a, b) => b.confidence - a.confidence);

    return recommendations[0];
  }

  /**
   * 获取工具超时时间
   */
  _getToolTimeout(toolName) {
    // 优先使用工具特定配置
    if (this.toolTimeouts.has(toolName)) {
      return this.toolTimeouts.get(toolName);
    }
    // 使用分类默认值
    const tool = this.tools.get(toolName);
    if (tool && this.toolTimeouts.has(tool.category)) {
      return this.toolTimeouts.get(tool.category);
    }
    // 使用全局默认值
    return this.defaultTimeout;
  }

  /**
   * 带超时的执行包装
   */
  async _executeWithTimeout(fn, timeout, toolName) {
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ToolTimeoutError(toolName, timeout));
      }, timeout);

      try {
        const result = await fn();
        clearTimeout(timer);
        resolve(result);
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  /**
   * 验证工具参数
   */
  _validateParameters(tool, params) {
    const errors = [];
    const { parameters } = tool;

    if (!parameters || !parameters.properties) {
      return { valid: true, errors: [] };
    }

    const required = parameters.required || [];
    const properties = parameters.properties;

    // 检查必需参数
    for (const field of required) {
      if (params[field] === undefined || params[field] === null) {
        errors.push({
          field,
          message: `Missing required parameter: ${field}`
        });
      }
    }

    // 检查参数类型
    for (const [key, value] of Object.entries(params)) {
      if (properties[key]) {
        const expectedType = properties[key].type;
        const actualType = typeof value;

        // 类型检查（排除null和undefined）
        if (value !== null && value !== undefined) {
          if (expectedType === 'number' && actualType !== 'number') {
            errors.push({
              field: key,
              message: `Parameter "${key}" should be number, got ${actualType}`
            });
          } else if (expectedType === 'string' && actualType !== 'string') {
            errors.push({
              field: key,
              message: `Parameter "${key}" should be string, got ${actualType}`
            });
          } else if (expectedType === 'boolean' && actualType !== 'boolean') {
            errors.push({
              field: key,
              message: `Parameter "${key}" should be boolean, got ${actualType}`
            });
          } else if (expectedType === 'array' && !Array.isArray(value)) {
            errors.push({
              field: key,
              message: `Parameter "${key}" should be array, got ${actualType}`
            });
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 更新工具超时配置
   */
  setToolTimeout(toolNameOrCategory, timeout) {
    this.toolTimeouts.set(toolNameOrCategory, timeout);
  }

  /**
   * 设置全局默认超时
   */
  setDefaultTimeout(timeout) {
    this.defaultTimeout = timeout;
    this.toolTimeouts.set('default', timeout);
  }

  /**
   * 执行工具（带参数提取和超时控制）
   * @param {string} toolName - 工具名称
   * @param {Object} params - 参数
   * @param {Object} options - 执行选项
   * @param {number} options.timeout - 超时时间（毫秒）
   * @param {boolean} options.skipValidation - 跳过参数验证
   * @returns {Promise} 执行结果
   */
  async executeTool(toolName, params = {}, options = {}) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        success: false,
        tool: toolName,
        error: `Tool not found: ${toolName}`
      };
    }

    // 参数验证
    if (options.skipValidation !== true) {
      const validation = this._validateParameters(tool, params);
      if (!validation.valid) {
        return {
          success: false,
          tool: toolName,
          error: 'Parameter validation failed',
          validationErrors: validation.errors
        };
      }
    }

    // 获取超时时间
    const timeout = options.timeout || this._getToolTimeout(toolName);

    // 记录执行统计
    this._recordExecutionStart(toolName);

    try {
      // 带超时的执行
      const result = await this._executeWithTimeout(
        () => tool.execute(params),
        timeout,
        toolName
      );

      // 记录成功
      this._recordExecutionEnd(toolName, true);

      return {
        success: true,
        tool: toolName,
        result,
        executionTime: Date.now() - (this.executionStats.get(toolName)?.lastStartTime || Date.now())
      };
    } catch (error) {
      // 记录失败
      this._recordExecutionEnd(toolName, false, error.message);

      // 分类错误类型
      let errorType = 'unknown';
      if (error instanceof ToolTimeoutError) {
        errorType = 'timeout';
      } else if (error instanceof ToolValidationError) {
        errorType = 'validation';
      }

      return {
        success: false,
        tool: toolName,
        error: error.message,
        errorType,
        ...(error instanceof ToolTimeoutError && { timeout: error.timeout })
      };
    }
  }

  /**
   * 并行执行多个工具（结果合并）
   */
  async executeTools(toolCalls) {
    const results = await Promise.allSettled(
      toolCalls.map(({ name, params, options }) =>
        this.executeTool(name, params, options)
      )
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          tool: toolCalls[index].name,
          error: result.reason?.message || 'Unknown error'
        };
      }
    });
  }

  /**
   * 记录执行开始
   */
  _recordExecutionStart(toolName) {
    if (!this.executionStats.has(toolName)) {
      this.executionStats.set(toolName, {
        totalCalls: 0,
        successCalls: 0,
        failureCalls: 0,
        totalTime: 0,
        lastStartTime: null,
        lastError: null
      });
    }
    const stats = this.executionStats.get(toolName);
    stats.totalCalls++;
    stats.lastStartTime = Date.now();
  }

  /**
   * 记录执行结束
   */
  _recordExecutionEnd(toolName, success, errorMessage = null) {
    const stats = this.executionStats.get(toolName);
    if (stats && stats.lastStartTime) {
      const duration = Date.now() - stats.lastStartTime;
      stats.totalTime += duration;
      if (success) {
        stats.successCalls++;
      } else {
        stats.failureCalls++;
        stats.lastError = errorMessage;
      }
    }
  }

  /**
   * 获取工具执行统计
   */
  getToolStats(toolName) {
    const stats = this.executionStats.get(toolName);
    if (!stats) return null;

    return {
      toolName,
      totalCalls: stats.totalCalls,
      successCalls: stats.successCalls,
      failureCalls: stats.failureCalls,
      successRate: stats.totalCalls > 0
        ? ((stats.successCalls / stats.totalCalls) * 100).toFixed(2) + '%'
        : 'N/A',
      avgExecutionTime: stats.totalCalls > 0
        ? (stats.totalTime / stats.totalCalls).toFixed(2) + 'ms'
        : 'N/A',
      lastError: stats.lastError
    };
  }

  /**
   * 获取所有工具统计
   */
  getAllStats() {
    const stats = {};
    for (const toolName of this.tools.keys()) {
      stats[toolName] = this.getToolStats(toolName);
    }
    return stats;
  }

  // ==================== 原有方法保持兼容 ====================

  /**
   * 智能选择工具（支持LLM语义匹配）
   * @param {Object} context - 上下文信息
   * @returns {Promise<Object>} 最佳工具或null
   */
  async selectBestToolSmart(context) {
    const { query, intent, messages } = context;

    // 如果有LLM分类器，使用语义匹配
    if (this.llmClassifier && query) {
      try {
        const availableTools = this.listTools();
        const result = await this.llmClassifier.selectTool(query, availableTools, context);

        if (result.selectedTool && result.confidence >= this.semanticThreshold) {
          return {
            name: result.selectedTool,
            description: this.get(result.selectedTool)?.description || '',
            parameters: result.parameters,
            confidence: result.confidence,
            reasoning: result.reasoning,
            source: 'llm'
          };
        }

        // LLM置信度不够，结合关键词
        if (result.confidence < this.semanticThreshold) {
          const keywordResult = this.selectBestTool(context);
          if (keywordResult && keywordResult.confidence > result.confidence) {
            return { ...keywordResult, source: 'keyword' };
          }
        }

        // 返回LLM结果（即使置信度不够）
        if (result.selectedTool) {
          return {
            name: result.selectedTool,
            description: this.get(result.selectedTool)?.description || '',
            parameters: result.parameters,
            confidence: result.confidence,
            reasoning: result.reasoning,
            source: 'llm'
          };
        }
      } catch (error) {
        logger.warn(`LLM tool selection failed: ${error.message}`);
      }
    }

    // 回退到关键词匹配
    const keywordResult = this.selectBestTool(context);
    return keywordResult ? { ...keywordResult, source: 'keyword' } : null;
  }

  /**
   * 语义搜索工具
   * @param {string} query - 查询
   * @param {number} limit - 返回数量
   * @returns {Promise<Array>} 匹配的工具列表
   */
  async semanticSearchTools(query, limit = 5) {
    // 如果有LLM，使用语义匹配
    if (this.llmClassifier) {
      try {
        const availableTools = this.listTools();
        const result = await this.llmClassifier.selectTool(query, availableTools, {});

        if (result.selectedTool) {
          const tool = this.get(result.selectedTool);
          return [{
            name: tool.name,
            description: tool.description,
            confidence: result.confidence,
            parameters: result.parameters,
            reasoning: result.reasoning
          }];
        }
      } catch (error) {
        logger.warn(`Semantic search failed: ${error.message}`);
      }
    }

    // 回退到关键词搜索
    return this.recommendTools({ query }).slice(0, limit);
  }

  /**
   * 批量选择工具（多候选）
   * @param {Object} context - 上下文
   * @param {number} maxTools - 最大工具数
   * @returns {Array} 工具列表
   */
  selectMultipleTools(context, maxTools = 3) {
    const recommendations = this.recommendTools(context);

    // 合并相似工具
    const merged = [];
    const seen = new Set();

    for (const rec of recommendations) {
      if (!seen.has(rec.name)) {
        merged.push(rec);
        seen.add(rec.name);
      }
    }

    // 按置信度排序
    merged.sort((a, b) => b.confidence - a.confidence);

    return merged.slice(0, maxTools);
  }

  /**
   * 获取工具使用统计
   */
  getStats() {
    const stats = {
      total: this.tools.size,
      byCategory: {}
    };

    for (const tool of this.tools.values()) {
      if (!stats.byCategory[tool.category]) {
        stats.byCategory[tool.category] = 0;
      }
      stats.byCategory[tool.category]++;
    }

    return stats;
  }
}

module.exports = ToolRegistry;
