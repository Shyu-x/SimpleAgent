/**
 * DuckDuckGo 免费搜索工具
 * 无需 API Key，无限制搜索
 */

class DuckDuckGoSearchTool {
  constructor(options = {}) {
    this.name = 'duckduckgo_search';
    this.description = 'DuckDuckGo 免费搜索 - 无需 API Key，无限制联网搜索';
    this.category = 'internet';
    this.timeout = options.timeout || 30000;
    this.maxResults = options.maxResults || 10;
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
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
          enum: ['search', 'batch_search', 'lucky'],
          description: '操作类型: search=搜索, batch_search=批量搜索, lucky=直接访问第一个结果'
        },
        query: {
          type: 'string',
          description: '搜索关键词'
        },
        queries: {
          type: 'array',
          items: { type: 'string' },
          description: '批量搜索关键词列表 (最多20个)'
        },
        options: {
          type: 'object',
          properties: {
            maxResults: { type: 'number', description: '最大结果数' },
            language: { type: 'string', description: '语言 (zh-CN, en-US 等)' },
            region: { type: 'string', description: '地区 (wt-wt, cn-zh 等)' }
          }
        }
      },
      required: ['action']
    };
  }

  /**
   * 执行搜索
   */
  async execute(params) {
    const { action, query, queries, options = {} } = params;

    try {
      switch (action) {
        case 'search':
          return await this.search(query, options);
        case 'batch_search':
          return await this.batchSearch(queries || [query], options);
        case 'lucky':
          return await this.luckySearch(query);
        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (error) {
      console.error('[DuckDuckGoSearch] 执行失败:', error.message);
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

    const maxResults = options.maxResults || this.maxResults;

    try {
      const results = await this.fetchSearchResults(query, options);
      return {
        success: true,
        query,
        results: results.slice(0, maxResults),
        totalResults: results.length,
        source: 'duckduckgo'
      };
    } catch (error) {
      return { success: false, error: error.message, query };
    }
  }

  /**
   * 批量搜索 (最多20个)
   */
  async batchSearch(queries, options = {}) {
    if (!queries || queries.length === 0) {
      return { success: false, error: '查询列表不能为空' };
    }

    const limitedQueries = queries.slice(0, 20);
    const results = [];
    const errors = [];

    console.log(`[DuckDuckGoSearch] 批量搜索: ${limitedQueries.length} 个查询`);

    for (let i = 0; i < limitedQueries.length; i++) {
      const q = limitedQueries[i];
      console.log(`[DuckDuckGoSearch] [${i + 1}/${limitedQueries.length}] ${q}`);

      try {
        const result = await this.search(q, options);
        results.push({ query: q, ...result });
      } catch (error) {
        errors.push({ query: q, error: error.message });
      }

      // 避免请求过快
      if (i < limitedQueries.length - 1) {
        await this.sleep(300);
      }
    }

    console.log(`[DuckDuckGoSearch] 完成: 成功 ${results.length}, 失败 ${errors.length}`);

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
   * Lucky 搜索 - 直接返回第一个结果的 URL
   */
  async luckySearch(query) {
    if (!query) {
      return { success: false, error: '搜索关键词不能为空' };
    }

    try {
      const results = await this.fetchSearchResults(query, { maxResults: 1 });
      if (results.length > 0) {
        return {
          success: true,
          query,
          url: results[0].url,
          title: results[0].title,
          source: 'duckduckgo_lucky'
        };
      }
      return { success: false, error: '未找到结果', query };
    } catch (error) {
      return { success: false, error: error.message, query };
    }
  }

  /**
   * 获取搜索结果 (带重试)
   */
  async fetchSearchResults(query, options = {}) {
    const language = options.language || 'zh-CN';
    const region = options.region || 'wt-wt';

    // DuckDuckGo HTML 搜索 API
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${language}-${region}`;

    // 重试机制
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(searchUrl, {
          headers: {
            'User-Agent': this.userAgent,
            'Accept': 'text/html'
          },
          signal: AbortSignal.timeout(this.timeout)
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        return this.parseHTML(html);
      } catch (error) {
        lastError = error;
        console.log(`[DuckDuckGoSearch] 第 ${attempt} 次尝试失败: ${error.message}`);

        if (attempt < maxRetries) {
          // 指数退避: 1s, 2s, 4s
          await this.sleep(Math.pow(2, attempt - 1) * 1000);
        }
      }
    }

    throw lastError;
  }

  /**
   * 解析 HTML 结果
   */
  parseHTML(html) {
    const results = [];

    // DuckDuckGo HTML 结构:
    // <h2 class="result__title"><a class="result__a" href="URL">Title</a></h2>
    // ... (中间有很多其他标签)
    // <a class="result__snippet">Snippet text</a>

    // 先找到所有 result__a 链接 (可能带有 rel="nofollow" 等属性)
    const titleRegex = /<a\s+[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
    const snippetRegex = /<a\s+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

    const titles = [];
    let titleMatch;
    while ((titleMatch = titleRegex.exec(html)) !== null) {
      titles.push({
        url: titleMatch[1],
        title: this.decodeHTML(titleMatch[2].trim())
      });
    }

    // 找到所有 snippet
    const snippets = [];
    let snippetMatch;
    while ((snippetMatch = snippetRegex.exec(html)) !== null) {
      snippets.push(this.decodeHTML(snippetMatch[1].replace(/<[^>]+>/g, '').trim()));
    }

    // 配对标题和摘要（按顺序配对）
    const count = Math.min(titles.length, snippets.length);
    for (let i = 0; i < count; i++) {
      const { url, title } = titles[i];
      const snippet = snippets[i];

      // 先修复 URL，提取真正的外部链接
      const fixedUrl = this.fixDuckDuckGoURL(url);

      // 过滤掉 DuckDuckGo 内部链接（基于修复后的 URL）
      if (fixedUrl && title && !fixedUrl.includes('duckduckgo.com')) {
        results.push({
          title,
          url: fixedUrl,
          snippet: snippet.substring(0, 300),
          source: 'duckduckgo'
        });
      }
    }

    // 如果正则没匹配到，尝试备用解析
    if (results.length === 0) {
      return this.parseHTMLFallback(html);
    }

    return results;
  }

  /**
   * 修复 DuckDuckGo 跳转 URL
   */
  fixDuckDuckGoURL(url) {
    // 如果是 //duckduckgo.com/l/?uddg= 格式，转为直接 URL
    if (url.startsWith('//duckduckgo.com/l/?uddg=')) {
      try {
        // 提取 uddg 参数并解码（&rut=... 在编码时已经包含在 udg 参数中）
        const decoded = decodeURIComponent(url.replace('//duckduckgo.com/l/?uddg=', ''));
        // 移除 DuckDuckGo 的跟踪参数 &rut=... （它是在编码时混入的）
        return decoded.replace(/&rut=[a-f0-9]+/gi, '').replace(/\?$/, '');
      } catch {
        return url;
      }
    }
    if (url.startsWith('/')) {
      return 'https://duckduckgo.com' + url;
    }
    return url;
  }

  /**
   * 备用解析方法
   */
  parseHTMLFallback(html) {
    const results = [];

    // 匹配所有链接
    const linkRegex = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/g;
    let match;
    const seen = new Set();

    while ((match = linkRegex.exec(html)) !== null && results.length < 10) {
      const url = match[1];
      const title = this.decodeHTML(match[2].trim());

      // 过滤掉 DuckDuckGo 内部链接
      if (url && !seen.has(url) && !url.includes('duckduckgo.com') &&
          !url.includes('yessearch') && title.length > 5) {
        seen.add(url);
        results.push({
          title,
          url,
          snippet: '',
          source: 'duckduckgo_fallback'
        });
      }
    }

    return results;
  }

  /**
   * 解码 HTML 实体
   */
  decodeHTML(str) {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }

  /**
   * 睡眠
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = DuckDuckGoSearchTool;
