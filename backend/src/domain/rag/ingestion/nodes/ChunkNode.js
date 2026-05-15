/**
 * ChunkNode - 文档分块节点
 *
 * 支持分块策略：
 * 1. fixed_size: 固定字数分块（重叠）
 * 2. semantic: 语义分块（按段落/主题）
 * 3. recursive: 递归分块（多级粒度）
 *
 * 设计考量：
 * - 保留分块间上下文重叠，避免语义断裂
 * - 记录每个chunk的来源位置，支持引用追溯
 * - 支持不同类型的文档使用不同策略
 */

const { IngestionNode } = require('../IngestionNode');
const AppError = require('../../common/errors/AppError');

class ChunkNode extends IngestionNode {
  constructor(options = {}) {
    super('ChunkNode', options);
    this.requiredFields = ['parsedContent'];
    this.options = {
      strategy: options.strategy || 'semantic', // default semantic
      chunkSize: options.chunkSize || 500, // 目标chunk大小（字符）
      chunkOverlap: options.chunkOverlap || 50, // 重叠大小
      minChunkLength: options.minChunkLength || 50, // 最小chunk长度
      maxChunkLength: options.maxChunkLength || 2000, // 最大chunk长度
      paragraphBreak: options.paragraphBreak || '\n\n',
      ...options,
    };
  }

  /**
   * 核心分块逻辑
   * @param {Object} context
   * @returns {Promise<Object>}
   */
  async _process(context) {
    const { parsedContent, parsedStructure, parsedMetadata } = context;

    let chunks;

    switch (this.options.strategy) {
      case 'fixed_size':
        chunks = this._fixedSizeChunk(parsedContent);
        break;
      case 'semantic':
        chunks = this._semanticChunk(parsedContent, parsedStructure);
        break;
      case 'recursive':
        chunks = this._recursiveChunk(parsedContent);
        break;
      default:
        chunks = this._semanticChunk(parsedContent, parsedStructure);
    }

    // 添加元数据
    const enrichedChunks = chunks.map((chunk, index) => ({
      id: this._generateChunkId(context, index),
      content: chunk.content,
      index,
      startChar: chunk.startChar,
      endChar: chunk.endChar,
      sentenceCount: chunk.sentenceCount,
      tokenEstimate: this._estimateTokens(chunk.content),
      metadata: {
        ...parsedMetadata,
        chunkStrategy: this.options.strategy,
      },
    }));

    return {
      chunks: enrichedChunks,
      chunkCount: enrichedChunks.length,
      totalTokensEstimate: enrichedChunks.reduce(
        (sum, c) => sum + c.tokenEstimate,
        0
      ),
    };
  }

  /**
   * 固定大小分块（带重叠）
   * @param {string} content
   * @returns {Object[]}
   */
  _fixedSizeChunk(content) {
    const chunks = [];
    const { chunkSize, chunkOverlap, maxChunkLength } = this.options;

    let startIndex = 0;

    while (startIndex < content.length) {
      let endIndex = startIndex + chunkSize;

      // 尽量在句子边界结束
      if (endIndex < content.length) {
        const sentenceBoundary = content.lastIndexOf(
          /[.!?。！？]\s/,
          endIndex
        );
        if (sentenceBoundary > startIndex + chunkSize / 2) {
          endIndex = sentenceBoundary + 2;
        }
      }

      // 硬性截断
      if (endIndex > maxChunkLength) {
        endIndex = maxChunkLength;
      }

      const chunkContent = content.slice(startIndex, endIndex).trim();

      if (chunkContent.length >= this.options.minChunkLength) {
        chunks.push({
          content: chunkContent,
          startChar: startIndex,
          endChar: endIndex,
          sentenceCount: this._countSentences(chunkContent),
        });
      }

      // 移动窗口（考虑重叠）
      startIndex += chunkSize - chunkOverlap;

      // 防止死循环
      if (startIndex <= 0 || chunks.length > 10000) break;
    }

    return chunks;
  }

  /**
   * 语义分块（保留段落边界）
   * @param {string} content
   * @param {Object} structure
   * @returns {Object[]}
   */
  _semanticChunk(content, structure) {
    const chunks = [];
    const { chunkSize, maxChunkLength } = this.options;

    if (!structure || !structure.paragraphs) {
      // 无结构信息，退化为固定大小
      return this._fixedSizeChunk(content);
    }

    let currentChunk = [];
    let currentLength = 0;
    let currentStartChar = 0;
    let currentSentences = 0;

    for (const para of structure.paragraphs) {
      const paraLength = para.text.length;

      // 检查是否需要开始新chunk
      if (
        currentLength + paraLength > chunkSize &&
        currentChunk.length > 0
      ) {
        // 保存当前chunk
        const chunkText = currentChunk.join(this.options.paragraphBreak);
        if (chunkText.length >= this.options.minChunkLength) {
          chunks.push({
            content: chunkText,
            startChar: currentStartChar,
            endChar: currentStartChar + chunkText.length,
            sentenceCount: currentSentences,
          });
        }

        // 重置
        currentChunk = [];
        currentLength = 0;
        currentSentences = 0;

        // 新chunk起始位置
        currentStartChar = para.text.indexOf(para.text.trim());
      }

      // 检查是否超过最大长度
      if (paraLength > maxChunkLength) {
        // 保存当前chunk
        if (currentChunk.length > 0) {
          const chunkText = currentChunk.join(this.options.paragraphBreak);
          if (chunkText.length >= this.options.minChunkLength) {
            chunks.push({
              content: chunkText,
              startChar: currentStartChar,
              endChar: currentStartChar + chunkText.length,
              sentenceCount: currentSentences,
            });
          }
          currentChunk = [];
          currentLength = 0;
          currentSentences = 0;
        }

        // 对超长段落进行递归拆分
        const subChunks = this._splitLongParagraph(para.text, maxChunkLength);
        for (const sub of subChunks) {
          chunks.push({
            content: sub.text,
            startChar: sub.start,
            endChar: sub.end,
            sentenceCount: this._countSentences(sub.text),
          });
        }
        continue;
      }

      // 添加到当前chunk
      currentChunk.push(para.text);
      currentLength += paraLength + this.options.paragraphBreak.length;
      currentSentences += para.sentenceCount;
    }

    // 保存最后一个chunk
    if (currentChunk.length > 0) {
      const chunkText = currentChunk.join(this.options.paragraphBreak);
      if (chunkText.length >= this.options.minChunkLength) {
        chunks.push({
          content: chunkText,
          startChar: currentStartChar,
          endChar: currentStartChar + chunkText.length,
          sentenceCount: currentSentences,
        });
      }
    }

    return chunks;
  }

  /**
   * 递归分块（多级粒度）
   * @param {string} content
   * @returns {Object[]}
   */
  _recursiveChunk(content) {
    const chunks = [];
    const { maxChunkLength } = this.options;

    // 第一层：按段落分
    const paragraphs = content.split(/\n\n+/);

    let currentSection = [];
    let currentLength = 0;

    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;

      if (currentLength + trimmed.length > maxChunkLength && currentSection.length > 0) {
        // 保存当前section
        const sectionText = currentSection.join('\n\n');
        chunks.push({
          content: sectionText,
          startChar: content.indexOf(sectionText),
          endChar: content.indexOf(sectionText) + sectionText.length,
          sentenceCount: this._countSentences(sectionText),
        });

        // 如果单个段落就超过限制，递归拆分
        if (trimmed.length > maxChunkLength) {
          const subChunks = this._splitLongParagraph(trimmed, maxChunkLength);
          chunks.push(...subChunks.map((sub) => ({
            content: sub.text,
            startChar: sub.start,
            endChar: sub.end,
            sentenceCount: this._countSentences(sub.text),
          })));
          currentSection = [];
          currentLength = 0;
          continue;
        }

        currentSection = [trimmed];
        currentLength = trimmed.length;
      } else {
        currentSection.push(trimmed);
        currentLength += trimmed.length + 2;
      }
    }

    // 保存最后一个section
    if (currentSection.length > 0) {
      const sectionText = currentSection.join('\n\n');
      chunks.push({
        content: sectionText,
        startChar: content.indexOf(sectionText),
        endChar: content.indexOf(sectionText) + sectionText.length,
        sentenceCount: this._countSentences(sectionText),
      });
    }

    return chunks;
  }

  /**
   * 拆分超长段落
   * @param {string} text
   * @param {number} maxLength
   * @returns {Object[]}
   */
  _splitLongParagraph(text, maxLength) {
    const chunks = [];
    let start = 0;

    while (start < text.length) {
      let end = Math.min(start + maxLength, text.length);

      // 尽量在句子边界切
      if (end < text.length) {
        const boundary = text.lastIndexOf(/[.!?。！？]\s/, end);
        if (boundary > start + maxLength / 2) {
          end = boundary + 2;
        }
      }

      chunks.push({
        text: text.slice(start, end).trim(),
        start,
        end,
      });

      start = end - this.options.chunkOverlap;
      if (start <= 0) break;
    }

    return chunks.filter((c) => c.text.length >= this.options.minChunkLength);
  }

  /**
   * 统计句子数
   * @param {string} text
   * @returns {number}
   */
  _countSentences(text) {
    return (text.match(/[.!?。！？]+/g) || []).length || 1;
  }

  /**
   * 估算token数（粗略）
   * @param {string} text
   * @returns {number}
   */
  _estimateTokens(text) {
    if (!text) return 0;
    // 中文按字符数估算，英文按单词数估算
    const cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    return Math.ceil(cjkChars * 1.5 + englishWords * 0.25);
  }

  /**
   * 生成chunk ID
   * @param {Object} context
   * @param {number} index
   * @returns {string}
   */
  _generateChunkId(context, index) {
    const docId = context.parsedMetadata?.source || 'doc';
    return `${docId}-chunk-${context.traceId}-${index}`;
  }

  /**
   * 后置验证
   * @param {Object} result
   * @param {Object} context
   */
  async _postValidate(result, context) {
    if (!result.chunks || result.chunks.length === 0) {
      throw AppError.ragError('CHUNK_FAILED', '分块结果为空');
    }
    if (result.totalTokensEstimate <= 0) {
      throw AppError.ragError('CHUNK_FAILED', 'Token估算结果无效');
    }
  }
}

module.exports = ChunkNode;
