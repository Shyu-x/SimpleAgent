const express = require('express');
const router = express.Router();
const { searchWeb, formatResultsAsMarkdown, SEARCH_CONFIG, getSearchProviders, getEnabledProviders } = require('../search');

/**
 * @swagger
 * tags:
 *   - name: search
 *     description: 搜索服务
 */

/**
 * @swagger
 * /api/search:
 *   get:
 *     tags: [search]
 *     summary: 获取搜索服务状态
 *     responses:
 *       200:
 *         description: 搜索服务状态信息
 */
router.get('/', (req, res) => {
  const providers = getEnabledProviders();

  res.json({
    success: true,
    service: 'search',
    status: 'ok',
    timestamp: new Date().toISOString(),
    endpoints: {
      web: 'POST /api/search/web',
      config: 'GET /api/search/config',
      providers: 'GET /api/search/providers',
      test: 'POST /api/search/test',
      health: 'GET /api/search/health',
      enhanced: {
        search: 'POST /api/search/enhanced',
        fetch: 'POST /api/search/fetch',
        stats: 'GET /api/search/enhanced/stats',
        test: 'POST /api/search/enhanced/test'
      }
    },
    availableProviders: providers.map(p => p.id),
    defaultProvider: 'jina'
  });
});

/**
 * @swagger
 * /api/search/web:
 *   post:
 *     tags: [search]
 *     summary: Web搜索接口
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: 搜索关键词
 *               limit:
 *                 type: number
 *                 default: 10
 *                 description: 返回结果数量
 *               source:
 *                 type: string
 *                 enum: [duckduckgo, jina, tavily, perplexity, brave, minimax]
 *                 default: jina
 *                 description: 搜索源
 *               format:
 *                 type: string
 *                 enum: [json, markdown]
 *                 default: json
 *                 description: 返回格式
 *     responses:
 *       200:
 *         description: 搜索结果
 *       400:
 *         description: 参数错误
 */
router.post('/web', async (req, res) => {
  const { query, limit = 10, source = 'jina', format = 'json' } = req.body;

  if (!query) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_QUERY', message: 'Missing query parameter' }
    });
  }

  // 验证 source 参数
  const validSources = Object.keys(SEARCH_CONFIG).filter(key => SEARCH_CONFIG[key].enabled);
  const searchSource = validSources.includes(source) ? source : 'jina';

  // 检查是否需要 API Key
  if (SEARCH_CONFIG[searchSource].requiresKey) {
    const apiKey = process.env[SEARCH_CONFIG[searchSource].keyEnv];
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'API_KEY_REQUIRED',
          message: `${SEARCH_CONFIG[searchSource].name} requires API Key`,
          envVar: SEARCH_CONFIG[searchSource].keyEnv
        }
      });
    }
  }

  try {
    const results = await searchWeb(query, limit, searchSource);

    if (format === 'markdown') {
      return res.json({
        success: results.success,
        markdown: formatResultsAsMarkdown(results),
        raw: results
      });
    }

    res.json(results);
  } catch (error) {
    console.error('[Search API] Error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SEARCH_FAILED', message: error.message }
    });
  }
});

/**
 * 获取搜索配置
 * GET /api/search/config
 *
 * 返回:
 * {
 *   success: true,
 *   config: {
 *     sources: [...],      // 所有支持的搜索源
 *     enabled: [...],      // 启用的搜索源
 *     defaultSource: string
 *   }
 * }
 */
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

/**
 * 获取搜索源详情
 * GET /api/search/providers
 */
router.get('/providers', (req, res) => {
  res.json({
    success: true,
    providers: getSearchProviders()
  });
});

/**
 * 测试搜索源
 * POST /api/search/test
 */
router.post('/test', async (req, res) => {
  const { source = 'jina', query = 'test' } = req.body;

  const validSources = Object.keys(SEARCH_CONFIG);
  if (!validSources.includes(source)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_SOURCE', message: `Invalid source: ${source}` }
    });
  }

  try {
    const results = await searchWeb(query, 3, source);
    res.json({
      success: true,
      source,
      results: results.results?.length || 0,
      tested: true
    });
  } catch (error) {
    res.json({
      success: false,
      source,
      error: error.message,
      tested: true
    });
  }
});

/**
 * 健康检查
 * GET /api/search/health
 */
router.get('/health', (req, res) => {
  const providers = getEnabledProviders();

  res.json({
    status: 'ok',
    service: 'search',
    timestamp: new Date().toISOString(),
    providers: providers.map(p => p.name),
    defaultProvider: 'jina'
  });
});

module.exports = router;
