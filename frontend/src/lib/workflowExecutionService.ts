/**
 * 工作流执行服务
 * 编排整个工作流的执行流程
 */

import { agentWorkflowAPI } from './agentWorkflowAPI';
import type {
  WorkflowDefinition,
  WorkflowExecution,
  TaskConfig,
  AgentConfig,
  ToolCall,
  ConfirmationRequest,
  SSEEvent,
} from '@/store/agentWorkflowStore';

// 执行配置
interface ExecutionConfig {
  maxConcurrentTasks?: number; // 最大并发任务数
  taskTimeout?: number; // 任务超时（毫秒）
  enableCheckpoint?: boolean; // 启用检查点
  autoRetry?: boolean; // 自动重试
  maxRetries?: number; // 最大重试次数
}

// 默认配置
const DEFAULT_CONFIG: ExecutionConfig = {
  maxConcurrentTasks: 2,
  taskTimeout: 300000, // 5分钟
  enableCheckpoint: true,
  autoRetry: true,
  maxRetries: 3,
};

// 执行结果
interface ExecutionResult {
  success: boolean;
  sessionId: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  results: Map<string, string>;
  errors: Map<string, string>;
  toolCalls: ToolCall[];
  duration: number;
}

// 事件回调
type EventCallback = (event: SSEEvent) => void;

class WorkflowExecutionService {
  private currentSessionId: string | null = null;
  private isPaused = false;
  private isRunning = false;
  private shouldStop = false;
  private config: ExecutionConfig;
  private eventCallbacks: Set<EventCallback> = new Set();

  constructor(config: ExecutionConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 订阅事件
   */
  subscribe(callback: EventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  /**
   * 发布事件
   */
  private emit(event: SSEEvent): void {
    this.eventCallbacks.forEach((cb) => cb(event));
  }

  /**
   * 设置配置
   */
  setConfig(config: Partial<ExecutionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 创建引擎会话
   */
  async createSession(): Promise<string> {
    const response = await agentWorkflowAPI.createEngine({
      sessionId: `wf_${Date.now()}`,
      options: {
        maxIterations: 50,
        enableCheckpoint: this.config.enableCheckpoint,
        enableMemory: true,
      },
    });

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to create engine session');
    }

    this.currentSessionId = response.data.sessionId;
    return this.currentSessionId;
  }

  /**
   * 获取当前会话ID
   */
  getSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * 执行工作流
   */
  async execute(
    workflow: WorkflowDefinition,
    initialInput?: string
  ): Promise<ExecutionResult> {
    if (this.isRunning) {
      throw new Error('Workflow is already running');
    }

    const startTime = Date.now();
    this.isRunning = true;
    this.shouldStop = false;
    this.isPaused = false;

    const result: ExecutionResult = {
      success: false,
      sessionId: this.currentSessionId || '',
      totalTasks: workflow.tasks.length,
      completedTasks: 0,
      failedTasks: 0,
      results: new Map(),
      errors: new Map(),
      toolCalls: [],
      duration: 0,
    };

    try {
      // 创建会话
      await this.createSession();

      // 发送工作流开始事件
      this.emit({ type: 'progress', progress: 0, currentTaskIndex: 0 });

      // 根据流程类型执行
      switch (workflow.process) {
        case 'sequential':
          await this.executeSequential(workflow, initialInput, result);
          break;
        case 'parallel':
          await this.executeParallel(workflow, initialInput, result);
          break;
        case 'hierarchical':
          await this.executeHierarchical(workflow, initialInput, result);
          break;
      }

      // 检查是否被停止
      if (this.shouldStop) {
        this.emit({ type: 'workflow_error', error: 'Workflow was stopped by user' });
        result.success = false;
      } else if (result.failedTasks === 0) {
        result.success = true;
        this.emit({
          type: 'workflow_complete',
          result: `完成 ${result.completedTasks}/${result.totalTasks} 个任务`,
        });
      } else {
        this.emit({
          type: 'workflow_error',
          error: `${result.failedTasks} 个任务失败`,
        });
      }
    } catch (error) {
      result.success = false;
      this.emit({
        type: 'workflow_error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      this.isRunning = false;
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  /**
   * 顺序执行
   */
  private async executeSequential(
    workflow: WorkflowDefinition,
    initialInput: string | undefined,
    result: ExecutionResult
  ): Promise<void> {
    let context = initialInput;

    for (let i = 0; i < workflow.tasks.length; i++) {
      if (this.shouldStop) break;

      // 等待暂停恢复
      while (this.isPaused && !this.shouldStop) {
        await this.sleep(500);
      }

      const task = workflow.tasks[i];
      const agent = workflow.agents.find((a) => a.id === task.agentId);

      // 发送任务开始事件
      this.emit({ type: 'task_start', taskId: task.id, agentId: task.agentId });
      this.emit({
        type: 'progress',
        progress: ((i + 1) / workflow.tasks.length) * 100,
        currentTaskIndex: i,
      });

      try {
        const taskResult = await this.executeTask(
          task,
          agent,
          context,
          result
        );

        result.results.set(task.id, taskResult);
        result.completedTasks++;

        // 将结果传递给下一个任务
        context = taskResult;

        this.emit({ type: 'task_complete', taskId: task.id, result: taskResult });
      } catch (error) {
        result.failedTasks++;
        const errorMsg = error instanceof Error ? error.message : 'Task failed';
        result.errors.set(task.id, errorMsg);

        this.emit({ type: 'task_error', taskId: task.id, error: errorMsg });

        // 如果配置不允许自动重试或达到最大重试次数，继续下一个任务
        if (!this.config.autoRetry) {
          continue;
        }
      }
    }
  }

  /**
   * 并行执行
   */
  private async executeParallel(
    workflow: WorkflowDefinition,
    initialInput: string | undefined,
    result: ExecutionResult
  ): Promise<void> {
    // 按依赖分组
    const taskGroups = this.groupTasksByDependencies(workflow.tasks);
    const totalGroups = taskGroups.length;

    for (let g = 0; g < taskGroups.length; g++) {
      if (this.shouldStop) break;

      // 等待暂停恢复
      while (this.isPaused && !this.shouldStop) {
        await this.sleep(500);
      }

      const group = taskGroups[g];
      const progress = ((g + 1) / totalGroups) * 100;

      // 并行执行组内任务
      const promises = group.map(async (task, index) => {
        const agent = workflow.agents.find((a) => a.id === task.agentId);

        this.emit({ type: 'task_start', taskId: task.id, agentId: task.agentId });
        this.emit({
          type: 'progress',
          progress: progress * (1 - 0.1 * (1 - index / group.length)),
          currentTaskIndex: g,
        });

        try {
          const taskResult = await this.executeTask(task, agent, initialInput, result);
          result.results.set(task.id, taskResult);
          result.completedTasks++;
          this.emit({ type: 'task_complete', taskId: task.id, result: taskResult });
        } catch (error) {
          result.failedTasks++;
          const errorMsg = error instanceof Error ? error.message : 'Task failed';
          result.errors.set(task.id, errorMsg);
          this.emit({ type: 'task_error', taskId: task.id, error: errorMsg });
        }
      });

      await Promise.all(promises);
    }
  }

  /**
   * 层级执行（先创建子任务，再汇总）
   */
  private async executeHierarchical(
    workflow: WorkflowDefinition,
    initialInput: string | undefined,
    result: ExecutionResult
  ): Promise<void> {
    // 找出根任务（没有依赖的任务）
    const rootTasks = workflow.tasks.filter((t) => t.dependencies.length === 0);
    const subTasks = workflow.tasks.filter((t) => t.dependencies.length > 0);

    // 执行根任务
    for (const task of rootTasks) {
      if (this.shouldStop) break;

      while (this.isPaused && !this.shouldStop) {
        await this.sleep(500);
      }

      const agent = workflow.agents.find((a) => a.id === task.agentId);
      this.emit({ type: 'task_start', taskId: task.id, agentId: task.agentId });

      try {
        const taskResult = await this.executeTask(task, agent, initialInput, result);
        result.results.set(task.id, taskResult);
        result.completedTasks++;
        this.emit({ type: 'task_complete', taskId: task.id, result: taskResult });
      } catch (error) {
        result.failedTasks++;
        const errorMsg = error instanceof Error ? error.message : 'Task failed';
        result.errors.set(task.id, errorMsg);
        this.emit({ type: 'task_error', taskId: task.id, error: errorMsg });
      }
    }

    // 执行子任务（依赖根任务结果）
    for (const task of subTasks) {
      if (this.shouldStop) break;

      while (this.isPaused && !this.shouldStop) {
        await this.sleep(500);
      }

      const agent = workflow.agents.find((a) => a.id === task.agentId);

      // 收集依赖结果作为上下文
      const dependencyResults = task.dependencies
        .map((depId) => result.results.get(depId))
        .filter(Boolean)
        .join('\n---\n');

      this.emit({ type: 'task_start', taskId: task.id, agentId: task.agentId });

      try {
        const taskResult = await this.executeTask(
          task,
          agent,
          dependencyResults,
          result
        );
        result.results.set(task.id, taskResult);
        result.completedTasks++;
        this.emit({ type: 'task_complete', taskId: task.id, result: taskResult });
      } catch (error) {
        result.failedTasks++;
        const errorMsg = error instanceof Error ? error.message : 'Task failed';
        result.errors.set(task.id, errorMsg);
        this.emit({ type: 'task_error', taskId: task.id, error: errorMsg });
      }
    }
  }

  /**
   * 执行单个任务
   */
  private async executeTask(
    task: TaskConfig,
    agent: AgentConfig | undefined,
    context: string | undefined,
    result: ExecutionResult
  ): Promise<string> {
    if (!this.currentSessionId) {
      throw new Error('No active session');
    }

    // 构建任务提示
    const taskPrompt = this.buildTaskPrompt(task, agent, context);

    // 发送工具调用事件
    const toolCall: ToolCall = {
      id: `call_${Date.now()}`,
      tool: 'agent_execute',
      input: { task: taskPrompt, agent: agent?.role },
      timestamp: Date.now(),
      success: false,
    };

    try {
      const response = await agentWorkflowAPI.executeTask(
        this.currentSessionId,
        taskPrompt,
        { agent: agent?.role, context }
      );

      toolCall.success = response.success;
      const resultData = (response.data as any)?.result || response.data;
      toolCall.output = resultData;
      toolCall.duration = 0;
      result.toolCalls.push(toolCall);

      this.emit({ type: 'tool_call', call: toolCall });

      if (!response.success) {
        throw new Error(response.error || 'Task execution failed');
      }

      // 提取最终结果
      const finalResult = resultData?.finalResult || resultData?.result || '';
      return typeof finalResult === 'string' ? finalResult : JSON.stringify(finalResult);
    } catch (error) {
      toolCall.output = { error: error instanceof Error ? error.message : 'Unknown error' };
      result.toolCalls.push(toolCall);
      throw error;
    }
  }

  /**
   * 构建任务提示
   */
  private buildTaskPrompt(
    task: TaskConfig,
    agent: AgentConfig | undefined,
    context: string | undefined
  ): string {
    const parts: string[] = [];

    if (agent) {
      parts.push(`【角色】${agent.role}`);
      parts.push(`【目标】${agent.goal}`);
      if (agent.backstory) {
        parts.push(`【背景】${agent.backstory}`);
      }
    }

    parts.push(`【任务】${task.description}`);

    if (context) {
      parts.push(`【上下文】${context}`);
    }

    if (task.description) {
      parts.push(`【预期输出】${task.description}`);
    }

    return parts.join('\n\n');
  }

  /**
   * 按依赖分组任务
   */
  private groupTasksByDependencies(tasks: TaskConfig[]): TaskConfig[][] {
    const groups: TaskConfig[][] = [];
    const remaining = [...tasks];
    const completed = new Set<string>();

    while (remaining.length > 0) {
      const group: TaskConfig[] = [];

      for (const task of remaining) {
        // 检查依赖是否都已完成
        const depsSatisfied = task.dependencies.every((depId) =>
          completed.has(depId)
        );

        if (depsSatisfied) {
          group.push(task);
        }
      }

      if (group.length === 0) {
        // 死锁：无法继续但还有任务
        console.warn('Task dependency deadlock detected');
        groups.push(remaining);
        break;
      }

      groups.push(group);

      // 从剩余列表移除
      for (const task of group) {
        const index = remaining.indexOf(task);
        if (index !== -1) {
          remaining.splice(index, 1);
          completed.add(task.id);
        }
      }
    }

    return groups;
  }

  /**
   * 暂停执行
   */
  async pause(): Promise<void> {
    if (!this.isRunning || this.isPaused) return;

    this.isPaused = true;

    if (this.currentSessionId) {
      await agentWorkflowAPI.pauseEngine(this.currentSessionId);
    }
  }

  /**
   * 恢复执行
   */
  async resume(): Promise<void> {
    if (!this.isRunning || !this.isPaused) return;

    this.isPaused = false;

    if (this.currentSessionId) {
      await agentWorkflowAPI.resumeEngine(this.currentSessionId);
    }
  }

  /**
   * 停止执行
   */
  async stop(): Promise<void> {
    this.shouldStop = true;
    this.isPaused = false;

    if (this.currentSessionId) {
      await agentWorkflowAPI.deleteEngine(this.currentSessionId);
      this.currentSessionId = null;
    }
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    if (this.currentSessionId) {
      await agentWorkflowAPI.deleteEngine(this.currentSessionId);
      this.currentSessionId = null;
    }

    this.isRunning = false;
    this.isPaused = false;
    this.shouldStop = false;
    this.eventCallbacks.clear();
  }

  /**
   * 辅助方法：休眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 检查是否正在运行
   */
  isExecutionRunning(): boolean {
    return this.isRunning;
  }

  /**
   * 检查是否暂停
   */
  isExecutionPaused(): boolean {
    return this.isPaused;
  }
}

// 导出单例
export const workflowExecutionService = new WorkflowExecutionService();

// 导出类
export { WorkflowExecutionService };
export type { ExecutionConfig, ExecutionResult };
