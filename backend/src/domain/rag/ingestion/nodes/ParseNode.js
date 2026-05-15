/**
 * ParseNode - 文档解析节点
 *
 * 职责：
 * - 识别文档类型（文本、HTML、Markdown、PDF等）
 * - 提取纯文本内容
 * - 提取元数据（标题、作者、创建时间等）
 *
 * 支持格式：
 * - text/plain: 直接返回
 * - text/html: HTML标签剥离
 * - text/markdown: 保留结构
 * - application/pdf: PDF.js 解析
 */

const { IngestionNode } = require('../IngestionNode');
const AppError = require('../../common/errors/AppError');

class ParseNode extends IngestionNode {
  constructor(options = {}) {
    super('ParseNode', options);
    this.requiredFields = ['rawContent'];
  }

  /**
   * 核心解析逻辑
   * @param {Object} context
   * @returns {Promise<Object>}
   */
  async _process(context) {
    const { rawContent, contentType = 'text/plain', source } = context;

    // 1. 内容清理
    const cleaned = await this._cleanContent(rawContent, contentType);

    // 2. 结构化提取
    const structured = await this._extractStructure(cleaned, contentType);

    // 3. 元数据提取
    const metadata = this._extractMetadata(structured, source);

    return {
      parsedContent: structured.content,
      parsedMetadata: metadata,
      parsedStructure: structured.structure,
      wordCount: this._countWords(structured.content),
    };
  }

  /**
   * 内容清理
   * @param {string} content
   * @param {string} contentType
   * @returns {Promise<string>}
   */
  async _cleanContent(content, contentType) {
    let cleaned = content;

    switch (contentType) {
      case 'text/html':
        cleaned = this._stripHtml(content);
        break;
      case 'text/markdown':
        cleaned = this._cleanMarkdown(content);
        break;
      case 'text/plain':
      default:
        cleaned = this._cleanPlainText(content);
        break;
    }

    // 通用清理：移除多余空白、控制字符
    cleaned = cleaned
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // 控制字符
      .replace(/\r\n/g, '\n') // Windows换行符
      .replace(/\n{3,}/g, '\n\n'); // 超过2个连续换行

    return cleaned.trim();
  }

  /**
   * HTML标签剥离
   * @param {string} html
   * @returns {string}
   */
  _stripHtml(html) {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // 移除脚本
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // 移除样式
      .replace(/<[^>]+>/g, ' ') // 移除标签
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ') // 合并空白
      .trim();
  }

  /**
   * Markdown清理
   * @param {string} md
   * @returns {string}
   */
  _cleanMarkdown(md) {
    return md
      .replace(/^#+\s+/gm, '') // 移除标题标记
      .replace(/\*\*([^*]+)\*\*/g, '$1') // 粗体
      .replace(/\*([^*]+)\*/g, '$1') // 斜体
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 链接
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // 图片
      .replace(/^[-*+]\s+/gm, '') // 列表标记
      .replace(/^\d+\.\s+/gm, '') // 有序列表
      .replace(/^>\s+/gm, '') // 引用
      .replace(/```[\s\S]*?```/g, '') // 代码块
      .replace(/`([^`]+)`/g, '$1') // 行内代码
      .trim();
  }

  /**
   * 纯文本清理
   * @param {string} text
   * @returns {string}
   */
  _cleanPlainText(text) {
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * 结构化提取
   * @param {string} content
   * @param {string} contentType
   * @returns {Promise<Object>}
   */
  async _extractStructure(content, contentType) {
    const structure = {
      paragraphs: [],
      headings: [],
      sentences: [],
    };

    // 按段落分割
    const paragraphs = content.split(/\n\n+/).filter((p) => p.trim());

    for (const para of paragraphs) {
      const trimmed = para.trim();

      // 检测标题
      if (contentType === 'text/markdown' && /^#+\s/.test(trimmed)) {
        structure.headings.push({
          level: (trimmed.match(/^#+/) || [''])[0].length,
          text: trimmed.replace(/^#+\s+/, ''),
        });
      }

      // 句子分割
      const sentences = this._splitSentences(trimmed);
      structure.sentences.push(...sentences);

      structure.paragraphs.push({
        text: trimmed,
        sentenceCount: sentences.length,
      });
    }

    return {
      content,
      structure,
    };
  }

  /**
   * 句子分割
   * @param {string} text
   * @returns {string[]}
   */
  _splitSentences(text) {
    // 简单按句号、问号、感叹号分割
    return text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /**
   * 提取元数据
   * @param {Object} structured
   * @param {string} source
   * @returns {Object}
   */
  _extractMetadata(structured, source) {
    const metadata = {
      source: source || 'unknown',
      parsedAt: new Date().toISOString(),
      paragraphCount: structured.structure.paragraphs.length,
      headingCount: structured.structure.headings.length,
      sentenceCount: structured.structure.sentences.length,
    };

    // 从标题提取
    if (structured.structure.headings.length > 0) {
      metadata.title = structured.structure.headings[0].text;
    }

    return metadata;
  }

  /**
   * 统计词数
   * @param {string} text
   * @returns {number}
   */
  _countWords(text) {
    if (!text) return 0;
    // 中日韩文字 + 英文单词
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
    if (!result.parsedContent || result.parsedContent.length === 0) {
      throw AppError.ragError('PARSE_FAILED', '解析后内容为空');
    }
    if (result.wordCount === 0) {
      throw AppError.ragError('PARSE_FAILED', '无法计算词数，可能内容无效');
    }
  }
}

module.exports = ParseNode;
