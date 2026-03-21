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
  SERVER_ERROR: { code: -32603, message: 'Server error' }
};

/**
 * MCP 协议版本
 */
const MCP_VERSION = '2024-11-05';

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
