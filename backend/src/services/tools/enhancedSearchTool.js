/**
 * 增强搜索工具
 * 支持多源搜索、批量搜索、搜索历史、搜索建议等
 */

const { getMCPSearchService } = require('../mcpSearchService');

class EnhancedSearchTool {
  constructor(options = {}) {
    this.name = 'enhanced_search';
    this.description = '增强搜索 - 多源搜索、批量查询、搜索历史、技术文档检索';
    this.category = 'internet';
    this.apiKey = options.apiKey || process.env.MINIMAX_API_KEY;
    this.baseUrl = options.baseUrl || process.env.MINIMAX_API_HOST || 'https://api.minimaxi.com';
    this.maxResults = options.maxResults || 10;
    this.timeout = options.timeout || 60000;
    this.mcpService = null;
    this.searchHistory = [];
    this.maxHistorySize = 100;
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
          enum: ['search', 'multi_search', 'batch_search', 'search_history', 'tech_search', 'news_search', 'clear_history'],
          description: '操作类型'
        },
        query: {
          type: 'string',
          description: '搜索查询词'
        },
        queries: {
          type: 'array',
          items: { type: 'string' },
          description: '批量搜索查询列表'
        },
        sources: {
          type: 'array',
          items: { type: 'string', enum: ['mcp', 'jina', 'duckduckgo', 'all'] },
          description: '搜索源 (默认 mcp)',
          default: ['mcp']
        },
        options: {
          type: 'object',
          properties: {
            maxResults: { type: 'number', description: '最大结果数' },
            language: { type: 'string', description: '语言 (zh, en)' },
            timeRange: { type: 'string', description: '时间范围' },
            category: { type: 'string', description: '搜索分类' }
          }
        },
        domain: {
          type: 'string',
          description: '技术文档域名 (github, npm, pypi, etc)'
        }
      },
      required: ['action']
    };
  }

  /**
   * 执行搜索操作
   */
  async execute(params) {
    const { action, query, queries, sources = ['mcp'], options = {}, domain } = params;

    try {
      switch (action) {
        case 'search':
          return await this.singleSearch(query, sources, options);
        case 'multi_search':
          return await this.multiSourceSearch(query, sources, options);
        case 'batch_search':
          return await this.batchSearch(queries || [query], options);
        case 'search_history':
          return this.getSearchHistory();
        case 'tech_search':
          return await this.techDocSearch(query, domain, options);
        case 'news_search':
          return await this.newsSearch(query, options);
        case 'clear_history':
          return this.clearHistory();
        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (error) {
      console.error('[EnhancedSearchTool] 执行失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 单源搜索
   */
  async singleSearch(query, sources, options) {
    if (!query) {
      return { success: false, error: '搜索关键词不能为空' };
    }

    // 记录搜索历史
    this.addToHistory('search', query);

    // 优先使用 MCP
    if (sources.includes('mcp') || sources.includes('all')) {
      try {
        const mcpResult = await this.mcpSearch(query, options);
        if (mcpResult.success) {
          return mcpResult;
        }
      } catch (e) {
        console.warn('[EnhancedSearchTool] MCP 搜索失败:', e.message);
      }
    }

    // Fallback 到 Jina
    if (sources.includes('jina') || sources.includes('all')) {
      const jinaResult = await this.jinaSearch(query, options);
      if (jinaResult.success) {
        return jinaResult;
      }
    }

    return { success: false, error: '所有搜索源均失败' };
  }

  /**
   * 多源搜索
   */
  async multiSourceSearch(query, sources, options) {
    if (!query) {
      return { success: false, error: '搜索关键词不能为空' };
    }

    this.addToHistory('multi_search', query);

    const results = {};
    const maxResults = options.maxResults || this.maxResults;

    // 并行执行多个搜索源
    const promises = [];

    if (sources.includes('mcp') || sources.includes('all')) {
      promises.push(
        this.mcpSearch(query, options).then(r => ({ source: 'mcp', ...r }))
          .catch(e => ({ source: 'mcp', success: false, error: e.message }))
      );
    }

    if (sources.includes('jina') || sources.includes('all')) {
      promises.push(
        this.jinaSearch(query, options).then(r => ({ source: 'jina', ...r }))
          .catch(e => ({ source: 'jina', success: false, error: e.message }))
      );
    }

    if (sources.includes('duckduckgo') || sources.includes('all')) {
      promises.push(
        this.duckduckgoSearch(query, options).then(r => ({ source: 'duckduckgo', ...r }))
          .catch(e => ({ source: 'duckduckgo', success: false, error: e.message }))
      );
    }

    const settled = await Promise.all(promises);

    for (const result of settled) {
      if (result.success) {
        results[result.source] = result.results || result;
      }
    }

    const successCount = Object.keys(results).length;

    return {
      success: successCount > 0,
      query,
      sources: Object.keys(results),
      totalSources: sources.length,
      successfulSources: successCount,
      results,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 批量搜索 (最多20个查询)
   */
  async batchSearch(queries, options = {}) {
    if (!queries || queries.length === 0) {
      return { success: false, error: '查询列表不能为空' };
    }

    // 限制批量大小
    const limitedQueries = queries.slice(0, 20);
    const maxResults = options.maxResults || 5;

    this.addToHistory('batch_search', queries.join(', '));

    const results = [];
    const errors = [];

    // 串行执行以避免 API 限流
    for (const query of limitedQueries) {
      try {
        const result = await this.singleSearch(query, ['mcp'], { ...options, maxResults });
        results.push({
          query,
          ...result
        });
      } catch (error) {
        errors.push({ query, error: error.message });
      }
    }

    return {
      success: results.length > 0,
      total: limitedQueries.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 技术文档搜索
   */
  async techDocSearch(query, domain, options = {}) {
    if (!query) {
      return { success: false, error: '搜索关键词不能为空' };
    }

    const domains = {
      github: { prefix: 'site:github.com ', label: 'GitHub' },
      npm: { prefix: 'site:npmjs.com ', label: 'NPM' },
      pypi: { prefix: 'site:pypi.org ', label: 'PyPI' },
      npmjs: { prefix: 'site:npmjs.com ', label: 'NPM' },
      stackoverflow: { prefix: 'site:stackoverflow.com ', label: 'Stack Overflow' },
      devdocs: { prefix: 'site:devdocs.io ', label: 'DevDocs' },
      mdndocs: { prefix: 'site:developer.mozilla.org ', label: 'MDN' },
      react: { prefix: 'site:react.dev ', label: 'React' },
      vue: { prefix: 'site:vuejs.org ', label: 'Vue' },
      nextjs: { prefix: 'site:nextjs.org ', label: 'Next.js' },
      typescript: { prefix: 'site:typescriptlang.org ', label: 'TypeScript' },
      rust: { prefix: 'site:doc.rust-lang.org ', label: 'Rust' },
      python: { prefix: 'site:docs.python.org ', label: 'Python' },
      deno: { prefix: 'site:deno.land ', label: 'Deno' },
      bun: { prefix: 'site:bun.sh ', label: 'Bun' }
    };

    const targetDomain = domains[domain] || domains.github;
    const searchQuery = targetDomain.prefix + query;

    return await this.singleSearch(searchQuery, ['mcp'], options);
  }

  /**
   * 新闻搜索
   */
  async newsSearch(query, options = {}) {
    if (!query) {
      return { success: false, error: '搜索关键词不能为空' };
    }

    // 添加时间参数获取最新结果
    const searchOptions = {
      ...options,
      timeRange: options.timeRange || 'week'
    };

    return await this.singleSearch(query, ['mcp'], searchOptions);
  }

  /**
   * 获取搜索历史
   */
  getSearchHistory() {
    return {
      success: true,
      total: this.searchHistory.length,
      history: this.searchHistory.slice(-50).reverse()
    };
  }

  /**
   * 清除搜索历史
   */
  clearHistory() {
    const count = this.searchHistory.length;
    this.searchHistory = [];
    return {
      success: true,
      cleared: count
    };
  }

  /**
   * 添加到搜索历史
   */
  addToHistory(type, query) {
    this.searchHistory.push({
      type,
      query,
      timestamp: Date.now()
    });

    // 限制历史大小
    if (this.searchHistory.length > this.maxHistorySize) {
      this.searchHistory = this.searchHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * MCP 搜索
   */
  async mcpSearch(query, options = {}) {
    if (!this.mcpService) {
      this.mcpService = getMCPSearchService({
        apiKey: this.apiKey,
        apiHost: this.baseUrl
      });
      await this.mcpService.initialize();
    }

    const result = await this.mcpService.search(query, {
      maxResults: options.maxResults || this.maxResults,
      language: options.language,
      timeRange: options.timeRange
    });

    if (result.success) {
      return {
        success: true,
        source: 'mcp',
        query,
        results: result.results,
        totalResults: result.totalResults
      };
    }

    throw new Error(result.error || 'MCP search failed');
  }

  /**
   * Jina AI 搜索
   */
  async jinaSearch(query, options = {}) {
    const searchUrl = `https://r.jina.ai/search?q=${encodeURIComponent(query)}`;

    try {
      const response = await fetch(searchUrl, {
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      const results = this.parseJinaResults(text);
      const maxResults = options.maxResults || this.maxResults;

      return {
        success: true,
        source: 'jina_ai',
        query,
        results: results.slice(0, maxResults),
        totalResults: results.length
      };
    } catch (error) {
      throw new Error(`Jina search failed: ${error.message}`);
    }
  }

  /**
   * DuckDuckGo 搜索
   */
  async duckduckgoSearch(query, options = {}) {
    // 使用 DuckDuckGo HTML 搜索
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    try {
      const response = await fetch(searchUrl, {
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const results = this.parseDuckduckgoHTML(html);
      const maxResults = options.maxResults || this.maxResults;

      return {
        success: true,
        source: 'duckduckgo',
        query,
        results: results.slice(0, maxResults),
        totalResults: results.length
      };
    } catch (error) {
      throw new Error(`DuckDuckGo search failed: ${error.message}`);
    }
  }

  /**
   * 解析 Jina 搜索结果
   */
  parseJinaResults(text) {
    const lines = text.split('\n');
    const results = [];
    let currentResult = null;

    for (const line of lines) {
      const titleMatch = line.match(/^##\s+(.+)$/);
      if (titleMatch) {
        if (currentResult) results.push(currentResult);
        currentResult = { title: titleMatch[1].trim(), url: '', snippet: '', timestamp: Date.now() };
        continue;
      }

      const urlMatch = line.match(/^-\s+(https?:\/\/[^\s]+)$/);
      if (urlMatch && currentResult) {
        currentResult.url = urlMatch[1];
        continue;
      }

      const contentMatch = line.match(/^-\s+(.+)$/);
      if (contentMatch && currentResult && !currentResult.snippet) {
        currentResult.snippet = contentMatch[1].trim();
      }
    }

    if (currentResult) results.push(currentResult);
    return results;
  }

  /**
   * 解析 DuckDuckGo HTML 结果
   */
  parseDuckduckgoHTML(html) {
    const results = [];
    // 简单的正则解析
    const resultRegex = /<a class="result__a" href="([^"]+)">([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let match;

    while ((match = resultRegex.exec(html)) !== null && results.length < 20) {
      results.push({
        title: match[2].trim(),
        url: match[1],
        snippet: match[3].replace(/<[^>]+>/g, '').trim(),
        timestamp: Date.now()
      });
    }

    return results;
  }
}

module.exports = EnhancedSearchTool;
