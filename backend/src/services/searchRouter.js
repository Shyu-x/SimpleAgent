/**
 * 搜索路由器 - 智能选择搜索来源
 * 支持多源并行搜索和结果聚合
 */

const axios = require('axios');

// 搜索源配置
const SEARCH_PROVIDERS = {
  minimax: {
    name: 'MiniMax MCP',
    enabled: true,
    requiresKey: true,
    priority: 1
  },
  jina: {
    name: 'Jina AI',
    enabled: true,
    requiresKey: false,
    priority: 2
  },
  duckduckgo: {
    name: 'DuckDuckGo',
    enabled: true,
    requiresKey: false,
    priority: 3
  }
};

/**
 * 搜索路由器类
 * 智能选择最佳搜索来源，支持并行搜索和结果去重
 */
class SearchRouter {
  constructor() {
    // 来源类型配置
    this.sourceTypes = {
      web: {
        name: 'Web Search',
        priority: ['minimax', 'jina', 'duckduckgo']
      },
      docs: {
        name: 'Documentation',
        priority: ['jina']
      },
      academic: {
        name: 'Academic',
        priority: ['minimax']
      }
    };

    // 失败记录
    this.failedProviders = new Map();
    this.coolDownTime = 30000; // 30秒冷却时间

    // 结果缓存
    this.cache = new Map();
    this.cacheTime = 60000; // 1分钟缓存
  }

  /**
   * 根据查询意图选择最佳搜索来源
   * @param {string} query - 搜索查询
   * @param {Object} options - 配置选项
   * @returns {string} 选择的 provider 名称
   */
  selectProvider(query, options = {}) {
    const { source = 'web', prefer = [] } = options;

    // 如果有偏好设置，优先使用
    if (prefer.length > 0) {
      for (const p of prefer) {
        if (!this.isProviderFailed(p) && this.providerExists(p)) {
          return p;
        }
      }
    }

    // 根据来源类型选择
    const sourceConfig = this.sourceTypes[source];
    if (sourceConfig) {
      for (const p of sourceConfig.priority) {
        if (!this.isProviderFailed(p) && this.providerExists(p)) {
          return p;
        }
      }
    }

    // 默认回退到 jina
    return 'jina';
  }

  /**
   * 并行搜索多个来源
   * @param {string} query - 搜索查询
   * @param {string[]} sources - 要搜索的来源列表
   * @returns {Object} 搜索结果和错误信息
   */
  async parallelSearch(query, sources = ['web']) {
    const results = [];
    const errors = [];

    // 获取要搜索的 providers
    const providers = sources.map(source => this.selectProvider(query, { source }));

    // 并行执行所有搜索
    await Promise.allSettled(
      providers.map(async (provider, index) => {
        try {
          const result = await this.searchWithProvider(query, provider);
          results.push({
            source: sources[index],
            provider,
            result,
            success: true
          });
        } catch (error) {
          this.recordFailure(provider);
          errors.push({
            source: sources[index],
            provider,
            error: error.message
          });
        }
      })
    );

    return { results, errors };
  }

  /**
   * 使用指定 provider 执行搜索
   * @param {string} query - 搜索查询
   * @param {string} provider - provider 名称
   * @returns {Object} 搜索结果
   */
  async searchWithProvider(query, provider) {
    // 检查缓存
    const cacheKey = `${provider}:${query}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    let result;
    switch (provider) {
      case 'minimax':
        result = await this.searchMiniMax(query);
        break;
      case 'jina':
        result = await this.searchJina(query);
        break;
      case 'duckduckgo':
        result = await this.searchDuckDuckGo(query);
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    // 存入缓存
    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * MiniMax 搜索
   */
  async searchMiniMax(query) {
    try {
      // 尝试使用 MCP 搜索服务
      let mcpService;
      try {
        const { getMCPSearchService } = require('./mcpSearchService');
        mcpService = getMCPSearchService({
          apiKey: process.env.MINIMAX_API_KEY,
          apiHost: process.env.MINIMAX_API_HOST || 'https://api.minimaxi.com'
        });
        await mcpService.initialize();

        const mcpResult = await mcpService.search(query, { maxResults: 10 });
        if (mcpResult.success) {
          return {
            success: true,
            results: mcpResult.results.map(r => ({
              title: r.title || '无标题',
              url: r.url || '',
              snippet: r.snippet || '',
              score: r.score || 0,
              source: 'minimax_mcp'
            })),
            source: 'minimax_mcp'
          };
        }
      } catch (mcpError) {
        console.log('[SearchRouter] MiniMax MCP 不可用:', mcpError.message);
      }

      // 备用：直接调用 MiniMax API
      if (process.env.MINIMAX_API_KEY) {
        const baseUrl = process.env.MINIMAX_API_HOST || 'https://api.minimaxi.com';
      const response = await axios.post(
        `${baseUrl}/v1/text/chatcompletion_pro`,
        {
          model: 'abab6.5s-chat',
            messages: [
              {
                role: 'system',
                content: '你是一个搜索助手。请提供与查询相关的信息。'
              },
              {
                role: 'user',
                content: `请搜索: ${query}`
              }
            ],
            tokens_to_generate: 500,
            temperature: 0.1
          },
          {
            headers: {
              'Authorization': `Bearer ${process.env.MINIMAX_API_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 15000
          }
        );

        const content = response.data.choices?.[0]?.message?.content || '';
        return {
          success: true,
          results: [
            {
              title: `${query} - MiniMax 搜索结果`,
              url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
              snippet: content,
              score: 1,
              source: 'minimax_api'
            }
          ],
          source: 'minimax_api'
        };
      }

      throw new Error('MiniMax API 不可用');
    } catch (error) {
      console.error('[SearchRouter] MiniMax search error:', error.message);
      throw error;
    }
  }

  /**
   * Jina AI 搜索
   */
  async searchJina(query) {
    try {
      const response = await axios.get(
        `https://r.jina.ai/search?q=${encodeURIComponent(query)}`,
        {
          timeout: 15000,
          headers: {
            'Accept': 'application/json'
          }
        }
      );

      const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      const results = [];
      const lines = text.split('\n');
      let currentTitle = '';

      for (const line of lines) {
        const titleMatch = line.match(/^#{1,3}\s+(.+)$/);
        if (titleMatch) {
          currentTitle = titleMatch[1].trim();
          continue;
        }

        const urlMatch = line.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch && currentTitle) {
          results.push({
            title: currentTitle,
            url: urlMatch[1],
            snippet: line.replace(urlMatch[1], '').trim() || `关于 ${query} 的搜索结果`,
            score: results.length / 10,
            source: 'jina_ai'
          });
          currentTitle = '';
        }
      }

      if (results.length === 0) {
        results.push({
          title: `${query} - 搜索结果`,
          url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
          snippet: text.substring(0, 500),
          score: 0.5,
          source: 'jina_ai'
        });
      }

      return {
        success: true,
        results: results.slice(0, 10),
        source: 'jina_ai'
      };
    } catch (error) {
      console.error('[SearchRouter] Jina search error:', error.message);
      throw error;
    }
  }

  /**
   * DuckDuckGo 搜索
   */
  async searchDuckDuckGo(query) {
    try {
      const cheerio = require('cheerio');
      const response = await axios.get(
        'https://html.duckduckgo.com/html/',
        {
          params: { q: query, b: 10 },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 10000
        }
      );

      const results = [];
      const $ = cheerio.load(response.data);
      const resultLinks = $('a.result__a');
      const resultSnippets = $('a.result__snippet');

      resultLinks.each((i, element) => {
        if (i >= 10) return;

        const $el = $(element);
        const url = $el.attr('href');
        const title = $el.text();
        const snippetEl = resultSnippets.eq(i);
        const snippet = snippetEl.length ? snippetEl.text() : '';

        results.push({
          title,
          url,
          snippet,
          score: (10 - i) / 10,
          source: 'duckduckgo'
        });
      });

      return {
        success: true,
        results,
        source: 'duckduckgo'
      };
    } catch (error) {
      console.error('[SearchRouter] DuckDuckGo search error:', error.message);
      throw error;
    }
  }

  /**
   * 结果聚合与去重
   * @param {Object[]} results - 搜索结果数组
   * @returns {Object[]} 聚合后的结果
   */
  aggregateResults(results) {
    const seen = new Set();
    const aggregated = [];

    for (const { result } of results) {
      if (!result.success) continue;

      const items = result.results || [];

      for (const item of items) {
        const key = this.getDedupeKey(item);
        if (!seen.has(key)) {
          seen.add(key);
          aggregated.push({
            ...item,
            source: item.source || result.source || 'unknown'
          });
        }
      }
    }

    // 按相关度排序
    return aggregated.sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  /**
   * 获取去重 key
   */
  getDedupeKey(item) {
    return item.url || item.link || item.id || JSON.stringify(item);
  }

  /**
   * 记录 provider 失败
   */
  recordFailure(provider) {
    const count = this.failedProviders.get(provider) || 0;
    this.failedProviders.set(provider, count + 1);

    // 冷却时间后重置
    setTimeout(() => {
      this.failedProviders.delete(provider);
    }, this.coolDownTime);
  }

  /**
   * 检查 provider 是否失败
   */
  isProviderFailed(provider) {
    return (this.failedProviders.get(provider) || 0) >= 3;
  }

  /**
   * 检查 provider 是否存在
   */
  providerExists(provider) {
    return Object.keys(SEARCH_PROVIDERS).includes(provider) &&
           SEARCH_PROVIDERS[provider].enabled;
  }

  /**
   * 从缓存获取结果
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTime) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  /**
   * 设置缓存
   */
  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * 获取路由统计信息
   */
  getStats() {
    return {
      providers: SEARCH_PROVIDERS,
      failedProviders: Object.fromEntries(this.failedProviders),
      cacheSize: this.cache.size
    };
  }
}

// 导出单例
const searchRouter = new SearchRouter();

module.exports = { SearchRouter, searchRouter };
