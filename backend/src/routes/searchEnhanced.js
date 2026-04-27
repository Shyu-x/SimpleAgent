/**
 * 增强搜索路由
 * 提供并行搜索、内容抓取等高级功能
 */
const express = require('express');
const router = express.Router();
const { searchRouter } = require('../services/searchRouter');

const ok = (res, data) => res.json({ success: true, ...data });
const err = (res, status, code, message) => {
  console.error(`[SearchEnhanced] ${message}`);
  res.status(status).json({ success: false, error: { code, message } });
};

router.post('/enhanced', async (req, res) => {
  const { query, sources = ['web'] } = req.body;
  if (!query) return err(res, 400, 'INVALID_QUERY', 'Missing query parameter');

  try {
    const { results, errors } = await searchRouter.parallelSearch(query, sources);
    const aggregated = searchRouter.aggregateResults(results);
    ok(res, { results: aggregated, total: aggregated.length, query, errors: errors.length ? errors : undefined, stats: { providers: results.map(r => r.provider), totalSources: sources.length, successfulSources: results.length, failedSources: errors.length } });
  } catch (error) {
    err(res, 500, 'SEARCH_FAILED', error.message);
  }
});

router.post('/fetch', async (req, res) => {
  const { url, query } = req.body;
  if (!url) return err(res, 400, 'INVALID_URL', 'Missing url parameter');

  try {
    const response = await fetch(`https://r.jina.ai/${encodeURIComponent(url)}`, {
      headers: { 'Accept': 'application/json', 'X-Return-Format': 'markdown' }
    });
    if (!response.ok) throw new Error('Fetch failed');
    const data = await response.json();
    ok(res, { url, content: data.content || data.data?.[0]?.content, title: data.title || data.data?.[0]?.title, query });
  } catch (error) {
    err(res, 500, 'FETCH_FAILED', error.message);
  }
});

router.get('/enhanced/stats', (req, res) => ok(res, { stats: searchRouter.getStats() }));

router.post('/enhanced/test', async (req, res) => {
  const { provider, query = 'test' } = req.body;
  if (!provider || !searchRouter.providerExists(provider)) return err(res, 400, 'INVALID_PROVIDER', 'Invalid or unknown provider');

  const startTime = Date.now();
  try {
    const result = await searchRouter.searchWithProvider(query, provider);
    ok(res, { provider, query, duration: Date.now() - startTime, resultCount: result.results?.length || 0, tested: true, success: true });
  } catch (error) {
    ok(res, { provider, query, error: error.message, tested: true, success: false });
  }
});

module.exports = router;
