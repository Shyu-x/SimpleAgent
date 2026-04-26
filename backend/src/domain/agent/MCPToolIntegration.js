/**
 * MCP 工具集成模块
 * 整合工具发现、参数提取和执行流程
 *
 * @author AI Chat 玩具团队
 * @date 2026-04-01
 */

const { MCPToolRegistry, createMCPToolRegistry } = require('./MCPToolRegistry');
const { MCPParameterExtractor, createParameterExtractor } = require('./MCPParameterExtractor');
const { ToolExecutor, ToolErrorType } = require('./ToolExecutor');

/**
 * MCP 工具集成器
 * 整合工具注册、参数提取和执行
 */
class MCPToolIntegration {
  constructor(options = {}) {
    // 1. 创建或注入注册表
    this.registry = options.registry || createMCPToolRegistry({
      autoDiscovery: options.autoDiscovery !== false
    });

    // 2. 创建参数提取器
    this.extractor = options.extractor || createParameterExtractor({
      useLLM: options.useLLM !== false,
      confidenceThreshold: options.confidenceThreshold || 0.6
    });

    // 3. 创建工具执行器
    this.executor = options.executor || new ToolExecutor({
      registry: this.registry,
      defaultTimeout: options.defaultTimeout || 30000
    });

    // 4. 配置选项
    this.options = {
      autoDiscover: options.autoDiscover !== false,
      autoExtractParams: options.autoExtractParams !== false,
      allowManualOverride: options.allowManualOverride !== false,
      ...options
    };

    // 5. 初始化
    this._initialized = false;
  }

  /**
   * 初始化
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._initialized) return;

    // 自动发现工具
    if (this.options.autoDiscover) {
      await this.registry.discoverTools();
    }

    // 设置参数提取器的 LLM 回调（如果有）
    if (this.options.llmExtractor) {
      this.extractor.setLLMExtractor(this.options.llmExtractor);
    }

    this._initialized = true;
    console.log(`[MCPToolIntegration] 初始化完成，已发现 ${this.registry.tools.size} 个工具`);
  }

  /**
   * 执行工具（带自动参数提取）
   * @param {Object} toolCall - 工具调用
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 执行结果
   */
  async execute(toolCall, context = {}) {
    const startTime = Date.now();

    try {
      // 1. 获取工具元信息
      const toolMeta = this.registry.get(toolCall.name);
      if (!toolMeta) {
        return this._buildErrorResult(toolCall, '工具不存在', ToolErrorType.NOT_FOUND, startTime);
      }

      // 2. 自动参数提取（如果启用且没有提供完整参数）
      let parameters = toolCall.parameters || {};

      if (this.options.autoExtractParams && context.query) {
        const extractionResult = this.extractor.extract(toolMeta, context.query, parameters);

        if (extractionResult.success || extractionResult.confidence > 0.3) {
          // 合并提取的参数
          parameters = { ...parameters, ...extractionResult.parameters };

          // 记录参数来源
          context._paramExtraction = {
            confidence: extractionResult.confidence,
            reasoning: extractionResult.reasoning,
            missing: extractionResult.missing
          };
        }

        // 检查必需参数
        if (extractionResult.missing && extractionResult.missing.length > 0) {
          const missingNames = extractionResult.missing.map(m => m.name).join(', ');
          console.warn(`[MCPToolIntegration] 参数缺失: ${missingNames}`);
        }
      }

      // 3. 验证参数
      const validation = this.extractor.validate(toolMeta, parameters);
      if (!validation.valid) {
        return {
          success: false,
          tool: toolCall.name,
          callId: toolCall.id,
          error: '参数验证失败',
          errorType: ToolErrorType.VALIDATION,
          validationErrors: validation.errors,
          executionTime: Date.now() - startTime
        };
      }

      // 4. 类型转换
      parameters = this.extractor.coerceTypes(parameters, toolMeta.parameters || {});

      // 5. 执行工具
      const result = await this.executor.execute({
        ...toolCall,
        parameters
      }, context);

      // 6. 添加参数提取信息到结果
      if (context._paramExtraction) {
        result.paramExtraction = context._paramExtraction;
      }

      return result;

    } catch (error) {
      return this._buildErrorResult(toolCall, error.message, ToolErrorType.EXECUTION, startTime);
    }
  }

  /**
   * 执行多个工具（带参数自动提取）
   * @param {Object[]} toolCalls - 工具调用列表
   * @param {Object} context - 执行上下文
   * @param {Object} options - 执行选项
   * @returns {Promise<Object[]>}
   */
  async executeMultiple(toolCalls, context = {}, options = {}) {
    const parallel = options.parallel !== false;

    if (parallel) {
      return Promise.all(
        toolCalls.map(tc => this.execute(tc, context))
      );
    } else {
      const results = [];
      for (const tc of toolCalls) {
        const result = await this.execute(tc, context);
        results.push(result);

        // 如果失败且配置停止
        if (!result.success && options.stopOnError) {
          break;
        }
      }
      return results;
    }
  }

  /**
   * 推荐工具
   * @param {string} query - 用户查询
   * @param {Object} options - 选项
   * @returns {Object[]}
   */
  recommendTools(query, options = {}) {
    return this.registry.suggestTools(query, options);
  }

  /**
   * 搜索工具
   * @param {string} query - 搜索查询
   * @param {number} limit - 返回数量
   * @returns {Object[]}
   */
  searchTools(query, limit = 10) {
    return this.registry.searchTools(query, limit);
  }

  /**
   * 获取工具信息
   * @param {string} name - 工具名称
   * @returns {Object|null}
   */
  getTool(name) {
    return this.registry.get(name) || null;
  }

  /**
   * 列出所有工具
   * @param {Object} filter - 过滤条件
   * @returns {Object[]}
   */
  listTools(filter = {}) {
    return this.registry.listTools(filter);
  }

  /**
   * 获取参数建议
   * @param {string} toolName - 工具名称
   * @param {string} query - 用户查询
   * @returns {Object[]}
   */
  getParamSuggestions(toolName, query) {
    const toolMeta = this.registry.get(toolName);
    if (!toolMeta) return [];

    return this.extractor.getSuggestions(toolMeta, query);
  }

  /**
   * 注册 MCP 服务器
   * @param {Object} mcpConfig - MCP 配置
   */
  registerMCPServer(mcpConfig) {
    this.registry.registerMCPServer(mcpConfig);
  }

  /**
   * 刷新 MCP 服务器工具
   * @param {string} serverName - 服务器名称
   * @returns {Promise<Object[]>}
   */
  async refreshMCPServer(serverName) {
    return this.registry.refreshMCPServer(serverName);
  }

  /**
   * 重新扫描工具
   * @returns {Promise<Object[]>}
   */
  async rescan() {
    return this.registry.rescan();
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    return {
      registry: this.registry.getStats(),
      extractor: {
        schemaCacheSize: this.extractor.schemaCache.size
      },
      executor: {
        activeCalls: this.executor.getActiveCallsCount()
      }
    };
  }

  /**
   * 构建错误结果
   * @private
   */
  _buildErrorResult(toolCall, errorMessage, errorType, startTime) {
    return {
      success: false,
      tool: toolCall.name,
      callId: toolCall.id,
      error: errorMessage,
      errorType,
      executionTime: Date.now() - startTime
    };
  }

  /**
   * 关闭集成器
   */
  async close() {
    // 清理资源
    this.extractor.clearCache();
    this.executor.cancel();
  }
}

/**
 * 创建 MCP 工具集成器实例
 * @param {Object} options - 配置选项
 * @returns {MCPToolIntegration}
 */
function createMCPToolIntegration(options = {}) {
  return new MCPToolIntegration(options);
}

module.exports = {
  MCPToolIntegration,
  createMCPToolIntegration
};
