/**
 * 缓存管理 API
 * 提供缓存统计、手动失效、批量操作接口
 *
 * @date 2026-05-15
 *
 * @swagger
 * tags:
 *   - name: cache
 *     description: 缓存管理接口
 */

const express = require('express');
const router = express.Router();
const { AgentLogger } = require('../../infra/logger/AgentLogger');
const {
  cacheManager,
  modelConfigCache,
  toolRegistryCache,
  ragResultCache,
  promptTemplateCache
} = require('../../services/cacheService');

const logger = new AgentLogger('admin-cache');

// 缓存名称映射
const CACHE_MAP = {
  'default': cacheManager.default,
  'model-config': modelConfigCache,
  'modelConfig': modelConfigCache,
  'tool-registry': toolRegistryCache,
  toolRegistry: toolRegistryCache,
  'rag-result': ragResultCache,
  ragResult: ragResultCache,
  'prompt-template': promptTemplateCache,
  promptTemplate: promptTemplateCache
};

/**
 * 解析缓存名称
 */
function resolveCache(name) {
  if (!name) return null;
  return CACHE_MAP[name] || CACHE_MAP[name.toLowerCase()] || null;
}

/**
 * GET /api/admin/cache/stats
 * 获取所有缓存的统计信息
 */
router.get('/stats', (req, res) => {
  try {
    const stats = cacheManager.getAllStats();

    // 计算总计
    const total = {
      keys: 0,
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      currentSize: 0,
      maxSize: 0
    };

    for (const cache of Object.values(CACHE_MAP)) {
      if (cache && cache.getStats) {
        const s = cache.getStats();
        total.keys += s.keys;
        total.hits += s.hits;
        total.misses += s.misses;
        total.sets += s.sets;
        total.deletes += s.deletes;
        total.errors += s.errors;
        total.currentSize += s.currentSize;
        total.maxSize += s.maxSize;
      }
    }

    // 计算总体命中率
    total.hitRate = total.hits + total.misses > 0
      ? parseFloat((total.hits / (total.hits + total.misses)).toFixed(4))
      : 0;

    res.json({
      success: true,
      data: {
        caches: stats,
        total,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Get cache stats error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/cache/health
 * 获取所有缓存的健康状态
 */
router.get('/health', (req, res) => {
  try {
    const health = cacheManager.getAllHealth();
    const allHealthy = Object.values(health).every(h => h.healthy);

    res.json({
      success: true,
      data: {
        overall: allHealthy ? 'healthy' : 'degraded',
        caches: health,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Get cache health error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/cache/:name/stats
 * 获取指定缓存的统计信息
 */
router.get('/:name/stats', (req, res) => {
  try {
    const { name } = req.params;
    const cache = resolveCache(name);

    if (!cache) {
      return res.status(404).json({
        success: false,
        error: `Cache '${name}' not found. Available: ${Object.keys(CACHE_MAP).join(', ')}`
      });
    }

    res.json({
      success: true,
      data: {
        name,
        stats: cache.getStats(),
        keyStats: cache.getKeyStats(),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Get cache stats error', { error: error.message, name: req.params.name });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/admin/cache/:name
 * 清空指定缓存
 */
router.delete('/:name', (req, res) => {
  try {
    const { name } = req.params;

    if (name === 'all') {
      cacheManager.flushAll();
      return res.json({
        success: true,
        data: {
          action: 'flush_all',
          message: 'All caches flushed',
          timestamp: new Date().toISOString()
        }
      });
    }

    const cache = resolveCache(name);

    if (!cache) {
      return res.status(404).json({
        success: false,
        error: `Cache '${name}' not found`
      });
    }

    cache.flush();

    res.json({
      success: true,
      data: {
        name,
        action: 'flush',
        keysCleared: 0,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Flush cache error', { error: error.message, name: req.params.name });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/admin/cache/:name/:key
 * 删除指定缓存的指定键
 */
router.delete('/:name/:key', (req, res) => {
  try {
    const { name, key } = req.params;
    const cache = resolveCache(name);

    if (!cache) {
      return res.status(404).json({
        success: false,
        error: `Cache '${name}' not found`
      });
    }

    const deleted = cache.del(key);

    res.json({
      success: true,
      data: {
        name,
        key,
        deleted: deleted > 0,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Delete cache key error', { error: error.message, name: req.params.name, key: req.params.key });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/admin/cache/:name/pattern/:pattern
 * 按模式删除缓存键
 */
router.delete('/:name/pattern/:pattern', (req, res) => {
  try {
    const { name, pattern } = req.params;
    const cache = resolveCache(name);

    if (!cache) {
      return res.status(404).json({
        success: false,
        error: `Cache '${name}' not found`
      });
    }

    // 解码 URL 编码的模式
    const decodedPattern = decodeURIComponent(pattern);
    const deletedCount = cache.deletePattern(decodedPattern);

    res.json({
      success: true,
      data: {
        name,
        pattern: decodedPattern,
        deletedCount,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Delete pattern error', { error: error.message, name: req.params.name, pattern: req.params.pattern });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/cache/:name/reset-stats
 * 重置指定缓存的统计信息
 */
router.post('/:name/reset-stats', (req, res) => {
  try {
    const { name } = req.params;
    const cache = resolveCache(name);

    if (!cache) {
      return res.status(404).json({
        success: false,
        error: `Cache '${name}' not found`
      });
    }

    cache.resetHitRateStats();

    res.json({
      success: true,
      data: {
        name,
        action: 'reset_stats',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Reset stats error', { error: error.message, name: req.params.name });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/cache/:name/keys
 * 获取指定缓存的所有键
 */
router.get('/:name/keys', (req, res) => {
  try {
    const { name } = req.params;
    const { limit = 100, offset = 0 } = req.query;
    const cache = resolveCache(name);

    if (!cache) {
      return res.status(404).json({
        success: false,
        error: `Cache '${name}' not found`
      });
    }

    const allKeys = cache.keys();
    const totalKeys = allKeys.length;
    const paginatedKeys = allKeys.slice(Number(offset), Number(offset) + Number(limit));

    res.json({
      success: true,
      data: {
        name,
        keys: paginatedKeys,
        total: totalKeys,
        limit: Number(limit),
        offset: Number(offset),
        hasMore: Number(offset) + paginatedKeys.length < totalKeys,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Get keys error', { error: error.message, name: req.params.name });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/cache/:name/key/:key
 * 获取指定缓存键的详细信息
 */
router.get('/:name/key/:key', (req, res) => {
  try {
    const { name, key } = req.params;
    const cache = resolveCache(name);

    if (!cache) {
      return res.status(404).json({
        success: false,
        error: `Cache '${name}' not found`
      });
    }

    const info = cache.getItemInfo(key);

    if (!info) {
      return res.status(404).json({
        success: false,
        error: `Key '${key}' not found in cache '${name}'`
      });
    }

    res.json({
      success: true,
      data: {
        name,
        ...info,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Get key info error', { error: error.message, name: req.params.name, key: req.params.key });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/cache/invalidate/model-config
 * 使模型配置缓存失效（当模型配置更新时调用）
 */
router.post('/invalidate/model-config', (req, res) => {
  try {
    modelConfigCache.flush();
    logger.info('Model config cache invalidated');

    res.json({
      success: true,
      data: {
        action: 'invalidate',
        cache: 'model-config',
        message: 'Model config cache invalidated successfully',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Invalidate model config error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/cache/invalidate/tool-registry
 * 使工具注册表缓存失效
 */
router.post('/invalidate/tool-registry', (req, res) => {
  try {
    toolRegistryCache.flush();
    logger.info('Tool registry cache invalidated');

    res.json({
      success: true,
      data: {
        action: 'invalidate',
        cache: 'tool-registry',
        message: 'Tool registry cache invalidated successfully',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Invalidate tool registry error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/cache/invalidate/rag-result
 * 使 RAG 检索结果缓存失效
 */
router.post('/invalidate/rag-result', (req, res) => {
  try {
    const { pattern } = req.body;
    const deletedCount = pattern
      ? ragResultCache.deletePattern(pattern)
      : ragResultCache.flush();

    logger.info('RAG result cache invalidated', { pattern, deletedCount });

    res.json({
      success: true,
      data: {
        action: 'invalidate',
        cache: 'rag-result',
        pattern: pattern || 'all',
        deletedCount,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Invalidate RAG result error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/cache/invalidate/prompt-template
 * 使 Prompt 模板缓存失效
 */
router.post('/invalidate/prompt-template', (req, res) => {
  try {
    promptTemplateCache.flush();
    logger.info('Prompt template cache invalidated');

    res.json({
      success: true,
      data: {
        action: 'invalidate',
        cache: 'prompt-template',
        message: 'Prompt template cache invalidated successfully',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Invalidate prompt template error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/cache/invalidate/all
 * 使所有缓存失效
 */
router.post('/invalidate/all', (req, res) => {
  try {
    cacheManager.flushAll();
    logger.info('All caches invalidated');

    res.json({
      success: true,
      data: {
        action: 'invalidate_all',
        message: 'All caches invalidated successfully',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Invalidate all caches error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;