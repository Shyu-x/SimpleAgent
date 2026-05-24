/**
 * Agent Workflow API 客户端
 * 负责与后端多Agent系统通信
 */

import { BACKEND_URL } from './config';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ==================== 类型定义 ====================

export interface CreateEngineRequest {
  sessionId?: string;
  options?: {
    maxIterations?: number;
    enableCheckpoint?: boolean;
    enableMemory?: boolean;
    [key: string]: unknown;
  };
}

export interface ExecuteTaskRequest {
  task: string;
  context?: Record<string, unknown>;
}

export interface WorkflowExecutionResult {
  success: boolean;
  sessionId: string;
  finalResult?: string;
  result?: {
    success: boolean;
    finalResult?: string;
    iterations?: number;
    toolCalls?: Array<{
      tool: string;
      input: Record<string, unknown>;
      output: unknown;
      reasoning?: string;
    }>;
    checkpoints?: Array<{
      id: string;
      iteration: number;
      timestamp: number;
    }>;
    humanConfirmations?: unknown[];
    error?: string;
  };
  iterations?: number;
  toolCalls?: Array<{
    tool: string;
    input: Record<string, unknown>;
    output: unknown;
    reasoning?: string;
  }>;
  error?: string;
}

// ==================== API 客户端 ====================

class AgentWorkflowAPI {
  private baseUrl: string;

  constructor(baseUrl: string = BACKEND_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || `HTTP ${response.status}`,
        };
      }

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  // ==================== 引擎管理 ====================

  /**
   * 创建增强版 Agent 引擎
   */
  async createEngine(options?: CreateEngineRequest['options']): Promise<ApiResponse<{ sessionId: string }>> {
    return this.request('/api/multiagent/engine', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: options?.sessionId || `engine_${Date.now()}`,
        options,
      }),
    });
  }

  /**
   * 获取引擎状态
   */
  async getEngineStatus(sessionId: string): Promise<ApiResponse<{
    state: {
      status: string;
      iteration: number;
      context: Record<string, unknown>;
      [key: string]: unknown;
    };
  }>> {
    return this.request(`/api/multiagent/engine/${sessionId}`);
  }

  /**
   * 删除引擎
   */
  async deleteEngine(sessionId: string): Promise<ApiResponse<void>> {
    return this.request(`/api/multiagent/engine/${sessionId}`, {
      method: 'DELETE',
    });
  }

  // ==================== 任务执行 ====================

  /**
   * 执行任务
   */
  async executeTask(sessionId: string, task: string, context?: Record<string, unknown>): Promise<ApiResponse<WorkflowExecutionResult>> {
    return this.request(`/api/multiagent/engine/${sessionId}/execute`, {
      method: 'POST',
      body: JSON.stringify({ task, context }),
    });
  }

  /**
   * 暂停引擎
   */
  async pauseEngine(sessionId: string): Promise<ApiResponse<void>> {
    return this.request(`/api/multiagent/engine/${sessionId}/pause`, {
      method: 'POST',
    });
  }

  /**
   * 恢复引擎
   */
  async resumeEngine(sessionId: string): Promise<ApiResponse<void>> {
    return this.request(`/api/multiagent/engine/${sessionId}/resume`, {
      method: 'POST',
    });
  }

  // ==================== 检查点管理 ====================

  /**
   * 获取检查点列表
   */
  async getCheckpoints(sessionId: string): Promise<ApiResponse<Array<{
    id: string;
    iteration: number;
    timestamp: number;
    status: string;
  }>>> {
    return this.request(`/api/multiagent/engine/${sessionId}/checkpoints`);
  }

  /**
   * 从检查点恢复
   */
  async restoreFromCheckpoint(sessionId: string, checkpointId: string): Promise<ApiResponse<{
    success: boolean;
    result?: string;
  }>> {
    return this.request(`/api/multiagent/engine/${sessionId}/restore`, {
      method: 'POST',
      body: JSON.stringify({ checkpointId }),
    });
  }

  // ==================== 人机确认 ====================

  /**
   * 响应确认请求
   */
  async respondToConfirmation(
    sessionId: string,
    confirmationId: string,
    approved: boolean,
    modifiedInput?: unknown
  ): Promise<ApiResponse<{ result: string }>> {
    return this.request(`/api/multiagent/engine/${sessionId}/confirm`, {
      method: 'POST',
      body: JSON.stringify({
        confirmationId,
        approved,
        modifiedInput,
      }),
    });
  }

  // ==================== 记忆系统 ====================

  /**
   * 获取记忆统计
   */
  async getMemoryStats(sessionId: string): Promise<ApiResponse<{
    shortTerm: number;
    longTerm: number;
    semantic: number;
  }>> {
    return this.request(`/api/multiagent/engine/${sessionId}/memory`);
  }

  /**
   * 搜索记忆
   */
  async searchMemory(
    sessionId: string,
    query: string,
    options?: { limit?: number; type?: string }
  ): Promise<ApiResponse<Array<{
    content: string;
    score: number;
    type: string;
  }>>> {
    return this.request(`/api/multiagent/engine/${sessionId}/memory/search`, {
      method: 'POST',
      body: JSON.stringify({ query, options }),
    });
  }

  // ==================== 工具系统 ====================

  /**
   * 获取可用工具列表
   */
  async getTools(): Promise<ApiResponse<Array<{
    name: string;
    description: string;
    category: string;
    parameters: Record<string, unknown>;
  }>>> {
    return this.request('/api/multiagent/tools');
  }

  /**
   * 执行工具
   */
  async executeTool(
    toolName: string,
    input: Record<string, unknown>,
    options?: Record<string, unknown>
  ): Promise<ApiResponse<{ result: unknown }>> {
    return this.request('/api/multiagent/tools/execute', {
      method: 'POST',
      body: JSON.stringify({ toolName, input, options }),
    });
  }

  // ==================== Crew 管理 ====================

  /**
   * 创建 Crew
   */
  async createCrew(crew: {
    name: string;
    agents: Array<{
      role: string;
      goal: string;
      backstory?: string;
      tools?: string[];
    }>;
    tasks: Array<{
      description: string;
      expectedOutput?: string;
      agentId?: string;
    }>;
    process?: 'sequential' | 'parallel' | 'hierarchical';
  }): Promise<ApiResponse<{ crewId: string }>> {
    return this.request('/api/multiagent/crew', {
      method: 'POST',
      body: JSON.stringify(crew),
    });
  }

  /**
   * 执行 Crew
   */
  async executeCrew(crewId: string): Promise<ApiResponse<{
    result: string;
  }>> {
    return this.request('/api/multiagent/execute', {
      method: 'POST',
      body: JSON.stringify({ crewId }),
    });
  }

  /**
   * 获取 Crew 状态
   */
  async getCrewStatus(crewId: string): Promise<ApiResponse<{
    id: string;
    status: string;
    agents: Array<{ role: string; status: string }>;
    tasks: Array<{ description: string; status: string }>;
  }>> {
    return this.request(`/api/multiagent/crew/${crewId}`);
  }

  /**
   * 获取所有 Crew
   */
  async listCrews(): Promise<ApiResponse<Array<{
    id: string;
    name: string;
    status: string;
  }>>> {
    return this.request('/api/multiagent/crews');
  }

  /**
   * 删除 Crew
   */
  async deleteCrew(crewId: string): Promise<ApiResponse<void>> {
    return this.request(`/api/multiagent/crew/${crewId}`, {
      method: 'DELETE',
    });
  }

  // ==================== 健康检查 ====================

  /**
   * 健康检查
   */
  async healthCheck(): Promise<ApiResponse<{
    status: string;
    service: string;
    crews: number;
    engines: number;
    timestamp: string;
  }>> {
    return this.request('/api/multiagent/health');
  }

  // ==================== 错误恢复 ====================

  /**
   * 尝试错误恢复
   */
  async attemptRecovery(
    errorCode: string,
    context?: Record<string, unknown>
  ): Promise<ApiResponse<{
    success: boolean;
    strategy: string;
    result?: string;
  }>> {
    return this.request('/api/multiagent/recovery', {
      method: 'POST',
      body: JSON.stringify({ errorCode, context }),
    });
  }

  /**
   * 获取可用的恢复处理器
   */
  async getRecoveryHandlers(): Promise<ApiResponse<string[]>> {
    return this.request('/api/multiagent/recovery/handlers');
  }
}

// 导出单例
export const agentWorkflowAPI = new AgentWorkflowAPI();

// 导出类
export { AgentWorkflowAPI };
