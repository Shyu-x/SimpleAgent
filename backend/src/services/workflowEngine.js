/**
 * 动态工作流引擎
 * 支持条件分支、循环迭代、子任务依赖管理
 */

const EventEmitter = require('events');
const AppError = require('../common/errors/AppError');

// 工作流节点类型
const NODE_TYPES = {
  TASK: 'task',
  CONDITION: 'condition',
  LOOP: 'loop',
  PARALLEL: 'parallel',
  SEQUENCE: 'sequence',
  FUNCTION: 'function',
  START: 'start',
  END: 'end'
};

// 节点状态
const NODE_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped'
};

class WorkflowNode {
  constructor(config) {
    this.id = config.id;
    this.type = config.type || NODE_TYPES.TASK;
    this.name = config.name || config.id;
    this.config = config.config || {};

    // 任务配置
    this.task = config.task || null;
    this.condition = config.condition || null;
    this.loop = config.loop || null;
    this.nodes = config.nodes || [];

    // 连接
    this.next = config.next || null;
    this.onTrue = config.onTrue || null;
    this.onFalse = config.onFalse || null;

    // 状态
    this.status = NODE_STATUS.PENDING;
    this.result = null;
    this.error = null;
    this.startTime = null;
    this.endTime = null;
  }
}

class WorkflowEngine extends EventEmitter {
  constructor(options = {}) {
    super();

    // 工作流定义
    this.workflow = null;
    this.nodes = new Map();

    // 执行状态
    this.executionId = null;
    this.isRunning = false;
    this.currentNodeId = null;

    // 结果
    this.results = new Map();
    this.variables = new Map();

    // 统计
    this.stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      totalExecutionTime: 0
    };

    // 工具注册（用于执行任务节点）
    this.toolRegistry = options.toolRegistry || null;
  }

  /**
   * 加载工作流定义
   */
  loadWorkflow(workflow) {
    this.workflow = workflow;
    this.nodes.clear();

    // 解析节点
    if (workflow.nodes) {
      for (const nodeConfig of workflow.nodes) {
        const node = new WorkflowNode(nodeConfig);
        this.nodes.set(node.id, node);
      }
    }

    this.emit('workflow:loaded', { workflowId: workflow.id });
    return this;
  }

  /**
   * 执行工作流
   */
  async execute(context = {}, startNodeId = null) {
    if (this.isRunning) {
      throw AppError.internalError('Workflow already running');
    }

    this.executionId = `wf_${Date.now()}_${Math.random()}`;
    this.isRunning = true;
    this.results.clear();
    this.variables.clear();

    // 初始化变量
    this.variables.set('context', context);
    this.variables.set('_context', context);

    const startTime = Date.now();
    this.emit('execution:start', { executionId: this.executionId });

    try {
      // 找到起始节点
      let currentNode = this._findStartNode();

      if (startNodeId) {
        currentNode = this.nodes.get(startNodeId);
        if (!currentNode) {
          throw AppError.notFound(`Start node ${startNodeId}`);
        }
      }

      // 执行节点链
      while (currentNode && this.isRunning) {
        this.currentNodeId = currentNode.id;

        const result = await this._executeNode(currentNode);
        this.results.set(currentNode.id, result);

        // 检查是否继续
        if (!result.continue) {
          break;
        }

        // 获取下一个节点
        currentNode = this._getNextNode(currentNode, result);
      }

      // 完成
      this.stats.successfulExecutions++;
      const executionTime = Date.now() - startTime;
      this.stats.totalExecutionTime += executionTime;

      this.emit('execution:complete', {
        executionId: this.executionId,
        results: this.getResults(),
        variables: this.getVariables(),
        duration: executionTime
      });

      return {
        success: true,
        executionId: this.executionId,
        results: this.getResults(),
        variables: this.getVariables(),
        duration: executionTime
      };

    } catch (error) {
      this.stats.failedExecutions++;
      const executionTime = Date.now() - startTime;

      this.emit('execution:failed', {
        executionId: this.executionId,
        error: error.message,
        currentNode: this.currentNodeId,
        duration: executionTime
      });

      return {
        success: false,
        executionId: this.executionId,
        error: error.message,
        currentNode: this.currentNodeId,
        results: this.getResults(),
        duration: executionTime
      };

    } finally {
      this.isRunning = false;
      this.stats.totalExecutions++;
    }
  }

  /**
   * 暂停执行
   */
  pause() {
    if (this.isRunning) {
      this.isRunning = false;
      this.emit('execution:paused', { executionId: this.executionId });
    }
  }

  /**
   * 恢复执行
   */
  async resume() {
    if (!this.executionId) {
      throw AppError.internalError('No execution to resume');
    }

    this.isRunning = true;
    this.emit('execution:resumed', { executionId: this.executionId });

    // 从暂停的地方继续
    // 注意：这需要更复杂的状态管理
  }

  /**
   * 停止执行
   */
  stop() {
    this.isRunning = false;
    this.emit('execution:stopped', { executionId: this.executionId });
  }

  /**
   * 执行单个节点
   */
  async _executeNode(node) {
    node.status = NODE_STATUS.RUNNING;
    node.startTime = Date.now();

    this.emit('node:start', { nodeId: node.id, nodeType: node.type });

    try {
      let result;

      switch (node.type) {
        case NODE_TYPES.START:
          result = { continue: true, output: null };
          break;

        case NODE_TYPES.END:
          result = { continue: false, output: node.config.output || null };
          break;

        case NODE_TYPES.TASK:
          result = await this._executeTask(node);
          break;

        case NODE_TYPES.CONDITION:
          result = await this._executeCondition(node);
          break;

        case NODE_TYPES.LOOP:
          result = await this._executeLoop(node);
          break;

        case NODE_TYPES.PARALLEL:
          result = await this._executeParallel(node);
          break;

        case NODE_TYPES.SEQUENCE:
          result = await this._executeSequence(node);
          break;

        case NODE_TYPES.FUNCTION:
          result = await this._executeFunction(node);
          break;

        default:
          throw AppError.internalError(`Unknown node type: ${node.type}`);
      }

      node.status = NODE_STATUS.COMPLETED;
      node.result = result.output;
      node.endTime = Date.now();

      this.emit('node:complete', { nodeId: node.id, result: result.output });

      return result;

    } catch (error) {
      node.status = NODE_STATUS.FAILED;
      node.error = error.message;
      node.endTime = Date.now();

      this.emit('node:failed', { nodeId: node.id, error: error.message });

      throw error;
    }
  }

  /**
   * 执行任务节点
   */
  async _executeTask(node) {
    if (!this.toolRegistry) {
      throw AppError.internalError('Tool registry not configured');
    }

    const { tool, params, expression } = node.task || {};

    if (!tool) {
      throw AppError.validationError('tool configuration', 'Task node missing tool configuration');
    }

    // 解析参数
    const resolvedParams = this._resolveVariables(params || {});

    // 执行工具
    const result = await this.toolRegistry.executeTool(tool, resolvedParams);

    // 设置变量
    if (node.config.outputVar) {
      this.variables.set(node.config.outputVar, result);
    }

    return {
      continue: true,
      output: result
    };
  }

  /**
   * 执行条件节点
   */
  async _executeCondition(node) {
    const condition = node.condition;

    if (!condition) {
      throw AppError.validationError('condition configuration', 'Condition node missing condition configuration');
    }

    // 解析条件表达式
    const result = await this._evaluateCondition(condition);

    return {
      continue: true,
      output: result,
      branch: result ? 'true' : 'false'
    };
  }

  /**
   * 执行循环节点
   */
  async _executeLoop(node) {
    const loop = node.loop || {};
    const maxIterations = loop.maxIterations || 10;
    const iterable = this._resolveVariables(loop.iterable) || [];

    const results = [];

    for (let i = 0; i < Math.min(iterable.length, maxIterations); i++) {
      if (!this.isRunning) break;

      // 设置循环变量
      this.variables.set(loop.variable || 'item', iterable[i]);
      this.variables.set(loop.indexVar || 'index', i);

      // 执行循环体
      if (node.nodes && node.nodes.length > 0) {
        for (const nodeConfig of node.nodes) {
          const loopNode = new WorkflowNode(nodeConfig);
          const result = await this._executeNode(loopNode);
          results.push(result);

          if (result.break) {
            break;
          }
        }
      }
    }

    return {
      continue: true,
      output: results
    };
  }

  /**
   * 执行并行节点
   */
  async _executeParallel(node) {
    if (!node.nodes || node.nodes.length === 0) {
      return { continue: true, output: [] };
    }

    // 创建并行执行
    const tasks = node.nodes.map(nodeConfig => {
      return async () => {
        const parallelNode = new WorkflowNode(nodeConfig);
        return await this._executeNode(parallelNode);
      };
    });

    // 并行执行
    const results = await Promise.all(
      tasks.map(t => t().catch(e => ({ error: e.message })))
    );

    return {
      continue: true,
      output: results
    };
  }

  /**
   * 执行顺序节点
   */
  async _executeSequence(node) {
    const results = [];

    for (const nodeConfig of node.nodes || []) {
      if (!this.isRunning) break;

      const seqNode = new WorkflowNode(nodeConfig);
      const result = await this._executeNode(seqNode);
      results.push(result);

      if (result.break) {
        break;
      }
    }

    return {
      continue: true,
      output: results
    };
  }

  /**
   * 执行函数节点
   */
  async _executeFunction(node) {
    const { fn, args } = node.config;

    if (!fn) {
      throw AppError.validationError('function configuration', 'Function node missing function configuration');
    }

    // 解析参数
    const resolvedArgs = this._resolveVariables(args || {});

    // 执行函数
    let result;
    if (typeof fn === 'function') {
      result = await fn(resolvedArgs, this.variables);
    } else {
      throw AppError.internalError('Invalid function configuration');
    }

    // 设置输出变量
    if (node.config.outputVar) {
      this.variables.set(node.config.outputVar, result);
    }

    return {
      continue: true,
      output: result
    };
  }

  /**
   * 评估条件
   */
  async _evaluateCondition(condition) {
    const { type, value } = condition;

    if (type === 'variable') {
      const varValue = this.variables.get(value);
      return !!varValue;
    }

    if (type === 'expression') {
      // 简单表达式求值
      return this._evaluateExpression(value);
    }

    if (type === 'function') {
      const fn = condition.fn;
      const args = this._resolveVariables(condition.args || {});
      return await fn(args, this.variables);
    }

    // 默认返回true
    return true;
  }

  /**
   * 安全表达式求值 - 使用有限数学运算子集
   * 避免使用 new Function()，改用安全的 AST 解析
   */
  _evaluateExpression(expr) {
    // 安全起见，只支持简单的比较和基本数学运算
    const varPattern = /\{(\w+)\}/g;
    let resolvedExpr = expr.replace(varPattern, (match, varName) => {
      const value = this.variables.get(varName);
      if (value === null || value === undefined) {
        return 'null';
      }
      if (typeof value === 'string') {
        // 转义字符串中的特殊字符，防止注入
        const escaped = value
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/'/g, "\\'")
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r');
        return `"${escaped}"`;
      }
      return String(value);
    });

    // 使用安全的表达式解析器替代 new Function()
    try {
      return this._safeEval(resolvedExpr);
    } catch {
      return false;
    }
  }

  /**
   * 安全表达式求值器 - 仅支持基本比较和数学运算
   * 白名单方式：只允许预定义的运算符和函数
   */
  _safeEval(expr) {
    // 清理空白字符
    const cleaned = expr.trim();

    // 预定义的安全常量
    const SAFE_CONSTANTS = {
      'true': true,
      'false': false,
      'null': null,
      'undefined': undefined,
      'Math.PI': Math.PI,
      'Math.E': Math.E,
      'Infinity': Infinity,
      'NaN': NaN
    };

    // 如果是常量，直接返回
    if (SAFE_CONSTANTS[cleaned] !== undefined) {
      return SAFE_CONSTANTS[cleaned];
    }

    // 安全比较运算符模式
    const comparisonPattern = /^([\w.]+)\s*(===|==|!==|!=|>=|<=|>|<)\s*([\w.'"]+)$/;
    const match = cleaned.match(comparisonPattern);

    if (match) {
      const [, left, op, right] = match;

      // 解析值
      const leftVal = this._parseValue(left);
      const rightVal = this._parseValue(right);

      // 执行比较
      switch (op) {
        case '===': return leftVal === rightVal;
        case '==': return leftVal == rightVal;
        case '!==': return leftVal !== rightVal;
        case '!=': return leftVal != rightVal;
        case '>=': return leftVal >= rightVal;
        case '<=': return leftVal <= rightVal;
        case '>': return leftVal > rightVal;
        case '<': return leftVal < rightVal;
      }
    }

    // 如果不匹配安全模式，拒绝执行
    return false;
  }

  /**
   * 安全解析值 - 仅支持数字、布尔和简单标识符
   */
  _parseValue(val) {
    const trimmed = val.trim();

    // 数字
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return parseFloat(trimmed);
    }

    // 布尔
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;
    if (trimmed === 'undefined') return undefined;

    // 安全常量
    if (trimmed === 'Math.PI') return Math.PI;
    if (trimmed === 'Math.E') return Math.E;

    // 变量引用（从 variables Map 获取）
    const varVal = this.variables.get(trimmed);
    if (varVal !== undefined) {
      return varVal;
    }

    // 带引号的字符串
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }

    return trimmed;
  }

  /**
   * 解析变量
   */
  _resolveVariables(obj) {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      // 替换变量占位符
      return obj.replace(/\{(\w+)\}/g, (match, varName) => {
        return this.variables.get(varName) ?? match;
      });
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this._resolveVariables(item));
    }

    if (typeof obj === 'object') {
      const resolved = {};
      for (const [key, value] of Object.entries(obj)) {
        resolved[key] = this._resolveVariables(value);
      }
      return resolved;
    }

    return obj;
  }

  /**
   * 查找起始节点
   */
  _findStartNode() {
    for (const node of this.nodes.values()) {
      if (node.type === NODE_TYPES.START) {
        return node;
      }
    }

    // 如果没有显式的START节点，返回第一个节点
    return this.nodes.values().next().value || null;
  }

  /**
   * 获取下一个节点
   */
  _getNextNode(node, result) {
    // 根据节点类型和结果确定下一个节点
    if (node.type === NODE_TYPES.CONDITION) {
      const branch = result.branch === 'true' ? node.onTrue : node.onFalse;
      if (branch) {
        return this.nodes.get(branch);
      }
      return node.next ? this.nodes.get(node.next) : null;
    }

    if (node.type === NODE_TYPES.LOOP) {
      // 循环节点执行完子节点后继续
      return node.next ? this.nodes.get(node.next) : null;
    }

    if (node.type === NODE_TYPES.END) {
      return null;
    }

    return node.next ? this.nodes.get(node.next) : null;
  }

  /**
   * 获取结果
   */
  getResults() {
    const results = {};
    for (const [nodeId, node] of this.nodes) {
      results[nodeId] = {
        status: node.status,
        result: node.result,
        error: node.error,
        duration: node.endTime - node.startTime
      };
    }
    return results;
  }

  /**
   * 获取变量
   */
  getVariables() {
    return Object.fromEntries(this.variables);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 设置变量
   */
  setVariable(name, value) {
    this.variables.set(name, value);
  }

  /**
   * 获取变量
   */
  getVariable(name) {
    return this.variables.get(name);
  }
}

/**
 * 创建工作流构建器
 */
class WorkflowBuilder {
  constructor() {
    this.nodes = [];
    this.startNode = null;
    this.endNode = null;
  }

  addTask(id, config) {
    this.nodes.push({
      id,
      type: NODE_TYPES.TASK,
      name: config.name || id,
      task: config.task,
      next: config.next
    });
    return this;
  }

  addCondition(id, config) {
    this.nodes.push({
      id,
      type: NODE_TYPES.CONDITION,
      name: config.name || id,
      condition: config.condition,
      onTrue: config.onTrue,
      onFalse: config.onFalse,
      next: config.next
    });
    return this;
  }

  addStart(id) {
    this.startNode = id;
    this.nodes.push({
      id,
      type: NODE_TYPES.START,
      name: 'Start',
      next: null
    });
    return this;
  }

  addEnd(id) {
    this.endNode = id;
    this.nodes.push({
      id,
      type: NODE_TYPES.END,
      name: 'End'
    });
    return this;
  }

  build() {
    return {
      id: `workflow_${Date.now()}`,
      nodes: this.nodes,
      start: this.startNode,
      end: this.endNode
    };
  }
}

module.exports = {
  WorkflowEngine,
  WorkflowBuilder,
  WorkflowNode,
  NODE_TYPES,
  NODE_STATUS
};
