/**
 * MiniMax 联网搜索工具
 * 直接使用 MiniMax API 实现联网搜索功能
 */

const { withRetry, withTimeout } = require('../utils/retry');
const AppError = require('../common/errors/AppError');

class MiniMaxSearchTool {
  constructor(options = {}) {
    this.name = 'minimax_search';
    this.description = 'MiniMax 联网搜索 - 使用 MiniMax API 搜索网络信息，支持20+并发搜索';
    this.category = 'internet';
    this.apiKey = options.apiKey || process.env.MINIMAX_API_KEY;
    this.baseUrl = options.baseUrl || process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/anthropic';
    this.maxResults = options.maxResults || 10;
    this.timeout = options.timeout || 60000;
    this.searchCount = 0;
    this.totalTokens = 0;
  }

  /**
   * 参数模式
   */
  get parameters() {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['search', 'batch_search', 'research', 'compare', 'trending'],
          description: '操作类型: search=单次搜索, batch_search=批量搜索, research=深度研究, compare=对比搜索, trending=热门话题'
        },
        query: {
          type: 'string',
          description: '搜索查询词'
        },
        queries: {
          type: 'array',
          items: { type: 'string' },
          description: '批量搜索查询列表 (最多20个)'
        },
        options: {
          type: 'object',
          properties: {
            maxResults: { type: 'number', description: '最大结果数' },
            language: { type: 'string', description: '语言 (zh/en)' },
            timeRange: { type: 'string', description: '时间范围 (day/week/month/year)' }
          }
        }
      },
      required: ['action']
    };
  }

  /**
   * 执行搜索操作
   */
  async execute(params) {
    const { action, query, queries, options = {} } = params;

    try {
      switch (action) {
        case 'search':
          return await this.search(query, options);
        case 'batch_search':
          return await this.batchSearch(queries || [query], options);
        case 'research':
          return await this.deepResearch(query, options);
        case 'compare':
          return await this.compareSearch(queries, options);
        case 'trending':
          return await this.trendingSearch(options);
        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (error) {
      console.error('[MiniMaxSearchTool] 执行失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 单次搜索
   */
  async search(query, options = {}) {
    if (!query) {
      return { success: false, error: '搜索关键词不能为空' };
    }

    this.searchCount++;

    try {
      const result = await withTimeout(
        this.callMinimaxAPI(query, options),
        this.timeout,
        '搜索超时'
      );

      if (result.success) {
        this.totalTokens += result.usage?.total_tokens || 0;
      }

      return result;
    } catch (error) {
      return { success: false, error: error.message, query };
    }
  }

  /**
   * 批量搜索 (最多20个查询)
   */
  async batchSearch(queries, options = {}) {
    if (!queries || queries.length === 0) {
      return { success: false, error: '查询列表不能为空' };
    }

    const limitedQueries = queries.slice(0, 20);
    const maxResults = options.maxResults || this.maxResults;
    const results = [];
    const errors = [];

    console.log(`[MiniMaxSearch] 批量搜索开始: ${limitedQueries.length} 个查询`);

    // 串行执行避免 API 限流
    for (let i = 0; i < limitedQueries.length; i++) {
      const q = limitedQueries[i];
      console.log(`[MiniMaxSearch] [${i + 1}/${limitedQueries.length}] 搜索: ${q}`);

      try {
        const result = await this.search(q, { ...options, maxResults });
        results.push({ query: q, ...result });

        // 添加延迟避免限流
        if (i < limitedQueries.length - 1) {
          await this.sleep(500);
        }
      } catch (error) {
        errors.push({ query: q, error: error.message });
      }
    }

    console.log(`[MiniMaxSearch] 批量搜索完成: 成功 ${results.length}, 失败 ${errors.length}`);

    return {
      success: results.length > 0,
      total: limitedQueries.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
      searchCount: this.searchCount,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 深度研究 (多角度搜索 + 综合分析)
   */
  async deepResearch(topic, options = {}) {
    if (!topic) {
      return { success: false, error: '研究主题不能为空' };
    }

    console.log(`[MiniMaxSearch] 深度研究开始: ${topic}`);

    // 生成多角度查询
    const queries = this.generateResearchQueries(topic);
    console.log(`[MiniMaxSearch] 生成 ${queries.length} 个研究查询`);

    // 并行执行批量搜索
    const batchResult = await this.batchSearch(queries, {
      ...options,
      maxResults: options.maxResults || 5
    });

    // 生成研究摘要
    const summary = this.generateResearchSummary(batchResult.results, topic);

    return {
      success: batchResult.successful > 0,
      topic,
      totalQueries: queries.length,
      successfulQueries: batchResult.successful,
      summary,
      findings: batchResult.results,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 对比搜索
   */
  async compareSearch(queries, options = {}) {
    if (!queries || queries.length < 2) {
      return { success: false, error: '对比搜索至少需要2个查询' };
    }

    const limitedQueries = queries.slice(0, 5);
    console.log(`[MiniMaxSearch] 对比搜索: ${limitedQueries.join(' vs ')}`);

    const results = [];
    for (const q of limitedQueries) {
      const result = await this.search(q, options);
      results.push({ query: q, ...result });
    }

    return {
      success: results.length > 0,
      queries: limitedQueries,
      results,
      comparison: this.generateComparison(results),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 热门话题搜索
   */
  async trendingSearch(options = {}) {
    const trendingTopics = [
      'AI人工智能最新进展',
      '大语言模型最新动态',
      '前端框架最新趋势',
      '开源项目热门话题'
    ];

    const results = [];
    for (const topic of trendingTopics) {
      const result = await this.search(topic, { ...options, maxResults: 5 });
      results.push({ topic, ...result });
    }

    return {
      success: true,
      topics: trendingTopics,
      results,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 调用 MiniMax API
   */
  async callMinimaxAPI(query, options = {}) {
    const maxResults = options.maxResults || this.maxResults;

    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'MiniMax-M2.7',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: `请搜索以下内容并返回搜索结果列表:\n\n${query}\n\n请以JSON格式返回，格式如下:\n{\n  "results": [\n    {\n      "title": "标题",\n      "url": "链接",\n      "snippet": "摘要描述",\n      "source": "来源"\n    }\n  ],\n  "totalResults": 数量\n}`
            }
          ],
          tools: [
            {
              type: 'web_search',
              name: 'web_search',
              description: '搜索网络信息',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: '搜索查询' },
                  max_results: { type: 'number', description: '最大结果数' }
                }
              }
            }
          ],
          tool_choice: { type: 'tool', name: 'web_search' }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw AppError.internalError(`API错误 ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      // 解析工具调用结果
      let searchResults = [];
      if (data.content && data.content.length > 0) {
        for (const block of data.content) {
          if (block.type === 'tool_result') {
            try {
              const toolData = typeof block.content === 'string'
                ? JSON.parse(block.content)
                : block.content;
              searchResults = toolData.results || [];
            } catch (e) {
              console.warn('[MiniMaxSearch] 解析搜索结果失败:', e.message);
            }
          }
        }
      }

      // 如果没有工具调用，尝试从文本中提取
      if (searchResults.length === 0 && data.content && data.content[0]?.type === 'text') {
        searchResults = this.parseTextResults(data.content[0].text);
      }

      return {
        success: true,
        query,
        results: searchResults.slice(0, maxResults),
        totalResults: searchResults.length,
        usage: data.usage
      };
    } catch (error) {
      console.error('[MiniMaxSearch] API调用失败:', error.message);
      return {
        success: false,
        error: error.message,
        query
      };
    }
  }

  /**
   * 从文本解析搜索结果
   */
  parseTextResults(text) {
    try {
      // 尝试 JSON 解析
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.results) return parsed.results;
      }

      // 尝试从文本中提取结构化信息
      const results = [];
      const lines = text.split('\n');

      for (const line of lines) {
        // 匹配常见格式: 1. 标题 - 描述
        const match = line.match(/^\d+[\.\)]\s*(.+?)(?:\s*[-:]\s*(.+))?$/);
        if (match) {
          results.push({
            title: match[1].trim(),
            snippet: match[2]?.trim() || '',
            url: '',
            source: 'inferred'
          });
        }
      }

      return results;
    } catch (e) {
      return [{ title: text.substring(0, 200), snippet: '', url: '', source: 'raw' }];
    }
  }

  /**
   * 生成研究查询
   */
  generateResearchQueries(topic) {
    return [
      `${topic} 最新消息`,
      `${topic} 技术原理`,
      `${topic} 应用场景`,
      `${topic} 发展趋势`,
      `${topic} 优缺点分析`,
      `${topic} 开源项目`,
      `${topic} 相关产品`,
      `${topic} 入门教程`
    ];
  }

  /**
   * 生成研究摘要
   */
  generateResearchSummary(results, topic) {
    const summary = {
      topic,
      totalSources: results.length,
      keyFindings: [],
      sources: []
    };

    for (const r of results) {
      if (r.results && r.results.length > 0) {
        summary.sources.push(...r.results.slice(0, 3));
      }
    }

    return summary;
  }

  /**
   * 生成对比结果
   */
  generateComparison(results) {
    return results.map(r => ({
      query: r.query,
      resultCount: r.results?.length || 0,
      topResult: r.results?.[0] || null
    }));
  }

  /**
   * 睡眠
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      searchCount: this.searchCount,
      totalTokens: this.totalTokens,
      avgTokensPerSearch: this.searchCount > 0 ? Math.round(this.totalTokens / this.searchCount) : 0
    };
  }
}

module.exports = MiniMaxSearchTool;
