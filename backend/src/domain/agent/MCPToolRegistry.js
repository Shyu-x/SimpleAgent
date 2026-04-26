/**
 * MCP 工具自动发现注册表
 * 支持动态扫描和注册工具，实现工具的自动发现机制
 *
 * 功能：
 * 1. 自动扫描 tools/ 目录下的所有工具
 * 2. 读取工具元信息（名称、描述、参数模式）
 * 3. 自动注册到注册表
 * 4. 支持 MCP 服务器工具的动态发现
 *
 * @author AI Chat 玩具团队
 * @date 2026-04-01
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

// 工具目录路径
const TOOLS_DIR = path.join(__dirname, '../../services/tools');

/**
 * 工具元信息
 * @typedef {Object} ToolMetadata
 * @property {string} name - 工具名称
 * @property {string} description - 工具描述
 * @property {Object} parameters - 参数模式 (JSON Schema)
 * @property {string} category - 工具分类
 * @property {string[]} keywords - 关键词
 * @property {string} filePath - 工具文件路径
 * @property {string} source - 来源 (local/mcp)
 */

/**
 * MCP 工具注册表
 * 自动发现和管理工具注册
 */
class MCPToolRegistry {
  constructor(options = {}) {
    /** @type {Map<string, ToolMetadata>} 工具映射 */
    this.tools = new Map();
    /** @type {boolean} 是否已完成扫描 */
    this.discovered = false;
    /** @type {number} 扫描时间戳 */
    this.discoveryTime = null;
    /** @type {Object} 配置选项 */
    this.options = {
      toolsDir: options.toolsDir || TOOLS_DIR,
      autoDiscovery: options.autoDiscovery !== false,
      cacheDiscovery: options.cacheDiscovery !== false,
      ...options
    };
    /** @type {Map<string, any>} MCP 服务器连接 */
    this.mcpConnections = new Map();
    /** @type {Function|null} LLM 提取器 */
    this.parameterExtractor = null;
  }

  /**
   * 设置参数提取器
   * @param {Function} extractor - 参数提取函数
   */
  setParameterExtractor(extractor) {
    this.parameterExtractor = extractor;
  }

  /**
   * 注册 MCP 服务器
   * @param {Object} mcpConfig - MCP 服务器配置
   */
  registerMCPServer(mcpConfig) {
    this.mcpConnections.set(mcpConfig.name, {
      config: mcpConfig,
      tools: [],
      lastSync: null
    });
  }

  /**
   * 自动扫描并注册工具
   * @returns {Promise<ToolMetadata[]>} 发现的所有工具
   */
  async discoverTools() {
    if (this.discovered && this.options.cacheDiscovery) {
      return Array.from(this.tools.values());
    }

    const discoveredTools = [];

    try {
      // 1. 扫描本地工具目录
      const localTools = await this._scanLocalTools();
      discoveredTools.push(...localTools);

      // 2. 从 MCP 服务器发现工具
      const mcpTools = await this._discoverMCPTools();
      discoveredTools.push(...mcpTools);

      // 3. 注册所有发现工具
      for (const tool of discoveredTools) {
        this.tools.set(tool.name, tool);
      }

      this.discovered = true;
      this.discoveryTime = Date.now();

      console.log(`[MCPToolRegistry] 发现 ${discoveredTools.length} 个工具 (本地: ${localTools.length}, MCP: ${mcpTools.length})`);

      return discoveredTools;

    } catch (error) {
      console.error('[MCPToolRegistry] 工具扫描失败:', error.message);
      throw error;
    }
  }

  /**
   * 扫描本地工具目录
   * @private
   * @returns {Promise<ToolMetadata[]>}
   */
  async _scanLocalTools() {
    const tools = [];

    try {
      // 查找所有 .js 文件，排除 index.js 和 toolRegistry.js
      const files = await glob('*.js', {
        cwd: this.options.toolsDir,
        ignore: ['index.js', 'toolRegistry.js', '**/*.test.js']
      });

      for (const file of files) {
        try {
          const toolPath = path.join(this.options.toolsDir, file);
          const metadata = await this._extractToolMetadata(toolPath);
          if (metadata) {
            tools.push(metadata);
          }
        } catch (err) {
          console.warn(`[MCPToolRegistry] 加载工具失败 ${file}:`, err.message);
        }
      }

    } catch (error) {
      console.error('[MCPToolRegistry] 扫描本地工具失败:', error.message);
    }

    return tools;
  }

  /**
   * 从工具文件提取元信息
   * @private
   * @param {string} toolPath - 工具文件路径
   * @returns {Promise<ToolMetadata|null>}
   */
  async _extractToolMetadata(toolPath) {
    try {
      // 动态导入工具类
      const ToolClass = require(toolPath);
      const instance = new ToolClass();

      // 提取元信息
      const metadata = {
        name: instance.name || path.basename(toolPath, '.js'),
        description: instance.description || '',
        parameters: instance.parameters || { type: 'object', properties: {} },
        category: instance.category || 'general',
        keywords: instance.keywords || [],
        examples: instance.examples || [],
        filePath: toolPath,
        source: 'local'
      };

      // 如果工具没有名称，从文件名推断
      if (!metadata.name || metadata.name === 'Tool') {
        const fileName = path.basename(toolPath, '.js');
        // 转换驼峰命名到下划线
        metadata.name = fileName.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
      }

      return metadata;

    } catch (error) {
      console.warn(`[MCPToolRegistry] 提取工具元信息失败 ${toolPath}:`, error.message);
      return null;
    }
  }

  /**
   * 从 MCP 服务器发现工具
   * @private
   * @returns {Promise<ToolMetadata[]>}
   */
  async _discoverMCPTools() {
    const tools = [];

    for (const [serverName, server] of this.mcpConnections) {
      try {
        // 模拟 MCP 工具发现（实际需要 MCP 协议通信）
        // 这里假设 MCP 服务器提供工具列表
        const mcpTools = await this._listMCPServerTools(server.config);
        for (const tool of mcpTools) {
          tools.push({
            ...tool,
            source: 'mcp',
            mcpServer: serverName
          });
        }
        server.tools = mcpTools;
        server.lastSync = Date.now();
      } catch (error) {
        console.warn(`[MCPToolRegistry] MCP 服务器 ${serverName} 工具发现失败:`, error.message);
      }
    }

    return tools;
  }

  /**
   * 列出 MCP 服务器工具
   * @private
   * @param {Object} mcpConfig - MCP 配置
   * @returns {Promise<ToolMetadata[]>}
   */
  async _listMCPServerTools(mcpConfig) {
    // 实现与 MCP 服务器的通信
    // 这里返回空数组，实际需要通过 HTTP/WebSocket 与 MCP 服务器通信
    // 参考 MCPToolExecutor.js 的实现
    return [];
  }

  /**
   * 动态注册新工具
   * @param {ToolMetadata|Object} tool - 工具元信息
   */
  registerTool(tool) {
    if (!tool.name) {
      throw new Error('工具必须具有名称');
    }

    const metadata = {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.parameters || { type: 'object', properties: {} },
      category: tool.category || 'general',
      keywords: tool.keywords || [],
      examples: tool.examples || [],
      filePath: tool.filePath || null,
      source: tool.source || 'dynamic'
    };

    this.tools.set(metadata.name, metadata);
    return metadata;
  }

  /**
   * 批量注册工具
   * @param {ToolMetadata[]} tools - 工具列表
   */
  registerTools(tools) {
    return tools.map(tool => this.registerTool(tool));
  }

  /**
   * 获取工具
   * @param {string} name - 工具名称
   * @returns {ToolMetadata|undefined}
   */
  get(name) {
    return this.tools.get(name);
  }

  /**
   * 检查工具是否存在
   * @param {string} name - 工具名称
   * @returns {boolean}
   */
  has(name) {
    return this.tools.has(name);
  }

  /**
   * 移除工具
   * @param {string} name - 工具名称
   * @returns {boolean}
   */
  unregister(name) {
    return this.tools.delete(name);
  }

  /**
   * 列出所有工具
   * @param {Object} filter - 过滤条件
   * @returns {ToolMetadata[]}
   */
  listTools(filter = {}) {
    let tools = Array.from(this.tools.values());

    if (filter.source) {
      tools = tools.filter(t => t.source === filter.source);
    }
    if (filter.category) {
      tools = tools.filter(t => t.category === filter.category);
    }
    if (filter.keyword) {
      const kw = filter.keyword.toLowerCase();
      tools = tools.filter(t =>
        t.keywords.some(k => k.toLowerCase().includes(kw)) ||
        t.name.toLowerCase().includes(kw)
      );
    }

    return tools;
  }

  /**
   * 按来源分组列出工具
   * @returns {Object} 按来源分组的工具
   */
  listToolsBySource() {
    const result = {
      local: [],
      mcp: [],
      dynamic: []
    };

    for (const tool of this.tools.values()) {
      if (result[tool.source]) {
        result[tool.source].push(tool);
      } else {
        result.dynamic.push(tool);
      }
    }

    return result;
  }

  /**
   * 获取工具的参数模式
   * @param {string} name - 工具名称
   * @returns {Object|undefined}
   */
  getParameters(name) {
    const tool = this.tools.get(name);
    return tool?.parameters;
  }

  /**
   * 搜索工具（基于关键词）
   * @param {string} query - 查询词
   * @param {number} limit - 返回数量
   * @returns {ToolMetadata[]}
   */
  searchTools(query, limit = 10) {
    const q = query.toLowerCase();
    const results = [];

    for (const tool of this.tools.values()) {
      let score = 0;

      // 名称匹配
      if (tool.name.toLowerCase().includes(q)) {
        score += 10;
      }

      // 描述匹配
      if (tool.description.toLowerCase().includes(q)) {
        score += 5;
      }

      // 关键词匹配
      for (const kw of tool.keywords) {
        if (kw.toLowerCase().includes(q)) {
          score += 3;
          break;
        }
      }

      if (score > 0) {
        results.push({ ...tool, score });
      }
    }

    // 按分数排序
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }

  /**
   * 获取工具使用建议
   * @param {string} query - 用户查询
   * @returns {Object[]} 建议的工具列表
   */
  suggestTools(query) {
    const q = query.toLowerCase();
    const suggestions = [];

    // 基于关键词的意图映射
    const intentMap = {
      '搜索': ['web_search', 'enhanced_search'],
      '查询': ['web_search', 'calculator'],
      '计算': ['calculator'],
      '编程': ['code_execution'],
      '代码': ['code_execution'],
      '文件': ['file_system'],
      '读取': ['file_system'],
      '天气': ['weather'],
      '翻译': ['translation'],
      '图片': ['image_generation'],
      '生成': ['image_generation'],
      '二维码': ['qr_code'],
      '货币': ['currency_converter'],
      '时区': ['timezone_converter'],
      '摘要': ['text_summary'],
      'GitHub': ['github'],
      '网页': ['web_scraper'],
      '错误': ['error_tracking']
    };

    // 查找匹配的意图
    for (const [intent, toolNames] of Object.entries(intentMap)) {
      if (q.includes(intent)) {
        for (const name of toolNames) {
          const tool = this.tools.get(name);
          if (tool && !suggestions.find(s => s.name === name)) {
            suggestions.push({
              name: tool.name,
              description: tool.description,
              reason: `关键词 "${intent}" 匹配`,
              confidence: 0.8
            });
          }
        }
      }
    }

    // 补充模糊搜索结果
    const searchResults = this.searchTools(query, 5);
    for (const result of searchResults) {
      if (!suggestions.find(s => s.name === result.name)) {
        suggestions.push({
          name: result.name,
          description: result.description,
          reason: '语义相似',
          confidence: result.score / 10
        });
      }
    }

    return suggestions;
  }

  /**
   * 重新扫描工具目录
   * @returns {Promise<ToolMetadata[]>}
   */
  async rescan() {
    this.discovered = false;
    this.tools.clear();
    return this.discoverTools();
  }

  /**
   * 获取扫描统计
   * @returns {Object}
   */
  getStats() {
    const tools = Array.from(this.tools.values());
    const bySource = {};
    const byCategory = {};

    for (const tool of tools) {
      bySource[tool.source] = (bySource[tool.source] || 0) + 1;
      byCategory[tool.category] = (byCategory[tool.category] || 0) + 1;
    }

    return {
      total: tools.length,
      discovered: this.discovered,
      discoveryTime: this.discoveryTime,
      bySource,
      byCategory
    };
  }

  /**
   * 导出所有工具为标准格式
   * @returns {Object[]}
   */
  exportTools() {
    return this.listTools().map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      category: tool.category,
      keywords: tool.keywords
    }));
  }

  /**
   * 从 MCP 服务器刷新工具列表
   * @param {string} serverName - 服务器名称
   * @returns {Promise<ToolMetadata[]>}
   */
  async refreshMCPServer(serverName) {
    const server = this.mcpConnections.get(serverName);
    if (!server) {
      throw new Error(`MCP 服务器未注册: ${serverName}`);
    }

    const tools = await this._listMCPServerTools(server.config);

    // 更新本地缓存
    for (const tool of tools) {
      const metadata = {
        ...tool,
        source: 'mcp',
        mcpServer: serverName
      };
      this.tools.set(tool.name, metadata);
    }

    // 移除不再存在的工具
    for (const [name, tool] of this.tools) {
      if (tool.mcpServer === serverName && !tools.find(t => t.name === name)) {
        this.tools.delete(name);
      }
    }

    server.tools = tools;
    server.lastSync = Date.now();

    return tools;
  }
}

/**
 * 创建 MCP 工具注册表实例
 * @param {Object} options - 配置选项
 * @returns {MCPToolRegistry}
 */
function createMCPToolRegistry(options = {}) {
  return new MCPToolRegistry(options);
}

module.exports = {
  MCPToolRegistry,
  createMCPToolRegistry
};
