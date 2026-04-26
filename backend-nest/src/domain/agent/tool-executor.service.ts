import { Injectable } from '@nestjs/common';

/**
 * 工具执行错误类型
 */
export enum ToolErrorType {
  NOT_FOUND = 'not_found',
  VALIDATION = 'validation',
  TIMEOUT = 'timeout',
  NETWORK = 'network',
  PERMISSION = 'permission',
  RATE_LIMIT = 'rate_limit',
  EXECUTION = 'execution',
  CANCELLED = 'cancelled',
  UNKNOWN = 'unknown',
}

/**
 * 工具调用接口
 */
export interface ToolCall {
  id?: string;
  name: string;
  parameters?: Record<string, any>;
  options?: {
    timeout?: number;
    maxRetries?: number;
    retryDelay?: number;
    stopOnError?: boolean;
    concurrency?: number;
  };
}

/**
 * 工具执行结果接口
 */
export interface ToolResult {
  success: boolean;
  tool: string;
  callId: string;
  result: any;
  error: string | null;
  errorType: ToolErrorType | null;
  validationErrors: any[] | null;
  executionTime: number;
  timestamp: number;
}

/**
 * 工具执行上下文
 */
export interface ExecutionContext {
  sessionId?: string;
  user?: any;
  messages?: any[];
  traceId?: string;
  signal?: AbortSignal;
  tools?: Record<string, any>;
}

/**
 * 工具执行器服务
 * 统一的工具执行接口，支持超时、重试、取消
 */
@Injectable()
export class ToolExecutorService {
  private defaultTimeout = 30000;
  private registry: Map<string, any> = new Map();
  private _cancelled = false;
  private activeCalls: Map<string, { tool: string; startTime: number; context: ExecutionContext }> = new Map();

  constructor() {}

  /**
   * 执行单个工具调用
   */
  async execute(toolCall: ToolCall, context: ExecutionContext = {}): Promise<ToolResult> {
    const startTime = Date.now();
    const callId = toolCall.id || this.generateCallId();

    try {
      // 验证工具调用
      const validation = this.validateToolCall(toolCall);
      if (!validation.valid) {
        return this.buildToolResult({
          success: false,
          tool: toolCall.name,
          callId,
          error: 'Tool call validation failed',
          errorType: ToolErrorType.VALIDATION,
          validationErrors: validation.errors,
          executionTime: Date.now() - startTime,
        });
      }

      // 检查取消状态
      if (this._cancelled || (context.signal && context.signal.aborted)) {
        return this.buildToolResult({
          success: false,
          tool: toolCall.name,
          callId,
          error: 'Tool execution cancelled',
          errorType: ToolErrorType.CANCELLED,
          executionTime: Date.now() - startTime,
        });
      }

      // 记录执行
      this.activeCalls.set(callId, {
        tool: toolCall.name,
        startTime,
        context,
      });

      // 获取工具执行函数
      const toolFn = await this.getToolFunction(toolCall.name, context);
      if (!toolFn) {
        return this.buildToolResult({
          success: false,
          tool: toolCall.name,
          callId,
          error: `Tool not found: ${toolCall.name}`,
          errorType: ToolErrorType.NOT_FOUND,
          executionTime: Date.now() - startTime,
        });
      }

      // 获取超时时间
      const timeout = this.getToolTimeout(toolCall.name, toolCall.options);

      // 执行工具（带超时）
      const result = await this.executeWithTimeout(toolFn, toolCall.parameters || {}, timeout);

      // 构建成功结果
      return this.buildToolResult({
        success: true,
        tool: toolCall.name,
        callId,
        result,
        executionTime: Date.now() - startTime,
      });
    } catch (error: any) {
      return this.handleExecutionError(error, toolCall, callId, startTime);
    } finally {
      this.activeCalls.delete(callId);
    }
  }

  /**
   * 并行执行多个工具调用
   */
  async executeParallel(toolCalls: ToolCall[], context: ExecutionContext = {}): Promise<ToolResult[]> {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      return [];
    }

    const concurrency = toolCalls[0]?.options?.concurrency || toolCalls.length;
    const results: ToolResult[] = [];

    const chunks = this.chunkArray(toolCalls, concurrency);

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(chunk.map((toolCall) => this.execute(toolCall, context)));
      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * 串行执行多个工具调用
   */
  async executeSequential(toolCalls: ToolCall[], context: ExecutionContext = {}): Promise<ToolResult[]> {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      return [];
    }

    const results: ToolResult[] = [];

    for (const toolCall of toolCalls) {
      if (this._cancelled || (context.signal && context.signal.aborted)) {
        results.push(
          this.buildToolResult({
            success: false,
            tool: toolCall.name,
            callId: toolCall.id,
            error: 'Execution cancelled',
            errorType: ToolErrorType.CANCELLED,
          }),
        );
        break;
      }

      const result = await this.execute(toolCall, context);
      results.push(result);

      if (!result.success && toolCall.options?.stopOnError) {
        break;
      }
    }

    return results;
  }

  /**
   * 验证工具调用
   */
  validateToolCall(toolCall: ToolCall): { valid: boolean; errors: any[] } {
    const errors: any[] = [];

    if (!toolCall || typeof toolCall.name !== 'string') {
      errors.push({
        field: 'name',
        message: 'Tool name is required and must be a string',
      });
    }

    if (toolCall.parameters !== undefined && typeof toolCall.parameters !== 'object') {
      errors.push({
        field: 'parameters',
        message: 'Tool parameters must be an object',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 构建工具结果
   */
  buildToolResult(data: Partial<ToolResult>): ToolResult {
    return {
      success: data.success ?? false,
      tool: data.tool || 'unknown',
      callId: data.callId || this.generateCallId(),
      result: data.result !== undefined ? data.result : null,
      error: data.error || null,
      errorType: data.errorType || (data.success ? null : ToolErrorType.UNKNOWN),
      validationErrors: data.validationErrors || null,
      executionTime: data.executionTime || 0,
      timestamp: Date.now(),
    };
  }

  /**
   * 取消所有执行
   */
  cancel(): void {
    this._cancelled = true;

    for (const [callId, call] of this.activeCalls.entries()) {
      if (call.context?.signal) {
        try {
          (call.context.signal as any).abort?.();
        } catch (e) {
          // Ignore abort errors
        }
      }
    }

    this.activeCalls.clear();
  }

  /**
   * 重置取消状态
   */
  reset(): void {
    this._cancelled = false;
  }

  /**
   * 注册工具
   */
  registerTool(name: string, tool: any): void {
    this.registry.set(name, tool);
  }

  /**
   * 获取工具超时时间
   */
  private getToolTimeout(toolName: string, options: any = {}): number {
    if (options?.timeout !== undefined) {
      return options.timeout;
    }

    if (this.registry.has(toolName)) {
      const tool = this.registry.get(toolName);
      if (tool?.timeout) {
        return tool.timeout;
      }
    }

    return this.defaultTimeout;
  }

  /**
   * 获取工具执行函数
   */
  private async getToolFunction(toolName: string, context: ExecutionContext = {}): Promise<any> {
    // 优先从注册表获取
    if (this.registry.has(toolName)) {
      const tool = this.registry.get(toolName);
      if (typeof tool.execute === 'function') {
        return tool.execute.bind(tool);
      }
    }

    // 从上下文中获取工具映射
    if (context.tools && context.tools[toolName]) {
      const tool = context.tools[toolName];
      if (typeof tool === 'function') {
        return tool;
      }
      if (typeof tool.execute === 'function') {
        return tool.execute.bind(tool);
      }
    }

    return null;
  }

  /**
   * 带超时的执行
   */
  private async executeWithTimeout(fn: any, params: any, timeout: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Tool execution timeout after ${timeout}ms`));
      }, timeout);

      fn(params)
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timer));
    });
  }

  /**
   * 处理执行错误
   */
  private handleExecutionError(error: any, toolCall: ToolCall, callId: string, startTime: number): ToolResult {
    let errorType = ToolErrorType.UNKNOWN;
    let errorMessage = error.message || 'Unknown error';

    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      errorType = ToolErrorType.TIMEOUT;
      errorMessage = `Tool "${toolCall.name}" execution timeout`;
    } else if (error.name === 'AbortError' || error.message?.includes('cancelled')) {
      errorType = ToolErrorType.CANCELLED;
    } else if (error.message?.includes('not found') || error.message?.includes('Not Found')) {
      errorType = ToolErrorType.NOT_FOUND;
    } else if (error.message?.includes('validation') || error.message?.includes('invalid')) {
      errorType = ToolErrorType.VALIDATION;
    } else if (error.message?.includes('permission') || error.message?.includes('denied')) {
      errorType = ToolErrorType.PERMISSION;
    } else if (error.message?.includes('rate limit') || error.message?.includes('429')) {
      errorType = ToolErrorType.RATE_LIMIT;
    } else if (error.message?.includes('network') || error.code?.startsWith('ECONN')) {
      errorType = ToolErrorType.NETWORK;
    } else {
      errorType = ToolErrorType.EXECUTION;
    }

    return this.buildToolResult({
      success: false,
      tool: toolCall.name,
      callId,
      error: errorMessage,
      errorType,
      executionTime: Date.now() - startTime,
    });
  }

  /**
   * 生成分调用ID
   */
  private generateCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 将数组分块
   */
  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * 获取活跃调用数
   */
  getActiveCallsCount(): number {
    return this.activeCalls.size;
  }
}
