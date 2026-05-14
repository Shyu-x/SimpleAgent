/**
 * 专业 Token 管理器
 * 使用 tiktoken 提供精确的 Token 计数，支持多种编码
 *
 * 支持模型：
 * - GPT 系列 (cl100k_base)
 * - Claude 系列 (o200k_base)
 * - 通用 (cl100k_base 作为默认)
 */

const tiktoken = require('tiktoken');

// 编码映射
const ENCODING_MAP = {
  'gpt-4': 'cl100k_base',
  'gpt-3.5-turbo': 'cl100k_base',
  'claude': 'o200k_base',
  'claude-3': 'o200k_base',
  'minimax': 'cl100k_base',  // MiniMax 类似 GPT
  'default': 'cl100k_base'
};

/**
 * 获取模型对应的编码名称
 */
function getEncodingNameForModel(model) {
  if (!model) return ENCODING_MAP.default;

  const modelLower = model.toLowerCase();

  // 精确匹配
  if (ENCODING_MAP[modelLower]) {
    return ENCODING_MAP[modelLower];
  }

  // 前缀匹配
  for (const [key, encoding] of Object.entries(ENCODING_MAP)) {
    if (modelLower.includes(key)) {
      return encoding;
    }
  }

  return ENCODING_MAP.default;
}

class TokenManager {
  /**
   * @param {Object} options
   * @param {string} options.model - 模型名称
   * @param {number} options.defaultLimit - 默认 Token 限制
   */
  constructor(options = {}) {
    this.model = options.model || 'gpt-4';
    this.defaultLimit = options.defaultLimit || 100000;
    this.encoding = null;
    this._initEncoding();
  }

  /**
   * 初始化编码器
   */
  _initEncoding() {
    try {
      const encodingName = getEncodingNameForModel(this.model);
      // tiktoken 0.7+ 使用 tiktoken.get_encoding()
      if (typeof tiktoken.get_encoding === 'function') {
        this.encoding = tiktoken.get_encoding(encodingName);
      } else if (typeof tiktoken.from_name === 'function') {
        this.encoding = tiktoken.from_name(encodingName);
      } else {
        throw new Error('tiktoken API not found');
      }
      console.log(`[TokenManager] 初始化完成，编码: ${encodingName}, 模型: ${this.model}`);
    } catch (error) {
      console.warn(`[TokenManager] 编码器初始化失败，使用备用方案: ${error.message}`);
      this.encoding = null;
    }
  }

  /**
   * 计算文本 Token 数
   * @param {string} text - 输入文本
   * @returns {number} Token 数量
   */
  count(text) {
    if (!text) return 0;

    if (this.encoding) {
      try {
        const tokens = this.encoding.encode(text);
        return tokens.length;
      } catch (error) {
        console.warn(`[TokenManager] Token计数失败: ${error.message}`);
      }
    }

    // 备用方案：字符估算
    return this._estimateTokens(text);
  }

  /**
   * 计算消息列表的 Token 数（包含消息格式开销）
   * @param {Array} messages - 消息数组 [{role, content}]
   * @returns {number} Token 数量
   */
  countMessages(messages) {
    if (!messages || messages.length === 0) return 0;

    let total = 0;

    for (const msg of messages) {
      // 每条消息的基础开销: role + content + 格式
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      total += this.count(content);

      // 消息格式开销（每条消息 +3 Token，末尾 +1 Token）
      total += 4;
    }

    // 对话格式基础开销: +3 Token
    total += 3;

    return total;
  }

  /**
   * 计算可用上下文空间
   * @param {number} totalLimit - 总限制
   * @param {number} reservedTokens - 保留空间（用于 system prompt 等）
   * @returns {number} 可用 Token 数
   */
  availableContext(totalLimit, reservedTokens = 0) {
    return totalLimit - reservedTokens;
  }

  /**
   * 计算压缩后应保留多少 Token
   * @param {number} currentTokens - 当前 Token 数
   * @param {number} targetTokens - 目标 Token 数
   * @param {number} limit - 上限
   * @returns {number} 保留 Token 数
   */
  calculateRetention(currentTokens, targetTokens, limit) {
    if (currentTokens <= limit) return currentTokens;

    // 保留目标值的 50-80%
    const retentionRatio = Math.min(0.8, Math.max(0.5, targetTokens / limit));
    return Math.floor(limit * retentionRatio);
  }

  /**
   * 估算 Token 数（备用方案）
   * @param {string} text
   * @returns {number}
   */
  _estimateTokens(text) {
    if (!text) return 0;

    const textStr = typeof text === 'string' ? text : String(text);
    if (!textStr) return 0;

    // 中文：约 1.5-2 字符 = 1 Token
    // 英文：约 4 字符 = 1 Token
    const chineseChars = (textStr.match(/[一-龥]/g) || []).length;
    const otherChars = textStr.length - chineseChars;

    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  /**
   * 截断文本到指定 Token 数
   * @param {string} text - 输入文本
   * @param {number} maxTokens - 最大 Token 数
   * @returns {string} 截断后的文本
   */
  truncate(text, maxTokens) {
    if (!text || maxTokens <= 0) return '';

    // 确保 text 是字符串
    const textStr = typeof text === 'string' ? text : String(text);
    if (!textStr) return '';

    if (this.encoding) {
      try {
        const tokens = this.encoding.encode(textStr);
        // tokens 可能是 Uint32Array，需要转换为普通数组
        const tokenCount = tokens.length || (tokens.toArray ? tokens.toArray().length : 0);
        if (tokenCount <= maxTokens) return textStr;

        // 保留前面的内容，截断后面的
        const truncatedTokens = tokens.slice(0, maxTokens);
        const decoded = this.encoding.decode(truncatedTokens);
        // decoded 可能是 Uint8Array，需要转换为字符串
        if (decoded instanceof Uint8Array) {
          return new TextDecoder().decode(decoded);
        }
        return decoded;
      } catch (error) {
        console.warn(`[TokenManager] Token截断失败: ${error.message}`);
      }
    }

    // 备用方案：按比例截断
    const estimated = this._estimateTokens(textStr);
    if (estimated <= maxTokens) return textStr;

    const ratio = maxTokens / estimated;
    const targetLength = Math.floor(textStr.length * ratio);
    return textStr.slice(0, targetLength) + '...';
  }

  /**
   * 智能压缩消息列表
   * @param {Array} messages - 原始消息
   * @param {number} maxTokens - 最大 Token 数
   * @param {Object} options - 压缩选项
   * @returns {Array} 压缩后的消息
   */
  compressMessages(messages, maxTokens, options = {}) {
    const {
      preserveSystem = true,
      preserveUser = true,
      compressAssistant = true,
      minMessagesToKeep = 2
    } = options;

    if (!messages || messages.length === 0) return [];

    // 计算当前 Token 数
    let currentTokens = this.countMessages(messages);

    if (currentTokens <= maxTokens) {
      return messages; // 不需要压缩
    }

    // 分类消息
    const systemMsgs = messages.filter(m => m.role === 'system');
    const userMsgs = messages.filter(m => m.role === 'user');
    const assistantMsgs = messages.filter(m => m.role === 'assistant');
    const otherMsgs = messages.filter(m => !['system', 'user', 'assistant'].includes(m.role));

    // 计算固定开销（必须保留的部分）
    let fixedTokens = 0;
    const result = [];

    if (preserveSystem && systemMsgs.length > 0) {
      const systemTokens = this.countMessages(systemMsgs);
      fixedTokens += systemTokens;
      result.push(...systemMsgs);
    }

    // 计算可用空间
    let availableTokens = maxTokens - fixedTokens;

    // 策略：从最新消息开始保留
    const allUserAssistant = [...userMsgs, ...assistantMsgs].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    // 优先保留用户消息（用户意图最重要）
    const retainedMessages = [];
    let usedTokens = fixedTokens;

    for (const msg of allUserAssistant) {
      const msgTokens = this.countMessages([msg]);

      if (usedTokens + msgTokens <= maxTokens) {
        retainedMessages.unshift(msg); // 保持时间顺序
        usedTokens += msgTokens;
      } else if (retainedMessages.length < minMessagesToKeep) {
        // 至少保留最新的 minMessagesToKeep 条
        retainedMessages.unshift(msg);
        usedTokens += msgTokens;
      } else {
        // 已达到限制
        break;
      }
    }

    // 如果压缩 assistant 消息，用摘要替换
    if (compressAssistant && assistantMsgs.length > minMessagesToKeep) {
      const compressedCount = assistantMsgs.length - retainedMessages.filter(m => m.role === 'assistant').length;

      if (compressedCount > 0) {
        // 创建摘要消息
        const summaryContent = `[对话摘要] 省略了 ${compressedCount} 条 assistant 消息`;
        result.push({
          role: 'assistant',
          content: summaryContent,
          metadata: { compressed: true, originalCount: compressedCount }
        });
      }
    }

    result.push(...retainedMessages);

    // 如果还是超限，使用截断
    while (this.countMessages(result) > maxTokens && result.length > minMessagesToKeep) {
      result.shift(); // 从最老的开始移除
    }

    return result;
  }

  /**
   * 获取编码信息
   */
  getEncodingInfo() {
    return {
      model: this.model,
      encoding: this.encoding ? this.encoding.name : 'fallback',
      name: this.encoding ? this.encoding.name : 'unknown'
    };
  }

  /**
   * 销毁（释放资源）
   */
  destroy() {
    if (this.encoding) {
      this.encoding.free();
      this.encoding = null;
    }
  }
}

/**
 * 创建默认 Token 管理器
 */
function createTokenManager(options = {}) {
  return new TokenManager(options);
}

module.exports = {
  TokenManager,
  createTokenManager,
  getEncodingNameForModel
};
