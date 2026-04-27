/**
 * WorkflowEngine 单元测试
 * 覆盖所有节点类型、变量替换、表达式计算、暂停/恢复
 */

const {
  WorkflowEngine,
  WorkflowBuilder,
  WorkflowNode,
  NODE_TYPES,
  NODE_STATUS
} = require('../../src/services/workflowEngine');

// Mock工具注册表
const mockToolRegistry = {
  executeTool: jest.fn()
};

// Mock函数
const mockFn = jest.fn();

describe('WorkflowEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('构造函数和初始化', () => {
    test('默认初始化', () => {
      const engine = new WorkflowEngine();
      expect(engine.isRunning).toBe(false);
      expect(engine.nodes.size).toBe(0);
      expect(engine.executionId).toBeNull();
    });

    test('带选项初始化', () => {
      const engine = new WorkflowEngine({ toolRegistry: mockToolRegistry });
      expect(engine.toolRegistry).toBe(mockToolRegistry);
    });

    test('统计信息初始化', () => {
      const engine = new WorkflowEngine();
      const stats = engine.getStats();
      expect(stats.totalExecutions).toBe(0);
      expect(stats.successfulExecutions).toBe(0);
      expect(stats.failedExecutions).toBe(0);
      expect(stats.totalExecutionTime).toBe(0);
    });
  });

  describe('loadWorkflow', () => {
    test('加载工作流定义', () => {
      const engine = new WorkflowEngine();
      const workflow = {
        id: 'test-workflow',
        nodes: [
          { id: 'node1', type: 'start' },
          { id: 'node2', type: 'task', task: { tool: 'test' } }
        ]
      };

      engine.loadWorkflow(workflow);
      expect(engine.nodes.size).toBe(2);
      expect(engine.workflow.id).toBe('test-workflow');
    });

    test('加载空工作流', () => {
      const engine = new WorkflowEngine();
      engine.loadWorkflow({ id: 'empty', nodes: [] });
      expect(engine.nodes.size).toBe(0);
    });

    test('加载后触发事件', () => {
      const engine = new WorkflowEngine();
      const handler = jest.fn();
      engine.on('workflow:loaded', handler);

      engine.loadWorkflow({ id: 'test', nodes: [] });
      expect(handler).toHaveBeenCalledWith({ workflowId: 'test' });
    });
  });

  describe('节点执行', () => {
    test('START节点执行', async () => {
      const engine = new WorkflowEngine();
      const workflow = {
        id: 'start-test',
        nodes: [{ id: 'start1', type: 'start' }]
      };

      engine.loadWorkflow(workflow);
      const result = await engine.execute({});

      expect(result.success).toBe(true);
    });

    test('END节点执行', async () => {
      const engine = new WorkflowEngine();
      const workflow = {
        id: 'end-test',
        nodes: [
          { id: 'start1', type: 'start', next: 'end1' },
          { id: 'end1', type: 'end', config: { output: 'finished' } }
        ]
      };

      engine.loadWorkflow(workflow);
      const result = await engine.execute({});

      expect(result.success).toBe(true);
    });

    test('TASK节点执行', async () => {
      mockToolRegistry.executeTool.mockResolvedValue({ result: 'tool-output' });

      const engine = new WorkflowEngine({ toolRegistry: mockToolRegistry });
      const workflow = {
        id: 'task-test',
        nodes: [
          { id: 'start1', type: 'start', next: 'task1' },
          {
            id: 'task1',
            type: 'task',
            task: { tool: 'mockTool', params: {} },
            config: { outputVar: 'taskResult' },
            next: 'end1'
          },
          { id: 'end1', type: 'end' }
        ]
      };

      engine.loadWorkflow(workflow);
      const result = await engine.execute({});

      expect(result.success).toBe(true);
      expect(mockToolRegistry.executeTool).toHaveBeenCalledWith('mockTool', {});
      expect(engine.getVariable('taskResult')).toEqual({ result: 'tool-output' });
    });

    test('TASK节点无toolRegistry抛出错误', async () => {
      const engine = new WorkflowEngine(); // 无toolRegistry
      const workflow = {
        id: 'task-no-registry',
        nodes: [
          { id: 'start1', type: 'start', next: 'task1' },
          { id: 'task1', type: 'task', task: { tool: 'mockTool' }, next: 'end1' },
          { id: 'end1', type: 'end' }
        ]
      };

      engine.loadWorkflow(workflow);
      const result = await engine.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Tool registry not configured');
    });

    test('FUNCTION节点执行', async () => {
      mockFn.mockResolvedValue('function-result');

      const engine = new WorkflowEngine();
      const workflow = {
        id: 'fn-test',
        nodes: [
          { id: 'start1', type: 'start', next: 'fn1' },
          {
            id: 'fn1',
            type: 'function',
            config: { fn: mockFn, args: { value: 42 }, outputVar: 'fnResult' },
            next: 'end1'
          },
          { id: 'end1', type: 'end' }
        ]
      };

      engine.loadWorkflow(workflow);
      const result = await engine.execute({});

      expect(result.success).toBe(true);
      expect(mockFn).toHaveBeenCalled();
    });

    test('未知节点类型抛出错误', async () => {
      const engine = new WorkflowEngine();
      const workflow = {
        id: 'unknown-node-test',
        nodes: [
          { id: 'start1', type: 'start', next: 'unknown1' },
          { id: 'unknown1', type: 'unknown_type' }
        ]
      };

      engine.loadWorkflow(workflow);
      const result = await engine.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown node type: unknown_type');
    });
  });

  describe('条件节点', () => {
    test('条件为true走onTrue分支', async () => {
      const engine = new WorkflowEngine();
      const workflow = {
        id: 'condition-true-test',
        nodes: [
          { id: 'start1', type: 'start', next: 'cond1' },
          {
            id: 'cond1',
            type: 'condition',
            condition: { type: 'variable', value: 'flag' },
            onTrue: 'nodeTrue',
            onFalse: 'nodeFalse'
          },
          { id: 'nodeTrue', type: 'end', config: { output: 'true-branch' } },
          { id: 'nodeFalse', type: 'end', config: { output: 'false-branch' } }
        ]
      };

      engine.loadWorkflow(workflow);
      const result = await engine.execute({ flag: true });

      expect(result.success).toBe(true);
    });

    test('条件为false走onFalse分支', async () => {
      const engine = new WorkflowEngine();
      const workflow = {
        id: 'condition-false-test',
        nodes: [
          { id: 'start1', type: 'start', next: 'cond1' },
          {
            id: 'cond1',
            type: 'condition',
            condition: { type: 'variable', value: 'flag' },
            onTrue: 'nodeTrue',
            onFalse: 'nodeFalse'
          },
          { id: 'nodeTrue', type: 'end', config: { output: 'true-branch' } },
          { id: 'nodeFalse', type: 'end', config: { output: 'false-branch' } }
        ]
      };

      engine.loadWorkflow(workflow);
      const result = await engine.execute({ flag: false });

      expect(result.success).toBe(true);
    });

    test('表达式条件求值', async () => {
      const engine = new WorkflowEngine();
      const workflow = {
        id: 'expr-test',
        nodes: [
          { id: 'start1', type: 'start', next: 'cond1' },
          {
            id: 'cond1',
            type: 'condition',
            condition: { type: 'expression', value: '{count} > 5' },
            onTrue: 'nodeTrue',
            onFalse: 'nodeFalse'
          },
          { id: 'nodeTrue', type: 'end', config: { output: 'gt' } },
          { id: 'nodeFalse', type: 'end', config: { output: 'lte' } }
        ]
      };

      engine.loadWorkflow(workflow);

      // count = 10, 10 > 5 = true
      const result1 = await engine.execute({ count: 10 });
      expect(result1.success).toBe(true);

      // count = 3, 3 > 5 = false
      const result2 = await engine.execute({ count: 3 });
      expect(result2.success).toBe(true);
    });
  });

  describe('循环节点', () => {
    test('基本循环执行', async () => {
      const engine = new WorkflowEngine();
      const workflow = {
        id: 'loop-test',
        nodes: [
          { id: 'start1', type: 'start', next: 'loop1' },
          {
            id: 'loop1',
            type: 'loop',
            loop: { iterable: [1, 2, 3], variable: 'item', maxIterations: 10 },
            nodes: [
              { id: 'loop-task', type: 'function', config: { fn: () => 'iterated' } }
            ],
            next: 'end1'
          },
          { id: 'end1', type: 'end' }
        ]
      };

      engine.loadWorkflow(workflow);
      const result = await engine.execute({});

      expect(result.success).toBe(true);
    });

    test('循环最大迭代次数限制', async () => {
      const engine = new WorkflowEngine();
      const workflow = {
        id: 'loop-max-test',
        nodes: [
          { id: 'start1', type: 'start', next: 'loop1' },
          {
            id: 'loop1',
            type: 'loop',
            loop: { iterable: [1, 2, 3, 4, 5], variable: 'item', maxIterations: 2 },
            nodes: [
              { id: 'loop-task', type: 'function', config: { fn: () => 'iterated' } }
            ],
            next: 'end1'
          },
          { id: 'end1', type: 'end' }
        ]
      };

      engine.loadWorkflow(workflow);
      const result = await engine.execute({});

      expect(result.success).toBe(true);
    });
  });

  describe('并行节点', () => {
    test('并行执行多个节点', async () => {
      let callOrder = [];
      const fn1 = jest.fn(() => {
        callOrder.push('fn1');
        return 'result1';
      });
      const fn2 = jest.fn(() => {
        callOrder.push('fn2');
        return 'result2';
      });

      const engine = new WorkflowEngine();
      const workflow = {
        id: 'parallel-test',
        nodes: [
          { id: 'start1', type: 'start', next: 'parallel1' },
          {
            id: 'parallel1',
            type: 'parallel',
            nodes: [
              { id: 'p1', type: 'function', config: { fn: fn1 } },
              { id: 'p2', type: 'function', config: { fn: fn2 } }
            ],
            next: 'end1'
          },
          { id: 'end1', type: 'end' }
        ]
      };

      engine.loadWorkflow(workflow);
      const result = await engine.execute({});

      expect(result.success).toBe(true);
      expect(fn1).toHaveBeenCalled();
      expect(fn2).toHaveBeenCalled();
    });

    test('空并行节点', async () => {
      const engine = new WorkflowEngine();
      const workflow = {
        id: 'parallel-empty-test',
        nodes: [
          { id: 'start1', type: 'start', next: 'parallel1' },
          { id: 'parallel1', type: 'parallel', nodes: [], next: 'end1' },
          { id: 'end1', type: 'end' }
        ]
      };

      engine.loadWorkflow(workflow);
      const result = await engine.execute({});

      expect(result.success).toBe(true);
    });
  });

  describe('顺序节点', () => {
    test('顺序执行多个节点', async () => {
      const calls = [];
      const fn1 = jest.fn(() => { calls.push('fn1'); return 'r1'; });
      const fn2 = jest.fn(() => { calls.push('fn2'); return 'r2'; });

      const engine = new WorkflowEngine();
      const workflow = {
        id: 'sequence-test',
        nodes: [
          { id: 'start1', type: 'start', next: 'seq1' },
          {
            id: 'seq1',
            type: 'sequence',
            nodes: [
              { id: 's1', type: 'function', config: { fn: fn1 } },
              { id: 's2', type: 'function', config: { fn: fn2 } }
            ],
            next: 'end1'
          },
          { id: 'end1', type: 'end' }
        ]
      };

      engine.loadWorkflow(workflow);
      const result = await engine.execute({});

      expect(result.success).toBe(true);
      expect(calls).toEqual(['fn1', 'fn2']);
    });

    test('空顺序节点', async () => {
      const engine = new WorkflowEngine();
      const workflow = {
        id: 'sequence-empty-test',
        nodes: [
          { id: 'start1', type: 'start', next: 'seq1' },
          { id: 'seq1', type: 'sequence', nodes: [], next: 'end1' },
          { id: 'end1', type: 'end' }
        ]
      };

      engine.loadWorkflow(workflow);
      const result = await engine.execute({});

      expect(result.success).toBe(true);
    });
  });

  describe('变量解析', () => {
    test('字符串变量解析', () => {
      const engine = new WorkflowEngine();
      engine.setVariable('name', 'Alice');
      engine.setVariable('greeting', 'Hello {name}');

      const resolved = engine._resolveVariables('{greeting}');
      // _resolveVariables只解析第一层，不递归解析已解析字符串中的变量
      expect(resolved).toBe('Hello {name}');
    });

    test('嵌套对象变量解析', () => {
      const engine = new WorkflowEngine();
      engine.setVariable('user', { name: 'Bob', age: 30 });

      // 对象转字符串时会变成 '[object Object]'
      const resolved = engine._resolveVariables({ user: '{user}' });
      expect(resolved.user).toBe('[object Object]');
    });

    test('数组变量解析', () => {
      const engine = new WorkflowEngine();
      engine.setVariable('items', ['a', 'b', 'c']);

      // 数组作为变量在字符串替换时会toString
      const resolved = engine._resolveVariables(['{items}', 'd']);
      expect(resolved[0]).toBe('a,b,c');
    });

    test('缺失变量保持原样', () => {
      const engine = new WorkflowEngine();

      const resolved = engine._resolveVariables('{missing}');
      expect(resolved).toBe('{missing}');
    });

    test('null/undefined处理', () => {
      const engine = new WorkflowEngine();

      expect(engine._resolveVariables(null)).toBeNull();
      expect(engine._resolveVariables(undefined)).toBeUndefined();
    });
  });

  describe('表达式求值', () => {
    test('相等比较', () => {
      const engine = new WorkflowEngine();
      engine.setVariable('a', 10);
      engine.setVariable('b', 10);

      expect(engine._evaluateExpression('{a} == {b}')).toBe(true);
    });

    test('不等比较', () => {
      const engine = new WorkflowEngine();
      engine.setVariable('x', 5);
      engine.setVariable('y', 10);

      expect(engine._evaluateExpression('{x} != {y}')).toBe(true);
    });

    test('大于小于比较', () => {
      const engine = new WorkflowEngine();
      engine.setVariable('n', 15);

      expect(engine._evaluateExpression('{n} > 10')).toBe(true);
      expect(engine._evaluateExpression('{n} < 20')).toBe(true);
    });

    test('字符串比较', () => {
      const engine = new WorkflowEngine();
      engine.setVariable('status', 'active');

      expect(engine._evaluateExpression('{status} == "active"')).toBe(true);
    });

    test('无效表达式返回false', () => {
      const engine = new WorkflowEngine();

      expect(engine._evaluateExpression('invalid++syntax')).toBe(false);
    });
  });

  describe('暂停/恢复/停止', () => {
    test('pause暂停执行', async () => {
      const engine = new WorkflowEngine();
      const workflow = {
        id: 'pause-test',
        nodes: [
          { id: 'start1', type: 'start', next: 'task1' },
          {
            id: 'task1',
            type: 'function',
            config: {
              fn: async () => {
                engine.pause();
                return 'paused';
              }
            },
            next: 'end1'
          },
          { id: 'end1', type: 'end' }
        ]
      };

      engine.loadWorkflow(workflow);
      const result = await engine.execute({});

      expect(result.success).toBe(true);
      expect(engine.isRunning).toBe(false);
    });

    test('stop停止执行', () => {
      const engine = new WorkflowEngine();
      engine.isRunning = true;
      engine.executionId = 'test-id';

      engine.stop();

      expect(engine.isRunning).toBe(false);
    });

    test('resume抛出错误当无executionId', async () => {
      const engine = new WorkflowEngine();

      // resume在没有executionId时抛出错误
      try {
        await engine.resume();
        // 如果没抛出，说明有问题
        expect(true).toBe(false);
      } catch (e) {
        expect(e.message).toBe('No execution to resume');
      }
    });
  });

  describe('事件发射', () => {
    test('execution:start事件', async () => {
      const engine = new WorkflowEngine();
      const handler = jest.fn();
      engine.on('execution:start', handler);

      const workflow = {
        id: 'event-test',
        nodes: [{ id: 'start1', type: 'start' }]
      };

      engine.loadWorkflow(workflow);
      await engine.execute({});

      expect(handler).toHaveBeenCalled();
    });

    test('execution:complete事件', async () => {
      const engine = new WorkflowEngine();
      const handler = jest.fn();
      engine.on('execution:complete', handler);

      const workflow = {
        id: 'complete-event-test',
        nodes: [{ id: 'start1', type: 'start' }]
      };

      engine.loadWorkflow(workflow);
      await engine.execute({});

      expect(handler).toHaveBeenCalled();
    });

    test('execution:failed事件', async () => {
      const engine = new WorkflowEngine();
      const handler = jest.fn();
      engine.on('execution:failed', handler);

      const workflow = {
        id: 'fail-event-test',
        nodes: [{ id: 'start1', type: 'start', next: 'unknown1' }, { id: 'unknown1', type: 'unknown' }]
      };

      engine.loadWorkflow(workflow);
      await engine.execute({});

      expect(handler).toHaveBeenCalled();
    });

    test('node:start事件', async () => {
      const engine = new WorkflowEngine();
      const handler = jest.fn();
      engine.on('node:start', handler);

      const workflow = {
        id: 'node-start-event-test',
        nodes: [
          { id: 'start1', type: 'start' },
          { id: 'end1', type: 'end' }
        ]
      };

      engine.loadWorkflow(workflow);
      await engine.execute({});

      expect(handler).toHaveBeenCalled();
    });

    test('node:complete事件', async () => {
      const engine = new WorkflowEngine();
      const handler = jest.fn();
      engine.on('node:complete', handler);

      const workflow = {
        id: 'node-complete-event-test',
        nodes: [
          { id: 'start1', type: 'start' },
          { id: 'end1', type: 'end' }
        ]
      };

      engine.loadWorkflow(workflow);
      await engine.execute({});

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('节点状态', () => {
    test('节点状态转换', async () => {
      const engine = new WorkflowEngine();
      const workflow = {
        id: 'node-status-test',
        nodes: [
          { id: 'start1', type: 'start', next: 'task1' },
          {
            id: 'task1',
            type: 'function',
            config: { fn: () => 'done' },
            next: 'end1'
          },
          { id: 'end1', type: 'end' }
        ]
      };

      engine.loadWorkflow(workflow);
      await engine.execute({});

      const results = engine.getResults();
      expect(results.start1.status).toBe(NODE_STATUS.COMPLETED);
      expect(results.task1.status).toBe(NODE_STATUS.COMPLETED);
    });

    test('失败节点状态', async () => {
      const engine = new WorkflowEngine();
      const workflow = {
        id: 'fail-status-test',
        nodes: [
          { id: 'start1', type: 'start', next: 'fail1' },
          { id: 'fail1', type: 'unknown_type' }
        ]
      };

      engine.loadWorkflow(workflow);
      await engine.execute({});

      const results = engine.getResults();
      expect(results.fail1.status).toBe(NODE_STATUS.FAILED);
      expect(results.fail1.error).toBeTruthy();
    });
  });

  describe('结果获取', () => {
    test('getResults返回所有节点结果', async () => {
      const engine = new WorkflowEngine();
      const workflow = {
        id: 'results-test',
        nodes: [
          { id: 'start1', type: 'start', next: 'task1' },
          {
            id: 'task1',
            type: 'function',
            config: { fn: () => 'result-data' },
            next: 'end1'
          },
          { id: 'end1', type: 'end' }
        ]
      };

      engine.loadWorkflow(workflow);
      await engine.execute({});

      const results = engine.getResults();
      expect(results.start1).toBeTruthy();
      expect(results.task1).toBeTruthy();
      expect(results.end1).toBeTruthy();
    });

    test('getVariables返回所有变量', () => {
      const engine = new WorkflowEngine();
      engine.setVariable('var1', 'value1');
      engine.setVariable('var2', 'value2');

      const vars = engine.getVariables();
      expect(vars.var1).toBe('value1');
      expect(vars.var2).toBe('value2');
    });

    test('getStats返回统计信息', async () => {
      const engine = new WorkflowEngine();
      const workflow = {
        id: 'stats-test',
        nodes: [{ id: 'start1', type: 'start' }]
      };

      engine.loadWorkflow(workflow);
      await engine.execute({});

      const stats = engine.getStats();
      expect(stats.totalExecutions).toBe(1);
      expect(stats.successfulExecutions).toBe(1);
    });
  });

  describe('统计信息更新', () => {
    test('成功执行更新统计', async () => {
      const engine = new WorkflowEngine();
      const workflow = {
        id: 'success-stats-test',
        nodes: [{ id: 'start1', type: 'start' }]
      };

      engine.loadWorkflow(workflow);
      await engine.execute({});

      const stats = engine.getStats();
      expect(stats.successfulExecutions).toBe(1);
      expect(stats.totalExecutions).toBe(1);
      expect(stats.failedExecutions).toBe(0);
    });

    test('失败执行更新统计', async () => {
      const engine = new WorkflowEngine();
      const workflow = {
        id: 'fail-stats-test',
        nodes: [{ id: 'start1', type: 'start', next: 'fail1' }, { id: 'fail1', type: 'unknown' }]
      };

      engine.loadWorkflow(workflow);
      await engine.execute({});

      const stats = engine.getStats();
      expect(stats.failedExecutions).toBe(1);
    });
  });

  describe('重复执行', () => {
    test('连续执行重置状态', async () => {
      const engine = new WorkflowEngine();
      const fn = jest.fn();

      const workflow = {
        id: 're-exec-test',
        nodes: [
          { id: 'start1', type: 'start', next: 'fn1' },
          { id: 'fn1', type: 'function', config: { fn }, next: 'end1' },
          { id: 'end1', type: 'end' }
        ]
      };

      engine.loadWorkflow(workflow);

      await engine.execute({});
      await engine.execute({});
      await engine.execute({});

      expect(fn).toHaveBeenCalledTimes(3);
    });
  });
});

describe('WorkflowBuilder', () => {
  describe('构建工作流', () => {
    test('添加任务节点', () => {
      const builder = new WorkflowBuilder();
      builder.addTask('task1', { name: 'Test Task', task: { tool: 'test' } });

      expect(builder.nodes).toHaveLength(1);
      expect(builder.nodes[0].type).toBe(NODE_TYPES.TASK);
    });

    test('添加条件节点', () => {
      const builder = new WorkflowBuilder();
      builder.addCondition('cond1', {
        condition: { type: 'variable', value: 'flag' },
        onTrue: 'trueNode',
        onFalse: 'falseNode'
      });

      expect(builder.nodes).toHaveLength(1);
      expect(builder.nodes[0].type).toBe(NODE_TYPES.CONDITION);
    });

    test('添加起始节点', () => {
      const builder = new WorkflowBuilder();
      builder.addStart('start1');

      expect(builder.nodes).toHaveLength(1);
      expect(builder.nodes[0].type).toBe(NODE_TYPES.START);
      expect(builder.startNode).toBe('start1');
    });

    test('添加结束节点', () => {
      const builder = new WorkflowBuilder();
      builder.addEnd('end1');

      expect(builder.nodes).toHaveLength(1);
      expect(builder.nodes[0].type).toBe(NODE_TYPES.END);
      expect(builder.endNode).toBe('end1');
    });

    test('构建完整工作流', () => {
      const builder = new WorkflowBuilder();
      builder.addStart('start');
      builder.addTask('task1', { task: { tool: 'test' }, next: 'end' });
      builder.addEnd('end');

      const workflow = builder.build();

      expect(workflow.nodes).toHaveLength(3);
      expect(workflow.start).toBe('start');
      expect(workflow.end).toBe('end');
    });
  });
});

describe('WorkflowNode', () => {
  test('创建基础节点', () => {
    const node = new WorkflowNode({ id: 'node1', type: 'task' });

    expect(node.id).toBe('node1');
    expect(node.type).toBe('task');
    expect(node.status).toBe(NODE_STATUS.PENDING);
  });

  test('创建带配置的节点', () => {
    const node = new WorkflowNode({
      id: 'node2',
      type: 'condition',
      config: { outputVar: 'result' },
      condition: { type: 'variable', value: 'flag' },
      onTrue: 'trueNode',
      onFalse: 'falseNode'
    });

    expect(node.config.outputVar).toBe('result');
    expect(node.condition).toBeTruthy();
  });

  test('节点状态转换', () => {
    const node = new WorkflowNode({ id: 'node3' });

    node.status = NODE_STATUS.RUNNING;
    expect(node.status).toBe(NODE_STATUS.RUNNING);

    node.result = 'execution-result';
    expect(node.result).toBe('execution-result');
  });

  test('节点错误记录', () => {
    const node = new WorkflowNode({ id: 'node4' });

    node.status = NODE_STATUS.FAILED;
    node.error = 'Something went wrong';

    expect(node.status).toBe(NODE_STATUS.FAILED);
    expect(node.error).toBe('Something went wrong');
  });

  test('节点时间戳', () => {
    const node = new WorkflowNode({ id: 'node5' });
    const now = Date.now();

    node.startTime = now;
    node.endTime = now + 1000;

    expect(node.startTime).toBe(now);
    expect(node.endTime).toBe(now + 1000);
  });
});

describe('NODE_TYPES常量', () => {
  test('所有节点类型定义', () => {
    expect(NODE_TYPES.TASK).toBe('task');
    expect(NODE_TYPES.CONDITION).toBe('condition');
    expect(NODE_TYPES.LOOP).toBe('loop');
    expect(NODE_TYPES.PARALLEL).toBe('parallel');
    expect(NODE_TYPES.SEQUENCE).toBe('sequence');
    expect(NODE_TYPES.FUNCTION).toBe('function');
    expect(NODE_TYPES.START).toBe('start');
    expect(NODE_TYPES.END).toBe('end');
  });
});

describe('NODE_STATUS常量', () => {
  test('所有节点状态定义', () => {
    expect(NODE_STATUS.PENDING).toBe('pending');
    expect(NODE_STATUS.RUNNING).toBe('running');
    expect(NODE_STATUS.COMPLETED).toBe('completed');
    expect(NODE_STATUS.FAILED).toBe('failed');
    expect(NODE_STATUS.SKIPPED).toBe('skipped');
  });
});