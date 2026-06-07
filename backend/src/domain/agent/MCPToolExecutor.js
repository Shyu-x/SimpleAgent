/**
 * MCP协议工具执行器
 * 支持MCP协议标准的工具发现、调用和管理
 *
 * MCP (Model Context Protocol) 标准：
 * 1. 工具列表获取 (tools/list)
 * 2. 工具调用 (tools/call)
 * 3. 资源访问 (resources/*)
 * 4. 提示词模板 (prompts/*)
 *
 * @author AI Chat 玩具团队
 * @date 2026-04-01
 */

const { AppError } = require('../../common/errors');
const { withTimeout } = require('../../utils/retry');
const createLogger = require('../../../common/logger');
const { classifyRetryableError } = require('../../common/errors/errorClassifier');
const logger = createLogger('MCPToolExecutor');

/**
 * MCP工具调用结构
 * @typedef {Object} MCPToolCall
 * @property {string} name - 工具名称
 * @property {Object} arguments - 工具参数
 */

/**
 * MCP配置
 * @typedef {Object} MCPConfig
 * @property {string} name - MCP服务器名称
 * @property {string} url - MCP服务器URL
 * @property {string} apiKey - API密钥
 * @property {number} timeout - 超时时间(ms)
 * @property {Object} headers - 自定义请求头
 */

/**
 * MCP工具定义
 * @typedef {Object} MCPTool
 * @property {string} name - 工具名称
 * @property {string} description - 工具描述
 * @property {Object} inputSchema - 输入参数schema
 */

/**
 * MCP协议执行器
 * 处理与MCP服务器的通信和工具执行
 */
class MCPToolExecutor {
  constructor(options = {}) {
    this.name = options.name || 'MCPToolExecutor';
    this.timeout = options.timeout || 30000;
    // MCP服务器连接映射
    this.connections = new Map();
    // MCP工具缓存
    this.toolCache = new Map();
    // 缓存过期时间
    this.cacheTTL = options.cacheTTL || 5 * 60 * 1000; // 5分钟
  }

  /**
   * 执行MCP工具调用
   * @param {MCPToolCall} toolCall - MCP工具调用
   * @param {MCPConfig} mcpConfig - MCP配置
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 执行结果
   */
  async executeMCP(toolCall, mcpConfig, context = {}) {
    const startTime = Date.now();
    const { name, arguments: args } = toolCall;

    try {
      // 获取或创建连接
      const connection = await this._getConnection(mcpConfig);

      // 构建MCP请求
      const request = {
        jsonrpc: '2.0',
        id: this._generateRequestId(),
        method: 'tools/call',
        params: {
          name,
          arguments: args || {}
        }
      };

      // 发送请求（带超时）
      const response = await withTimeout(
        this._sendRequest(connection, request),
        mcpConfig.timeout || this.timeout
      );

      // 处理响应
      if (response.error) {
        return {
          success: false,
          tool: name,
          error: response.error.message || 'MCP tool execution failed',
          errorCode: response.error.code,
          executionTime: Date.now() - startTime
        };
      }

      return {
        success: true,
        tool: name,
        result: response.result || response,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        tool: name,
        error: error.message || 'MCP tool execution failed',
        errorType: classifyRetryableError(error),
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * 列出MCP服务器上的所有工具
   * @param {MCPConfig} mcpConfig - MCP配置
   * @returns {Promise<MCPTool[]>} 工具列表
   */
  async listTools(mcpConfig) {
    try {
      // 检查缓存
      const cacheKey = this._getCacheKey(mcpConfig);
      const cached = this._getCachedTools(cacheKey);
      if (cached) {
        return cached;
      }

      // 获取或创建连接
      const connection = await this._getConnection(mcpConfig);

      // 构建MCP请求
      const request = {
        jsonrpc: '2.0',
        id: this._generateRequestId(),
        method: 'tools/list',
        params: {}
      };

      // 发送请求
      const response = await withTimeout(
        this._sendRequest(connection, request),
        mcpConfig.timeout || this.timeout
      );

      // 解析工具列表
      const tools = this._parseToolList(response, mcpConfig);

      // 缓存结果
      this._cacheTools(cacheKey, tools);

      return tools;

    } catch (error) {
      logger.error(`MCP list tools failed for ${mcpConfig.name}`, { error: error.message });
      return [];
    }
  }

  /**
   * 获取工具的schema定义
   * @param {string} toolName - 工具名称
   * @param {MCPConfig} mcpConfig - MCP配置
   * @returns {Promise<Object|null>} 工具schema
   */
  async getToolSchema(toolName, mcpConfig) {
    try {
      const tools = await this.listTools(mcpConfig);
      const tool = tools.find(t => t.name === toolName);

      if (!tool) {
        return null;
      }

      return {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema || { type: 'object', properties: {} }
      };

    } catch (error) {
      logger.error('MCP get tool schema failed', { error: error.message });
      return null;
    }
  }

  /**
   * 批量执行MCP工具
   * @param {MCPToolCall[]} toolCalls - 工具调用列表
   * @param {MCPConfig} mcpConfig - MCP配置
   * @param {Object} options - 执行选项
   * @returns {Promise<Object[]>} 结果列表
   */
  async executeBatch(toolCalls, mcpConfig, options = {}) {
    const parallel = options.parallel !== false;
    const results = [];

    if (parallel) {
      // 并行执行
      const promises = toolCalls.map(tc =>
        this.executeMCP(tc, mcpConfig, options.context)
      );
      results.push(...await Promise.allSettled(promises).then(settled =>
        settled.map((r, i) => r.status === 'fulfilled' ? r.value : {
          success: false,
          tool: toolCalls[i].name,
          error: r.reason?.message || 'Unknown error'
        })
      ));
    } else {
      // 串行执行
      for (const toolCall of toolCalls) {
        const result = await this.executeMCP(toolCall, mcpConfig, options.context);
        results.push(result);

        // 如果失败且配置停止，则中断
        if (!result.success && options.stopOnError) {
          break;
        }
      }
    }

    return results;
  }

  /**
   * 获取或创建MCP连接
   * @private
   */
  async _getConnection(mcpConfig) {
    const key = `${mcpConfig.name}:${mcpConfig.url}`;

    if (this.connections.has(key)) {
      const conn = this.connections.get(key);
      if (conn.alive) {
        return conn;
      }
    }

    // 创建新连接
    const connection = await this._establishConnection(mcpConfig);
    this.connections.set(key, {
      ...connection,
      config: mcpConfig,
      alive: true,
      createdAt: Date.now()
    });

    return this.connections.get(key);
  }

  /**
   * 建立MCP连接
   * @private
   */
  async _establishConnection(mcpConfig) {
    // 支持HTTP/WebSocket两种连接方式
    const url = mcpConfig.url;

    if (url.startsWith('ws://') || url.startsWith('wss://')) {
      // WebSocket连接
      return this._createWebSocketConnection(mcpConfig);
    } else {
      // HTTP连接（STDIO或HTTP）
      return this._createHTTPConnection(mcpConfig);
    }
  }

  /**
   * 创建HTTP连接
   * @private
   */
  async _createHTTPConnection(mcpConfig) {
    const headers = {
      'Content-Type': 'application/json',
      ...mcpConfig.headers
    };

    if (mcpConfig.apiKey) {
      headers['Authorization'] = `Bearer ${mcpConfig.apiKey}`;
    }

    return {
      type: 'http',
      url: mcpConfig.url,
      headers,
      sendRequest: async (request) => {
        const response = await fetch(mcpConfig.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(request)
        });

        if (!response.ok) {
          throw AppError.internalError(`HTTP error: ${response.status} ${response.statusText}`);
        }

        return response.json();
      }
    };
  }

  /**
   * 创建WebSocket连接
   * @private
   */
  async _createWebSocketConnection(mcpConfig) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(mcpConfig.url, {
        headers: mcpConfig.headers || {}
      });

      const pendingRequests = new Map();
      let requestId = 0;

      ws.onopen = () => {
        resolve({
          type: 'websocket',
          ws,
          sendRequest: (request) => {
            return new Promise((res, rej) => {
              const id = ++requestId;
              pendingRequests.set(id, { resolve: res, reject: rej });
              ws.send(JSON.stringify({ ...request, id }));
            });
          },
          close: () => ws.close()
        });
      };

      ws.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data);
          const pending = pendingRequests.get(response.id);
          if (pending) {
            pendingRequests.delete(response.id);
            pending.resolve(response);
          }
        } catch (e) {
          logger.error('WebSocket message parse error', { error: e.message });
        }
      };

      ws.onerror = (error) => {
        reject(new Error('WebSocket connection error'));
      };

      ws.onclose = () => {
        pendingRequests.forEach(p => p.reject(new Error('WebSocket closed')));
        pendingRequests.clear();
      };

      // 超时处理
      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          reject(new Error('WebSocket connection timeout'));
        }
      }, this.timeout);
    });
  }

  /**
   * 发送MCP请求
   * @private
   */
  async _sendRequest(connection, request) {
    if (connection.type === 'http') {
      return connection.sendRequest(request);
    } else if (connection.type === 'websocket') {
      return connection.sendRequest(request);
    }

    throw AppError.internalError('Unsupported connection type');
  }

  /**
   * 解析工具列表响应
   * @private
   */
  _parseToolList(response, mcpConfig) {
    // 支持多种响应格式
    const tools = response.result?.tools || response.tools || [];

    return tools.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema || tool.parameters || { type: 'object', properties: {} },
      annotations: tool.annotations || null,
      mcpServer: mcpConfig.name
    }));
  }

  /**
   * 获取缓存键
   * @private
   */
  _getCacheKey(mcpConfig) {
    return `${mcpConfig.name}:${mcpConfig.url}`;
  }

  /**
   * 从缓存获取工具列表
   * @private
   */
  _getCachedTools(cacheKey) {
    const cached = this.toolCache.get(cacheKey);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.toolCache.delete(cacheKey);
      return null;
    }

    return cached.tools;
  }

  /**
   * 缓存工具列表
   * @private
   */
  _cacheTools(cacheKey, tools) {
    this.toolCache.set(cacheKey, {
      tools,
      timestamp: Date.now()
    });
  }

  /**
   * 生成请求ID
   * @private
   */
  _generateRequestId() {
    return `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 关闭所有连接
   */
  async close() {
    for (const [key, conn] of this.connections) {
      try {
        if (conn.ws) {
          conn.ws.close();
        }
        if (conn.close) {
          conn.close();
        }
      } catch (e) {
        logger.warn(`Failed to close connection ${key}`, { error: e.message });
      }
    }
    this.connections.clear();
    this.toolCache.clear();
  }

  /**
   * 移除指定MCP连接
   * @param {string} name - MCP服务器名称
   * @param {string} url - MCP服务器URL
   */
  removeConnection(name, url) {
    const key = `${name}:${url}`;
    const conn = this.connections.get(key);
    if (conn) {
      if (conn.ws) conn.ws.close();
      if (conn.close) conn.close();
      this.connections.delete(key);
      this.toolCache.delete(key);
    }
  }
}

/**
 * 创建MCP执行器实例
 * @param {Object} options - 配置选项
 * @returns {MCPToolExecutor}
 */
function createMCPToolExecutor(options = {}) {
  return new MCPToolExecutor(options);
}

module.exports = {
  MCPToolExecutor,
  createMCPToolExecutor
};
