import { Injectable } from '@nestjs/common';

/**
 * 重写类型枚举
 */
export enum RewriteType {
  CONTEXTUAL_COMPLETION = 'contextual_completion',
  SEMANTIC_EXPANSION = 'semantic_expansion',
  INTENT_PRESERVATION = 'intent_preservation',
  DISAMBIGUATION = 'disambiguation',
}

/**
 * 重写结果接口
 */
export interface RewriteResult {
  rewritten: string;
  type: RewriteType;
  confidence: number;
  changes: string[];
  original: string;
  timestamp: number;
  error?: string;
}

/**
 * 问题重写服务
 * 补全上下文、语义扩展、意图保持
 */
@Injectable()
export class QueryRewriteService {
  private maxHistoryMessages = 10;
  private confidenceThreshold = 0.5;
  private enableContextCompletion = true;
  private enableSemanticExpansion = true;

  private stats = {
    totalRewrites: 0,
    contextCompletions: 0,
    semanticExpansions: 0,
    intentPreservations: 0,
    failures: 0,
    averageLatencyMs: 0,
  };

  /**
   * 主重写接口
   */
  async rewrite(query: string, context: { messages?: any[] } = {}): Promise<RewriteResult> {
    const startTime = Date.now();
    this.stats.totalRewrites++;

    try {
      if (!query || query.trim() === '') {
        return {
          rewritten: query,
          type: RewriteType.INTENT_PRESERVATION,
          confidence: 1.0,
          changes: [],
          original: query,
          timestamp: Date.now(),
        };
      }

      const trimmedQuery = query.trim();

      // 1. 判断是否需要上下文补全
      let needsContextCompletion = false;
      if (this.enableContextCompletion && context.messages && context.messages.length > 0) {
        needsContextCompletion = this.needsContextCompletion(trimmedQuery);
      }

      // 2. 判断是否需要语义扩展
      let needsSemanticExpansion = this.needsSemanticExpansion(trimmedQuery);

      // 3. 根据情况选择重写策略
      let rewrittenQuery = trimmedQuery;
      let rewriteType = RewriteType.INTENT_PRESERVATION;
      const changes: string[] = [];

      if (needsContextCompletion) {
        // 上下文补全（简化实现）
        rewrittenQuery = await this.completeContext(trimmedQuery, context.messages || []);
        rewriteType = RewriteType.CONTEXTUAL_COMPLETION;
        changes.push(`上下文补全`);
        this.stats.contextCompletions++;
      } else if (needsSemanticExpansion) {
        // 语义扩展（简化实现）
        rewrittenQuery = await this.semanticExpansion(trimmedQuery);
        rewriteType = RewriteType.SEMANTIC_EXPANSION;
        changes.push(`语义扩展`);
        this.stats.semanticExpansions++;
      } else {
        // 意图保持（轻微规范化）
        const result = this.intentPreservation(trimmedQuery);
        rewrittenQuery = result.query;
        if (result.changed) {
          changes.push(`规范化`);
        }
        this.stats.intentPreservations++;
      }

      // 计算置信度
      const confidence = this.calculateConfidence(trimmedQuery, rewrittenQuery, needsContextCompletion, needsSemanticExpansion);

      return {
        rewritten: rewrittenQuery,
        type: rewriteType,
        confidence,
        changes,
        original: trimmedQuery,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.stats.failures++;
      return {
        rewritten: query,
        type: RewriteType.INTENT_PRESERVATION,
        confidence: 0.3,
        changes: [],
        original: query,
        timestamp: Date.now(),
        error: error.message,
      };
    }
  }

  /**
   * 判断是否需要上下文补全
   */
  private needsContextCompletion(query: string): boolean {
    const pronounPatterns = [/^(它|这个|那个|这|那|这些|那些)/, /^(我|你|他|她)/, /^(上述|前述|上面|刚才|之前)/, /继续/, /然后/, /还有呢/];

    const ellipsisPatterns = [/^[能会要请帮给将].{0,5}$/, /^[是很有有没有].{0,10}$/];

    return (
      pronounPatterns.some((p) => p.test(query)) ||
      ellipsisPatterns.some((p) => p.test(query)) ||
      query.length < 5
    );
  }

  /**
   * 判断是否需要语义扩展
   */
  private needsSemanticExpansion(query: string): boolean {
    const shortQuery = query.length < 15;
    const vaguePatterns = [/^(什么是|如何|怎么|怎样)/, /[东西事]/, /(好|坏|优|缺)/];

    return shortQuery && vaguePatterns.some((p) => p.test(query));
  }

  /**
   * 上下文补全（简化实现）
   */
  private async completeContext(query: string, messages: any[]): Promise<string> {
    // 简化：直接返回原查询
    // 实际应该使用 LLM 来补全上下文
    return query;
  }

  /**
   * 语义扩展（简化实现）
   */
  private async semanticExpansion(query: string): Promise<string> {
    // 简化：直接返回原查询
    // 实际应该使用 LLM 来生成扩展
    return query;
  }

  /**
   * 意图保持（轻微规范化）
   */
  private intentPreservation(query: string): { query: string; changed: boolean } {
    const normalized = query.replace(/\s+/g, ' ').replace(/[。！？]+$/, '').trim();

    return {
      query: normalized,
      changed: normalized !== query,
    };
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(original: string, rewritten: string, needsContext: boolean, needsExpansion: boolean): number {
    let confidence = 0.8;

    if (needsContext) confidence += 0.1;
    if (needsExpansion) confidence += 0.05;
    if (rewritten !== original) confidence += 0.05;
    if (rewritten.length < original.length * 0.5) confidence -= 0.2;
    if (rewritten.length > original.length * 3) confidence -= 0.1;

    return Math.min(Math.max(confidence, 0), 1);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      successRate:
        this.stats.totalRewrites > 0
          ? ((1 - this.stats.failures / this.stats.totalRewrites) * 100).toFixed(1) + '%'
          : '0%',
    };
  }
}
