import { Injectable } from '@nestjs/common';

/**
 * 拆分类型枚举
 */
export enum DecomposeType {
  SEQUENTIAL = 'sequential',
  PARALLEL = 'parallel',
  HYBRID = 'hybrid',
}

/**
 * 子问题接口
 */
export interface SubQuestion {
  id: string;
  question: string;
  dimension: string;
  order: number;
  dependOn: string[];
  priority: number;
  answer?: string;
}

/**
 * 拆分结果接口
 */
export interface DecomposeResult {
  subQuestions: SubQuestion[];
  type: DecomposeType | null;
  reasoning: string;
  confidence: number;
  shouldDecompose: boolean;
  error?: string;
}

/**
 * 问题拆分服务
 * 将复杂问题拆分为多个可独立回答的子问题
 */
@Injectable()
export class QueryDecomposeService {
  private maxSubQuestions = 5;
  private confidenceThreshold = 0.5;
  private enableLLMDetect = true;

  private stats = {
    totalDecomposes: 0,
    successfulDecomposes: 0,
    skippedDecomposes: 0,
    failures: 0,
    averageSubQuestions: 0,
    averageLatencyMs: 0,
  };

  /**
   * 主拆分接口
   */
  async decompose(complexQuery: string, context: any = {}): Promise<DecomposeResult> {
    const startTime = Date.now();
    this.stats.totalDecomposes++;

    try {
      if (!complexQuery || complexQuery.trim() === '') {
        return {
          subQuestions: [],
          type: null,
          reasoning: '空查询无需拆分',
          confidence: 1.0,
          shouldDecompose: false,
        };
      }

      const trimmedQuery = complexQuery.trim();

      // 1. 判断是否需要拆分
      const shouldDecomposeResult = this.quickDetect(trimmedQuery);

      if (!shouldDecomposeResult.shouldDecompose) {
        this.stats.skippedDecomposes++;
        return {
          subQuestions: [
            {
              id: 'q-0',
              question: trimmedQuery,
              dimension: 'main',
              order: 0,
              dependOn: [],
              priority: 1.0,
            },
          ],
          type: null,
          reasoning: shouldDecomposeResult.reasoning,
          confidence: shouldDecomposeResult.confidence,
          shouldDecompose: false,
        };
      }

      // 2. 执行拆分
      const decomposition = await this.decomposeWithLLM(trimmedQuery, context);

      // 3. 验证和排序
      const validated = this.validateAndSort(decomposition);

      this.stats.successfulDecomposes++;

      return {
        ...validated,
        shouldDecompose: true,
      };
    } catch (error) {
      this.stats.failures++;

      // 降级：返回原始查询作为单一子问题
      return {
        subQuestions: [
          {
            id: 'q-0',
            question: complexQuery,
            dimension: 'main',
            order: 0,
            dependOn: [],
            priority: 1.0,
          },
        ],
        type: null,
        reasoning: '拆分失败，降级为单一问题',
        confidence: 0.3,
        shouldDecompose: false,
        error: error.message,
      };
    }
  }

  /**
   * 快速规则判断
   */
  private quickDetect(query: string): { shouldDecompose: boolean; reasoning: string; confidence: number; type?: DecomposeType } {
    const decomposePatterns = [
      { pattern: /比较|对比|差异|不同/, type: DecomposeType.PARALLEL, reason: '包含对比/比较意图', weight: 0.9 },
      { pattern: /和.*和|以及.*和|既.*又/, type: DecomposeType.PARALLEL, reason: '包含多个并列项', weight: 0.85 },
      { pattern: /如何学会|怎么实现|步骤是/, type: DecomposeType.SEQUENTIAL, reason: '包含多步骤请求', weight: 0.8 },
      { pattern: /优缺点|利弊|优势.*劣势/, type: DecomposeType.PARALLEL, reason: '包含正反两面分析', weight: 0.9 },
    ];

    let bestMatch: { type: DecomposeType; reason: string; weight: number } | null = null;
    let bestWeight = 0;

    for (const { pattern, type, reason, weight } of decomposePatterns) {
      if (pattern.test(query) && weight > bestWeight) {
        bestMatch = { type, reason, weight };
        bestWeight = weight;
      }
    }

    const isComplexLength = query.length > 30;

    if (bestMatch) {
      const confidence = isComplexLength ? Math.min(bestMatch.weight + 0.1, 0.95) : bestMatch.weight;

      return {
        shouldDecompose: confidence >= this.confidenceThreshold,
        reasoning: bestMatch.reason,
        confidence,
        type: bestMatch.type,
      };
    }

    return {
      shouldDecompose: false,
      reasoning: isComplexLength ? '查询较复杂但未匹配明确拆分模式' : '查询较简单无需拆分',
      confidence: isComplexLength ? 0.4 : 0.2,
    };
  }

  /**
   * 使用LLM执行拆分（简化实现）
   */
  private async decomposeWithLLM(query: string, context: any): Promise<DecomposeResult> {
    // 简化实现：基于关键词规则拆分
    const quickResult = this.quickDetect(query);

    if (!quickResult.shouldDecompose) {
      return {
        subQuestions: [
          {
            id: 'q-0',
            question: query,
            dimension: 'main',
            order: 0,
            dependOn: [],
            priority: 1.0,
          },
        ],
        type: null,
        reasoning: quickResult.reasoning,
        confidence: quickResult.confidence,
        shouldDecompose: false,
      };
    }

    // 简化的拆分逻辑
    const subQuestions: SubQuestion[] = [];

    if (quickResult.type === DecomposeType.PARALLEL && query.includes('和')) {
      const parts = query.split('和');
      parts.forEach((part, index) => {
        subQuestions.push({
          id: `q-${index}`,
          question: part.trim(),
          dimension: '并行方面',
          order: index,
          dependOn: [],
          priority: 1 - index * 0.1,
        });
      });
    } else {
      // 默认返回原始问题
      subQuestions.push({
        id: 'q-0',
        question: query,
        dimension: 'main',
        order: 0,
        dependOn: [],
        priority: 1.0,
      });
    }

    return {
      subQuestions: subQuestions.slice(0, this.maxSubQuestions),
      type: quickResult.type || DecomposeType.PARALLEL,
      reasoning: '规则拆分',
      confidence: 0.6,
      shouldDecompose: true,
    };
  }

  /**
   * 验证和排序子问题
   */
  private validateAndSort(decomposition: DecomposeResult): DecomposeResult {
    let { subQuestions, type, reasoning, confidence } = decomposition;

    // 限制数量
    if (subQuestions.length > this.maxSubQuestions) {
      subQuestions = subQuestions.sort((a, b) => b.priority - a.priority).slice(0, this.maxSubQuestions);
    }

    // 重新编号
    subQuestions = subQuestions.map((sq, index) => ({
      ...sq,
      id: `q-${index}`,
      order: sq.order ?? index,
    }));

    return {
      subQuestions,
      type,
      reasoning,
      confidence,
      shouldDecompose: true,
    };
  }

  /**
   * 合并子问题结果
   */
  async mergeResults(subQuestions: SubQuestion[], originalQuery: string, options: any = {}): Promise<any> {
    const sorted = this.topologicalSort(subQuestions);

    const answerSummary = sorted.filter((sq) => sq.answer).map((sq) => `[子问题${sq.id}]: ${sq.question}\n回答: ${sq.answer}`).join('\n\n');

    return {
      mergedAnswer: answerSummary || '无法合并结果',
      keyPoints: [],
      conclusion: '',
    };
  }

  /**
   * 拓扑排序
   */
  private topologicalSort(subQuestions: SubQuestion[]): SubQuestion[] {
    const sorted: SubQuestion[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (sq: SubQuestion) => {
      if (visited.has(sq.id)) return;
      if (visiting.has(sq.id)) return;

      visiting.add(sq.id);

      for (const depId of sq.dependOn) {
        const dep = subQuestions.find((s) => s.id === depId);
        if (dep) visit(dep);
      }

      visiting.delete(sq.id);
      visited.add(sq.id);
      sorted.push(sq);
    };

    for (const sq of subQuestions) {
      visit(sq);
    }

    return sorted.map((sq, index) => ({ ...sq, order: index }));
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      successRate:
        this.stats.totalDecomposes > 0
          ? ((this.stats.successfulDecomposes + this.stats.skippedDecomposes) / this.stats.totalDecomposes * 100).toFixed(1) + '%'
          : '0%',
    };
  }
}
