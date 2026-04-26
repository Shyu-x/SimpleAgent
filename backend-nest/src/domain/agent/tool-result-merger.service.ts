/**
 * 工具结果合并器
 * 端口自 backend/src/domain/agent/ToolResultMerger.js
 *
 * 统一管理多个工具执行结果的合并、去重和冲突解决
 *
 * 设计目标：
 * 1. 多种合并策略（优先级、相关性、时间）
 * 2. 结果去重
 * 3. 冲突检测和解决
 * 4. 结构化输出
 */

import { Injectable, Logger } from '@nestjs/common';

export enum MergeStrategy {
  PRIORITY = 'priority',
  RELEVANCE = 'relevance',
  SEQUENTIAL = 'sequential',
  UNION = 'union',
  INTERSECTION = 'intersection',
}

export enum ConflictResolution {
  FIRST = 'first',
  LAST = 'last',
  PRIORITY = 'priority',
  MERGE = 'merge',
  DISCARD = 'discard',
}

export interface ToolResult {
  tool: string;
  success: boolean;
  result?: any;
  error?: string;
  executionTime?: number;
  relevance?: number;
}

export interface MergedResult {
  success: boolean;
  error?: string | null;
  results: ToolResult[];
  successfulCount: number;
  failedCount: number;
  mergedOutput: any;
  toolOutputs?: Record<string, ToolResult>;
  conflicts?: string[];
  resolvedConflicts?: number;
  executionOrder?: string[];
  executionDetails?: Array<{
    tool: string;
    status: string;
    output?: any;
    error?: string;
  }>;
  mergedKeys?: string[];
  commonKeys?: string[];
  topRelevance?: number;
  relevanceScores?: Array<{ tool: string; relevance: number }>;
}

export interface PriorityConfig {
  tool: string;
  priority: number;
}

@Injectable()
export class ToolResultMergerService {
  private readonly logger = new Logger(ToolResultMergerService.name);
  private readonly priorityMap: Map<string, number> = new Map();
  private defaultPriority: number;
  private defaultStrategy: MergeStrategy;
  private conflictResolution: ConflictResolution;

  constructor(options: {
    name?: string;
    priorities?: PriorityConfig[];
    defaultPriority?: number;
    defaultStrategy?: MergeStrategy;
    conflictResolution?: ConflictResolution;
  } = {}) {
    this.defaultPriority = options.defaultPriority || 50;
    this.defaultStrategy = options.defaultStrategy || MergeStrategy.PRIORITY;
    this.conflictResolution = options.conflictResolution || ConflictResolution.PRIORITY;

    if (options.priorities) {
      for (const p of options.priorities) {
        this.priorityMap.set(p.tool, p.priority);
      }
    }
  }

  /**
   * 合并多个工具结果
   */
  merge(results: ToolResult[], strategy?: MergeStrategy): MergedResult {
    if (!Array.isArray(results) || results.length === 0) {
      return this.emptyResult();
    }

    // 过滤失败的结果
    const successfulResults = results.filter(r => r.success);
    if (successfulResults.length === 0) {
      return this.buildMergedResult({
        success: false,
        results,
        error: 'All tool executions failed',
        mergedOutput: null,
      });
    }

    switch (strategy || this.defaultStrategy) {
      case MergeStrategy.PRIORITY:
        return this.mergeByPriority(results);
      case MergeStrategy.RELEVANCE:
        return this.mergeByRelevance(results);
      case MergeStrategy.SEQUENTIAL:
        return this.mergeSequential(results);
      case MergeStrategy.UNION:
        return this.mergeUnion(results);
      case MergeStrategy.INTERSECTION:
        return this.mergeIntersection(results);
      default:
        return this.mergeByPriority(results);
    }
  }

  /**
   * 按优先级合并结果
   */
  private mergeByPriority(results: ToolResult[]): MergedResult {
    const sorted = this.sortByPriority(results);
    const successfulResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);

    const byTool: Record<string, ToolResult> = {};
    const conflictingKeys = new Set<string>();

    // 初始化工具结果映射
    for (const result of sorted) {
      byTool[result.tool] = result;
    }

    // 检测冲突
    const fieldSources = new Map<string, string>();
    for (const result of sorted) {
      if (!result.success) continue;

      const data = this.normalizeResult(result);
      for (const key of Object.keys(data)) {
        if (fieldSources.has(key)) {
          conflictingKeys.add(key);
        } else {
          fieldSources.set(key, result.tool);
        }
      }
    }

    // 按优先级解决冲突
    const resolvedData: Record<string, any> = {};
    for (const [key, firstTool] of fieldSources) {
      if (conflictingKeys.has(key)) {
        resolvedData[key] = this.resolveFieldConflict(key, sorted);
      } else {
        const sourceResult = byTool[firstTool];
        const data = this.normalizeResult(sourceResult);
        resolvedData[key] = data[key];
      }
    }

    return this.buildMergedResult({
      success: true,
      results,
      successfulCount: successfulResults.length,
      failedCount: failedResults.length,
      mergedOutput: this.formatMergedOutput(resolvedData, sorted),
      toolOutputs: byTool,
      conflicts: Array.from(conflictingKeys),
      resolvedConflicts: conflictingKeys.size,
      executionOrder: sorted.map(r => r.tool),
    });
  }

  /**
   * 按相关性合并结果
   */
  private mergeByRelevance(results: ToolResult[], context: { query?: string } = {}): MergedResult {
    const { query } = context;

    const scored = results
      .filter(r => r.success)
      .map(result => {
        const relevance = this.calculateRelevance(result, query);
        return { ...result, relevance };
      })
      .sort((a, b) => (b.relevance || 0) - (a.relevance || 0));

    if (scored.length === 0) {
      return this.buildMergedResult({
        success: false,
        results,
        error: 'No successful results',
      });
    }

    const mergedData = this.weightedMerge(scored);

    return this.buildMergedResult({
      success: true,
      results,
      mergedOutput: mergedData,
      topRelevance: scored[0]?.relevance || 0,
      relevanceScores: scored.map(s => ({
        tool: s.tool,
        relevance: s.relevance || 0,
      })),
    });
  }

  /**
   * 顺序合并
   */
  private mergeSequential(results: ToolResult[]): MergedResult {
    const outputs: string[] = [];
    const details: Array<{ tool: string; status: string; output?: any; error?: string }> = [];

    for (const result of results) {
      if (result.success) {
        outputs.push(this.extractOutput(result));
        details.push({
          tool: result.tool,
          status: 'success',
          output: this.extractOutput(result),
        });
      } else {
        details.push({
          tool: result.tool,
          status: 'failed',
          error: result.error,
        });
      }
    }

    return this.buildMergedResult({
      success: true,
      results,
      mergedOutput: outputs.join('\n'),
      executionDetails: details,
    });
  }

  /**
   * 联合合并
   */
  private mergeUnion(results: ToolResult[]): MergedResult {
    const union: Record<string, any> = {};
    const mergedKeys = new Set<string>();

    for (const result of results) {
      if (!result.success) continue;

      const data = this.normalizeResult(result);
      for (const [key, value] of Object.entries(data)) {
        if (!mergedKeys.has(key)) {
          union[key] = value;
          mergedKeys.add(key);
        }
      }
    }

    return this.buildMergedResult({
      success: true,
      results,
      mergedOutput: union,
      mergedKeys: Array.from(mergedKeys),
    });
  }

  /**
   * 交集合并
   */
  private mergeIntersection(results: ToolResult[]): MergedResult {
    const successful = results.filter(r => r.success);
    if (successful.length === 0) {
      return this.buildMergedResult({
        success: false,
        results,
        error: 'No successful results',
      });
    }

    const firstData = this.normalizeResult(successful[0]);
    let intersection = new Set(Object.keys(firstData));

    for (const result of successful.slice(1)) {
      const data = this.normalizeResult(result);
      const keys = new Set(Object.keys(data));
      intersection = new Set([...intersection].filter(k => keys.has(k)));
    }

    const intersectionData: Record<string, any> = {};
    for (const key of intersection) {
      intersectionData[key] = successful[0]?.result?.[key] || successful[0]?.result;
    }

    return this.buildMergedResult({
      success: true,
      results,
      mergedOutput: Object.keys(intersectionData).length > 0 ? intersectionData : null,
      commonKeys: Array.from(intersection),
    });
  }

  /**
   * 结果去重
   */
  deduplicate(results: ToolResult[]): ToolResult[] {
    const seen = new Map<string, ToolResult>();
    const deduped: ToolResult[] = [];

    for (const result of results) {
      const key = this.generateResultKey(result);

      if (!seen.has(key)) {
        seen.set(key, result);
        deduped.push(result);
      } else {
        const existing = seen.get(key)!;
        if ((result.executionTime || 0) < (existing.executionTime || Infinity)) {
          seen.set(key, result);
          const idx = deduped.indexOf(existing);
          if (idx !== -1) {
            deduped[idx] = result;
          }
        }
      }
    }

    return deduped;
  }

  /**
   * 设置工具优先级
   */
  setPriority(toolName: string, priority: number): void {
    this.priorityMap.set(toolName, priority);
  }

  /**
   * 批量设置优先级
   */
  setPriorities(priorities: PriorityConfig[]): void {
    for (const { tool, priority } of priorities) {
      this.priorityMap.set(tool, priority);
    }
  }

  // ==================== 私有辅助方法 ====================

  private sortByPriority(results: ToolResult[]): ToolResult[] {
    return [...results].sort((a, b) => {
      const priorityA = this.getPriority(a.tool);
      const priorityB = this.getPriority(b.tool);
      return priorityB - priorityA;
    });
  }

  private getPriority(toolName: string): number {
    return this.priorityMap.get(toolName) ?? this.defaultPriority;
  }

  private normalizeResult(result: ToolResult): Record<string, any> {
    if (!result.result) return {};
    if (typeof result.result === 'object') return result.result;
    try {
      return JSON.parse(result.result);
    } catch {
      return { content: result.result };
    }
  }

  private extractOutput(result: ToolResult): string {
    if (!result.result) return '';
    if (typeof result.result === 'string') return result.result;
    return JSON.stringify(result.result, null, 2);
  }

  private resolveFieldConflict(key: string, sortedResults: ToolResult[]): any {
    for (const result of sortedResults) {
      if (!result.success) continue;
      const data = this.normalizeResult(result);
      if (key in data) {
        return data[key];
      }
    }
    return null;
  }

  private calculateRelevance(result: ToolResult, query?: string): number {
    if (!query) {
      return this.getPriority(result.tool) / 100;
    }

    const queryLower = query.toLowerCase();
    const resultStr = JSON.stringify(result.result || '').toLowerCase();

    let score = 0;
    const queryWords = queryLower.split(/\s+/);

    for (const word of queryWords) {
      if (resultStr.includes(word)) {
        score += 1;
      }
    }

    const normalized = score / Math.max(queryWords.length, 1);
    const priorityWeight = this.getPriority(result.tool) / 100;
    return normalized * 0.7 + priorityWeight * 0.3;
  }

  private weightedMerge(scoredResults: Array<ToolResult & { relevance: number }>): any {
    if (scoredResults.length === 0) return null;
    if (scoredResults.length === 1) return scoredResults[0].result;

    const weights = scoredResults.map(r => r.relevance);
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    const first = scoredResults[0];

    if (Array.isArray(first.result)) {
      const weightedSum = scoredResults.reduce((acc, r, i) => {
        const weight = weights[i] / totalWeight;
        return acc + (r.result * weight);
      }, 0);
      return weightedSum;
    }

    return first.result;
  }

  private formatMergedOutput(data: any, sortedResults: ToolResult[]): any {
    if (typeof data === 'object' && data !== null) {
      return data;
    }
    return data;
  }

  private generateResultKey(result: ToolResult): string {
    const parts = [result.tool];
    if (result.result !== undefined) {
      parts.push(JSON.stringify(result.result));
    }
    return parts.join('|');
  }

  private buildMergedResult(data: Partial<MergedResult> & { results: ToolResult[] }): MergedResult {
    return {
      ...data,
      success: data.success ?? false,
      error: data.error || null,
      results: data.results || [],
      successfulCount: data.successfulCount ?? data.results?.filter(r => r.success).length ?? 0,
      failedCount: data.failedCount ?? data.results?.filter(r => !r.success).length ?? 0,
      mergedOutput: data.mergedOutput ?? null,
    };
  }

  private emptyResult(): MergedResult {
    return {
      success: false,
      error: 'No results to merge',
      results: [],
      successfulCount: 0,
      failedCount: 0,
      mergedOutput: null,
    };
  }
}
