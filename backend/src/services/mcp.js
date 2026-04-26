/**
 * MCP (Model Context Protocol) 集成 v2.0
 * 完整支持 MCP 协议规范
 * - 工具管理 (tools)
 * - 资源管理 (resources)
 * - 提示词模板 (prompts)
 * - 服务端推送通知
 * - JSON-RPC 2.0 实现
 */

const EventEmitter = require('events');

/**
 * JSON-RPC 2.0 错误码
 */
const JsonRpcErrors = {
  PARSE_ERROR: { code: -32700, message: 'Parse error' },
  INVALID_REQUEST: { code: -32600, message: 'Invalid request' },
  METHOD_NOT_FOUND: { code: -32601, message: 'Method not found' },
  INVALID_PARAMS: { code: -32602, message: 'Invalid params' },
  INTERNAL_ERROR: { code: -32603, message: 'Internal error' },
  SERVER_ERROR: { code: -32603, message: 'Server error' },
  TIMEOUT: { code: -32001, message: 'Execution timeout' }
};

/**
 * MCP 协议版本
 */
const MCP_VERSION = '2024-11-05';

/**
 * 默认超时时间 (30秒)
 */
const DEFAULT_TIMEOUT_MS = 30000;

class MCPService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.name = options.name || 'MCP Service';
    this.version = options.version || '2.0.0';

    // 存储
    this.tools = new Map();
    this.resources = new Map();
    this.prompts = new Map();
    this.resourceSubscriptions = new Map();

    // 连接状态
    this.connected = false;
    this.connectionId = null;
    this.clients = new Map();

    // 通知队列
    this.notificationQueue = [];

    // 工具执行统计
    this.executionStats = {
      total: 0,
      success: 0,
      failed: 0,
      timeouts: 0
    };

    // 注册内置资源和提示词
    this.registerBuiltinResources();
    this.registerBuiltinPrompts();
  }

  /**
   * 初始化MCP服务
   */
  async initialize(options = {}) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('Initializing MCP Service...');
    }

    // 注册内置工具
    this.registerBuiltinTools();

    this.connected = true;
    this.emit('connected');

    return {
      success: true,
      version: this.version,
      capabilities: this.getCapabilities()
    };
  }

  /**
   * 获取服务器能力
   */
  getCapabilities() {
    return {
      tools: {
        listChanged: true
      },
      resources: {
        subscribe: true,
        listChanged: true
      },
      prompts: {
        listChanged: true
      }
    };
  }

  /**
   * 注册内置工具
   */
  registerBuiltinTools() {
    // 可以在这里注册默认的MCP工具
  }

  /**
   * 工具处理 - MCP协议
   */
  async handleToolsList() {
    const tools = Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema || {
        type: 'object',
        properties: {}
      }
    }));

    return {
      tools,
      nextCursor: null
    };
  }

  /**
   * 工具调用 - MCP协议
   */
  async handleToolCall(name, args = {}) {
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: `Unknown tool: ${name}`
          })
        }]
      };
    }

    try {
      const result = await tool.handler(args);

      return {
        content: [{
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: error.message
          })
        }]
      };
    }
  }

  /**
   * 注册MCP工具
   */
  registerTool(tool) {
    const mcpTool = {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema || tool.parameters || {
        type: 'object',
        properties: {}
      },
      handler: tool.handler || tool.execute
    };

    this.tools.set(tool.name, mcpTool);
    this.emit('toolRegistered', tool);

    return this;
  }

  /**
   * 执行工具
   * @param {string} toolName - 工具名称
   * @param {object} args - 工具参数
   * @param {object} context - 执行上下文（可选）
   * @returns {Promise<object>} MCP格式的执行结果
   */
  async executeTool(toolName, args = {}, context = {}) {
    const startTime = Date.now();
    this.executionStats.total++;

    // 验证工具是否存在
    const tool = this.tools.get(toolName);
    if (!tool) {
      const errorResult = this.formatToolResult(toolName, {
        success: false,
        error: { code: 'TOOL_NOT_FOUND', message: `工具 ${toolName} 不存在` }
      }, startTime);
      this.executionStats.failed++;
      return errorResult;
    }

    // 参数验证
    if (tool.inputSchema && tool.inputSchema.properties) {
      const validation = this.validateArgs(toolName, args);
      if (!validation.valid) {
        const errorResult = this.formatToolResult(toolName, {
          success: false,
          error: { code: 'INVALID_PARAMS', message: validation.errors.join('; ') }
        }, startTime);
        this.executionStats.failed++;
        return errorResult;
      }
    }

    try {
      // 执行工具
      const result = await tool.handler(args);

      // 记录日志
      this.logToolExecution(toolName, args, true, result, Date.now() - startTime);

      this.executionStats.success++;

      return this.formatToolResult(toolName, {
        success: true,
        result
      }, startTime);
    } catch (error) {
      // 记录错误日志
      this.logToolExecution(toolName, args, false, error.message, Date.now() - startTime);

      this.executionStats.failed++;

      return this.formatToolResult(toolName, {
        success: false,
        error: { code: 'EXECUTION_ERROR', message: error.message }
      }, startTime);
    }
  }

  /**
   * 带超时保护的工具执行
   * @param {string} toolName - 工具名称
   * @param {object} args - 工具参数
   * @param {number} timeoutMs - 超时时间（毫秒），默认30秒
   * @param {object} context - 执行上下文
   * @returns {Promise<object>} MCP格式的执行结果
   */
  async executeWithTimeout(toolName, args = {}, timeoutMs = DEFAULT_TIMEOUT_MS, context = {}) {
    const startTime = Date.now();
    this.executionStats.total++;

    return new Promise((resolve) => {
      // 设置超时定时器
      const timeoutId = setTimeout(() => {
        this.executionStats.timeouts++;
        this.executionStats.failed++;

        const timeoutResult = this.formatToolResult(toolName, {
          success: false,
          error: {
            code: 'TIMEOUT',
            message: `工具执行超时 (${timeoutMs}ms)`,
            timeout: timeoutMs
          }
        }, startTime);

        this.logToolExecution(toolName, args, false, `Timeout after ${timeoutMs}ms`, timeoutMs);

        resolve(timeoutResult);
      }, timeoutMs);

      // 执行工具
      this.executeTool(toolName, args, context)
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          this.executionStats.failed++;

          const errorResult = this.formatToolResult(toolName, {
            success: false,
            error: { code: 'EXECUTION_ERROR', message: error.message }
          }, startTime);

          resolve(errorResult);
        });
    });
  }

  /**
   * 格式化工具执行结果为 MCP 协议格式
   * @param {string} toolName - 工具名称
   * @param {object} result - 执行结果
   * @param {number} startTime - 开始时间戳
   * @returns {object} MCP 协议格式结果
   */
  formatToolResult(toolName, result, startTime = Date.now()) {
    const executionTime = Date.now() - startTime;

    if (result.success) {
      return {
        success: true,
        tool: toolName,
        result: result.result,
        executionTime,
        timestamp: new Date().toISOString()
      };
    } else {
      return {
        success: false,
        tool: toolName,
        error: result.error,
        executionTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 验证工具参数
   * @param {string} toolName - 工具名称
   * @param {object} args - 要验证的参数
   * @returns {{valid: boolean, errors: string[]}}
   */
  validateArgs(toolName, args) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { valid: false, errors: [`工具 ${toolName} 不存在`] };
    }

    const schema = tool.inputSchema;
    if (!schema || !schema.properties) {
      return { valid: true, errors: [] };
    }

    const errors = [];
    const requiredFields = schema.required || [];

    // 检查必填字段
    for (const field of requiredFields) {
      if (args[field] === undefined || args[field] === null || args[field] === '') {
        errors.push(`缺少必填参数: ${field}`);
      }
    }

    // 类型和约束检查
    for (const [key, value] of Object.entries(args)) {
      if (schema.properties[key]) {
        const propSchema = schema.properties[key];

        // 类型检查
        if (propSchema.type) {
          const expectedType = propSchema.type;
          const actualType = typeof value;

          if (expectedType === 'integer' && !Number.isInteger(value)) {
            errors.push(`参数 ${key} 必须是整数`);
          } else if (expectedType === 'number' && typeof value !== 'number') {
            errors.push(`参数 ${key} 必须是数字`);
          } else if (expectedType === 'string' && typeof value !== 'string') {
            errors.push(`参数 ${key} 必须是字符串`);
          } else if (expectedType === 'boolean' && typeof value !== 'boolean') {
            errors.push(`参数 ${key} 必须是布尔值`);
          } else if (expectedType === 'array' && !Array.isArray(value)) {
            errors.push(`参数 ${key} 必须是数组`);
          } else if (expectedType === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
            errors.push(`参数 ${key} 必须是对象`);
          }
        }

        // 枚举检查
        if (propSchema.enum && !propSchema.enum.includes(value)) {
          errors.push(`参数 ${key} 值必须在允许范围内: ${JSON.stringify(propSchema.enum)}`);
        }

        // 数值范围检查
        if (typeof value === 'number') {
          if (propSchema.minimum !== undefined && value < propSchema.minimum) {
            errors.push(`参数 ${key} 不能小于 ${propSchema.minimum}`);
          }
          if (propSchema.maximum !== undefined && value > propSchema.maximum) {
            errors.push(`参数 ${key} 不能大于 ${propSchema.maximum}`);
          }
        }

        // 字符串长度检查
        if (typeof value === 'string') {
          if (propSchema.minLength !== undefined && value.length < propSchema.minLength) {
            errors.push(`参数 ${key} 长度不能小于 ${propSchema.minLength}`);
          }
          if (propSchema.maxLength !== undefined && value.length > propSchema.maxLength) {
            errors.push(`参数 ${key} 长度不能大于 ${propSchema.maxLength}`);
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
   * 记录工具执行日志
   */
  logToolExecution(toolName, args, success, result, executionTime) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      tool: toolName,
      args: this.sanitizeArgs(args),
      success,
      executionTime,
      result: success ? undefined : result
    };

    // 发送通知
    this.sendNotification('notifications/tools/executed', logEntry);

    // 触发事件
    this.emit('toolExecuted', logEntry);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[MCP Tool] ${toolName} ${success ? 'SUCCESS' : 'FAILED'} (${executionTime}ms)`);
    }
  }

  /**
   * 清理敏感参数
   */
  sanitizeArgs(args) {
    const sanitized = { ...args };
    const sensitiveKeys = ['key', 'secret', 'password', 'token', 'api_key'];
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
        sanitized[key] = '***REDACTED***';
      }
    }
    return sanitized;
  }

  /**
   * 获取执行统计
   */
  getExecutionStats() {
    return {
      ...this.executionStats,
      successRate: this.executionStats.total > 0
        ? (this.executionStats.success / this.executionStats.total * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * 列出资源 - MCP协议
   */
  async handleResourcesList() {
    const resources = Array.from(this.resources.values()).map(resource => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType
    }));

    return {
      resources,
      nextCursor: null
    };
  }

  /**
   * 读取资源 - MCP协议
   */
  async handleResourceRead(uri) {
    const resource = this.resources.get(uri);

    if (!resource) {
      return {
        contents: [{
          uri,
          error: `Resource not found: ${uri}`
        }]
      };
    }

    try {
      const content = await resource.handler();

      return {
        contents: [{
          uri,
          mimeType: resource.mimeType || 'text/plain',
          text: typeof content === 'string' ? content : JSON.stringify(content)
        }]
      };
    } catch (error) {
      return {
        contents: [{
          uri,
          error: error.message
        }]
      };
    }
  }

  /**
   * 注册MCP资源
   */
  registerResource(resource) {
    this.resources.set(resource.uri, resource);
    this.emit('resourceRegistered', resource);

    return this;
  }

  /**
   * 列出提示 - MCP协议
   */
  async handlePromptsList() {
    const prompts = Array.from(this.prompts.values()).map(prompt => ({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments
    }));

    return {
      prompts,
      nextCursor: null
    };
  }

  /**
   * 获取提示 - MCP协议
   */
  async handlePromptGet(name, args = {}) {
    const prompt = this.prompts.get(name);

    if (!prompt) {
      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Prompt not found: ${name}`
          }
        }]
      };
    }

    try {
      const messages = await prompt.handler(args);

      return {
        messages
      };
    } catch (error) {
      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Error: ${error.message}`
          }
        }]
      };
    }
  }

  /**
   * 注册MCP提示
   */
  registerPrompt(prompt) {
    this.prompts.set(prompt.name, prompt);
    this.emit('promptRegistered', prompt);

    return this;
  }

  /**
   * 处理MCP请求
   */
  async handleRequest(request) {
    const { method, params = {} } = request;

    switch (method) {
      case 'initialize':
        return await this.handleInitialize(params);

      case 'tools/list':
        return await this.handleToolsList();

      case 'tools/call':
        return await this.handleToolCall(params.name, params.arguments);

      case 'resources/list':
        return await this.handleResourcesList();

      case 'resources/read':
        return await this.handleResourceRead(params.uri);

      case 'prompts/list':
        return await this.handlePromptsList();

      case 'prompts/get':
        return await this.handlePromptGet(params.name, params.arguments);

      default:
        return {
          error: {
            code: 'method_not_found',
            message: `Unknown method: ${method}`
          }
        };
    }
  }

  /**
   * 处理初始化
   */
  async handleInitialize(params) {
    const { protocolVersion, capabilities, clientInfo } = params;

    if (process.env.NODE_ENV !== 'production') {
      console.log(`MCP Client connected: ${clientInfo?.name || 'Unknown'}`);
    }

    return {
      protocolVersion: this.version,
      capabilities: this.getCapabilities(),
      serverInfo: {
        name: this.name,
        version: this.version
      }
    };
  }

  /**
   * 断开连接
   */
  async disconnect() {
    this.connected = false;
    this.emit('disconnected');
  }

  /**
   * 获取状态
   */
  getStatus() {
    return {
      connected: this.connected,
      tools: this.tools.size,
      resources: this.resources.size,
      prompts: this.prompts.size,
      clients: this.clients.size,
      version: this.version
    };
  }

  /**
   * 注册内置资源
   */
  registerBuiltinResources() {
    // 系统信息资源
    this.registerResource({
      uri: 'system://info',
      name: 'System Information',
      description: '获取系统运行状态和信息',
      mimeType: 'application/json',
      handler: async () => ({
        platform: process.platform,
        nodeVersion: process.version,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
      })
    });

    // 环境变量资源
    this.registerResource({
      uri: 'system://env',
      name: 'Environment Variables',
      description: '获取环境变量列表',
      mimeType: 'application/json',
      handler: async () => {
        const safeEnv = {};
        for (const [key, value] of Object.entries(process.env)) {
          // 过滤敏感信息
          if (key.toLowerCase().includes('key') ||
              key.toLowerCase().includes('secret') ||
              key.toLowerCase().includes('password')) {
            safeEnv[key] = '***REDACTED***';
          } else {
            safeEnv[key] = value;
          }
        }
        return safeEnv;
      }
    });

    // 配置资源
    this.registerResource({
      uri: 'config://tools',
      name: 'Tool Configuration',
      description: '获取已注册工具的配置信息',
      mimeType: 'application/json',
      handler: async () => this.handleToolsList()
    });
  }

  /**
   * 注册内置提示词
   */
  registerBuiltinPrompts() {
    // 代码审查提示词
    this.registerPrompt({
      name: 'code_review',
      description: '生成代码审查请求',
      arguments: [
        { name: 'language', description: '编程语言', required: true },
        { name: 'code', description: '要审查的代码', required: true }
      ],
      handler: async (args) => [{
        role: 'user',
        content: {
          type: 'text',
          text: `请审查以下 ${args.language} 代码，提供改进建议：

\`\`\`${args.language}
${args.code}
\`\`\`

审查要点：
1. 代码质量和可读性
2. 潜在的bug和错误
3. 性能优化建议
4. 安全性问题
5. 最佳实践建议`
        }
      }]
    });

    // 文档生成提示词
    this.registerPrompt({
      name: 'generate_docs',
      description: '生成代码文档',
      arguments: [
        { name: 'code', description: '要生成文档的代码', required: true },
        { name: 'format', description: '文档格式 (markdown/javadoc/jsdoc)', required: false }
      ],
      handler: async (args) => [{
        role: 'user',
        content: {
          type: 'text',
          text: `请为以下代码生成${args.format || 'markdown'}格式的文档：

\`\`\`
${args.code}
\`\`\`

文档应包含：
- 功能描述
- 参数说明
- 返回值说明
- 使用示例
- 注意事项`
        }
      }]
    });

    // 任务分解提示词
    this.registerPrompt({
      name: 'task_breakdown',
      description: '将任务分解为可执行步骤',
      arguments: [
        { name: 'task', description: '要分解的任务', required: true }
      ],
      handler: async (args) => [{
        role: 'user',
        content: {
          type: 'text',
          text: `请将以下任务分解为详细的执行步骤：

任务：${args.task}

请提供：
1. 步骤列表（按顺序）
2. 每个步骤的预期输出
3. 可能需要的工具或资源
4. 潜在的风险和解决方案`
        }
      }]
    });
  }

  /**
   * 发送通知
   */
  sendNotification(method, params) {
    const notification = {
      jsonrpc: '2.0',
      method,
      params
    };

    this.notificationQueue.push(notification);
    this.emit('notification', notification);

    // 通知所有客户端
    for (const [clientId, client] of this.clients) {
      if (client.onNotification) {
        client.onNotification(notification);
      }
    }
  }

  /**
   * 获取待发送通知
   */
  getPendingNotifications() {
    const notifications = [...this.notificationQueue];
    this.notificationQueue = [];
    return notifications;
  }

  /**
   * 订阅资源更新
   */
  async subscribeResource(uri, clientId) {
    if (!this.resourceSubscriptions.has(uri)) {
      this.resourceSubscriptions.set(uri, new Set());
    }
    this.resourceSubscriptions.get(uri).add(clientId);

    return { success: true, message: `Subscribed to ${uri}` };
  }

  /**
   * 取消资源订阅
   */
  async unsubscribeResource(uri, clientId) {
    const subscribers = this.resourceSubscriptions.get(uri);
    if (subscribers) {
      subscribers.delete(clientId);
    }

    return { success: true, message: `Unsubscribed from ${uri}` };
  }

  /**
   * 通知资源更新
   */
  notifyResourceUpdate(uri) {
    const subscribers = this.resourceSubscriptions.get(uri);
    if (subscribers && subscribers.size > 0) {
      this.sendNotification('notifications/resources/updated', { uri });
    }
  }

  /**
   * 处理 JSON-RPC 请求
   */
  handleJsonRpcRequest(request) {
    // 验证 JSON-RPC 格式
    if (request.jsonrpc !== '2.0') {
      return this.createJsonRpcError(null, JsonRpcErrors.INVALID_REQUEST);
    }

    const { id, method, params } = request;

    // 处理请求
    return this.handleRequest({ method, params })
      .then(result => ({
        jsonrpc: '2.0',
        id,
        result
      }))
      .catch(error => ({
        jsonrpc: '2.0',
        id,
        error: {
          code: JsonRpcErrors.INTERNAL_ERROR.code,
          message: error.message
        }
      }));
  }

  /**
   * 创建 JSON-RPC 错误响应
   */
  createJsonRpcError(id, error, data = null) {
    const response = {
      jsonrpc: '2.0',
      id,
      error: {
        code: error.code,
        message: error.message
      }
    };
    if (data) {
      response.error.data = data;
    }
    return response;
  }

  /**
   * 注册客户端
   */
  registerClient(clientId, clientInfo = {}) {
    this.clients.set(clientId, {
      id: clientId,
      info: clientInfo,
      connectedAt: Date.now(),
      onNotification: null
    });

    this.emit('clientConnected', { clientId, clientInfo });
    return { success: true, clientId };
  }

  /**
   * 注销客户端
   */
  unregisterClient(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      // 清理所有订阅
      for (const [uri, subscribers] of this.resourceSubscriptions) {
        subscribers.delete(clientId);
      }
      this.clients.delete(clientId);
      this.emit('clientDisconnected', { clientId });
    }
    return { success: true };
  }

  /**
   * 完整的 MCP 协议处理
   */
  async handleFullRequest(request) {
    const { method, params = {} } = request;

    // 扩展方法支持
    switch (method) {
      case 'initialize':
        return await this.handleInitialize(params);

      case 'tools/list':
        return await this.handleToolsList();

      case 'tools/call':
        return await this.handleToolCall(params.name, params.arguments);

      case 'resources/list':
        return await this.handleResourcesList();

      case 'resources/read':
        return await this.handleResourceRead(params.uri);

      case 'resources/subscribe':
        return await this.subscribeResource(params.uri, params.clientId);

      case 'resources/unsubscribe':
        return await this.unsubscribeResource(params.uri, params.clientId);

      case 'prompts/list':
        return await this.handlePromptsList();

      case 'prompts/get':
        return await this.handlePromptGet(params.name, params.arguments);

      case 'ping':
        return { pong: true, timestamp: Date.now() };

      case 'shutdown':
        await this.disconnect();
        return { success: true, message: 'Server shutting down' };

      default:
        return {
          error: {
            code: JsonRpcErrors.METHOD_NOT_FOUND.code,
            message: `Unknown method: ${method}`
          }
        };
    }
  }
}

// MCP工具装饰器
function mcpTool(config) {
  return function (target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args) {
      return await originalMethod.apply(this, args);
    };

    descriptor.value.mcpTool = {
      name: config.name || propertyKey,
      description: config.description || '',
      inputSchema: config.inputSchema || {}
    };

    return descriptor;
  };
}

module.exports = {
  MCPService,
  mcpTool,
  MCP_VERSION,
  JsonRpcErrors
};
