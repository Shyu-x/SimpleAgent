/**
 * 网络搜索工具
 * 使用 DuckDuckGo HTML 解析获取搜索结果
 */

import { Logger } from '@nestjs/common';
import { ToolDefinition, ToolExecutionResult } from './tool-registry.service';
import {
  executeWithTimeout,
  executeWithRetry,
  cleanSearchQuery
} from './base.tool';

const logger = new Logger('SearchTool');

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * 创建搜索工具定义
 */
export function createSearchTool(): ToolDefinition {
  return {
    name: 'web_search',
    description: 'Search the web for information. Use this when you need to find current events, facts, or specific information.',
    category: 'search',
    keywords: ['搜索', '查找', 'search', 'find', '查询', 'web'],
    examples: [
      '搜索 ChatGPT 最新消息',
      '查找 Python 教程',
      'search for weather news'
    ],
    parameters: {
      properties: {
        query: {
          type: 'string',
          description: 'The search query'
        },
        numResults: {
          type: 'number',
          description: 'Number of results to return (default: 5)',
          default: 5
        }
      },
      required: ['query']
    },
    execute: async (params: { query: string; numResults?: number }): Promise<ToolExecutionResult> => {
      const startTime = Date.now();
      const query = cleanSearchQuery(params.query || '');
      const numResults = params.numResults || 5;

      if (!query) {
        return {
          success: false,
          tool: 'web_search',
          error: 'Search query is required',
          errorType: 'validation',
          executionTime: 0
        };
      }

      try {
        const results = await executeWithTimeout(
          () => executeWithRetry(() => searchDuckDuckGo(query, numResults), 2, 1000),
          15000,
          'web_search'
        );

        return {
          success: true,
          tool: 'web_search',
          result: {
            query,
            results,
            total: results.length
          },
          executionTime: Date.now() - startTime
        };
      } catch (error) {
        logger.error(`Search failed: ${error.message}`);
        return {
          success: false,
          tool: 'web_search',
          error: error.message,
          errorType: 'search_failed',
          executionTime: Date.now() - startTime
        };
      }
    }
  };
}

/**
 * DuckDuckGo 搜索实现
 */
async function searchDuckDuckGo(query: string, numResults: number): Promise<SearchResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html'
      },
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    return parseDuckDuckGoResults(html, numResults);
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

/**
 * 解析 DuckDuckGo HTML 结果
 */
function parseDuckDuckGoResults(html: string, numResults: number): SearchResult[] {
  const results: SearchResult[] = [];
  const resultsRegex = /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

  let match;
  let count = 0;

  while ((match = resultsRegex.exec(html)) !== null && count < numResults) {
    const url = match[1];
    const title = match[2].replace(/<[^>]+>/g, '').trim();
    const snippet = match[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

    if (url && title && !url.includes('duckduckgo')) {
      results.push({
        title,
        url,
        snippet
      });
      count++;
    }
  }

  // 如果正则匹配失败，尝试备用解析
  if (results.length === 0) {
    return fallbackParseResults(html, numResults);
  }

  return results;
}

/**
 * 备用解析方法
 */
function fallbackParseResults(html: string, numResults: number): SearchResult[] {
  const results: SearchResult[] = [];
  const linkRegex = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/g;

  let match;
  let count = 0;

  while ((match = linkRegex.exec(html)) !== null && count < numResults) {
    const url = match[1];
    const title = match[2].replace(/<[^>]+>/g, '').trim();

    // 过滤掉无效链接
    if (url && title && !url.includes('duckduckgo.com') && title.length > 5) {
      results.push({
        title,
        url,
        snippet: ''
      });
      count++;
    }
  }

  return results;
}
