/**
 * 工具结果合并器
 * 统一管理多个工具执行结果的合并、去重和冲突解决
 *
 * 设计目标：
 * 1. 多种合并策略（优先级、相关性、时间）
 * 2. 结果去重
 * 3. 冲突检测和解决
 * 4. 结构化输出
 *
 * @author AI Chat 玩具团队
 * @date 2026-04-01
 */

/**
 * 合并策略类型
 */
const MergeStrategy = {
  PRIORITY: 'priority',           // 按优先级合并
  RELEVANCE: 'relevance',         // 按相关性合并
  SEQUENTIAL: 'sequential',       // 按顺序合并
  UNION: 'union',                // 联合合并
  INTERSECTION: 'intersection'    // 交集合并
};

/**
 * 冲突解决策略
 */
const ConflictResolution = {
  FIRST: 'first',               // 保留第一个
  LAST: 'last',                 // 保留最后一个
  PRIORITY: 'priority',         // 按优先级
  MERGE: 'merge',               // 合并内容
  DISCARD: 'discard'            // 丢弃冲突项
};

/**
 * 工具结果合并器
 */
class ToolResultMerger {
  constructor(options = {}) {
    this.name = options.name || 'ToolResultMerger';
    // 优先级配置
    this.priorityMap = new Map(
      options.priorities?.map(p => [p.tool, p.priority]) || []
    );
    // 默认优先级（工具名不存在时使用）
    this.defaultPriority = options.defaultPriority || 50;
    // 默认合并策略
    this.defaultStrategy = options.defaultStrategy || MergeStrategy.PRIORITY;
    // 冲突解决策略
    this.conflictResolution = options.conflictResolution || ConflictResolution.PRIORITY;
  }

  /**
   * 合并多个工具结果
   * @param {ToolResult[]} results - 工具结果数组
   * @param {string} strategy - 合并策略
   * @returns {Object} 合并后的结果
   */
  merge(results, strategy = null) {
    if (!Array.isArray(results) || results.length === 0) {
      return this._emptyResult();
    }

    // 过滤失败的结果
    const successfulResults = results.filter(r => r.success);
    if (successfulResults.length === 0) {
      return this._buildMergedResult({
        success: false,
        results,
        error: 'All tool executions failed',
        mergedOutput: null
      });
    }

    // 过滤失败
    const failedResults = results.filter(r => !r.success);

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
   * 高优先级结果覆盖低优先级结果
   * @param {ToolResult[]} results - 工具结果
   * @returns {Object} 合并结果
   */
  mergeByPriority(results) {
    // 按优先级排序
    const sorted = this._sortByPriority(results);

    const successfulResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);

    // 收集所有成功结果的内容
    const contents = [];
    const byTool = {};
    const conflictingKeys = new Set();

    // 初始化工具结果映射
    for (const result of sorted) {
      byTool[result.tool] = result;
    }

    // 检测冲突（同一字段被多个工具输出）
    const fieldSources = new Map();
    for (const result of sorted) {
      if (!result.success) continue;

      const data = this._normalizeResult(result);
      for (const key of Object.keys(data)) {
        if (fieldSources.has(key)) {
          conflictingKeys.add(key);
        } else {
          fieldSources.set(key, result.tool);
        }
      }
    }

    // 按优先级解决冲突
    const resolvedData = {};
    for (const [key, firstTool] of fieldSources) {
      if (conflictingKeys.has(key)) {
        // 冲突存在，按优先级解决
        resolvedData[key] = this._resolveFieldConflict(key, sorted);
      } else {
        // 无冲突，使用唯一来源
        const sourceResult = byTool[firstTool];
        const data = this._normalizeResult(sourceResult);
        resolvedData[key] = data[key];
      }
    }

    return this._buildMergedResult({
      success: true,
      results,
      successfulCount: successfulResults.length,
      failedCount: failedResults.length,
      mergedOutput: this._formatMergedOutput(resolvedData, sorted),
      toolOutputs: byTool,
      conflicts: Array.from(conflictingKeys),
      resolvedConflicts: conflictingKeys.size,
      executionOrder: sorted.map(r => r.tool)
    });
  }

  /**
   * 按相关性合并结果
   * 根据查询相关性分配权重
   * @param {ToolResult[]} results - 工具结果
   * @param {Object} context - 上下文（包含query等）
   * @returns {Object} 合并结果
   */
  mergeByRelevance(results, context = {}) {
    const { query } = context;

    // 计算每个结果的相关性得分
    const scored = results
      .filter(r => r.success)
      .map(result => {
        const relevance = this._calculateRelevance(result, query);
        return { ...result, relevance };
      })
      .sort((a, b) => b.relevance - a.relevance);

    if (scored.length === 0) {
      return this._buildMergedResult({
        success: false,
        results,
        error: 'No successful results'
      });
    }

    // 加权合并
    const mergedData = this._weightedMerge(scored);

    return this._buildMergedResult({
      success: true,
      results,
      mergedOutput: mergedData,
      topRelevance: scored[0]?.relevance || 0,
      relevanceScores: scored.map(s => ({
        tool: s.tool,
        relevance: s.relevance
      }))
    });
  }

  /**
   * 顺序合并
   * 按原始顺序拼接结果
   * @param {ToolResult[]} results - 工具结果
   * @returns {Object} 合并结果
   */
  mergeSequential(results) {
    const outputs = [];
    const details = [];

    for (const result of results) {
      if (result.success) {
        outputs.push(this._extractOutput(result));
        details.push({
          tool: result.tool,
          status: 'success',
          output: this._extractOutput(result)
        });
      } else {
        details.push({
          tool: result.tool,
          status: 'failed',
          error: result.error
        });
      }
    }

    return this._buildMergedResult({
      success: true,
      results,
      mergedOutput: outputs.join('\n'),
      executionDetails: details
    });
  }

  /**
   * 联合合并
   * 合并所有不冲突的字段
   * @param {ToolResult[]} results - 工具结果
   * @returns {Object} 合并结果
   */
  mergeUnion(results) {
    const union = {};
    const mergedKeys = new Set();

    for (const result of results) {
      if (!result.success) continue;

      const data = this._normalizeResult(result);
      for (const [key, value] of Object.entries(data)) {
        if (!mergedKeys.has(key)) {
          union[key] = value;
          mergedKeys.add(key);
        }
      }
    }

    return this._buildMergedResult({
      success: true,
      results,
      mergedOutput: union,
      mergedKeys: Array.from(mergedKeys)
    });
  }

  /**
   * 交集合并
   * 仅保留所有成功结果中都有的字段
   * @param {ToolResult[]} results - 工具结果
   * @returns {Object} 合并结果
   */
  mergeIntersection(results) {
    const successful = results.filter(r => r.success);
    if (successful.length === 0) {
      return this._buildMergedResult({
        success: false,
        results,
        error: 'No successful results'
      });
    }

    // 获取第一个结果的字段作为初始交集
    const firstData = this._normalizeResult(successful[0]);
    let intersection = new Set(Object.keys(firstData));

    // 与其他结果取交集
    for (const result of successful.slice(1)) {
      const data = this._normalizeResult(result);
      const keys = new Set(Object.keys(data));
      intersection = new Set([...intersection].filter(k => keys.has(k)));
    }

    // 构建交集结果
    const intersectionData = {};
    for (const key of intersection) {
      // 对于有多个值的字段，取第一个
      intersectionData[key] = successful[0]?.result?.[key] || successful[0]?.result;
    }

    return this._buildMergedResult({
      success: true,
      results,
      mergedOutput: Object.keys(intersectionData).length > 0 ? intersectionData : null,
      commonKeys: Array.from(intersection)
    });
  }

  /**
   * 结果去重
   * @param {ToolResult[]} results - 工具结果
   * @returns {ToolResult[]} 去重后的结果
   */
  deduplicate(results) {
    const seen = new Map();
    const deduped = [];

    for (const result of results) {
      // 生成唯一键
      const key = this._generateResultKey(result);

      if (!seen.has(key)) {
        seen.set(key, result);
        deduped.push(result);
      } else {
        // 保留更早的结果（更可靠）
        const existing = seen.get(key);
        if (result.executionTime < (existing.executionTime || Infinity)) {
          seen.set(key, result);
          // 替换
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
   * 解决结果冲突
   * @param {ToolResult[]} results - 工具结果
   * @param {string} strategy - 冲突解决策略
   * @returns {Object} 解决后的结果
   */
  resolveConflicts(results, strategy = null) {
    const resolution = strategy || this.conflictResolution;
    const conflicts = this._detectConflicts(results);

    if (conflicts.length === 0) {
      return {
        resolved: true,
        conflicts: [],
        results
      };
    }

    const resolvedResults = [...results];

    for (const conflict of conflicts) {
      const resolved = this._resolveConflict(resolve, conflict, resolution);
      // 更新结果
      const idx = resolvedResults.findIndex(r => r.tool === conflict.tool);
      if (idx !== -1) {
        resolvedResults[idx] = resolved;
      }
    }

    return {
      resolved: true,
      conflicts,
      results: resolvedResults
    };
  }

  /**
   * 检测结果中的冲突
   * @private
   */
  _detectConflicts(results) {
    const conflicts = [];
    const fieldValues = new Map();

    for (const result of results) {
      if (!result.success) continue;

      const data = this._normalizeResult(result);
      for (const [key, value] of Object.entries(data)) {
        const serialized = JSON.stringify(value);
        if (fieldValues.has(key)) {
          const existing = fieldValues.get(key);
          if (existing.value !== serialized && existing.tool !== result.tool) {
            conflicts.push({
              field: key,
              tool: result.tool,
              conflictingTools: [existing.tool, result.tool],
              existingValue: existing.value,
              newValue: serialized
            });
          }
        } else {
          fieldValues.set(key, {
            value: serialized,
            tool: result.tool
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * 解决单个字段冲突
   * @private
   */
  _resolveFieldConflict(key, sortedResults) {
    // 按优先级选择
    for (const result of sortedResults) {
      if (!result.success) continue;
      const data = this._normalizeResult(result);
      if (key in data) {
        return data[key];
      }
    }
    return null;
  }

  /**
   * 解决冲突
   * @private
   */
  _resolveConflict(result, conflict, strategy) {
    switch (strategy) {
      case ConflictResolution.FIRST:
        return result;

      case ConflictResolution.LAST:
        return conflict;

      case ConflictResolution.MERGE:
        // 合并内容
        return {
          ...result,
          result: `[Merged] ${result.result} | ${conflict.result}`
        };

      case ConflictResolution.DISCARD:
        return { ...result, discarded: true };

      default:
        return result;
    }
  }

  /**
   * 计算相关性得分
   * @private
   */
  _calculateRelevance(result, query) {
    if (!query) {
      return this._getPriority(result.tool);
    }

    // 基于查询词在结果中出现的次数计算
    const queryLower = query.toLowerCase();
    const resultStr = JSON.stringify(result.result || '').toLowerCase();

    let score = 0;
    const queryWords = queryLower.split(/\s+/);

    for (const word of queryWords) {
      if (resultStr.includes(word)) {
        score += 1;
      }
    }

    // 归一化到0-1
    const normalized = score / Math.max(queryWords.length, 1);

    // 加上优先级权重
    const priorityWeight = this._getPriority(result.tool) / 100;
    return normalized * 0.7 + priorityWeight * 0.3;
  }

  /**
   * 加权合并
   * @private
   */
  _weightedMerge(scoredResults) {
    if (scoredResults.length === 0) return null;
    if (scoredResults.length === 1) return scoredResults[0].result;

    const weights = scoredResults.map(r => r.relevance);
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    // 加权平均（适用于数值类型）
    const first = scoredResults[0];
    const data = this._normalizeResult(first);

    // 如果是数值数组，进行加权平均
    if (Array.isArray(first.result)) {
      const weightedSum = scoredResults.reduce((acc, r, i) => {
        const weight = weights[i] / totalWeight;
        return acc + (r.result * weight);
      }, 0);
      return weightedSum;
    }

    // 否则返回相关性最高的结果
    return first.result;
  }

  /**
   * 按优先级排序
   * @private
   */
  _sortByPriority(results) {
    return [...results].sort((a, b) => {
      const priorityA = this._getPriority(a.tool);
      const priorityB = this._getPriority(b.tool);
      return priorityB - priorityA;
    });
  }

  /**
   * 获取工具优先级
   * @private
   */
  _getPriority(toolName) {
    return this.priorityMap.get(toolName) ?? this.defaultPriority;
  }

  /**
   * 标准化结果数据
   * @private
   */
  _normalizeResult(result) {
    if (!result.result) return {};
    if (typeof result.result === 'object') return result.result;
    try {
      return JSON.parse(result.result);
    } catch {
      return { content: result.result };
    }
  }

  /**
   * 提取输出内容
   * @private
   */
  _extractOutput(result) {
    if (!result.result) return '';
    if (typeof result.result === 'string') return result.result;
    return JSON.stringify(result.result, null, 2);
  }

  /**
   * 格式化合并输出
   * @private
   */
  _formatMergedOutput(data, sortedResults) {
    if (typeof data === 'object' && data !== null) {
      return data;
    }
    return data;
  }

  /**
   * 生成结果唯一键
   * @private
   */
  _generateResultKey(result) {
    const parts = [result.tool];
    if (result.result !== undefined) {
      parts.push(JSON.stringify(result.result));
    }
    return parts.join('|');
  }

  /**
   * 构建合并结果
   * @private
   */
  _buildMergedResult(data) {
    return {
      success: data.success ?? false,
      error: data.error || null,
      results: data.results || [],
      successfulCount: data.successfulCount ?? data.results?.filter(r => r.success).length ?? 0,
      failedCount: data.failedCount ?? data.results?.filter(r => !r.success).length ?? 0,
      mergedOutput: data.mergedOutput ?? null,
      ...data
    };
  }

  /**
   * 返回空结果
   * @private
   */
  _emptyResult() {
    return {
      success: false,
      error: 'No results to merge',
      results: [],
      successfulCount: 0,
      failedCount: 0,
      mergedOutput: null
    };
  }

  /**
   * 设置工具优先级
   * @param {string} toolName - 工具名称
   * @param {number} priority - 优先级（越高越优先）
   */
  setPriority(toolName, priority) {
    this.priorityMap.set(toolName, priority);
  }

  /**
   * 批量设置优先级
   * @param {Array<{tool: string, priority: number}>} priorities - 优先级配置
   */
  setPriorities(priorities) {
    for (const { tool, priority } of priorities) {
      this.priorityMap.set(tool, priority);
    }
  }
}

/**
 * 创建结果合并器实例
 * @param {Object} options - 配置选项
 * @returns {ToolResultMerger}
 */
function createToolResultMerger(options = {}) {
  return new ToolResultMerger(options);
}

module.exports = {
  ToolResultMerger,
  MergeStrategy,
  ConflictResolution,
  createToolResultMerger
};
