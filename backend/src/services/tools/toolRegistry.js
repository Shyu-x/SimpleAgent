/**
 * 工具注册中心
 * 管理所有可用工具的注册和调用
 * 支持关键词匹配 + LLM语义匹配
 * 参考 ragent 的 MCP 工具集成设计
 */

class ToolRegistry {
  constructor(options = {}) {
    this.tools = new Map();
    // 工具意图映射 - 用于智能推荐
    this.intentToolMapping = new Map();
    // LLM语义匹配器
    this.llmClassifier = null;
    // 语义匹配阈值
    this.semanticThreshold = options.semanticThreshold || 0.6;
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
      throw new Error('Tool must have name and execute function');
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
   * 执行工具（带参数提取）
   * @param {string} toolName - 工具名称
   * @param {Object} params - 参数
   * @returns {Promise} 执行结果
   */
  async executeTool(toolName, params = {}) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        success: false,
        tool: toolName,
        error: `Tool not found: ${toolName}`
      };
    }

    try {
      const result = await tool.execute(params);
      return {
        success: true,
        tool: toolName,
        result
      };
    } catch (error) {
      return {
        success: false,
        tool: toolName,
        error: error.message
      };
    }
  }

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
        console.warn('LLM tool selection failed:', error.message);
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
        console.warn('Semantic search failed:', error.message);
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
