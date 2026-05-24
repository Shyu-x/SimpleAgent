/**
 * ToolExecutor 单元测试
 *
 * 测试内容：
 * 1. ToolResult 结果类
 * 2. ToolExecutor 执行器
 * 3. 并发控制
 * 4. 策略模式
 */
const assert = require('assert');



const { ToolExecutor, ToolResult, ToolExecutorFactory, executorFactory } = require('../../src/services/agent/ToolExecutor');

describe('ToolResult', () => {
  test('应该正确构造成功结果', () => {
    const result = new ToolResult('testTool', true, { data: 'success' }, null, 100);
    assert.strictEqual(result.toolName, 'testTool');
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.result, { data: 'success' });
    assert.strictEqual(result.error, null);
    assert.strictEqual(result.duration, 100);
    assert.ok(result.timestamp);
  });

  test('应该正确构造失败结果', () => {
    const error = new Error('Tool failed');
    const result = new ToolResult('failTool', false, null, error, 50);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.result, null);
    assert.strictEqual(result.error, error);
    assert.strictEqual(result.duration, 50);
  });

  test('错误应该是字符串形式', () => {
    const result = new ToolResult('failTool', false, null, 'error message', 50);
    const json = result.toJSON();
    assert.strictEqual(json.error, 'error message');
  });

  test('应该正确序列化为 JSON', () => {
    const result = new ToolResult('jsonTool', true, { key: 'value' }, null, 75);
    const json = result.toJSON();
    assert.strictEqual(json.toolName, 'jsonTool');
    assert.strictEqual(json.success, true);
    assert.deepStrictEqual(json.result, { key: 'value' });
    assert.strictEqual(json.error, null);
    assert.strictEqual(json.duration, 75);
    assert.ok(json.timestamp);
  });
});

describe('ToolExecutor 构造函数', () => {
  test('默认配置应该正确', () => {
    const executor = new ToolExecutor();
    assert.strictEqual(executor.defaultTimeout, 60000);
    assert.strictEqual(executor.maxRetries, 0);
    assert.strictEqual(executor.retryDelay, 1000);
    assert.strictEqual(executor.maxConcurrent, 5);
    assert.strictEqual(executor.strategy, 'sequential');
  });

  test('自定义配置应该正确应用', () => {
    const executor = new ToolExecutor({
      defaultTimeout: 30000,
      maxRetries: 3,
      retryDelay: 500,
      maxConcurrent: 10,
      strategy: 'parallel'
    });
    assert.strictEqual(executor.defaultTimeout, 30000);
    assert.strictEqual(executor.maxRetries, 3);
    assert.strictEqual(executor.retryDelay, 500);
    assert.strictEqual(executor.maxConcurrent, 10);
    assert.strictEqual(executor.strategy, 'parallel');
  });
});

describe('ToolExecutor registerTool', () => {
  test('应该注册单个工具', () => {
    const executor = new ToolExecutor();
    const tool = { name: 'testTool', execute: async () => 'result' };
    executor.registerTool(tool);
    assert.strictEqual(executor.toolRegistry.get('testTool'), tool);
  });

  test('应该支持链式调用', () => {
    const executor = new ToolExecutor();
    const result = executor.registerTool({ name: 'chainTool', execute: async () => {} });
    assert.strictEqual(result, executor);
  });

  test('应该注册多个工具', () => {
    const executor = new ToolExecutor();
    const tools = [
      { name: 'tool1', execute: async () => 'result1' },
      { name: 'tool2', execute: async () => 'result2' }
    ];
    executor.registerTools(tools);
    assert.strictEqual(executor.toolRegistry.get('tool1'), tools[0]);
    assert.strictEqual(executor.toolRegistry.get('tool2'), tools[1]);
  });
});

describe('ToolExecutor executeTool 正常路径', () => {
  test('应该成功执行工具', async () => {
    const executor = new ToolExecutor();
    executor.registerTool({ name: 'successTool', execute: async () => 'success result' });
    const result = await executor.executeTool('successTool', {});
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.result, 'success result');
  });

  test('应该传递参数给工具', async () => {
    const executor = new ToolExecutor();
    executor.registerTool({ name: 'paramTool', execute: async (params) => params.input });
    const result = await executor.executeTool('paramTool', { input: 'test value' });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.result, 'test value');
  });

  test('应该记录执行时间', async () => {
    const executor = new ToolExecutor();
    executor.registerTool({
      name: 'delayTool',
      execute: async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'delayed';
      }
    });
    const result = await executor.executeTool('delayTool', {});
    assert.strictEqual(result.success, true);
    assert.ok(result.duration >= 50);
  });
});

describe('ToolExecutor executeTool 异常路径', () => {
  test('不存在的工具应该返回失败结果', async () => {
    const executor = new ToolExecutor();
    const result = await executor.executeTool('nonExistent', {});
    assert.strictEqual(result.success, false);
    assert.ok(result.error instanceof Error);
    assert.strictEqual(result.error.message, 'Tool not found: nonExistent');
  });

  test('工具执行失败应该返回失败结果', async () => {
    const executor = new ToolExecutor();
    executor.registerTool({ name: 'failTool', execute: async () => { throw new Error('Execution failed'); } });
    const result = await executor.executeTool('failTool', {});
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error.message, 'Execution failed');
  });

  test('超时应该被正确处理', async () => {
    const executor = new ToolExecutor({ defaultTimeout: 50 });
    executor.registerTool({
      name: 'timeoutTool',
      execute: async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'never returned';
      }
    });
    const result = await executor.executeTool('timeoutTool', {});
    assert.strictEqual(result.success, false);
    assert.ok(result.error.message.includes('timeout'));
  });

  test('重试机制应该正常工作', async () => {
    const executor = new ToolExecutor({ maxRetries: 2, retryDelay: 10 });
    let attempts = 0;
    executor.registerTool({
      name: 'retryTool',
      execute: async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        return 'success on attempt 3';
      }
    });
    const result = await executor.executeTool('retryTool', {});
    assert.strictEqual(result.success, true);
    assert.strictEqual(attempts, 3);
  });

  test('所有重试都失败应该返回失败结果', async () => {
    const executor = new ToolExecutor({ maxRetries: 2, retryDelay: 10 });
    executor.registerTool({ name: 'alwaysFailTool', execute: async () => { throw new Error('Always fails'); } });
    const result = await executor.executeTool('alwaysFailTool', {});
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error.message, 'Always fails');
  });
});

describe('ToolExecutor executeTools 策略', () => {
  test('sequential 策略应该按顺序执行工具', async () => {
    const executor = new ToolExecutor({ strategy: 'sequential' });
    const executionOrder = [];

    executor.registerTools([
      { name: 'first', execute: async () => { executionOrder.push(1); return 'first'; } },
      { name: 'second', execute: async () => { executionOrder.push(2); return 'second'; } },
      { name: 'third', execute: async () => { executionOrder.push(3); return 'third'; } }
    ]);

    const results = await executor.executeTools([
      { toolName: 'first', params: {} },
      { toolName: 'second', params: {} },
      { toolName: 'third', params: {} }
    ]);

    assert.deepStrictEqual(executionOrder, [1, 2, 3]);
    assert.strictEqual(results.length, 3);
    assert.strictEqual(results[0].result, 'first');
    assert.strictEqual(results[1].result, 'second');
    assert.strictEqual(results[2].result, 'third');
  });

  test('parallel 策略应该并行执行工具', async () => {
    const executor = new ToolExecutor({ strategy: 'parallel', maxConcurrent: 5 });
    const executionTimes = [];

    executor.registerTools([
      { name: 'slow1', execute: async () => {
        await new Promise(resolve => setTimeout(resolve, 30));
        executionTimes.push(Date.now());
        return 'slow1';
      }},
      { name: 'slow2', execute: async () => {
        await new Promise(resolve => setTimeout(resolve, 30));
        executionTimes.push(Date.now());
        return 'slow2';
      }}
    ]);

    const startTime = Date.now();
    const results = await executor.executeTools([
      { toolName: 'slow1', params: {} },
      { toolName: 'slow2', params: {} }
    ], { strategy: 'parallel' });

    const totalTime = Date.now() - startTime;
    assert.ok(totalTime < 60, `Expected < 60ms, got ${totalTime}ms`);
    assert.strictEqual(results.length, 2);
  });
});

describe('ToolExecutor mergeResults', () => {
  test('应该合并多个工具结果', () => {
    const executor = new ToolExecutor();
    const results = [
      new ToolResult('tool1', true, 'result1', null, 10),
      new ToolResult('tool2', true, 'result2', null, 20),
      new ToolResult('tool3', false, null, new Error('tool3 failed'), 30)
    ];

    const merged = executor.mergeResults(results);
    assert.strictEqual(merged.total, 3);
    assert.strictEqual(merged.successful, 2);
    assert.strictEqual(merged.failed, 1);
    assert.strictEqual(merged.mergedContent, 'result1\n\nresult2');
    assert.strictEqual(merged.errors.length, 1);
    assert.strictEqual(merged.errors[0].tool, 'tool3');
  });

  test('应该处理不同类型的成功结果', () => {
    const executor = new ToolExecutor();
    const results = [
      new ToolResult('strTool', true, 'string result', null, 10),
      new ToolResult('objTool', true, { content: 'object result' }, null, 20),
      new ToolResult('arrTool', true, [1, 2, 3], null, 30)
    ];

    const merged = executor.mergeResults(results);
    // mergeResults 对有 content 属性的对象返回 content 字段的值
    assert.strictEqual(merged.mergedContent, 'string result\n\nobject result\n\n[1,2,3]');
  });
});

describe('ToolExecutorFactory', () => {
  test('get 应该创建新的执行器', () => {
    const factory = new ToolExecutorFactory();
    const executor = factory.get('new-executor');
    assert.ok(executor instanceof ToolExecutor);
  });

  test('get 应该返回已存在的执行器', () => {
    const factory = new ToolExecutorFactory();
    const executor1 = factory.get('existing');
    const executor2 = factory.get('existing');
    assert.strictEqual(executor1, executor2);
  });

  test('createConfigured 应该创建配置好的执行器', () => {
    const factory = new ToolExecutorFactory();
    const executor = factory.createConfigured({
      name: 'configured',
      strategy: 'parallel',
      timeout: 30000,
      retries: 2,
      maxConcurrent: 10
    });
    assert.strictEqual(executor.strategy, 'parallel');
    assert.strictEqual(executor.defaultTimeout, 30000);
    assert.strictEqual(executor.maxRetries, 2);
    assert.strictEqual(executor.maxConcurrent, 10);
  });
});

describe('executorFactory 全局实例', () => {
  test('应该是一个 ToolExecutorFactory 实例', () => {
    assert.ok(executorFactory instanceof ToolExecutorFactory);
  });
});

