/**
 * 文本摘要工具
 * 对长文本进行自动摘要
 */

class TextSummaryTool {
  constructor(options = {}) {
    this.name = 'text_summary';
    this.AppError = require('../../common/errors/AppError');
    this.description = '文本摘要 - 对长文本进行自动摘要，支持关键信息提取';
    this.category = 'utility';
    this.timeout = options.timeout || 30000;
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: '要摘要的文本'
        },
        options: {
          type: 'object',
          properties: {
            maxLength: {
              type: 'number',
              default: 200,
              description: '摘要最大长度（字符）'
            },
            type: {
              type: 'string',
              enum: ['extractive', 'abstractive'],
              default: 'extractive',
              description: '摘要类型'
            }
          }
        }
      },
      required: ['text']
    };
  }

  async execute(params) {
    const { text, options = {} } = params;
    const { maxLength = 200, type = 'extractive' } = options;

    if (!text || text.trim().length === 0) {
      return { success: false, error: '文本不能为空' };
    }

    if (text.length < 50) {
      return {
        success: true,
        summary: text,
        type: 'short_text',
        message: '文本过短，无需摘要'
      };
    }

    try {
      let summary;

      if (type === 'abstractive') {
        summary = await this.abstractiveSummary(text, maxLength);
      } else {
        summary = this.extractiveSummary(text, maxLength);
      }

      return {
        success: true,
        originalLength: text.length,
        summaryLength: summary.length,
        summary,
        type,
        compressionRatio: ((1 - summary.length / text.length) * 100).toFixed(1) + '%'
      };
    } catch (error) {
      // 如果抽象摘要失败，回退到抽取式
      return {
        success: true,
        originalLength: text.length,
        summary: this.extractiveSummary(text, maxLength),
        type: 'extractive_fallback',
        error: error.message
      };
    }
  }

  extractiveSummary(text, maxLength) {
    // 抽取式摘要：提取关键句子
    const sentences = text.match(/[^.!?。！？]+[.!?。！？]+/g) || [text];

    // 计算句子权重（基于词频）
    const wordFreq = this.calculateWordFreq(text);
    const scoredSentences = sentences.map(sentence => {
      const words = sentence.split(/\s+/);
      const score = words.reduce((sum, word) => sum + (wordFreq[word.toLowerCase()] || 0), 0);
      return { sentence: sentence.trim(), score };
    });

    // 按分数排序，优先选择靠前的句子
    scoredSentences.sort((a, b) => b.score - a.score);

    // 贪心选择句子直到达到最大长度
    const selected = [];
    let currentLength = 0;

    for (const item of scoredSentences) {
      if (currentLength + item.sentence.length <= maxLength) {
        selected.push(item);
        currentLength += item.sentence.length;
      }
    }

    // 按原文顺序重新排序
    const selectedSet = new Set(selected.map(s => s.sentence));
    const orderedSummary = sentences.filter(s => selectedSet.has(s.trim()));

    return orderedSummary.join('').substring(0, maxLength);
  }

  calculateWordFreq(text) {
    const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how', '的', '是', '在', '和', '了', '有', '我', '他', '她', '它', '们', '这', '那', '你']);

    const freq = {};
    for (const word of words) {
      if (!stopWords.has(word) && word.length > 2) {
        freq[word] = (freq[word] || 0) + 1;
      }
    }
    return freq;
  }

  async abstractiveSummary(text, maxLength) {
    // 调用 AI API 进行生成式摘要
    // 这里使用简单的占位实现，实际项目中可以调用 MiniMax API
    throw this.AppError.internalError('Abstractive summary requires AI API');
  }
}

module.exports = TextSummaryTool;
