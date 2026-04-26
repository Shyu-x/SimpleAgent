/**
 * 百科查询工具
 * 使用 Wikipedia API 获取词条信息
 */

import { Logger } from '@nestjs/common';
import { ToolDefinition, ToolExecutionResult } from './tool-registry.service';
import { executeWithTimeout, executeWithRetry, cleanSearchQuery } from './base.tool';

const logger = new Logger('EncyclopediaTool');

// Wikipedia API 端点
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const WIKIPEDIA_CN_API = 'https://zh.wikipedia.org/w/api.php';

interface WikiPage {
  title: string;
  extract: string;
  pageId: number;
  url: string;
  timestamp?: string;
}

/**
 * 创建百科查询工具定义
 */
export function createEncyclopediaTool(): ToolDefinition {
  return {
    name: 'encyclopedia',
    description: 'Look up encyclopedic information from Wikipedia. Best for facts, definitions, historical events, scientific topics, and biographical information.',
    category: 'information',
    keywords: ['百科', 'wikipedia', ' encyclopedia', '定义', '意思', '是什么', 'who is', 'what is'],
    examples: [
      '什么是人工智能',
      'Wikipedia: Albert Einstein',
      '查询 Python 编程语言'
    ],
    parameters: {
      properties: {
        query: {
          type: 'string',
          description: 'The topic to look up'
        },
        language: {
          type: 'string',
          description: 'Language code: en (English) or zh (Chinese), default: auto-detect',
          default: 'auto'
        },
        sentences: {
          type: 'number',
          description: 'Maximum number of sentences in the extract (default: 3)',
          default: 3
        }
      },
      required: ['query']
    },
    execute: async (params: {
      query: string;
      language?: string;
      sentences?: number;
    }): Promise<ToolExecutionResult> => {
      const startTime = Date.now();
      const query = cleanSearchQuery(params.query || '');

      if (!query) {
        return {
          success: false,
          tool: 'encyclopedia',
          error: 'Query is required',
          errorType: 'validation',
          executionTime: 0
        };
      }

      try {
        // 自动检测语言
        let lang = params.language || 'auto';
        if (lang === 'auto') {
          lang = detectLanguage(query);
        }

        const maxSentences = params.sentences || 3;

        const page = await executeWithTimeout(
          () => executeWithRetry(() => fetchWikipediaPage(query, lang, maxSentences), 2, 500),
          10000,
          'encyclopedia'
        );

        if (!page) {
          return {
            success: false,
            tool: 'encyclopedia',
            error: `No Wikipedia article found for: ${query}`,
            errorType: 'not_found',
            executionTime: Date.now() - startTime
          };
        }

        return {
          success: true,
          tool: 'encyclopedia',
          result: {
            query,
            page: {
              title: page.title,
              extract: page.extract,
              pageId: page.pageId,
              url: page.url,
              source: lang === 'zh' ? 'Wikipedia (中文)' : 'Wikipedia (English)'
            }
          },
          executionTime: Date.now() - startTime
        };
      } catch (error) {
        logger.error(`Encyclopedia lookup failed: ${error.message}`);
        return {
          success: false,
          tool: 'encyclopedia',
          error: error.message,
          errorType: 'lookup_failed',
          executionTime: Date.now() - startTime
        };
      }
    }
  };
}

/**
 * 检测查询语言
 */
function detectLanguage(query: string): string {
  // 检测是否包含中文字符
  const chineseRegex = /[\u4e00-\u9fff]/;
  if (chineseRegex.test(query)) {
    return 'zh';
  }
  return 'en';
}

/**
 * 获取 Wikipedia 页面
 */
async function fetchWikipediaPage(
  query: string,
  language: string,
  maxSentences: number
): Promise<WikiPage | null> {
  const apiUrl = language === 'zh' ? WIKIPEDIA_CN_API : WIKIPEDIA_API;

  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'extracts|info',
    exintro: 'true',
    explaintext: 'true',
    exsentences: maxSentences.toString(),
    titles: query,
    inprop: 'url',
    origin: '*'
  });

  const response = await fetch(`${apiUrl}?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'AI-Chat-Toy/1.0 (https://github.com/example/ai-chat-toy)'
    }
  });

  if (!response.ok) {
    throw new Error(`Wikipedia API error: HTTP ${response.status}`);
  }

  const data = await response.json();
  const pages = data.query?.pages;

  if (!pages) {
    return null;
  }

  const pageId = Object.keys(pages)[0];

  // pageId === '-1' 表示页面不存在
  if (pageId === '-1') {
    return null;
  }

  const page = pages[pageId];
  const langCode = language === 'zh' ? 'zh' : 'en';

  return {
    title: page.title,
    extract: page.extract || '',
    pageId: page.pageid,
    url: `https://${langCode}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    timestamp: page.touched
  };
}
