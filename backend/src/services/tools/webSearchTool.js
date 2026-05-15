/**
 * Web搜索工具
 * 使用MiniMax MCP Web Search API
 */

const { getMCPSearchService } = require('../mcpSearchService');
const AppError = require('../../common/errors/AppError');
const createLogger = require('../../common/logger');
const logger = createLogger('WebSearchTool');

class WebSearchTool {
  constructor(options = {}) {
    this.name = 'web_search';
    this.description = '搜索网络信息';
    this.category = 'internet';
    this.apiKey = options.apiKey || process.env.MINIMAX_API_KEY;
    this.baseUrl = options.baseUrl || process.env.MINIMAX_API_HOST || 'https://api.minimaxi.com';
    this.maxResults = options.maxResults || 5;
    this.timeout = options.timeout || 30000;
    this.mcpService = null;
  }

  /**
   * 获取 MCP 服务实例
   */
  async _getMCPService() {
    if (!this.mcpService) {
      this.mcpService = getMCPSearchService({
        apiKey: this.apiKey,
        apiHost: this.baseUrl
      });
      await this.mcpService.initialize();
    }
    return this.mcpService;
  }

  /**
   * 参数模式
   */
  get parameters() {
    return {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索查询词'
        },
        options: {
          type: 'object',
          properties: {
            maxResults: { type: 'number', description: '最大结果数' },
            language: { type: 'string', description: '语言代码 (zh, en等)' },
            timeRange: { type: 'string', 'enum': ['day', 'week', 'month', 'year', 'all'] }
          }
        }
      },
      required: ['query']
    };
  }

  /**
   * 执行搜索
   */
  async execute(params) {
    const { query, options = {} } = params;

    if (!this.apiKey) {
      return {
        success: false,
        error: '未配置API密钥'
      };
    }

    try {
      // 优先使用 MCP 服务
      const mcpService = await this._getMCPService();
      const results = await mcpService.search(query, {
        maxResults: options.maxResults || this.maxResults,
        language: options.language,
        timeRange: options.timeRange
      });

      if (!results.success) {
        return results;
      }

      return {
        success: true,
        query,
        results: results.results.slice(0, options.maxResults || this.maxResults),
        totalResults: results.totalResults
      };
    } catch (error) {
      logger.error(`搜索失败: ${error.message}`);

      // 如果 MCP 服务失败，尝试使用备用搜索
      try {
        const fallbackResults = await this._fallbackSearch(query, options);
        return fallbackResults;
      } catch (fallbackError) {
        return {
          success: false,
          error: error.message,
          query
        };
      }
    }
  }

  /**
   * 备用搜索实现（使用 Jina AI Reader API）
   */
  async _fallbackSearch(query, options) {
    try {
      // 使用 Jina AI 的 Reader API 进行搜索
      const searchUrl = `https://r.jina.ai/search?q=${encodeURIComponent(query)}`;
      const response = await fetch(searchUrl, {
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw AppError.internalError(`搜索请求失败: ${response.status}`);
      }

      const text = await response.text();
      // 解析 Jina AI 返回的搜索结果
      const results = this._parseJinaResults(text);

      return {
        success: true,
        query,
        results: results.slice(0, options.maxResults || this.maxResults),
        totalResults: results.length,
        source: 'jina_ai'
      };
    } catch (error) {
      // 如果也失败，返回简单结果
      return {
        success: true,
        query,
        results: [
          {
            title: `${query} - 搜索结果`,
            url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
            snippet: `关于${query}的搜索结果。请访问Google获取更多信息。`,
            timestamp: Date.now()
          }
        ],
        totalResults: 1,
        source: 'google_redirect'
      };
    }
  }

  /**
   * 解析 Jina AI 搜索结果
   */
  _parseJinaResults(text) {
    try {
      // Jina AI 返回的是 Markdown 格式的搜索结果
      const lines = text.split('\n');
      const results = [];
      let currentResult = null;

      for (const line of lines) {
        // 匹配标题行
        const titleMatch = line.match(/^##\s+(.+)$/);
        if (titleMatch) {
          if (currentResult) {
            results.push(currentResult);
          }
          currentResult = {
            title: titleMatch[1].trim(),
            url: '',
            snippet: '',
            timestamp: Date.now()
          };
          continue;
        }

        // 匹配 URL 行
        const urlMatch = line.match(/^-\s+(https?:\/\/[^\s]+)$/);
        if (urlMatch && currentResult) {
          currentResult.url = urlMatch[1];
          continue;
        }

        // 匹配内容行
        const contentMatch = line.match(/^-\s+(.+)$/);
        if (contentMatch && currentResult && !currentResult.snippet) {
          currentResult.snippet = contentMatch[1].trim();
        }
      }

      if (currentResult) {
        results.push(currentResult);
      }

      return results;
    } catch (error) {
      logger.error(`解析失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 格式化搜索结果为文本
   */
  formatResults(results) {
    if (!results || results.length === 0) {
      return '未找到相关结果';
    }

    return results.map((result, index) => {
      return `${index + 1}. ${result.title}\n   ${result.snippet || ''}\n   ${result.url || ''}`;
    }).join('\n\n');
  }
}

module.exports = WebSearchTool;
