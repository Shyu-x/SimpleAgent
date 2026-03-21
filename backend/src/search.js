/**
 * 搜索服务模块
 * 提供 Web 搜索能力
 * 支持多种搜索源
 */

const axios = require('axios');
const cheerio = require('cheerio');

// ===========================================
// 搜索配置 - 支持的搜索源
// ===========================================
const SEARCH_CONFIG = {
  // DuckDuckGo (免费，无需API Key)
  duckduckgo: {
    baseUrl: 'https://html.duckduckgo.com/html/',
    enabled: true,
    requiresKey: false,
    name: 'DuckDuckGo',
    description: '免费搜索，无需API Key',
    rateLimit: '无限制'
  },

  // Jina AI (免费，无需API Key)
  jina: {
    baseUrl: 'https://r.jina.ai',
    enabled: true,
    requiresKey: false,
    name: 'Jina AI',
    description: '免费搜索，AI优化摘要',
    rateLimit: '无限制'
  },

  // Tavily (免费，需API Key)
  tavily: {
    baseUrl: 'https://api.tavily.com',
    enabled: true,
    requiresKey: true,
    name: 'Tavily',
    description: 'AI优化的搜索引擎',
    rateLimit: '1000次/月(免费版)',
    keyEnv: 'TAVILY_API_KEY'
  },

  // Perplexity (付费，需API Key)
  perplexity: {
    baseUrl: 'https://api.perplexity.ai',
    enabled: true,
    requiresKey: true,
    name: 'Perplexity',
    description: 'AI搜索助手，引用来源',
    rateLimit: '需付费订阅',
    keyEnv: 'PERPLEXITY_API_KEY'
  },

  // Brave Search (免费，需API Key)
  brave: {
    baseUrl: 'https://api.search.brave.com/res/v1/web/search',
    enabled: true,
    requiresKey: true,
    name: 'Brave Search',
    description: '隐私优先的搜索引擎',
    rateLimit: '2000次/月(免费版)',
    keyEnv: 'BRAVE_API_KEY'
  },

  // SerpAPI (付费，需API Key)
  serpapi: {
    baseUrl: 'https://serpapi.com/search',
    enabled: false,
    requiresKey: true,
    name: 'SerpAPI',
    description: 'Google搜索API',
    rateLimit: '需付费',
    keyEnv: 'SERPAPI_KEY'
  },

  // MiniMax MCP (需API Key)
  minimax: {
    baseUrl: 'https://api.minimaxi.com',
    enabled: true,
    requiresKey: true,
    name: 'MiniMax',
    description: 'MiniMax MCP 搜索',
    rateLimit: '取决于订阅',
    keyEnv: 'MINIMAX_API_KEY'
  },

  // Google Custom Search (需API Key)
  google: {
    baseUrl: 'https://www.googleapis.com/customsearch/v1',
    enabled: false,
    requiresKey: true,
    name: 'Google Search',
    description: 'Google官方搜索API',
    rateLimit: '100次/天(免费版)',
    keyEnv: 'GOOGLE_API_KEY'
  }
};

/**
 * 获取所有支持的搜索源
 */
function getSearchProviders() {
  return Object.entries(SEARCH_CONFIG).map(([key, config]) => ({
    id: key,
    name: config.name,
    description: config.description,
    enabled: config.enabled,
    requiresKey: config.requiresKey,
    rateLimit: config.rateLimit
  }));
}

/**
 * 获取启用的搜索源列表
 */
function getEnabledProviders() {
  return getSearchProviders().filter(p => p.enabled);
}

/**
 * 搜索结果格式化
 */
function formatSearchResults(results, query) {
  return results.map((result, index) => ({
    id: `result_${index}`,
    title: result.title || '无标题',
    url: result.url || result.link,
    snippet: result.snippet || result.description || result.body || '',
    source: 'web'
  }));
}

/**
 * DuckDuckGo 搜索
 */
async function searchDuckDuckGo(query, limit = 10) {
  try {
    const response = await axios.get(SEARCH_CONFIG.duckduckgo.baseUrl, {
      params: { q: query, b: limit },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    // 解析 HTML 结果
    const results = [];
    const $ = cheerio.load(response.data);

    const resultLinks = $('a.result__a');
    const resultSnippets = $('a.result__snippet');

    resultLinks.each((i, element) => {
      if (i >= limit) return;

      const $el = $(element);
      const url = $el.attr('href');
      const title = $el.text();

      // 获取对应的 snippet
      const snippetEl = resultSnippets.eq(i);
      const snippet = snippetEl.length ? snippetEl.text() : '';

      results.push({
        title: title,
        url: url,
        snippet: snippet
      });
    });

    return {
      success: true,
      query,
      count: results.length,
      results: results.slice(0, limit)
    };
  } catch (error) {
    console.error('[Search] DuckDuckGo search error:', error.message);
    return {
      success: false,
      error: error.message,
      query,
      results: []
    };
  }
}

/**
 * 通用搜索接口
 */
async function searchWeb(query, limit = 10, source = 'duckduckgo') {
  console.log(`[Search] Searching for: "${query}" (source: ${source})`);

  switch (source) {
    case 'duckduckgo':
      return searchDuckDuckGo(query, limit);

    case 'minimax':
      // 使用 MiniMax MCP 搜索
      return searchMiniMaxMCP(query, limit);

    case 'jina':
      // 使用 Jina AI 搜索
      return searchJinaAI(query, limit);

    default:
      // 默认使用 DuckDuckGo
      return searchDuckDuckGo(query, limit);
  }
}

/**
 * MiniMax MCP 搜索 (使用 Coding Plan)
 */
async function searchMiniMaxMCP(query, limit = 10) {
  try {
    // 尝试导入 MCP 搜索服务
    let mcpService;
    try {
      const { getMCPSearchService } = require('./services/mcpSearchService');
      mcpService = getMCPSearchService({
        apiKey: process.env.MINIMAX_API_KEY,
        apiHost: process.env.MINIMAX_API_HOST || 'https://api.minimaxi.com'
      });
      await mcpService.initialize();

      const result = await mcpService.search(query, { maxResults: limit });

      if (result.success) {
        return {
          success: true,
          query,
          count: result.results.length,
          results: result.results.map(r => ({
            title: r.title || '无标题',
            url: r.url || '',
            snippet: r.snippet || '',
            source: 'minimax_mcp'
          })),
          source: 'minimax_mcp'
        };
      }
    } catch (mcpError) {
      console.log('[Search] MiniMax MCP 不可用，尝试备用方案:', mcpError.message);
    }

    // 如果 MCP 不可用，尝试直接调用 MiniMax API
    if (process.env.MINIMAX_API_KEY) {
      return searchMiniMaxAPI(query, limit);
    }

    // 回退到 Jina AI
    return searchJinaAI(query, limit);
  } catch (error) {
    console.error('[Search] MiniMax MCP search error:', error.message);
    return {
      success: false,
      error: error.message,
      query,
      results: []
    };
  }
}

/**
 * MiniMax API 直接搜索 (备用方案)
 */
async function searchMiniMaxAPI(query, limit = 10) {
  try {
    // 使用 MiniMax 的对话 API 进行搜索
    const response = await axios.post(
      'https://api.minimax.chat/v1/text/chatcompletion_pro',
      {
        model: 'abab6.5s-chat',
        messages: [
          {
            role: 'system',
            content: '你是一个搜索助手。用户会给出搜索关键词，请提供相关的搜索结果摘要。'
          },
          {
            role: 'user',
            content: `请搜索以下内容并提供相关信息：${query}`
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
      query,
      count: 1,
      results: [
        {
          title: `${query} - MiniMax AI 搜索结果`,
          url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
          snippet: content,
          source: 'minimax_api'
        }
      ],
      source: 'minimax_api'
    };
  } catch (error) {
    console.error('[Search] MiniMax API search error:', error.message);
    return {
      success: false,
      error: error.message,
      query,
      results: []
    };
  }
}

/**
 * Jina AI 搜索 (免费备选)
 */
async function searchJinaAI(query, limit = 10) {
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

    // Jina AI 返回的是文本格式，需要解析
    const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

    // 简单解析 - 提取标题和链接
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
          source: 'jina_ai'
        });
        currentTitle = '';
      }
    }

    // 如果解析失败，返回原始结果
    if (results.length === 0) {
      results.push({
        title: `${query} - 搜索结果`,
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        snippet: text.substring(0, 500),
        source: 'jina_ai'
      });
    }

    return {
      success: true,
      query,
      count: results.length,
      results: results.slice(0, limit),
      source: 'jina_ai'
    };
  } catch (error) {
    console.error('[Search] Jina AI search error:', error.message);

    // 最终回退到 DuckDuckGo
    return searchDuckDuckGo(query, limit);
  }
}

/**
 * 格式化搜索结果为 Markdown
 */
function formatResultsAsMarkdown(searchResults) {
  if (!searchResults.success || !searchResults.results.length) {
    return `搜索"${searchResults.query}"未找到相关结果。`;
  }

  let markdown = `🔍 **搜索结果: "${searchResults.query}"**\n\n`;

  searchResults.results.forEach((result, index) => {
    markdown += `**${index + 1}. ${result.title}**\n`;
    markdown += `${result.snippet}\n`;
    markdown += `[查看详情](${result.url})\n\n`;
  });

  markdown += `---\n`;
  markdown += `*共找到 ${searchResults.count} 条结果*`;

  return markdown;
}

module.exports = {
  searchWeb,
  searchDuckDuckGo,
  formatResultsAsMarkdown,
  SEARCH_CONFIG,
  getSearchProviders,
  getEnabledProviders
};