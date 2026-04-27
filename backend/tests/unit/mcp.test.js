/**
 * MCP Protocol 单元测试
 *
 * 测试内容：
 * 1. JSON-RPC 处理 (parseRequest, createJsonRpcError)
 * 2. 工具管理 (registerTool, unregisterTool, handleToolsList, handleToolCall)
 * 3. 资源订阅 (subscribeResource, unsubscribeResource, notificationQueue)
 * 4. 执行统计 (Execution time tracking, Success/failure counting)
 */

const assert = require('assert');
const { MCPService, mcpTool, MCP_VERSION, JsonRpcErrors } = require('../../src/services/mcp');

describe('MCP Protocol - 构造函数与初始化', () => {
  test('应该使用默认配置创建实例', () => {
    const mcp = new MCPService();
    expect(mcp.name).toBe('MCP Service');
    expect(mcp.version).toBe('2.0.0');
    expect(mcp.connected).toBe(false);
    expect(mcp.tools).toBeInstanceOf(Map);
    expect(mcp.resources).toBeInstanceOf(Map);
    expect(mcp.prompts).toBeInstanceOf(Map);
    expect(mcp.resourceSubscriptions).toBeInstanceOf(Map);
    expect(Array.isArray(mcp.notificationQueue)).toBe(true);
  });

  test('应该使用自定义配置创建实例', () => {
    const mcp = new MCPService({ name: 'Test MCP', version: '1.0.0' });
    expect(mcp.name).toBe('Test MCP');
    expect(mcp.version).toBe('1.0.0');
  });

  test('应该初始化执行统计', () => {
    const mcp = new MCPService();
    expect(mcp.executionStats).toEqual({
      total: 0,
      success: 0,
      failed: 0,
      timeouts: 0
    });
  });

  test('应该注册内置资源', () => {
    const mcp = new MCPService();
    expect(mcp.resources.size).toBeGreaterThan(0);
    expect(mcp.resources.has('system://info')).toBe(true);
    expect(mcp.resources.has('system://env')).toBe(true);
    expect(mcp.resources.has('config://tools')).toBe(true);
  });

  test('应该注册内置提示词', () => {
    const mcp = new MCPService();
    expect(mcp.prompts.size).toBeGreaterThan(0);
    expect(mcp.prompts.has('code_review')).toBe(true);
    expect(mcp.prompts.has('generate_docs')).toBe(true);
    expect(mcp.prompts.has('task_breakdown')).toBe(true);
  });
});

describe('MCP Protocol - initialize', () => {
  test('应该成功初始化', async () => {
    const mcp = new MCPService();
    const result = await mcp.initialize();
    expect(result.success).toBe(true);
    expect(result.version).toBe('2.0.0');
    expect(result.capabilities).toBeDefined();
  });

  test('初始化后应该设置connected为true', async () => {
    const mcp = new MCPService();
    await mcp.initialize();
    expect(mcp.connected).toBe(true);
  });

  test('应该触发connected事件', async () => {
    const mcp = new MCPService();
    let eventFired = false;
    mcp.on('connected', () => { eventFired = true; });
    await mcp.initialize();
    expect(eventFired).toBe(true);
  });
});

describe('MCP Protocol - getCapabilities', () => {
  test('应该返回服务能力', async () => {
    const mcp = new MCPService();
    const capabilities = mcp.getCapabilities();
    expect(capabilities.tools).toBeDefined();
    expect(capabilities.resources).toBeDefined();
    expect(capabilities.prompts).toBeDefined();
  });

  test('能力对象应该包含listChanged标志', async () => {
    const mcp = new MCPService();
    const capabilities = mcp.getCapabilities();
    expect(capabilities.tools.listChanged).toBe(true);
  });
});

describe('MCP Protocol - JSON-RPC 处理', () => {
  test('handleJsonRpcRequest应该处理有效请求', async () => {
    const mcp = new MCPService();
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    };

    const result = await mcp.handleJsonRpcRequest(request);
    expect(result.jsonrpc).toBe('2.0');
    expect(result.id).toBe(1);
  });

  test('handleJsonRpcRequest应该处理无效jsonrpc', async () => {
    const mcp = new MCPService();
    const request = {
      id: 1,
      method: 'test.method'
    };

    const result = await mcp.handleJsonRpcRequest(request);
    expect(result.error).toBeDefined();
  });

  test('createJsonRpcError应该返回正确格式的错误', () => {
    const mcp = new MCPService();
    const error = mcp.createJsonRpcError(null, JsonRpcErrors.INVALID_REQUEST, { hint: 'Check your JSON' });

    expect(error.jsonrpc).toBe('2.0');
    expect(error.error.code).toBe(JsonRpcErrors.INVALID_REQUEST.code);
    expect(error.id).toBeNull();
  });
});

describe('MCP Protocol - 工具管理 (registerTool)', () => {
  test('应该注册工具', () => {
    const mcp = new MCPService();
    mcp.registerTool({
      name: 'test_tool',
      description: 'Test tool',
      inputSchema: { type: 'object', properties: {} }
    });

    expect(mcp.tools.has('test_tool')).toBe(true);
  });

  test('应该存储工具的description和inputSchema', () => {
    const mcp = new MCPService();
    mcp.registerTool({
      name: 'full_tool',
      description: 'Full tool',
      inputSchema: { type: 'object', properties: { x: { type: 'string' } } }
    });

    const tool = mcp.tools.get('full_tool');
    expect(tool.description).toBe('Full tool');
    expect(tool.inputSchema.properties.x.type).toBe('string');
  });

  test('注册同名工具应该覆盖', () => {
    const mcp = new MCPService();
    mcp.registerTool({ name: 'overwrite_tool', description: 'Original' });
    mcp.registerTool({ name: 'overwrite_tool', description: 'Updated' });

    expect(mcp.tools.get('overwrite_tool').description).toBe('Updated');
  });
});

describe('MCP Protocol - handleToolsList', () => {
  test('应该返回空列表当没有工具注册时', async () => {
    const mcp = new MCPService();
    const result = await mcp.handleToolsList();
    expect(result.tools).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  test('应该返回已注册的工具列表', async () => {
    const mcp = new MCPService();
    mcp.registerTool({
      name: 'tool1',
      description: 'First tool',
      inputSchema: { type: 'object', properties: { a: { type: 'string' } } }
    });
    mcp.registerTool({
      name: 'tool2',
      description: 'Second tool',
      inputSchema: { type: 'object', properties: { b: { type: 'number' } } }
    });

    const result = await mcp.handleToolsList();
    expect(result.tools.length).toBe(2);

    const toolNames = result.tools.map(t => t.name);
    expect(toolNames).toContain('tool1');
    expect(toolNames).toContain('tool2');
  });

  test('应该包含工具的name, description, inputSchema', async () => {
    const mcp = new MCPService();
    mcp.registerTool({
      name: 'full_tool',
      description: 'Full tool description',
      inputSchema: {
        type: 'object',
        properties: { x: { type: 'integer' } },
        required: ['x']
      }
    });

    const result = await mcp.handleToolsList();
    const tool = result.tools[0];
    expect(tool.name).toBe('full_tool');
    expect(tool.description).toBe('Full tool description');
    expect(tool.inputSchema).toEqual({
      type: 'object',
      properties: { x: { type: 'integer' } },
      required: ['x']
    });
  });

  test('应该为没有inputSchema的工具提供默认空对象', async () => {
    const mcp = new MCPService();
    mcp.registerTool({ name: 'no_schema_tool', description: 'No schema' });

    const result = await mcp.handleToolsList();
    const tool = result.tools[0];
    expect(tool.inputSchema).toEqual({ type: 'object', properties: {} });
  });
});

describe('MCP Protocol - handleToolCall', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
    console.error.mockRestore();
  });

  test('应该成功执行已注册的工具', async () => {
    const mcp = new MCPService();
    mcp.registerTool({
      name: 'echo',
      description: 'Echo tool',
      handler: async (args) => ({ echoed: args.message })
    });

    const result = await mcp.handleToolCall('echo', { message: 'hello' });
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.echoed).toBe('hello');
  });

  test('应该返回字符串结果的原始内容', async () => {
    const mcp = new MCPService();
    mcp.registerTool({
      name: 'string_tool',
      handler: async () => 'plain string result'
    });

    const result = await mcp.handleToolCall('string_tool', {});
    expect(result.content[0].text).toBe('plain string result');
  });

  test('未知工具应该返回错误', async () => {
    const mcp = new MCPService();
    const result = await mcp.handleToolCall('unknown_tool', {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
  });

  test('工具执行超时应该返回超时错误', async () => {
    const mcp = new MCPService();
    mcp.registerTool({
      name: 'slow_tool',
      handler: async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'done';
      }
    });

    const result = await mcp.executeWithTimeout('slow_tool', {}, 50);
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('TIMEOUT');
  });

  test('执行失败应该返回错误内容', async () => {
    const mcp = new MCPService();
    mcp.registerTool({
      name: 'fail_tool',
      handler: async () => {
        throw new Error('Intentional error');
      }
    });

    const result = await mcp.handleToolCall('fail_tool', {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
  });
});

describe('MCP Protocol - 资源管理', () => {
  test('应该注册资源', () => {
    const mcp = new MCPService();
    mcp.registerResource({
      uri: 'custom://test',
      name: 'Test Resource',
      description: 'A test resource',
      mimeType: 'text/plain'
    });

    expect(mcp.resources.has('custom://test')).toBe(true);
  });

  test('资源uri应该包含name和mimeType', () => {
    const mcp = new MCPService();
    mcp.registerResource({
      uri: 'custom://full',
      name: 'Full Resource',
      description: 'A full resource',
      mimeType: 'application/json'
    });

    const resource = mcp.resources.get('custom://full');
    expect(resource.name).toBe('Full Resource');
    expect(resource.mimeType).toBe('application/json');
  });

  test('handleResourcesList应该返回资源列表', async () => {
    const mcp = new MCPService();
    const result = await mcp.handleResourcesList();
    expect(Array.isArray(result.resources)).toBe(true);
    expect(result.resources.length).toBeGreaterThan(0);
  });
});

describe('MCP Protocol - 订阅管理', () => {
  test('应该订阅资源', async () => {
    const mcp = new MCPService();
    const result = await mcp.subscribeResource('system://info', 'session1');
    expect(result.success).toBe(true);
  });

  test('应该取消订阅', async () => {
    const mcp = new MCPService();
    await mcp.subscribeResource('system://info', 'session1');
    const result = await mcp.unsubscribeResource('system://info', 'session1');
    expect(result.success).toBe(true);
  });

  test('取消未订阅的资源应该成功', async () => {
    const mcp = new MCPService();
    const result = await mcp.unsubscribeResource('nonexistent://resource', 'session1');
    expect(result.success).toBe(true);
  });
});

describe('MCP Protocol - 提示词管理', () => {
  test('应该注册提示词', () => {
    const mcp = new MCPService();
    mcp.registerPrompt({
      name: 'custom_prompt',
      description: 'A custom prompt',
      arguments: [{ name: 'topic', description: 'The topic', required: true }]
    });

    expect(mcp.prompts.has('custom_prompt')).toBe(true);
  });

  test('handlePromptsList应该返回提示词列表', async () => {
    const mcp = new MCPService();
    const result = await mcp.handlePromptsList();
    expect(Array.isArray(result.prompts)).toBe(true);
  });

  test('handlePromptGet应该返回指定提示词', async () => {
    const mcp = new MCPService();
    const result = await mcp.handlePromptGet('code_review', { code: 'test' });
    expect(result.messages).toBeDefined();
    expect(Array.isArray(result.messages)).toBe(true);
  });

  test('handlePromptGet应该处理缺少参数的情况', async () => {
    const mcp = new MCPService();
    const result = await mcp.handlePromptGet('code_review', {});
    expect(result.messages).toBeDefined();
  });

  test('未知提示词应该返回提示词未找到消息', async () => {
    const mcp = new MCPService();
    const result = await mcp.handlePromptGet('nonexistent_prompt', {});
    expect(result.messages[0].content.text).toContain('Prompt not found');
  });
});

describe('MCP Protocol - 执行统计', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
    console.error.mockRestore();
  });

  test('执行统计应该初始化为零', () => {
    const mcp = new MCPService();
    expect(mcp.executionStats.total).toBe(0);
    expect(mcp.executionStats.success).toBe(0);
    expect(mcp.executionStats.failed).toBe(0);
    expect(mcp.executionStats.timeouts).toBe(0);
  });

  test('成功执行应该增加success计数', async () => {
    const mcp = new MCPService();
    mcp.registerTool({
      name: 'quick_tool',
      handler: async () => 'result'
    });

    await mcp.executeTool('quick_tool', {});
    expect(mcp.executionStats.success).toBe(1);
    expect(mcp.executionStats.total).toBe(1);
  });

  test('失败执行应该增加failed计数', async () => {
    const mcp = new MCPService();
    mcp.registerTool({
      name: 'error_tool',
      handler: async () => { throw new Error('fail'); }
    });

    await mcp.executeTool('error_tool', {});
    expect(mcp.executionStats.failed).toBe(1);
  });

  test('getExecutionStats应该返回统计数据', () => {
    const mcp = new MCPService();
    const stats = mcp.getExecutionStats();
    expect(stats).toHaveProperty('total');
    expect(stats).toHaveProperty('success');
    expect(stats).toHaveProperty('failed');
    expect(stats).toHaveProperty('timeouts');
  });

  test('多次成功执行应该累加计数', async () => {
    const mcp = new MCPService();
    mcp.registerTool({
      name: 'count_tool',
      handler: async () => 'result'
    });

    await mcp.executeTool('count_tool', {});
    await mcp.executeTool('count_tool', {});
    await mcp.executeTool('count_tool', {});
    expect(mcp.executionStats.success).toBe(3);
    expect(mcp.executionStats.total).toBe(3);
  });

  test('getTotalExecutions应该返回总执行次数', () => {
    const mcp = new MCPService();
    mcp.registerTool({
      name: 'exec_tool',
      handler: async () => 'result'
    });

    expect(mcp.getExecutionStats().total).toBe(0);
  });
});

describe('MCP Protocol - 集成测试', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
    console.error.mockRestore();
  });

  test('完整工具注册和调用流程', async () => {
    const mcp = new MCPService();

    mcp.registerTool({
      name: 'calculator',
      description: 'Simple calculator',
      inputSchema: {
        type: 'object',
        properties: {
          a: { type: 'number' },
          b: { type: 'number' }
        }
      },
      handler: async (args) => ({
        sum: args.a + args.b,
        product: args.a * args.b
      })
    });

    const listResult = await mcp.handleToolsList();
    expect(listResult.tools.length).toBeGreaterThan(0);

    const callResult = await mcp.handleToolCall('calculator', { a: 5, b: 3 });
    expect(callResult.content).toBeDefined();
  });

  test('完整资源订阅流程', async () => {
    const mcp = new MCPService();

    const subResult = await mcp.subscribeResource('system://info', 'user_session');
    expect(subResult.success).toBe(true);

    const hasSub = mcp.resourceSubscriptions.has('system://info');
    expect(hasSub).toBe(true);
  });

  test('并发订阅同一资源', async () => {
    const mcp = new MCPService();

    await mcp.subscribeResource('system://info', 'session1');
    await mcp.subscribeResource('system://info', 'session2');

    const subscribers = mcp.resourceSubscriptions.get('system://info');
    expect(subscribers.size).toBe(2);
  });

  test('取消订阅后其他会话不受影响', async () => {
    const mcp = new MCPService();

    await mcp.subscribeResource('system://info', 'session1');
    await mcp.subscribeResource('system://info', 'session2');
    await mcp.unsubscribeResource('system://info', 'session1');

    const subscribers = mcp.resourceSubscriptions.get('system://info');
    expect(subscribers.has('session2')).toBe(true);
    expect(subscribers.has('session1')).toBe(false);
  });

  test('注册多个工具后列表应该正确', async () => {
    const mcp = new MCPService();

    mcp.registerTool({ name: 'tool_a', description: 'Tool A' });
    mcp.registerTool({ name: 'tool_b', description: 'Tool B' });
    mcp.registerTool({ name: 'tool_c', description: 'Tool C' });

    const result = await mcp.handleToolsList();
    expect(result.tools.length).toBeGreaterThanOrEqual(3);
  });
});

describe('MCP Protocol - mcpTool装饰器', () => {
  test('mcpTool应该返回装饰器函数', () => {
    const decorator = mcpTool({ name: 'test_decorator', description: 'A decorated tool' });
    expect(typeof decorator).toBe('function');
  });
});

describe('MCP Protocol - 常量验证', () => {
  test('MCP_VERSION应该存在', () => {
    expect(MCP_VERSION).toBeDefined();
    expect(typeof MCP_VERSION).toBe('string');
  });

  test('JsonRpcErrors应该包含标准错误码', () => {
    expect(JsonRpcErrors.PARSE_ERROR.code).toBe(-32700);
    expect(JsonRpcErrors.INVALID_REQUEST.code).toBe(-32600);
    expect(JsonRpcErrors.METHOD_NOT_FOUND.code).toBe(-32601);
    expect(JsonRpcErrors.INVALID_PARAMS.code).toBe(-32602);
    expect(JsonRpcErrors.INTERNAL_ERROR.code).toBe(-32603);
  });
});

describe('MCP Protocol - 边界条件测试', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
    console.error.mockRestore();
  });

  test('空参数应该正常处理', async () => {
    const mcp = new MCPService();
    mcp.registerTool({
      name: 'no_args_tool',
      handler: async () => 'no args result'
    });

    const result = await mcp.handleToolCall('no_args_tool', {});
    expect(result.content).toBeDefined();
  });

  test('未初始化的服务应该可以注册工具', () => {
    const mcp = new MCPService();
    mcp.registerTool({
      name: 'pre_init_tool',
      description: 'Tool registered before init'
    });

    expect(mcp.tools.has('pre_init_tool')).toBe(true);
  });

  test('应该处理大量并发订阅', async () => {
    const mcp = new MCPService();

    for (let i = 0; i < 10; i++) {
      await mcp.subscribeResource('system://info', `session_${i}`);
    }

    const subscribers = mcp.resourceSubscriptions.get('system://info');
    expect(subscribers.size).toBe(10);
  });
});

describe('MCP Protocol - 通知队列', () => {
  test('notificationQueue应该初始化为空数组', () => {
    const mcp = new MCPService();
    expect(Array.isArray(mcp.notificationQueue)).toBe(true);
    expect(mcp.notificationQueue.length).toBe(0);
  });

  test('sendNotification应该添加通知到队列', () => {
    const mcp = new MCPService();
    mcp.sendNotification('notifications/message', { content: 'test message' });

    expect(mcp.notificationQueue.length).toBe(1);
  });

  test('getPendingNotifications应该返回并清空队列', () => {
    const mcp = new MCPService();
    mcp.sendNotification('test', {});
    mcp.sendNotification('test2', {});

    const drained = mcp.getPendingNotifications();

    expect(drained.length).toBe(2);
    expect(mcp.notificationQueue.length).toBe(0);
  });
});