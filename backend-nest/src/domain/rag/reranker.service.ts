import { Injectable } from '@nestjs/common';

/**
 * 重排序策略类型
 */
export enum RerankStrategy {
  CROSS_ENCODER = 'cross_encoder_rerank',
  BM25 = 'bm25_score_boost',
  SEMANTIC = 'semantic_similarity',
  DIVERSITY = 'diversity_boost',
}

/**
 * 检索结果接口
 */
export interface SearchResult {
  id: string;
  content: string;
  score: number;
  metadata?: Record<string, any>;
}

/**
 * 重排序结果接口
 */
export interface RerankResult extends SearchResult {
  rerankRank?: number;
  metadata: {
    originalRank?: number;
    rerankScore?: number;
    crossEncoderScore?: number;
    bm25Boost?: number;
    semanticScore?: number;
    diversityScore?: number;
    finalScore?: number;
    [key: string]: any;
  };
}

/**
 * 策略权重配置
 */
const DEFAULT_STRATEGY_WEIGHTS = {
  [RerankStrategy.CROSS_ENCODER]: 0.5,
  [RerankStrategy.BM25]: 0.2,
  [RerankStrategy.SEMANTIC]: 0.2,
  [RerankStrategy.DIVERSITY]: 0.1,
};

/**
 * 领域层重排序服务
 * 支持多种重排序策略：Cross-Encoder、BM25、语义相似度、多样性提升
 */
@Injectable()
export class RerankerService {
  private topK = 10;
  private enabled = true;
  private strategyWeights = { ...DEFAULT_STRATEGY_WEIGHTS };
  private strategiesEnabled: Record<RerankStrategy, boolean> = {
    [RerankStrategy.CROSS_ENCODER]: false,
    [RerankStrategy.BM25]: true,
    [RerankStrategy.SEMANTIC]: true,
    [RerankStrategy.DIVERSITY]: true,
  };

  private stats = {
    totalReranks: 0,
    strategyUsage: {} as Record<string, { count: number; totalLatencyMs: number }>,
    averageLatencyMs: 0,
  };

  /**
   * 执行重排序
   */
  async rerank(query: string, results: SearchResult[], options: { topK?: number; strategies?: RerankStrategy[] } = {}): Promise<RerankResult[]> {
    const startTime = Date.now();
    this.stats.totalReranks++;

    if (!this.enabled || !results || results.length === 0) {
      return results as RerankResult[];
    }

    const topK = options.topK || this.topK;
    const strategyList = options.strategies || Object.keys(this.strategiesEnabled).filter((s) => this.strategiesEnabled[s as RerankStrategy]) as RerankStrategy[];

    try {
      let currentResults = [...results];

      // 按顺序执行各策略
      for (const strategyName of strategyList) {
        if (!this.strategiesEnabled[strategyName]) continue;

        const strategyStart = Date.now();
        currentResults = await this.executeStrategy(strategyName, query, currentResults);

        const strategyLatency = Date.now() - strategyStart;
        if (!this.stats.strategyUsage[strategyName]) {
          this.stats.strategyUsage[strategyName] = { count: 0, totalLatencyMs: 0 };
        }
        this.stats.strategyUsage[strategyName].count++;
        this.stats.strategyUsage[strategyName].totalLatencyMs += strategyLatency;
      }

      // 综合评分并排序
      const finalResults = this.computeFinalScores(currentResults, strategyList);

      // 截取topK
      const topResults = finalResults
        .sort((a, b) => (b.metadata.finalScore || 0) - (a.metadata.finalScore || 0))
        .slice(0, topK)
        .map((r, i) => ({
          ...r,
          rerankRank: i,
          metadata: {
            ...r.metadata,
            originalRank: (r as any)._originalIndex,
            finalScore: r.metadata.finalScore,
          },
        }));

      const latency = Date.now() - startTime;
      this.stats.averageLatencyMs = (this.stats.averageLatencyMs * (this.stats.totalReranks - 1) + latency) / this.stats.totalReranks;

      return topResults;
    } catch (error) {
      console.error('[Reranker] 重排序异常:', error);
      return results.sort((a, b) => b.score - a.score).slice(0, topK) as RerankResult[];
    }
  }

  /**
   * 执行单个策略
   */
  private async executeStrategy(strategy: RerankStrategy, query: string, results: SearchResult[]): Promise<RerankResult[]> {
    switch (strategy) {
      case RerankStrategy.BM25:
        return this.bm25Rerank(query, results);
      case RerankStrategy.SEMANTIC:
        return this.semanticRerank(query, results);
      case RerankStrategy.DIVERSITY:
        return this.diversityRerank(query, results);
      case RerankStrategy.CROSS_ENCODER:
        // Cross-Encoder 需要 LLM 调用，这里简化处理
        return results as RerankResult[];
      default:
        return results as RerankResult[];
    }
  }

  /**
   * BM25 重排序
   */
  private bm25Rerank(query: string, results: SearchResult[]): RerankResult[] {
    const queryTerms = this.tokenize(query);
    const avgDocLength = 100;

    return results.map((result) => {
      const content = result.content || '';
      const docLength = this.tokenize(content).length;

      let bm25Score = 0;
      let matchedTerms = 0;

      for (const term of queryTerms) {
        const tf = this.countTermFrequency(term, content);
        if (tf > 0) {
          matchedTerms++;
          const numerator = tf * (1.5 + 1);
          const denominator = tf + 1.5 * (1 - 0.75 + 0.75 * (docLength / avgDocLength));
          bm25Score += numerator / denominator;
        }
      }

      const normalizedBoost = matchedTerms > 0 ? (bm25Score / queryTerms.length) * 0.3 : 0;

      return {
        ...result,
        metadata: {
          ...result.metadata,
          bm25Boost: normalizedBoost,
          matchedTerms,
        },
      };
    });
  }

  /**
   * 语义相似度重排序
   */
  private semanticRerank(query: string, results: SearchResult[]): RerankResult[] {
    return results.map((result) => {
      const content = result.content || '';
      const density = this.calculateDensity(content);

      return {
        ...result,
        metadata: {
          ...result.metadata,
          semanticScore: density,
        },
      };
    });
  }

  /**
   * 多样性提升重排序
   */
  private diversityRerank(query: string, results: SearchResult[]): RerankResult[] {
    if (results.length < 2) return results as RerankResult[];

    // 使用扩展接口保存临时分数
    interface ScoredResult extends RerankResult {
      _originalIndex: number;
      _diversityScore: number;
    }

    const scored: ScoredResult[] = results.map((r, i) => ({
      ...r,
      metadata: r.metadata || {},
      _originalIndex: i,
      _diversityScore: 0,
    }));

    const selected: ScoredResult[] = [];
    const remaining = [...scored];
    const lambda = 0.8;
    const decayFactor = 0.9;

    while (remaining.length > 0) {
      let bestScore = -Infinity;
      let bestIdx = 0;

      for (let i = 0; i < remaining.length; i++) {
        const result = remaining[i];
        const baseScore = result.score || 0;

        let maxSimilarity = 0;
        for (const sel of selected) {
          const similarity = this.calculateSimilarity(result.content, sel.content);
          maxSimilarity = Math.max(maxSimilarity, similarity);
        }

        const mmrScore = lambda * baseScore - (1 - lambda) * maxSimilarity;
        const positionPenalty = Math.pow(decayFactor, selected.length);
        const finalScore = mmrScore * positionPenalty;

        if (finalScore > bestScore) {
          bestScore = finalScore;
          bestIdx = i;
        }
      }

      const selectedItem = remaining.splice(bestIdx, 1)[0];
      selectedItem._diversityScore = bestScore;
      selected.push(selectedItem);
    }

    return selected
      .sort((a, b) => (b._diversityScore || 0) - (a._diversityScore || 0))
      .map((r, i) => ({
        ...r,
        metadata: {
          ...r.metadata,
          diversityScore: r._diversityScore,
          diversityRank: i,
        },
      }));
  }

  /**
   * 计算最终综合分数
   */
  private computeFinalScores(results: RerankResult[] | SearchResult[], strategyList: RerankStrategy[]): RerankResult[] {
    return (results as RerankResult[]).map((result) => {
      let weightedScore = 0;
      let usedWeight = 0;

      for (const strategyName of strategyList) {
        if (!this.strategiesEnabled[strategyName]) continue;

        const weight = this.strategyWeights[strategyName] || 1;
        let strategyScore = 0;

        switch (strategyName) {
          case RerankStrategy.BM25:
            strategyScore = result.metadata?.bm25Boost || 0;
            break;
          case RerankStrategy.SEMANTIC:
            strategyScore = result.metadata?.semanticScore || 0;
            break;
          case RerankStrategy.DIVERSITY:
            strategyScore = result.metadata?.diversityScore || 0;
            break;
          default:
            strategyScore = 0;
        }

        const normalizedScore = Math.min(Math.max(strategyScore, 0), 1);
        weightedScore += normalizedScore * weight;
        usedWeight += weight;
      }

      const originalScore = result.score || 0;
      const normalizedWeight = usedWeight / Object.values(this.strategyWeights).reduce((a, b) => a + b, 0);
      const finalScore = normalizedWeight * (weightedScore / usedWeight) + (1 - normalizedWeight) * originalScore;

      return {
        ...result,
        metadata: {
          ...result.metadata,
          finalScore,
        },
      };
    });
  }

  private tokenize(text: string): string[] {
    return (text || '')
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  private countTermFrequency(term: string, content: string): number {
    const tokens = this.tokenize(content);
    return tokens.filter((t) => t.includes(term)).length;
  }

  private calculateDensity(content: string): number {
    if (!content) return 0;
    const words = content.toLowerCase().split(/\s+/);
    const unique = new Set(words);
    return words.length > 0 ? unique.size / words.length : 0;
  }

  private calculateSimilarity(contentA: string, contentB: string): number {
    if (!contentA || !contentB) return 0;
    const wordsA = new Set(contentA.toLowerCase().split(/\s+/));
    const wordsB = new Set(contentB.toLowerCase().split(/\s+/));
    const intersection = new Set([...wordsA].filter((x) => wordsB.has(x)));
    const union = new Set([...wordsA, ...wordsB]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * 启用/禁用策略
   */
  setStrategyEnabled(strategy: RerankStrategy, enabled: boolean): void {
    this.strategiesEnabled[strategy] = enabled;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      strategyWeights: { ...this.strategyWeights },
      registeredStrategies: Object.keys(this.strategiesEnabled),
      averageLatencyMs: this.stats.averageLatencyMs.toFixed(2),
    };
  }
}
