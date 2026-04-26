/**
 * 查询改写服务
 * 负责查询的补全、拆分、同义词扩展
 */

class QueryRewriteService {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.llmClient = options.llmClient;
  }

  /**
   * 补全省略信息
   * 例如: "它支持哪些功能?" -> "MiniMax API支持哪些功能?"
   */
  async rewrite(query, context = {}) {
    if (!this.enabled) return query;

    // 简单实现：添加上下文前缀
    if (context.topic && !query.includes(context.topic)) {
      return `${context.topic}相关: ${query}`;
    }

    return query;
  }

  /**
   * 拆分子问题
   * 例如: "比较GPT-4和Claude的性能" -> ["GPT-4的性能", "Claude的性能", "两者比较"]
   */
  decompose(query) {
    const subQueries = [query];

    // 检测比较型查询
    if (query.includes('比较') || query.includes('对比')) {
      const parts = query.split(/(?:比较|对比)/);
      if (parts.length >= 2) {
        subQueries.push(`详细说明: ${parts[0].trim()}`);
        subQueries.push(`详细说明: ${parts[1].trim()}`);
      }
    }

    // 检测列表型查询
    if (query.includes('哪些') || query.includes('有什么')) {
      subQueries.push(`${query.replace(/哪些|有什么/g, '哪些具体')}`);
    }

    return subQueries.slice(0, 3); // 最多3个子查询
  }

  /**
   * 同义词扩展
   */
  expand(query) {
    const synonyms = {
      'AI': ['人工智能', 'Artificial Intelligence'],
      'API': ['应用程序接口', '接口'],
      'LLM': ['大语言模型', '语言模型'],
      'RAG': ['检索增强生成', '知识检索']
    };

    let expanded = query;
    for (const [term, syns] of Object.entries(synonyms)) {
      if (query.includes(term)) {
        expanded += ' ' + syns.join(' ');
      }
    }

    return expanded;
  }
}

module.exports = QueryRewriteService;
