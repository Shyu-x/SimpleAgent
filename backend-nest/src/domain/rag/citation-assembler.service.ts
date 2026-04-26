import { Injectable } from '@nestjs/common';

/**
 * 引用类型
 */
export enum CitationType {
  PASSAGE = 'passage',
  SENTENCE = 'sentence',
  PHRASE = 'phrase',
  FORMULA = 'formula',
  CODE = 'code',
}

/**
 * 引用格式类型
 */
export enum CitationFormat {
  PLAIN = 'plain',
  NUMBERED = 'numbered',
  AUTHOR_DATE = 'author_date',
  FOOTNOTE = 'footnote',
  INLINE = 'inline',
}

/**
 * 引用来源类型
 */
export enum CitationSource {
  KNOWLEDGE_BASE = 'knowledge_base',
  WEB_SEARCH = 'web_search',
  DOCUMENT = 'document',
  CONVERSATION = 'conversation',
  EXTERNAL = 'external',
}

/**
 * 引用对象接口
 */
export interface Citation {
  id: string;
  type: CitationType;
  text: string;
  source: {
    type: CitationSource;
    id?: string;
    name?: string;
  };
  position: {
    start: number;
    end: number;
    paragraph: number;
    sentence: number;
  };
  relevance: {
    score: number;
    matchedTerms: string[];
    snippet: string | null;
  };
  metadata: {
    title?: string;
    author?: string | null;
    date?: string | null;
    url?: string | null;
    page?: string | null;
    license?: string | null;
  };
  formatted?: Record<string, string | null>;
}

/**
 * 组装结果接口
 */
export interface AssemblyResult {
  citations: Citation[];
  formattedCitations: any[];
  sourceMap: Record<string, any>;
  summary: {
    query: string;
    totalCitations: number;
    uniqueSources: number;
    sourceTypes: string[];
    averageRelevance: string;
    topCitation: {
      id: string;
      score: number;
      title?: string;
    };
    matchedTerms: string[];
  } | null;
  metadata: {
    totalResults: number;
    uniqueCitations: number;
    duplicateCount: number;
    averageRelevance: number;
  };
}

/**
 * 引用组装服务
 * 检索结果的引用追溯和组装
 */
@Injectable()
export class CitationAssemblerService {
  private maxCitationLength = 300;
  private contextWords = 20;

  private stats = {
    totalAssemblies: 0,
    totalCitations: 0,
    duplicateCount: 0,
  };

  /**
   * 组装引用
   */
  assemble(results: any[], query: string, options: any = {}): AssemblyResult {
    this.stats.totalAssemblies++;

    if (!results || !results.length) {
      return {
        citations: [],
        formattedCitations: [],
        sourceMap: {},
        summary: null,
        metadata: {
          totalResults: 0,
          uniqueCitations: 0,
          duplicateCount: 0,
          averageRelevance: 0,
        },
      };
    }

    // 1. 提取引用
    const citations = this.extractCitations(results, query);
    this.stats.totalCitations += citations.length;

    // 2. 去重统计
    const uniqueCount = citations.length;
    const duplicateCount = results.length - uniqueCount;
    this.stats.duplicateCount += duplicateCount;

    // 3. 关联到原文
    const linkedCitations = this.linkCitations(citations, options.context);

    // 4. 格式化引用
    const formattedCitations = this.formatAllCitations(linkedCitations, options);

    // 5. 构建source map
    const sourceMap = this.buildSourceMap(linkedCitations);

    // 6. 生成摘要
    const summary = this.generateSummary(linkedCitations, query);

    return {
      citations: linkedCitations,
      formattedCitations,
      sourceMap,
      summary,
      metadata: {
        totalResults: results.length,
        uniqueCitations: uniqueCount,
        duplicateCount,
        averageRelevance: this.calculateAverageRelevance(citations),
      },
    };
  }

  /**
   * 从检索结果中提引用
   */
  private extractCitations(results: any[], query: string): Citation[] {
    const citations: Citation[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const citation = this.extractFromResult(result, query, i);

      if (citation && !this.isDuplicate(citation, seen)) {
        citations.push(citation);
        seen.add(citation.text.substring(0, 50));
      }
    }

    return citations;
  }

  /**
   * 从单个结果提引用
   */
  private extractFromResult(result: any, query: string, index: number): Citation | null {
    const content = result.content || '';
    const metadata = result.metadata || {};

    const snippet = this.extractSnippet(content, query);
    const type = this.detectCitationType(content, snippet);

    return {
      id: `cite_${index}_${Date.now()}`,
      type,
      text: snippet,
      source: {
        type: metadata.sourceType || CitationSource.KNOWLEDGE_BASE,
        id: metadata.sourceId || result.id || `result_${index}`,
        name: metadata.sourceName || metadata.title || '未知来源',
      },
      position: this.findPosition(content, snippet),
      relevance: {
        score: result.score || result.relevance || 0,
        matchedTerms: this.extractMatchedTerms(query, snippet),
        snippet,
      },
      metadata: {
        title: metadata.title || '未知标题',
        author: metadata.author || null,
        date: metadata.date || metadata.createdAt || null,
        url: metadata.url || null,
        page: metadata.page || null,
        license: metadata.license || null,
      },
    };
  }

  /**
   * 提取匹配片段
   */
  private extractSnippet(content: string, query: string): string {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const sentences = content.split(/[。！？；\n]/);

    let bestSentence = sentences[0] || content;
    let maxMatches = 0;

    for (const sentence of sentences) {
      const sentenceLower = sentence.toLowerCase();
      const matches = queryTerms.filter((term) => sentenceLower.includes(term)).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        bestSentence = sentence.trim();
      }
    }

    if (bestSentence.length > this.maxCitationLength) {
      const truncated = bestSentence.substring(0, this.maxCitationLength);
      const lastPunct = Math.max(truncated.lastIndexOf('，'), truncated.lastIndexOf('、'), truncated.lastIndexOf(' '));

      if (lastPunct > this.maxCitationLength * 0.5) {
        bestSentence = truncated.substring(0, lastPunct + 1) + '...';
      } else {
        bestSentence = truncated + '...';
      }
    }

    return bestSentence;
  }

  /**
   * 检测引用类型
   */
  private detectCitationType(content: string, snippet: string): CitationType {
    if (/```[\s\S]*?```/.test(snippet) || /`[^`]+`/.test(snippet)) {
      return CitationType.CODE;
    }
    if (/\$\$[\s\S]*?\$\$|\$[^$]+\$/.test(snippet) || /\d+\s*[+\-*/=]\s*\d+/.test(snippet)) {
      return CitationType.FORMULA;
    }
    return CitationType.PASSAGE;
  }

  /**
   * 查找片段在原文中的位置
   */
  private findPosition(content: string, snippet: string): { start: number; end: number; paragraph: number; sentence: number } {
    const start = content.indexOf(snippet);
    if (start === -1) {
      return { start: 0, end: snippet.length, paragraph: 0, sentence: 0 };
    }

    const end = start + snippet.length;
    const beforeSnippet = content.substring(0, start);
    const paragraph = (beforeSnippet.match(/[。！？；\n]/g) || []).length;
    const sentence = (beforeSnippet.match(/[。！？]/g) || []).length;

    return { start, end, paragraph, sentence };
  }

  /**
   * 提取匹配词
   */
  private extractMatchedTerms(query: string, snippet: string): string[] {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const snippetLower = snippet.toLowerCase();
    return queryTerms.filter((term) => term.length > 1 && snippetLower.includes(term));
  }

  /**
   * 检查重复引用
   */
  private isDuplicate(citation: Citation, seen: Set<string>): boolean {
    return seen.has(citation.text.substring(0, 50));
  }

  /**
   * 关联引用到原文
   */
  private linkCitations(citations: Citation[], context: any = {}): Citation[] {
    return citations.map((citation) => {
      const linked = { ...citation };

      if (citation.metadata.url) {
        linked.metadata = {
          ...linked.metadata,
        };
      }

      return linked;
    });
  }

  /**
   * 批量格式化引用
   */
  private formatAllCitations(citations: Citation[], options: any = {}): any[] {
    const format = options.format || CitationFormat.PLAIN;

    return citations.map((citation, index) => ({
      ...citation,
      _index: index,
      _formatted: this.formatCitation(citation, format, index),
      _tooltip: this.generateTooltip(citation),
    }));
  }

  /**
   * 格式化单个引用
   */
  formatCitation(citation: Citation, format: CitationFormat = CitationFormat.PLAIN, index: number = 0): string {
    const prefix = '[';
    const suffix = ']';
    const num = index + 1;

    switch (format) {
      case CitationFormat.PLAIN:
      case CitationFormat.NUMBERED:
        return `${prefix}${num}${suffix}`;
      case CitationFormat.AUTHOR_DATE:
        const author = citation.metadata.author || 'Unknown';
        const date = citation.metadata.date || 'n.d.';
        return `(${author}, ${date})`;
      case CitationFormat.FOOTNOTE:
        return `[${num}] ${citation.metadata.title || '未知来源'}`;
      case CitationFormat.INLINE:
        const text = citation.text.length > 100 ? citation.text.substring(0, 100) + '...' : citation.text;
        return `"${text}"${prefix}${num}${suffix}`;
      default:
        return `${prefix}${num}${suffix}`;
    }
  }

  /**
   * 生成悬停提示
   */
  private generateTooltip(citation: Citation): string {
    return `<b>来源</b>: ${citation.metadata.title || '未知来源'}<br/><b>相关性</b>: ${(citation.relevance.score * 100).toFixed(0)}%<br/><b>日期</b>: ${citation.metadata.date || '未知日期'}`;
  }

  /**
   * 构建source映射
   */
  private buildSourceMap(citations: Citation[]): Record<string, any> {
    const sourceMap: Record<string, any> = {};

    for (const citation of citations) {
      const sourceId = citation.source.id || citation.source.name || 'unknown';

      if (!sourceMap[sourceId]) {
        sourceMap[sourceId] = {
          id: sourceId,
          name: citation.source.name || '未知来源',
          type: citation.source.type,
          metadata: {
            title: citation.metadata.title,
            author: citation.metadata.author,
            date: citation.metadata.date,
            url: citation.metadata.url,
          },
          citationIds: [],
        };
      }

      sourceMap[sourceId].citationIds.push(citation.id);
    }

    return sourceMap;
  }

  /**
   * 生成引用摘要
   */
  private generateSummary(citations: Citation[], query: string): any | null {
    if (!citations.length) return null;

    const totalCitations = citations.length;
    const avgRelevance = this.calculateAverageRelevance(citations);
    const sources = new Set(citations.map((c) => c.source.id || c.source.name));
    const types = new Set(citations.map((c) => c.type));

    const topCitation = citations.reduce((best, current) => (current.relevance.score > best.relevance.score ? current : best), citations[0]);

    return {
      query,
      totalCitations,
      uniqueSources: sources.size,
      sourceTypes: Array.from(types),
      averageRelevance: avgRelevance.toFixed(3),
      topCitation: {
        id: topCitation.id,
        score: topCitation.relevance.score,
        title: topCitation.metadata.title,
      },
      matchedTerms: topCitation.relevance.matchedTerms,
    };
  }

  /**
   * 计算平均相关性
   */
  private calculateAverageRelevance(citations: Citation[]): number {
    if (!citations.length) return 0;
    const sum = citations.reduce((acc, c) => acc + (c.relevance.score || 0), 0);
    return sum / citations.length;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      averageCitationsPerAssembly:
        this.stats.totalAssemblies > 0 ? (this.stats.totalCitations / this.stats.totalAssemblies).toFixed(2) : '0',
    };
  }
}
