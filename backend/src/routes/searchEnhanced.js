/**
 * 增强搜索路由
 * 提供并行搜索、内容抓取等高级功能
 */

const express = require('express');
const router = express.Router();
const { searchRouter } = require('../services/searchRouter');

/**
 * 增强搜索 API
 * POST /api/search/enhanced
 *
 * 请求体:
 * {
 *   query: string,      // 搜索关键词
 *   source?: string,    // 来源类型: web/docs/academic
 *   sources?: string[], // 要搜索的来源列表
 *   prefer?: string[],  // 偏好 provider
 * }
 */
router.post('/enhanced', async (req, res) => {
  const { query, source = 'web', sources = ['web'], prefer = [] } = req.body;

  if (!query) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_QUERY', message: 'Missing query parameter' }
    });
  }

  try {
    // 执行并行搜索
    const { results, errors } = await searchRouter.parallelSearch(query, sources);

    // 聚合结果
    const aggregated = searchRouter.aggregateResults(results);

    res.json({
      success: true,
      results: aggregated,
      total: aggregated.length,
      query,
      errors: errors.length > 0 ? errors : undefined,
      stats: {
        providers: results.map(r => r.provider),
        totalSources: sources.length,
        successfulSources: results.length,
        failedSources: errors.length
      }
    });
  } catch (error) {
    console.error('[SearchEnhanced] Enhanced search error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SEARCH_FAILED', message: error.message }
    });
  }
});

/**
 * 内容抓取 API
 * POST /api/search/fetch
 *
 * 请求体:
 * {
 *   url: string,  // 要抓取的 URL
 *   query?: string // 原始查询（用于上下文）
 * }
 */
router.post('/fetch', async (req, res) => {
  const { url, query } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_URL', message: 'Missing url parameter' }
    });
  }

  try {
    // 使用 Jina Reader API 抓取内容
    const jinaReaderUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;

    const response = await fetch(jinaReaderUrl, {
      headers: {
        'Accept': 'application/json',
        'X-Return-Format': 'markdown'
      }
    });

    if (!response.ok) {
      throw new Error('Fetch failed');
    }

    const data = await response.json();

    res.json({
      success: true,
      url,
      content: data.content || data.data?.[0]?.content,
      title: data.title || data.data?.[0]?.title,
      query
    });
  } catch (error) {
    console.error('[SearchEnhanced] Content fetch error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_FAILED', message: error.message }
    });
  }
});

/**
 * 搜索路由器统计
 * GET /api/search/enhanced/stats
 */
router.get('/enhanced/stats', (req, res) => {
  res.json({
    success: true,
    stats: searchRouter.getStats()
  });
});

/**
 * 测试搜索源
 * POST /api/search/enhanced/test
 *
 * 请求体:
 * {
 *   provider: string,  // provider 名称
 *   query?: string     // 测试查询
 * }
 */
router.post('/enhanced/test', async (req, res) => {
  const { provider, query = 'test' } = req.body;

  if (!provider || !searchRouter.providerExists(provider)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_PROVIDER', message: 'Invalid or unknown provider' }
    });
  }

  try {
    const startTime = Date.now();
    const result = await searchRouter.searchWithProvider(query, provider);
    const duration = Date.now() - startTime;

    res.json({
      success: result.success,
      provider,
      query,
      duration,
      resultCount: result.results?.length || 0,
      tested: true
    });
  } catch (error) {
    res.json({
      success: false,
      provider,
      query,
      error: error.message,
      tested: true
    });
  }
});

module.exports = router;
