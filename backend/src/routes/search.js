/**
 * 搜索服务路由
 * Thin wrapper around search module - 精简版
 */

const express = require('express');
const router = express.Router();
const { searchWeb, formatResultsAsMarkdown, SEARCH_CONFIG, getSearchProviders, getEnabledProviders } = require('../search');
const { AgentLogger } = require('../infra/logger/AgentLogger');

const logger = new AgentLogger('search');

// GET / - 搜索服务状态
router.get('/', (req, res) => {
  res.json({
    success: true,
    service: 'search',
    status: 'ok',
    timestamp: new Date().toISOString(),
    availableProviders: getEnabledProviders().map(p => p.id),
    defaultProvider: 'jina'
  });
});

// POST /web - Web搜索接口
router.post('/web', async (req, res) => {
  const { query, limit = 10, source = 'jina', format = 'json' } = req.body;

  if (!query) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_QUERY', message: 'Missing query' } });
  }

  // 验证 source 参数
  const validSources = Object.keys(SEARCH_CONFIG).filter(key => SEARCH_CONFIG[key].enabled);
  const searchSource = validSources.includes(source) ? source : 'jina';

  // 检查 API Key
  if (SEARCH_CONFIG[searchSource]?.requiresKey) {
    const apiKey = process.env[SEARCH_CONFIG[searchSource].keyEnv];
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: { code: 'API_KEY_REQUIRED', message: `${SEARCH_CONFIG[searchSource].name} requires API Key` }
      });
    }
  }

  try {
    const results = await searchWeb(query, limit, searchSource);
    if (format === 'markdown') {
      return res.json({ success: results.success, markdown: formatResultsAsMarkdown(results), raw: results });
    }
    res.json(results);
  } catch (error) {
    logger.error('Search API error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: { code: 'SEARCH_FAILED', message: error.message } });
  }
});

// GET /config - 获取搜索配置
router.get('/config', (req, res) => {
  const providers = getSearchProviders();
  const enabled = getEnabledProviders();
  res.json({
    success: true,
    config: {
      sources: providers,
      enabled: enabled.map(p => p.id),
      defaultSource: 'jina',
      freeSources: providers.filter(p => !p.requiresKey).map(p => p.id),
      paidSources: providers.filter(p => p.requiresKey).map(p => p.id)
    }
  });
});

// GET /providers - 获取搜索源详情
router.get('/providers', (req, res) => {
  res.json({ success: true, providers: getSearchProviders() });
});

// POST /test - 测试搜索源
router.post('/test', async (req, res) => {
  const { source = 'jina', query = 'test' } = req.body;
  if (!SEARCH_CONFIG[source]) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_SOURCE', message: `Invalid source: ${source}` } });
  }
  try {
    const results = await searchWeb(query, 3, source);
    res.json({ success: true, source, results: results.results?.length || 0, tested: true });
  } catch (error) {
    res.json({ success: false, source, error: error.message, tested: true });
  }
});

// GET /health - 健康检查
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'search',
    timestamp: new Date().toISOString(),
    providers: getEnabledProviders().map(p => p.name),
    defaultProvider: 'jina'
  });
});

module.exports = router;
