/**
 * Multi-Agent 协作系统
 * 参考 CrewAI 设计理念
 * 实现多Agent协作、任务分配和工作流编排
 */

/**
 * Agent 定义
 */
class Agent {
  constructor(config) {
    this.id = config.id || `agent_${Date.now()}`;
    this.role = config.role;           // 角色名称
    this.goal = config.goal;           // 目标
    this.backstory = config.backstory; // 背景故事
    this.tools = config.tools || [];   // 可用工具
    this.provider = config.provider;   // LLM 提供商
    this.model = config.model;         // 模型
    this.verbose = config.verbose || false;
  }

  /**
   * 生成 Agent 描述
   */
  getDescription() {
    return `
Role: ${this.role}
Goal: ${this.goal}
Backstory: ${this.backstory}
    `.trim();
  }
}

/**
 * Task 定义
 */
class Task {
  constructor(config) {
    this.id = config.id || `task_${Date.now()}`;
    this.description = config.description;     // 任务描述
    this.expectedOutput = config.expectedOutput; // 期望输出
    this.agent = config.agent;                  // 执行 Agent
    this.context = config.context || [];      // 上下文依赖
    this.tools = config.tools || [];          // 可用工具
  }

  /**
   * 生成 Task 提示
   */
  getPrompt() {
    let prompt = this.description;
    if (this.expectedOutput) {
      prompt += `\n\nExpected Output: ${this.expectedOutput}`;
    }
    if (this.context.length > 0) {
      prompt += `\n\nContext:\n${this.context.join('\n\n')}`;
    }
    return prompt;
  }
}

/**
 * Crew 协作管理器
 */
class Crew {
  constructor(config) {
    this.id = config.id || `crew_${Date.now()}`;
    this.agents = config.agents || [];  // Agent 列表
    this.tasks = config.tasks || [];      // Task 列表
    this.process = config.process || 'sequential'; // sequential | hierarchical
    this.verbose = config.verbose || false;
    this.results = new Map(); // 任务结果
  }

  /**
   * 添加 Agent
   */
  addAgent(agent) {
    this.agents.push(agent);
    return this;
  }

  /**
   * 添加 Task
   */
  addTask(task) {
    this.tasks.push(task);
    return this;
  }

  /**
   * 按顺序执行任务
   */
  async executeSequential(llmClient) {
    const results = [];

    for (const task of this.tasks) {
      this.log(`Executing task: ${task.description}`);

      // 构建 prompt
      let prompt = task.getPrompt();

      // 添加上下文（之前任务的结果）
      if (results.length > 0) {
        prompt += `\n\nPrevious results:\n${results.join('\n\n')}`;
      }

      try {
        // 调用 LLM
        const response = await llmClient.complete({
          prompt,
          agent: task.agent,
          tools: task.tools
        });

        results.push(response);
        this.results.set(task.id, response);

        this.log(`Task completed: ${task.id}`);
      } catch (error) {
        this.log(`Task failed: ${error.message}`);
        results.push(`Error: ${error.message}`);
        this.results.set(task.id, `Error: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * 分层执行（指定 Manager Agent）
   */
  async executeHierarchical(managerAgent, llmClient) {
    this.log('Hierarchical execution not fully implemented, falling back to sequential');
    return this.executeSequential(llmClient);
  }

  /**
   * 执行整个 Crew
   */
  async execute(llmClient) {
    this.log(`Starting Crew execution with ${this.process} process`);

    let results;
    if (this.process === 'hierarchical') {
      // 需要指定 manager
      const manager = this.agents.find(a => a.isManager);
      if (!manager) {
        this.log('No manager agent found, falling back to sequential');
        results = await this.executeSequential(llmClient);
      } else {
        results = await this.executeHierarchical(manager, llmClient);
      }
    } else {
      results = await this.executeSequential(llmClient);
    }

    this.log('Crew execution completed');
    return {
      crewId: this.id,
      results,
      taskCount: this.tasks.length,
      agentCount: this.agents.length
    };
  }

  /**
   * 日志输出
   */
  log(message) {
    if (this.verbose) {
      console.log(`[Crew] ${message}`);
    }
  }

  /**
   * 获取状态
   */
  getStatus() {
    return {
      id: this.id,
      agentCount: this.agents.length,
      taskCount: this.tasks.length,
      process: this.process,
      completedTasks: this.results.size
    };
  }
}

// 预定义 Agent 模板
const AGENT_TEMPLATES = {
  researcher: {
    role: 'Research Analyst',
    goal: 'Research and gather information on the given topic',
    backstory: 'You are a veteran researcher with keen eye for detail and emerging trends.'
  },
  writer: {
    role: 'Content Writer',
    goal: 'Create engaging content based on research',
    backstory: 'You are an experienced writer known for clear and compelling prose.'
  },
  editor: {
    role: 'Editor',
    goal: 'Review and refine content for publication',
    backstory: 'You are a meticulous editor with years of publishing experience.'
  },
  coder: {
    role: 'Software Developer',
    goal: 'Write clean, efficient code',
    backstory: 'You are a skilled developer focused on best practices and maintainability.'
  },
  reviewer: {
    role: 'Code Reviewer',
    goal: 'Review code for bugs and improvements',
    backstory: 'You are a senior developer focused on code quality and security.'
  }
};

// 预定义 Task 模板
const TASK_TEMPLATES = {
  research: {
    expectedOutput: 'Comprehensive research report with key findings'
  },
  write: {
    expectedOutput: 'Polished article or content piece'
  },
  review: {
    expectedOutput: 'Detailed review with actionable feedback'
  },
  code: {
    expectedOutput: 'Working code implementation'
  }
};

module.exports = {
  Agent,
  Task,
  Crew,
  AGENT_TEMPLATES,
  TASK_TEMPLATES
};