/**
 * 查询改写器
 * 实现上下文补全和复杂查询分解
 * 参考 ragent 的查询改写机制
 */

class QueryRewriter {
  constructor(options = {}) {
    this.maxHistoryLength = options.maxHistoryLength || 10;
    this.enableContextCompletion = options.enableContextCompletion !== false;
    this.enableQueryDecomposition = options.enableQueryDecomposition !== false;
  }

  /**
   * 改写查询
   * @param {Object} params - 改写参数
   * @returns {Object} 改写结果
   */
  async rewrite(params) {
    const { query, messages, intent, sessionId } = params;

    // 1. 上下文补全
    let rewrittenQuery = query;
    if (this.enableContextCompletion && messages && messages.length > 0) {
      rewrittenQuery = await this.completeContext(query, messages);
    }

    // 2. 复杂查询分解
    let subQueries = null;
    if (this.enableQueryDecomposition) {
      const decompositionResult = await this.decompose(rewrittenQuery, intent);
      if (decompositionResult.isComplex) {
        subQueries = decompositionResult.subQueries;
        rewrittenQuery = decompositionResult.mainQuery;
      }
    }

    return {
      originalQuery: query,
      rewrittenQuery,
      subQueries,
      hasChanges: query !== rewrittenQuery,
      technique: this.getRewriteTechnique(query, rewrittenQuery)
    };
  }

  /**
   * 上下文补全
   * 将历史对话中的关键信息补充到当前查询
   */
  async completeContext(query, messages) {
    // 提取最近N轮对话
    const recentMessages = messages.slice(-this.maxHistoryLength);

    // 提取关键实体和信息
    const contextInfo = this.extractContextInfo(recentMessages);

    // 如果有上下文信息，补全查询
    if (contextInfo.entities.length > 0 || contextInfo.topics.length > 0) {
      // 构建补全提示
      const contextPrefix = this.buildContextPrefix(contextInfo);

      // 检查查询是否已经包含上下文信息
      const needsContext = !this.hasContextReference(query, contextInfo);

      if (needsContext) {
        return `${contextPrefix} ${query}`;
      }
    }

    return query;
  }

  /**
   * 从历史消息中提取关键信息
   */
  extractContextInfo(messages) {
    const entities = [];      // 实体（人名、术语等）
    const topics = [];       // 话题
    const lastTopic = null;   // 最后的话题
    const lastIntent = null; // 最后的意图

    // 遍历消息提取信息
    for (const msg of messages) {
      if (msg.role === 'user' && typeof msg.content === 'string') {
        // 简单提取：查找引号内的内容作为实体
        const quotedMatches = msg.content.match(/"([^"]+)"/g);
        if (quotedMatches) {
          entities.push(...quotedMatches.map(m => m.replace(/"/g, '')));
        }

        // 查找关键词作为话题
        const topicKeywords = ['关于', '关于', '这个', '那个', '之前', '上次'];
        for (const keyword of topicKeywords) {
          if (msg.content.includes(keyword)) {
            const topic = this.extractTopic(msg.content, keyword);
            if (topic && !topics.includes(topic)) {
              topics.push(topic);
            }
          }
        }
      }
    }

    return {
      entities: [...new Set(entities)],
      topics: [...new Set(topics)],
      lastTopic: topics[topics.length - 1] || null,
      lastIntent
    };
  }

  /**
   * 提取话题
   */
  extractTopic(text, keyword) {
    const index = text.indexOf(keyword);
    if (index === -1) return null;

    // 获取关键词后的内容
    const after = text.substring(index + keyword.length).trim();
    // 取前20个字符作为话题
    return after.substring(0, 20) || null;
  }

  /**
   * 构建上下文前缀
   */
  buildContextPrefix(contextInfo) {
    const parts = [];

    if (contextInfo.lastTopic) {
      parts.push(`关于 ${contextInfo.lastTopic}`);
    }

    if (contextInfo.entities.length > 0) {
      const entityList = contextInfo.entities.slice(0, 3).join('、');
      parts.push(`${entityList}相关`);
    }

    return parts.join('，');
  }

  /**
   * 检查查询是否已包含上下文引用
   */
  hasContextReference(query, contextInfo) {
    const lowerQuery = query.toLowerCase();

    // 检查是否包含指代词
    const pronouns = ['这个', '那个', '它', '他', '她', '之前', '上次', '刚才'];
    for (const pronoun of pronouns) {
      if (lowerQuery.includes(pronoun)) {
        return true;
      }
    }

    // 检查是否包含之前的话题
    if (contextInfo.lastTopic) {
      if (lowerQuery.includes(contextInfo.lastTopic.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * 复杂查询分解
   * 将复杂问题拆分为多个简单子查询
   */
  async decompose(query, intent) {
    // 复杂查询的特征
    const complexPatterns = [
      /和.*与.*/g,           // "和...与..."
      /以及.*/g,              // "...以及..."
      /并且.*并且/g,          // "并且...并且"
      /首先.*然后.*最后/g,     // 步骤类
      /为什么.*如何/g,         // 多问题类
      /对比.*和.*|比较.*和/g  // 对比类
    ];

    let isComplex = false;
    for (const pattern of complexPatterns) {
      if (pattern.test(query)) {
        isComplex = true;
        break;
      }
    }

    // 检查是否包含多个问题
    const questionCount = (query.match(/[？?]/g) || []).length;
    if (questionCount > 1) {
      isComplex = true;
    }

    if (!isComplex) {
      return {
        isComplex: false,
        mainQuery: query,
        subQueries: null
      };
    }

    // 分解查询
    const subQueries = this.splitQuery(query);

    return {
      isComplex: true,
      mainQuery: query,
      subQueries,
      strategy: subQueries.length > 2 ? 'parallel' : 'sequential'
    };
  }

  /**
   * 拆分查询为子查询
   */
  splitQuery(query) {
    const subQueries = [];

    // 按连接词拆分
    const separators = [
      '和', '与', '以及', '并且', '然后', '同时',
      '另外', '此外', '还有', '或者', '还是'
    ];

    // 尝试按句号拆分
    const sentences = query.split(/[。；!?！？]/).filter(s => s.trim());

    if (sentences.length > 1) {
      // 按句子拆分
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (trimmed) {
          subQueries.push(trimmed);
        }
      }
    } else {
      // 按连接词拆分
      let current = query;
      for (const sep of separators) {
        const parts = current.split(sep);
        if (parts.length > 1) {
          current = parts[0];
          for (let i = 1; i < parts.length; i++) {
            if (parts[i].trim()) {
              subQueries.push(parts[i].trim());
            }
          }
        }
      }
      if (current.trim()) {
        subQueries.unshift(current.trim());
      }
    }

    // 如果拆分失败，返回原查询
    if (subQueries.length === 0) {
      return [query];
    }

    return subQueries;
  }

  /**
   * 获取使用的改写技术
   */
  getRewriteTechnique(original, rewritten) {
    if (original === rewritten) {
      return 'none';
    }

    // 检测使用了哪种技术
    if (rewritten.includes('关于')) {
      return 'context_completion';
    }

    return 'general_rewrite';
  }
}

module.exports = {
  QueryRewriter
};
