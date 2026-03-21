/**
 * ReAct Agent (Reasoning + Acting)
 * 推理行动Agent，支持思考-行动-观察循环
 */

const EventEmitter = require('events');

// Agent类型
const AgentType = {
  REACT: 'react',
  PLAN_EXECUTE: 'plan_execute',
  CODEACT: 'codeact',
  TEXT2SQL: 'text2sql'
};

// 思考步骤类型
const ThoughtType = {
  THOUGHT: 'thought',      // 推理
  ACTION: 'action',        // 行动
  OBSERVATION: 'observation', // 观察
  FINAL: 'final'           // 最终答案
};

class ReActAgent extends EventEmitter {
  constructor(options = {}) {
    super();

    this.name = options.name || 'ReAct Agent';
    this.maxIterations = options.maxIterations || 10;
    this.maxDepth = options.maxDepth || 5; // 递归深度限制

    // 工具注册表
    this.tools = new Map();
    this.toolRegistry = options.toolRegistry || null;

    // 状态
    this.state = {
      status: 'idle', // idle, thinking, acting, observing, completed, error
      iteration: 0,
      thoughts: [],
      currentThought: null,
      finalAnswer: null,
      error: null
    };

    // 提示词模板
    this.systemPrompt = options.systemPrompt || `你是一个ReAct (Reasoning + Acting) Agent。
你需要通过推理和行动来解决问题。

思考过程:
1. THOUGHT: 分析问题，进行推理
2. ACTION: 选择并执行工具
3. OBSERVATION: 观察行动结果
4. 重复直到得到答案

输出格式:
- 使用"Thought:"表示推理
- 使用"Action:"表示行动，格式为 action_name(param1=value1, param2=value2)
- 使用"Observation:"表示观察结果
- 使用"Answer:"表示最终答案`;
  }

  /**
   * 注册工具
   */
  registerTool(tool) {
    this.tools.set(tool.name, tool);
  }

  /**
   * 设置工具注册表
   */
  setToolRegistry(registry) {
    this.toolRegistry = registry;
  }

  /**
   * 执行Agent
   */
  async run(input, context = {}) {
    this.reset();
    this.state.status = 'running';
    this.emit('start', { input, context });

    const toolRegistry = this.toolRegistry || { get: (name) => this.tools.get(name), execute: async (name, args) => {
      const tool = this.tools.get(name);
      if (!tool) throw new Error(`Tool not found: ${name}`);
      return await tool.execute(args);
    }};

    try {
      // 构建初始消息
      let messages = [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: this._buildUserMessage(input, context) }
      ];

      // 思考-行动-观察循环
      while (this.state.iteration < this.maxIterations) {
        this.state.iteration++;

        // 1. 思考
        const thought = await this._think(messages);
        this.state.thoughts.push(thought);
        this.state.currentThought = thought;
        this.emit('thought', thought);

        // 检查是否是最终答案
        if (thought.type === ThoughtType.FINAL) {
          this.state.finalAnswer = thought.content;
          this.state.status = 'completed';
          this.emit('complete', { answer: thought.content, thoughts: this.state.thoughts });
          return { success: true, answer: thought.content, thoughts: this.state.thoughts };
        }

        // 2. 行动
        if (thought.type === ThoughtType.ACTION) {
          this.state.status = 'acting';
          this.emit('action', thought);

          const actionResult = await this._act(thought, toolRegistry);
          this.state.status = 'observing';
          this.emit('observation', { thought, result: actionResult });

          // 3. 添加观察结果到消息
          messages.push({
            role: 'assistant',
            content: `Thought: ${thought.content}\nAction: ${thought.action}\nObservation: ${actionResult}`
          });
        }
      }

      // 达到最大迭代次数
      this.state.status = 'completed';
      this.state.finalAnswer = this.state.thoughts[this.state.thoughts.length - 1]?.content || '达到最大迭代次数';
      return {
        success: true,
        answer: this.state.finalAnswer,
        thoughts: this.state.thoughts,
        truncated: true
      };

    } catch (error) {
      this.state.status = 'error';
      this.state.error = error.message;
      this.emit('error', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 思考步骤
   */
  async _think(messages) {
    // 简化实现：实际应该调用LLM
    // 这里返回模拟思考结果
    const lastMessage = messages[messages.length - 1];
    const content = lastMessage.content;

    // 简单的关键词检测来确定行动
    if (content.includes('搜索') || content.includes('search')) {
      return {
        type: ThoughtType.ACTION,
        content: '我需要搜索相关信息',
        action: 'web_search',
        actionParams: { query: this._extractQuery(content) }
      };
    }

    if (content.includes('计算') || content.includes('calculate')) {
      return {
        type: ThoughtType.ACTION,
        content: '我需要进行计算',
        action: 'calculator',
        actionParams: { expression: this._extractExpression(content) }
      };
    }

    // 默认返回最终答案
    return {
      type: ThoughtType.FINAL,
      content: `已处理: ${content.substring(0, 50)}...`
    };
  }

  /**
   * 行动步骤
   */
  async _act(thought, registry) {
    try {
      if (registry.execute) {
        return await registry.execute(thought.action, thought.actionParams);
      }

      const tool = this.tools.get(thought.action);
      if (!tool) {
        return { error: `Tool not found: ${thought.action}` };
      }
      return await tool.execute(thought.actionParams);
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * 构建用户消息
   */
  _buildUserMessage(input, context) {
    let message = typeof input === 'string' ? input : JSON.stringify(input);

    if (context.tools) {
      message += `\n\n可用工具: ${context.tools.join(', ')}`;
    }

    return message;
  }

  /**
   * 提取搜索查询
   */
  _extractQuery(content) {
    const match = content.match(/搜索?[：:](.+)/i) || content.match(/search[:\s]+(.+)/i);
    return match ? match[1].trim() : content;
  }

  /**
   * 提取计算表达式
   */
  _extractExpression(content) {
    const match = content.match(/计算?[：:](.+)/i) || content.match(/(\d+[\s+\-*/()]+(?:\d+[\s+\-*/()]+)*\d+)/);
    return match ? match[1].trim() : '0';
  }

  /**
   * 重置状态
   */
  reset() {
    this.state = {
      status: 'idle',
      iteration: 0,
      thoughts: [],
      currentThought: null,
      finalAnswer: null,
      error: null
    };
  }

  /**
   * 获取状态
   */
  getState() {
    return {
      ...this.state,
      tools: Array.from(this.tools.keys())
    };
  }

  /**
   * 暂停执行
   */
  pause() {
    if (this.state.status === 'running') {
      this.state.status = 'paused';
      this.emit('pause');
    }
  }

  /**
   * 恢复执行
   */
  resume() {
    if (this.state.status === 'paused') {
      this.state.status = 'running';
      this.emit('resume');
    }
  }
}

/**
 * Plan-Execute Agent
 * 计划执行Agent，支持任务分解和逐步执行
 */
class PlanExecuteAgent extends EventEmitter {
  constructor(options = {}) {
    super();

    this.name = options.name || 'Plan-Execute Agent';
    this.maxSteps = options.maxSteps || 20;
    this.maxPlanDepth = options.maxPlanDepth || 3;

    this.tools = new Map();
    this.toolRegistry = options.toolRegistry || null;

    this.state = {
      status: 'idle',
      plan: null,
      currentStep: 0,
      executedSteps: [],
      results: [],
      finalAnswer: null,
      error: null
    };

    this.systemPrompt = options.systemPrompt || `你是一个Plan-Execute Agent。
你需要将复杂任务分解为步骤计划，然后逐步执行。

流程:
1. 分析任务，制定计划步骤
2. 按顺序执行每个步骤
3. 根据执行结果调整计划
4. 返回最终结果`;
  }

  registerTool(tool) {
    this.tools.set(tool.name, tool);
  }

  setToolRegistry(registry) {
    this.toolRegistry = registry;
  }

  async run(input, context = {}) {
    this.reset();
    this.state.status = 'running';
    this.emit('start', { input, context });

    try {
      // 1. 制定计划
      this.emit('planning');
      const plan = await this._createPlan(input, context);
      this.state.plan = plan;
      this.emit('planCreated', plan);

      // 2. 执行计划
      const toolRegistry = this.toolRegistry || {
        execute: async (name, args) => {
          const tool = this.tools.get(name);
          if (!tool) throw new Error(`Tool not found: ${name}`);
          return await tool.execute(args);
        }
      };

      for (let i = 0; i < plan.steps.length; i++) {
        if (this.state.status === 'paused') {
          await new Promise(resolve => this.once('resume', resolve));
        }

        this.state.currentStep = i;
        const step = plan.steps[i];

        this.emit('stepStart', { step, index: i });

        // 执行步骤
        const result = await this._executeStep(step, toolRegistry);
        this.state.executedSteps.push({ step, result });
        this.state.results.push(result);

        this.emit('stepComplete', { step, result, index: i });

        // 检查是否需要调整计划
        if (result.needsReplan) {
          this.emit('replanning');
          const newPlan = await this._replan(plan, this.state.results);
          this.state.plan = newPlan;
          this.emit('planUpdated', newPlan);
        }
      }

      // 3. 生成最终答案
      this.state.finalAnswer = await this._generateAnswer(this.state.results);
      this.state.status = 'completed';
      this.emit('complete', { answer: this.state.finalAnswer, results: this.state.results });

      return {
        success: true,
        answer: this.state.finalAnswer,
        plan: this.state.plan,
        results: this.state.results
      };

    } catch (error) {
      this.state.status = 'error';
      this.state.error = error.message;
      this.emit('error', error);
      return { success: false, error: error.message };
    }
  }

  async _createPlan(input, context) {
    // 简化实现：实际应该调用LLM来分解任务
    const steps = [
      { id: 1, action: 'analyze', description: '分析任务', status: 'pending' },
      { id: 2, action: 'execute', description: '执行主要操作', status: 'pending' },
      { id: 3, action: 'finalize', description: '生成最终结果', status: 'pending' }
    ];

    return { steps, originalInput: input };
  }

  async _executeStep(step, registry) {
    try {
      const result = { stepId: step.id, action: step.action, success: true };

      switch (step.action) {
        case 'analyze':
          result.output = { analysis: '任务分析完成' };
          break;
        case 'execute':
          if (step.tool && step.params) {
            result.output = await registry.execute(step.tool, step.params);
          } else {
            result.output = { message: '步骤执行完成' };
          }
          break;
        case 'finalize':
          result.output = { message: '结果已生成' };
          break;
        default:
          result.output = { message: `执行动作: ${step.action}` };
      }

      return result;
    } catch (error) {
      return { stepId: step.id, action: step.action, success: false, error: error.message };
    }
  }

  async _replan(plan, results) {
    // 简化实现：根据执行结果调整计划
    return plan;
  }

  async _generateAnswer(results) {
    return results.map(r => r.output).filter(Boolean).join('\n');
  }

  reset() {
    this.state = {
      status: 'idle',
      plan: null,
      currentStep: 0,
      executedSteps: [],
      results: [],
      finalAnswer: null,
      error: null
    };
  }

  getState() {
    return { ...this.state };
  }

  pause() {
    if (this.state.status === 'running') {
      this.state.status = 'paused';
      this.emit('pause');
    }
  }

  resume() {
    if (this.state.status === 'paused') {
      this.state.status = 'running';
      this.emit('resume');
    }
  }
}

/**
 * CodeAct Agent
 * 代码执行Agent，支持安全沙箱代码运行
 */
class CodeActAgent extends EventEmitter {
  constructor(options = {}) {
    super();

    this.name = options.name || 'CodeAct Agent';
    this.maxIterations = options.maxIterations || 5;
    this.sandboxTimeout = options.sandboxTimeout || 30000;

    this.tools = new Map();

    this.state = {
      status: 'idle',
      iteration: 0,
      code: null,
      output: null,
      error: null,
      logs: []
    };

    this.systemPrompt = options.systemPrompt || `你是一个CodeAct Agent。
你可以编写和执行代码来完成任务。

能力:
- 编写Python/JS代码
- 执行代码并获取结果
- 分析错误并修复代码

输出格式:
- 使用"Code:"标记代码块
- 使用"Answer:"标记最终答案`;
  }

  registerTool(tool) {
    this.tools.set(tool.name, tool);
  }

  async run(input, context = {}) {
    this.reset();
    this.state.status = 'running';
    this.emit('start', { input, context });

    try {
      // 提取代码或生成代码
      let code = this._extractCode(input);

      for (let i = 0; i < this.maxIterations; i++) {
        this.state.iteration = i + 1;
        this.state.code = code;

        this.emit('executing', { code, iteration: this.state.iteration });

        // 执行代码
        const result = await this._executeCode(code);

        this.state.output = result.output;
        this.state.logs.push({ iteration: this.state.iteration, code, result });

        if (result.success) {
          this.state.status = 'completed';
          this.emit('complete', { output: result.output, logs: this.state.logs });
          return { success: true, output: result.output, logs: this.state.logs };
        }

        // 错误处理：尝试修复
        if (result.error && i < this.maxIterations - 1) {
          code = this._fixCode(code, result.error);
          this.emit('error', { error: result.error, fixed: code });
        }
      }

      this.state.status = 'completed';
      return { success: false, error: '达到最大迭代次数', logs: this.state.logs };

    } catch (error) {
      this.state.status = 'error';
      this.state.error = error.message;
      this.emit('error', error);
      return { success: false, error: error.message };
    }
  }

  _extractCode(input) {
    if (typeof input === 'string') {
      // 尝试提取代码块
      const codeMatch = input.match(/```(?:\w+)?\n([\s\S]*?)```/);
      if (codeMatch) return codeMatch[1];

      // 如果没有代码块，生成代码
      return `print("${input}")`;
    }
    return JSON.stringify(input);
  }

  async _executeCode(code) {
    // 简化实现：应该使用沙箱执行
    try {
      // 简单的模拟执行
      const vm = require('vm');
      const sandbox = { console: { log: (...args) => args.join(' ') } };
      vm.createContext(sandbox);
      vm.runInContext(code, sandbox, { timeout: this.sandboxTimeout });

      return { success: true, output: 'Code executed' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  _fixCode(code, error) {
    // 简化实现：实际应该调用LLM来修复代码
    return code;
  }

  reset() {
    this.state = {
      status: 'idle',
      iteration: 0,
      code: null,
      output: null,
      error: null,
      logs: []
    };
  }

  getState() {
    return { ...this.state };
  }
}

/**
 * Text2SQL Agent
 * 自然语言转SQL查询Agent
 */
class Text2SQLAgent extends EventEmitter {
  constructor(options = {}) {
    super();

    this.name = options.name || 'Text2SQL Agent';
    this.maxIterations = options.maxIterations || 3;

    // 数据库连接配置
    this.dbConfig = options.dbConfig || null;

    this.state = {
      status: 'idle',
      iteration: 0,
      question: null,
      sql: null,
      results: null,
      error: null
    };

    this.systemPrompt = options.systemPrompt || `你是一个Text2SQL Agent。
将自然语言问题转换为SQL查询。

输入: 自然语言问题
输出: SQL语句

注意:
- 考虑表结构
- 使用正确的SQL语法
- 处理可能的安全问题`;
  }

  async run(input, context = {}) {
    this.reset();
    this.state.status = 'running';
    this.state.question = typeof input === 'string' ? input : JSON.stringify(input);
    this.emit('start', { input: this.state.question, context });

    try {
      // 1. 分析问题，生成SQL
      this.emit('generating');
      const sql = await this._generateSQL(this.state.question, context);
      this.state.sql = sql;
      this.emit('sqlGenerated', sql);

      // 2. 验证SQL
      const validation = this._validateSQL(sql);
      if (!validation.valid) {
        throw new Error(`SQL validation failed: ${validation.error}`);
      }

      // 3. 执行SQL（如果配置了数据库）
      if (this.dbConfig) {
        const results = await this._executeSQL(sql);
        this.state.results = results;
        this.emit('results', results);
      }

      this.state.status = 'completed';
      this.emit('complete', { sql: this.state.sql, results: this.state.results });

      return {
        success: true,
        sql: this.state.sql,
        results: this.state.results
      };

    } catch (error) {
      this.state.status = 'error';
      this.state.error = error.message;
      this.emit('error', error);
      return { success: false, error: error.message };
    }
  }

  async _generateSQL(question, context) {
    // 简化实现：实际应该调用LLM
    const tables = context.tables || [];

    // 简单的关键词匹配
    if (question.includes('用户') || question.includes('user')) {
      return 'SELECT * FROM users LIMIT 10';
    }

    if (question.includes('订单') || question.includes('order')) {
      return 'SELECT * FROM orders LIMIT 10';
    }

    return `-- Generated SQL for: ${question}\nSELECT * FROM unknown_table LIMIT 10`;
  }

  _validateSQL(sql) {
    // 简单验证：检查危险操作
    const dangerous = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER'];
    for (const keyword of dangerous) {
      if (sql.toUpperCase().includes(keyword)) {
        return { valid: false, error: `Dangerous operation: ${keyword}` };
      }
    }
    return { valid: true };
  }

  async _executeSQL(sql) {
    // 简化实现：实际应该连接数据库执行
    return { message: 'Database not configured', sql };
  }

  setDBConfig(config) {
    this.dbConfig = config;
  }

  reset() {
    this.state = {
      status: 'idle',
      iteration: 0,
      question: null,
      sql: null,
      results: null,
      error: null
    };
  }

  getState() {
    return { ...this.state };
  }
}

/**
 * Agent工厂
 */
class AgentFactory {
  static create(type, options) {
    switch (type) {
      case AgentType.REACT:
        return new ReActAgent(options);
      case AgentType.PLAN_EXECUTE:
        return new PlanExecuteAgent(options);
      case AgentType.CODEACT:
        return new CodeActAgent(options);
      case AgentType.TEXT2SQL:
        return new Text2SQLAgent(options);
      default:
        throw new Error(`Unknown agent type: ${type}`);
    }
  }
}

module.exports = {
  ReActAgent,
  PlanExecuteAgent,
  CodeActAgent,
  Text2SQLAgent,
  AgentFactory,
  AgentType,
  ThoughtType
};
