/**
 * CitationAssembler - 领域层引用追溯组件
 *
 * 功能说明：
 * - 检索结果的引用追溯和组装
 * - 从检索结果中提取引用信息
 * - 格式化引用为可展示格式
 * - 关联引用到原文位置
 *
 * 企业级设计要点：
 * - 职责单一：只负责引用相关逻辑
 * - 可扩展：支持多种引用格式
 * - 可配置：引用样式可定制
 *
 * @author AI Chat 玩具团队
 * @date 2026-04-01
 */

// ==================== 常量定义 ====================

/**
 * 引用类型
 */
const CITATION_TYPES = {
  PASSAGE: 'passage',           // 段落引用
  SENTENCE: 'sentence',        // 句子引用
  PHRASE: 'phrase',             // 短语引用
  FORMULA: 'formula',           // 公式引用
  CODE: 'code'                  // 代码引用
};

/**
 * 引用格式类型
 */
const CITATION_FORMATS = {
  PLAIN: 'plain',               // 纯文本格式 [1]
  NUMBERED: 'numbered',         // 数字编号 [1][2]
  AUTHOR_DATE: 'author_date',   // 作者-日期 (Smith, 2020)
  FOOTNOTE: 'footnote',         // 脚注格式
  INLINE: 'inline'              // 行内引用 "text" [1]
};

/**
 * 引用位置标记
 */
const CITATION_SOURCE = {
  KNOWLEDGE_BASE: 'knowledge_base',   // 知识库
  WEB_SEARCH: 'web_search',           // 网络搜索
  DOCUMENT: 'document',               // 文档
  CONVERSATION: 'conversation',        // 对话历史
  EXTERNAL: 'external'                 // 外部来源
};

// ==================== 引用数据结构 ====================

/**
 * 创建引用对象
 *
 * @param {Object} options - 配置选项
 * @returns {Object} 引用对象
 */
function createCitation(options = {}) {
  return {
    // 引用ID
    id: options.id || `cite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,

    // 引用类型
    type: options.type || CITATION_TYPES.PASSAGE,

    // 引用内容
    text: options.text || '',

    // 原文位置
    source: {
      ...options.source,
      type: options.source?.type || CITATION_SOURCE.KNOWLEDGE_BASE
    },

    // 位置信息
    position: {
      start: options.position?.start ?? -1,
      end: options.position?.end ?? -1,
      paragraph: options.position?.paragraph ?? 0,
      sentence: options.position?.sentence ?? 0
    },

    // 相关性信息
    relevance: {
      score: options.relevance?.score ?? 0,
      matchedTerms: options.relevance?.matchedTerms || [],
      snippet: options.relevance?.snippet || null
    },

    // 引用元数据
    metadata: {
      title: options.metadata?.title || '未知来源',
      author: options.metadata?.author || null,
      date: options.metadata?.date || null,
      url: options.metadata?.url || null,
      page: options.metadata?.page || null,
      license: options.metadata?.license || null
    },

    // 格式化后的引用
    formatted: {
      [CITATION_FORMATS.PLAIN]: null,
      [CITATION_FORMATS.NUMBERED]: null,
      [CITATION_FORMATS.AUTHOR_DATE]: null,
      [CITATION_FORMATS.FOOTNOTE]: null,
      [CITATION_FORMATS.INLINE]: null
    }
  };
}

// ==================== 引用提取器 ====================

/**
 * 引用提取器
 *
 * 从检索结果中提取引用信息
 */
class CitationExtractor {
  /**
   * 构造函数
   *
   * @param {Object} options - 配置选项
   * @param {number} options.maxCitationLength - 最大引用长度（默认300）
   * @param {number} options.contextWords - 上下文词数（默认20）
   */
  constructor(options = {}) {
    this.maxCitationLength = options.maxCitationLength || 300;
    this.contextWords = options.contextWords || 20;
  }

  /**
   * 从检索结果中提取引用
   *
   * @param {Array} results - 检索结果
   * @param {string} query - 查询文本
   * @param {Object} options - 选项
   * @returns {Array} 引用列表
   */
  extract(results, query, options = {}) {
    if (!results || !results.length) {
      return [];
    }

    const citations = [];
    const seen = new Set();

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const citation = this._extractFromResult(result, query, i, options);

      if (citation && !this._isDuplicate(citation, seen)) {
        citations.push(citation);
        seen.add(citation.text.substring(0, 50));
      }
    }

    return citations;
  }

  /**
   * 从单个结果提取引用
   *
   * @private
   * @param {Object} result - 检索结果
   * @param {string} query - 查询文本
   * @param {number} index - 结果索引
   * @param {Object} options - 选项
   * @returns {Object} 引用对象
   */
  _extractFromResult(result, query, index, options = {}) {
    const content = result.content || '';
    const metadata = result.metadata || {};

    // 提取匹配片段
    const snippet = this._extractSnippet(content, query, options);

    // 确定引用类型
    const type = this._detectCitationType(content, snippet);

    // 创建引用对象
    const citation = createCitation({
      id: `cite_${index}_${Date.now()}`,
      type,
      text: snippet,
      source: {
        type: metadata.sourceType || CITATION_SOURCE.KNOWLEDGE_BASE,
        id: metadata.sourceId || result.id || `result_${index}`,
        name: metadata.sourceName || metadata.title || '未知来源'
      },
      position: metadata.position || this._findPosition(content, snippet),
      relevance: {
        score: result.score || result.relevance || 0,
        matchedTerms: this._extractMatchedTerms(query, snippet),
        snippet
      },
      metadata: {
        title: metadata.title || '未知标题',
        author: metadata.author || null,
        date: metadata.date || metadata.createdAt || null,
        url: metadata.url || null,
        page: metadata.page || null,
        license: metadata.license || null
      }
    });

    return citation;
  }

  /**
   * 提取匹配片段
   *
   * @private
   * @param {string} content - 文档内容
   * @param {string} query - 查询文本
   * @param {Object} options - 选项
   * @returns {string} 匹配片段
   */
  _extractSnippet(content, query, options = {}) {
    const queryTerms = query.toLowerCase().split(/\s+/);

    // 查找包含最多查询词的句子/段落
    const sentences = content.split(/[。！？；\n]/);
    let bestSentence = sentences[0] || content;
    let maxMatches = 0;

    for (const sentence of sentences) {
      const sentenceLower = sentence.toLowerCase();
      const matches = queryTerms.filter(term => sentenceLower.includes(term)).length;

      if (matches > maxMatches) {
        maxMatches = matches;
        bestSentence = sentence.trim();
      }
    }

    // 截断过长片段
    if (bestSentence.length > this.maxCitationLength) {
      // 尝试在句子边界截断
      const truncated = bestSentence.substring(0, this.maxCitationLength);
      const lastPunct = Math.max(
        truncated.lastIndexOf('，'),
        truncated.lastIndexOf('、'),
        truncated.lastIndexOf(' ')
      );

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
   *
   * @private
   * @param {string} content - 文档内容
   * @param {string} snippet - 片段
   * @returns {string} 引用类型
   */
  _detectCitationType(content, snippet) {
    // 代码检测
    if (/```[\s\S]*?```/.test(snippet) || /`[^`]+`/.test(snippet)) {
      return CITATION_TYPES.CODE;
    }

    // 公式检测（简化）
    if (/\$\$[\s\S]*?\$\$|\$[^$]+\$/.test(snippet) ||
        /\d+\s*[+\-*/=]\s*\d+/.test(snippet)) {
      return CITATION_TYPES.FORMULA;
    }

    // 段落检测（默认）
    return CITATION_TYPES.PASSAGE;
  }

  /**
   * 查找片段在原文中的位置
   *
   * @private
   * @param {string} content - 文档内容
   * @param {string} snippet - 片段
   * @returns {Object} 位置信息
   */
  _findPosition(content, snippet) {
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
   *
   * @private
   * @param {string} query - 查询文本
   * @param {string} snippet - 片段
   * @returns {Array} 匹配词列表
   */
  _extractMatchedTerms(query, snippet) {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const snippetLower = snippet.toLowerCase();

    return queryTerms.filter(term =>
      term.length > 1 && snippetLower.includes(term)
    );
  }

  /**
   * 检查重复引用
   *
   * @private
   * @param {Object} citation - 引用
   * @param {Set} seen - 已见集合
   * @returns {boolean} 是否重复
   */
  _isDuplicate(citation, seen) {
    const textKey = citation.text.substring(0, 50);
    return seen.has(textKey);
  }
}

// ==================== 引用格式化器 ====================

/**
 * 引用格式化器
 *
 * 将引用格式化为不同样式
 */
class CitationFormatter {
  /**
   * 构造函数
   *
   * @param {Object} options - 配置选项
   * @param {string} options.format - 默认格式
   * @param {Object} options.style - 样式配置
   */
  constructor(options = {}) {
    this.defaultFormat = options.format || CITATION_FORMATS.PLAIN;
    this.style = {
      prefix: options.style?.prefix || '[',
      suffix: options.style?.suffix || ']',
      separator: options.style?.separator || ', ',
      hoverTemplate: options.style?.hoverTemplate ||
        '<b>来源</b>: {title}<br/><b>相关性</b>: {score}<br/><b>日期</b>: {date}',
      ...options.style
    };
  }

  /**
   * 格式化引用
   *
   * @param {Object} citation - 引用对象
   * @param {string} format - 格式类型
   * @param {number} index - 引用索引
   * @returns {string} 格式化后的引用标记
   */
  format(citation, format = null, index = null) {
    const fmt = format || this.defaultFormat;

    switch (fmt) {
      case CITATION_FORMATS.PLAIN:
        return this._formatPlain(citation, index);
      case CITATION_FORMATS.NUMBERED:
        return this._formatNumbered(citation, index);
      case CITATION_FORMATS.AUTHOR_DATE:
        return this._formatAuthorDate(citation);
      case CITATION_FORMATS.FOOTNOTE:
        return this._formatFootnote(citation, index);
      case CITATION_FORMATS.INLINE:
        return this._formatInline(citation, index);
      default:
        return this._formatPlain(citation, index);
    }
  }

  /**
   * 格式化纯文本引用 [1]
   */
  _formatPlain(citation, index) {
    const num = index !== null ? index + 1 : citation._index + 1;
    return `${this.style.prefix}${num}${this.style.suffix}`;
  }

  /**
   * 格式化数字引用 [1][2]
   */
  _formatNumbered(citation, index) {
    const num = index !== null ? index + 1 : citation._index + 1;
    return `${this.style.prefix}${num}${this.style.suffix}`;
  }

  /**
   * 格式化作者-日期引用 (Smith, 2020)
   */
  _formatAuthorDate(citation) {
    const author = citation.metadata.author || 'Unknown';
    const date = citation.metadata.date || 'n.d.';
    return `(${author}, ${date})`;
  }

  /**
   * 格式化脚注引用
   */
  _formatFootnote(citation, index) {
    const num = index !== null ? index + 1 : citation._index + 1;
    const title = citation.metadata.title || '未知来源';
    return `[${num}] ${title}`;
  }

  /**
   * 格式化行内引用 "text" [1]
   */
  _formatInline(citation, index) {
    const text = citation.text.length > 100
      ? citation.text.substring(0, 100) + '...'
      : citation.text;
    const num = index !== null ? index + 1 : citation._index + 1;
    return `"${text}"${this.style.prefix}${num}${this.style.suffix}`;
  }

  /**
   * 生成悬停提示HTML
   *
   * @param {Object} citation - 引用对象
   * @returns {string} HTML字符串
   */
  generateHoverTooltip(citation) {
    const template = this.style.hoverTemplate;
    return template
      .replace('{title}', this._escapeHtml(citation.metadata.title || '未知来源'))
      .replace('{score}', (citation.relevance.score * 100).toFixed(0) + '%')
      .replace('{date}', citation.metadata.date || '未知日期')
      .replace('{author}', citation.metadata.author || '未知作者')
      .replace('{url}', citation.metadata.url || '#');
  }

  /**
   * HTML转义
   */
  _escapeHtml(text) {
    const div = { innerHTML: '' };
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// ==================== 引用链接器 ====================

/**
 * 引用链接器
 *
 * 将引用关联到原文
 */
class CitationLinker {
  /**
   * 构造函数
   *
   * @param {Object} options - 配置选项
   */
  constructor(options = {}) {
    this.enableExternalLinks = options.enableExternalLinks !== false;
    this.enableInternalLinks = options.enableInternalLinks !== false;
  }

  /**
   * 关联引用到原文
   *
   * @param {Object} citation - 引用对象
   * @param {Object} context - 上下文信息
   * @returns {Object} 添加链接后的引用
   */
  linkToSource(citation, context = {}) {
    const linked = { ...citation };

    // 外部链接（URL）
    if (this.enableExternalLinks && citation.metadata.url) {
      linked.links = {
        external: {
          url: citation.metadata.url,
          text: citation.metadata.title || '查看来源',
          newTab: true
        }
      };
    }

    // 内部链接（文档内跳转）
    if (this.enableInternalLinks) {
      const internalLink = this._generateInternalLink(citation, context);
      if (internalLink) {
        linked.links = {
          ...linked.links,
          internal: internalLink
        };
      }
    }

    // 位置链接（页码、段落）
    if (citation.metadata.page) {
      linked.links = {
        ...linked.links,
        page: {
          number: citation.metadata.page,
          label: `第 ${citation.metadata.page} 页`
        }
      };
    }

    return linked;
  }

  /**
   * 生成内部链接
   *
   * @private
   * @param {Object} citation - 引用对象
   * @param {Object} context - 上下文
   * @returns {Object|null} 内部链接信息
   */
  _generateInternalLink(citation, context) {
    const { docId, baseUrl } = context;

    if (!docId && !baseUrl) {
      return null;
    }

    const params = new URLSearchParams();

    if (docId) {
      params.set('doc', docId);
    }

    if (citation.position?.paragraph >= 0) {
      params.set('p', citation.position.paragraph);
    }

    if (citation.position?.start >= 0) {
      params.set('pos', citation.position.start);
    }

    const queryString = params.toString();
    const base = baseUrl || '/document';
    const url = `${base}?${queryString}`;

    return {
      url,
      text: '跳转到原文',
      anchor: citation.position?.paragraph != null
        ? `paragraph-${citation.position.paragraph}`
        : null
    };
  }

  /**
   * 批量关联引用
   *
   * @param {Array} citations - 引用列表
   * @param {Object} context - 上下文
   * @returns {Array} 关联后的引用
   */
  linkCitations(citations, context = {}) {
    return citations.map(citation => this.linkToSource(citation, context));
  }
}

// ==================== 主类实现 ====================

/**
 * 领域层引用组装器
 *
 * 组合提取器、格式化器、链接器，提供统一接口
 */
class CitationAssembler {
  /**
   * 构造函数
   *
   * @param {Object} options - 配置选项
   * @param {Object} options.extractor - 引用提取器
   * @param {Object} options.formatter - 引用格式化器
   * @param {Object} options.linker - 引用链接器
   */
  constructor(options = {}) {
    this.extractor = options.extractor || new CitationExtractor();
    this.formatter = options.formatter || new CitationFormatter();
    this.linker = options.linker || new CitationLinker();

    // 统计信息
    this.stats = {
      totalAssemblies: 0,
      totalCitations: 0,
      duplicateCount: 0
    };
  }

  /**
   * 组装引用
   *
   * @param {Array} results - 检索结果
   * @param {string} query - 查询文本
   * @param {Object} options - 选项
   * @returns {Object} 组装结果
   */
  assemble(results, query, options = {}) {
    this.stats.totalAssemblies++;

    if (!results || !results.length) {
      return {
        citations: [],
        formattedCitations: [],
        sourceMap: {},
        summary: null
      };
    }

    // 1. 提取引用
    const citations = this.extractor.extract(results, query, options);
    this.stats.totalCitations += citations.length;

    // 2. 去重统计
    const uniqueCount = citations.length;
    const duplicateCount = results.length - uniqueCount;
    this.stats.duplicateCount += duplicateCount;

    // 3. 关联到原文
    const linkedCitations = this.linker.linkCitations(citations, options.context);

    // 4. 格式化引用
    const formattedCitations = this._formatAllCitations(linkedCitations, options);

    // 5. 构建source map
    const sourceMap = this._buildSourceMap(linkedCitations);

    // 6. 生成摘要
    const summary = this._generateSummary(linkedCitations, query);

    return {
      citations: linkedCitations,
      formattedCitations,
      sourceMap,
      summary,
      metadata: {
        totalResults: results.length,
        uniqueCitations: uniqueCount,
        duplicateCount,
        averageRelevance: this._calculateAverageRelevance(citations)
      }
    };
  }

  /**
   * 提取引用列表
   *
   * @param {Array} results - 检索结果
   * @param {string} query - 查询文本
   * @param {Object} options - 选项
   * @returns {Array} 引用列表
   */
  extractCitations(results, query, options = {}) {
    return this.extractor.extract(results, query, options);
  }

  /**
   * 格式化单个引用
   *
   * @param {Object} citation - 引用对象
   * @param {string} format - 格式类型
   * @param {number} index - 索引
   * @returns {string} 格式化后的引用
   */
  formatCitation(citation, format = null, index = null) {
    return this.formatter.format(citation, format, index);
  }

  /**
   * 关联引用到原文
   *
   * @param {Object} citation - 引用对象
   * @param {Object} context - 上下文
   * @returns {Object} 关联后的引用
   */
  linkToSource(citation, context = {}) {
    return this.linker.linkToSource(citation, context);
  }

  /**
   * 批量格式化引用
   *
   * @private
   * @param {Array} citations - 引用列表
   * @param {Object} options - 选项
   * @returns {Array} 格式化后的引用
   */
  _formatAllCitations(citations, options = {}) {
    const format = options.format || CITATION_FORMATS.PLAIN;

    return citations.map((citation, index) => {
      const formatted = this.formatter.format(citation, format, index);

      return {
        ...citation,
        _index: index,
        _formatted: formatted,
        _tooltip: this.formatter.generateHoverTooltip(citation)
      };
    });
  }

  /**
   * 构建source映射
   *
   * @private
   * @param {Array} citations - 引用列表
   * @returns {Object} source映射
   */
  _buildSourceMap(citations) {
    const sourceMap = {};

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
            url: citation.metadata.url
          },
          citationIds: []
        };
      }

      sourceMap[sourceId].citationIds.push(citation.id);
    }

    return sourceMap;
  }

  /**
   * 生成引用摘要
   *
   * @private
   * @param {Array} citations - 引用列表
   * @param {string} query - 查询文本
   * @returns {Object} 摘要
   */
  _generateSummary(citations, query) {
    if (!citations.length) {
      return null;
    }

    // 计算总体统计
    const totalCitations = citations.length;
    const avgRelevance = this._calculateAverageRelevance(citations);
    const sources = new Set(citations.map(c => c.source.id || c.source.name));
    const types = new Set(citations.map(c => c.type));

    // 找出最相关的引用
    const topCitation = citations.reduce((best, current) =>
      current.relevance.score > best.relevance.score ? current : best
    , citations[0]);

    return {
      query,
      totalCitations,
      uniqueSources: sources.size,
      sourceTypes: Array.from(types),
      averageRelevance: avgRelevance.toFixed(3),
      topCitation: {
        id: topCitation.id,
        score: topCitation.relevance.score,
        title: topCitation.metadata.title
      },
      matchedTerms: topCitation.relevance.matchedTerms
    };
  }

  /**
   * 计算平均相关性
   *
   * @private
   * @param {Array} citations - 引用列表
   * @returns {number} 平均相关性
   */
  _calculateAverageRelevance(citations) {
    if (!citations.length) return 0;

    const sum = citations.reduce((acc, c) => acc + (c.relevance.score || 0), 0);
    return sum / citations.length;
  }

  /**
   * 将引用注入到文本中
   *
   * @param {string} text - 文本
   * @param {Array} citations - 引用列表
   * @param {Object} options - 选项
   * @returns {string} 带引用的文本
   */
  injectIntoText(text, citations, options = {}) {
    if (!citations.length || !text) {
      return text;
    }

    let result = text;
    const injected = new Set();

    // 按相关性排序
    const sortedCitations = [...citations].sort(
      (a, b) => b.relevance.score - a.relevance.score
    );

    for (let i = 0; i < sortedCitations.length; i++) {
      const citation = sortedCitations[i];

      // 避免重复注入
      if (injected.has(citation.id)) continue;

      // 检查引用文本是否在原文中
      if (result.includes(citation.text)) {
        const formatted = this.formatCitation(citation, options.format, i);
        result = result.replace(
          citation.text,
          `${citation.text}${formatted}`
        );
        injected.add(citation.id);
      }
    }

    return result;
  }

  /**
   * 获取统计信息
   *
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      averageCitationsPerAssembly: this.stats.totalAssemblies > 0
        ? (this.stats.totalCitations / this.stats.totalAssemblies).toFixed(2)
        : '0'
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      totalAssemblies: 0,
      totalCitations: 0,
      duplicateCount: 0
    };
    return this;
  }
}

// ==================== 导出 ====================

module.exports = {
  CitationAssembler,

  // 子组件
  CitationExtractor,
  CitationFormatter,
  CitationLinker,

  // 工厂函数
  createCitation,

  // 常量
  CITATION_TYPES,
  CITATION_FORMATS,
  CITATION_SOURCE
};
