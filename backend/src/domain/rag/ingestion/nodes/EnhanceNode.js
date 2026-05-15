/**
 * EnhanceNode - 内容增强节点
 *
 * 职责：
 * - 提取元数据（标题、作者、日期）
 * - 识别内容类型（文章、文档、问答）
 * - 添加结构化标记
 * - 清理噪音内容
 * - 文本规范化
 *
 * 内容类型识别：
 * - article: 新闻/博客文章
 * - documentation: 技术文档
 * - Q&A: 问答内容
 * - forum: 论坛帖子
 * - product: 产品描述
 * - unknown: 未知类型
 */

const { IngestionNode } = require('../IngestionNode');
const AppError = require('../../common/errors/AppError');

class EnhanceNode extends IngestionNode {
  constructor(options = {}) {
    super('EnhanceNode', options);
    this.requiredFields = ['rawContent'];
    this.options = {
      // 是否自动识别内容类型
      autoDetectType: options.autoDetectType !== false,
      // 是否提取实体
      extractEntities: options.extractEntities !== false,
      // 内容类型
      defaultType: options.defaultType || 'article',
      ...options,
    };
  }

  /**
   * 核心增强逻辑
   * @param {Object} context
   * @returns {Promise<Object>}
   */
  async _process(context) {
    const { rawContent, contentType, fetchMetadata, source } = context;

    // 1. 识别内容类型
    const contentType2 = this.options.autoDetectType
      ? this._detectContentType(rawContent, fetchMetadata)
      : this.options.defaultType;

    // 2. 提取结构化信息
    const structuredInfo = this._extractStructuredInfo(rawContent, contentType2);

    // 3. 清理噪音内容
    const cleanedContent = this._cleanNoise(rawContent, contentType2);

    // 4. 添加结构化标记
    const markedContent = this._addStructureMarkers(cleanedContent, contentType2);

    // 5. 生成摘要
    const summary = this._generateSummary(cleanedContent, contentType2);

    // 6. 提取关键词
    const keywords = this._extractKeywords(cleanedContent);

    // 7. 合并元数据
    const enhancedMetadata = {
      ...fetchMetadata,
      contentType: contentType2,
      language: this._detectLanguage(cleanedContent),
      wordCount: this._countWords(cleanedContent),
      charCount: cleanedContent.length,
      hasCode: this._containsCode(cleanedContent),
      hasList: this._containsList(cleanedContent),
      hasTable: this._containsTable(rawContent),
      structuredInfo,
      summary,
      keywords,
      enhancedAt: new Date().toISOString(),
    };

    return {
      enhancedContent: markedContent,
      contentType: contentType2,
      enhancedMetadata,
    };
  }

  /**
   * 识别内容类型
   * @param {string} content
   * @param {Object} metadata
   * @returns {string}
   */
  _detectContentType(content, metadata) {
    // 优先使用已有的类型信息
    if (metadata?.contentType) {
      return metadata.contentType;
    }

    const lowerContent = content.toLowerCase();
    const title = (metadata?.title || '').toLowerCase();

    // 问答模式检测
    if (
      /\?|？/.test(content) &&
      (lowerContent.includes('how to') ||
        lowerContent.includes('why') ||
        lowerContent.includes('what is') ||
        lowerContent.includes('如何') ||
        lowerContent.includes('为什么') ||
        lowerContent.includes('是什么'))
    ) {
      // 检查是否有明确的问题-答案结构
      const qnaPatterns = [
        /(?:问题|疑问|question|answer|回答|答案|solution|解决方法)/i,
        /\n\s*[AQ问答答]:\s*/,
        /^\d+\.\s*[A-Z].*\?/m,
      ];

      for (const pattern of qnaPatterns) {
        if (pattern.test(content)) {
          return 'Q&A';
        }
      }
    }

    // 文档模式检测
    if (
      lowerContent.includes('function') ||
      lowerContent.includes('class ') ||
      lowerContent.includes('const ') ||
      lowerContent.includes('import ') ||
      lowerContent.includes('export ') ||
      lowerContent.includes('#include') ||
      lowerContent.includes('package ') ||
      /```[\s\S]*?```/.test(content)
    ) {
      return 'documentation';
    }

    // 论坛模式检测
    if (
      lowerContent.includes('reply') ||
      lowerContent.includes('re:') ||
      lowerContent.includes('posted by') ||
      lowerContent.includes('楼主') ||
      lowerContent.includes('回帖') ||
      /^\s*>\s*/.test(content)
    ) {
      return 'forum';
    }

    // 产品描述检测
    if (
      lowerContent.includes('price') ||
      lowerContent.includes('规格') ||
      lowerContent.includes('型号') ||
      lowerContent.includes('features') ||
      lowerContent.includes('优点') ||
      lowerContent.includes('缺点')
    ) {
      return 'product';
    }

    // 新闻/文章检测
    if (
      lowerContent.includes('published') ||
      lowerContent.includes('报道') ||
      lowerContent.includes('新闻') ||
      lowerContent.includes('日前') ||
      metadata?.publishDate
    ) {
      return 'article';
    }

    return 'article'; // 默认类型
  }

  /**
   * 提取结构化信息
   * @param {string} content
   * @param {string} contentType
   * @returns {Object}
   */
  _extractStructuredInfo(content, contentType) {
    const info = {
      sentences: [],
      paragraphs: [],
      questions: [],
      answers: [],
    };

    // 分割句子
    const sentences = content.split(/[.!?。！？\n]+/).filter((s) => s.trim());
    info.sentences = sentences.map((s) => s.trim()).filter((s) => s.length > 10);

    // 分割段落
    const paragraphs = content.split(/\n\n+/).filter((p) => p.trim());
    info.paragraphs = paragraphs.map((p) => p.trim()).filter((p) => p.length > 20);

    // 问答提取
    if (contentType === 'Q&A') {
      const qaPairs = this._extractQAPairs(content);
      info.questions = qaPairs.questions;
      info.answers = qaPairs.answers;
    }

    return info;
  }

  /**
   * 提取问答对
   * @param {string} content
   * @returns {Object}
   */
  _extractQAPairs(content) {
    const questions = [];
    const answers = [];

    // 模式1: 问号结尾的句子作为问题
    const segments = content.split(/(?<=[?？])\s*/);

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i].trim();
      if (!segment) continue;

      // 检查是否像问题
      if (/[?？]$/.test(segment) || /^(what|how|why|who|when|where|如何|为什么|是什么|谁|哪)/i.test(segment)) {
        questions.push(segment);
        // 下一个段落可能是答案
        if (i + 1 < segments.length) {
          answers.push(segments[i + 1].trim());
        }
      }
    }

    return { questions, answers };
  }

  /**
   * 清理噪音内容
   * @param {string} content
   * @param {string} contentType
   * @returns {string}
   */
  _cleanNoise(content, contentType) {
    let cleaned = content;

    // 移除常见噪音模式
    const noisePatterns = [
      // 社交媒体分享按钮
      /\b(share|tweet|like|follow|评论|分享|转发)\b/gi,
      // 广告相关
      /\b(ad|advertisement|广告|推广|赞助)\b/gi,
      // 弹窗相关
      /\b(close|关闭|skip|跳过)\b/gi,
      // 订阅相关
      /\b(subscribe|订阅|subscriber|粉丝)\b/gi,
      // 版权相关（可选移除）
      /\b(copyright|©|™|®|版权所有)\b/gi,
      // cookie提示
      /cookie/gi,
      // 导航相关（可选）
      /\b(menu|导航|home|首页|back|返回)\b/gi,
    ];

    // 根据内容类型决定移除哪些噪音
    for (const pattern of noisePatterns) {
      cleaned = cleaned.replace(pattern, ' ');
    }

    // 移除多余空白
    cleaned = cleaned.replace(/\s+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

    return cleaned;
  }

  /**
   * 添加结构化标记
   * @param {string} content
   * @param {string} contentType
   * @returns {string}
   */
  _addStructureMarkers(content, contentType) {
    // 目前主要用于标识内容类型
    // 后续可以扩展添加标题层级、段落标记等

    const markers = {
      'Q&A': '<!-- CONTENT_TYPE: Q&A -->',
      documentation: '<!-- CONTENT_TYPE: DOCUMENTATION -->',
      forum: '<!-- CONTENT_TYPE: FORUM -->',
      product: '<!-- CONTENT_TYPE: PRODUCT -->',
      article: '<!-- CONTENT_TYPE: ARTICLE -->',
    };

    const marker = markers[contentType] || markers.article;
    return `${marker}\n\n${content}`;
  }

  /**
   * 生成摘要
   * @param {string} content
   * @param {string} contentType
   * @returns {string}
   */
  _generateSummary(content, contentType) {
    // 简单的前几句话作为摘要
    const sentences = content.split(/[.!?。！？\n]+/).filter((s) => s.trim());

    let summaryLength;
    switch (contentType) {
      case 'Q&A':
        summaryLength = 2; // 问答通常需要问题和主要答案
        break;
      case 'documentation':
        summaryLength = 2; // 文档通常开头就是概述
        break;
      default:
        summaryLength = 3;
    }

    const summarySentences = sentences.slice(0, summaryLength);
    let summary = summarySentences.join('. ').trim();

    // 限制摘要长度
    if (summary.length > 500) {
      summary = summary.substring(0, 500) + '...';
    }

    return summary;
  }

  /**
   * 提取关键词
   * @param {string} content
   * @returns {string[]}
   */
  _extractKeywords(content) {
    // 简单的关键词提取：去除停用词后取高频词
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
      'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can',
      'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
      'we', 'they', 'what', 'which', 'who', 'when', 'where', 'how', 'why',
      '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都',
      '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会',
      '着', '没有', '看', '好', '自己', '这', '那', '么', '她', '他',
    ]);

    // 提取单词/词语
    const words = content
      .toLowerCase()
      .match(/[a-z]{4,}/g) || [];

    // 统计词频
    const wordCount = new Map();
    for (const word of words) {
      if (!stopWords.has(word)) {
        wordCount.set(word, (wordCount.get(word) || 0) + 1);
      }
    }

    // 按频率排序，取前10个
    const sorted = Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);

    return sorted;
  }

  /**
   * 检测语言
   * @param {string} content
   * @returns {string}
   */
  _detectLanguage(content) {
    // 简单检测：通过字符范围
    const cjkChars = (content.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
    const totalChars = content.length;

    if (totalChars === 0) return 'unknown';

    const cjkRatio = cjkChars / totalChars;

    if (cjkRatio > 0.3) {
      return cjkRatio > 0.5 ? 'zh' : 'ja';
    }

    return 'en';
  }

  /**
   * 检查是否包含代码
   * @param {string} content
   * @returns {boolean}
   */
  _containsCode(content) {
    const codePatterns = [
      /function\s+\w+/,
      /const\s+\w+\s*=/,
      /let\s+\w+\s*=/,
      /var\s+\w+\s*=/,
      /class\s+\w+/,
      /import\s+.*from/,
      /export\s+(default|const|function)/,
      /#include\s*</,
      /package\s+\w+/,
      /def\s+\w+\s*\(/,
      /public\s+(static\s+)?void/,
      /```[\s\S]*?```/,
      /`[\s\S]*?`/,
    ];

    return codePatterns.some((pattern) => pattern.test(content));
  }

  /**
   * 检查是否包含列表
   * @param {string} content
   * @returns {boolean}
   */
  _containsList(content) {
    // 检查常见的列表模式
    return (
      /^\s*[-*+]\s+/m.test(content) || // 无序列表
      /^\s*\d+\.\s+/m.test(content) || // 有序列表
      /^\s*\([a-z]\)\s+/im.test(content) || // (a) (b) 模式
      /^\s*\([0-9]+\)\s+/m.test(content) // (1) (2) 模式
    );
  }

  /**
   * 检查是否包含表格
   * @param {string} content
   * @returns {boolean}
   */
  _containsTable(html) {
    // 如果是HTML内容，检查table标签
    if (typeof html === 'string' && /<table/i.test(html)) {
      return true;
    }
    return false;
  }

  /**
   * 统计词数
   * @param {string} text
   * @returns {number}
   */
  _countWords(text) {
    if (!text) return 0;
    // 中文按字符数估算，英文按单词数估算
    const cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    return cjkChars + englishWords;
  }

  /**
   * 后置验证
   * @param {Object} result
   * @param {Object} context
   */
  async _postValidate(result, context) {
    if (!result.enhancedContent || result.enhancedContent.length === 0) {
      throw AppError.ragError('PARSE_FAILED', '增强后内容为空');
    }
    if (!result.contentType) {
      throw AppError.ragError('PARSE_FAILED', '无法识别内容类型');
    }
    if (!result.enhancedMetadata) {
      throw AppError.ragError('PARSE_FAILED', '元数据增强失败');
    }
  }
}

module.exports = EnhanceNode;
