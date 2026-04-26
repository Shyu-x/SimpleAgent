/**
 * 基础工具类
 * 提供超时控制、错误处理等通用功能
 */

export interface ToolExecutionOptions {
  timeout?: number;
  retries?: number;
  skipValidation?: boolean;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  errorType?: string;
  executionTime?: number;
}

/**
 * 带超时的执行包装
 */
export async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeout: number,
  toolName: string
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Tool "${toolName}" execution timeout after ${timeout}ms`));
    }, timeout);

    try {
      const result = await fn();
      clearTimeout(timer);
      resolve(result);
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

/**
 * 重试包装
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await sleep(delayMs * Math.pow(2, i)); // 指数退避
      }
    }
  }

  throw lastError!;
}

/**
 * 睡眠函数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 验证必需参数
 */
export function validateRequiredParams(
  params: Record<string, any>,
  required: string[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const field of required) {
    if (params[field] === undefined || params[field] === null || params[field] === '') {
      errors.push(`Missing required parameter: ${field}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 安全解析JSON
 */
export function safeJsonParse<T = any>(str: string, defaultValue: T): T {
  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
}

/**
 * 清理搜索查询
 */
export function cleanSearchQuery(query: string): string {
  return query
    .replace(/["']/g, '')
    .replace(/[搜索|查找|帮我找|请搜索]/g, '')
    .trim();
}
