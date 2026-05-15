/**
 * 缓存中间件
 * 为管理后台 API 提供缓存支持
 *
 * @date 2026-05-15
 */

const {
  modelConfigCache,
  toolRegistryCache,
  ragResultCache,
  promptTemplateCache
} = require('../services/cacheService');

/**
 * 模型配置缓存中间件
 */
function modelConfigCacheMiddleware(req, res, next) {
  // 只缓存 GET 请求
  if (req.method !== 'GET') {
    return next();
  }

  const cacheKey = `model-config:${req.originalUrl}`;

  // 尝试从缓存获取
  const cached = modelConfigCache.get(cacheKey);
  if (cached) {
    return res.json({
      ...cached,
      _cached: true,
      _cacheTimestamp: modelConfigCache.getItemInfo(cacheKey)?.ttl
    });
  }

  // 拦截响应以缓存结果
  const originalJson = res.json.bind(res);
  res.json = function(data) {
    if (data && data.success !== false) {
      modelConfigCache.set(cacheKey, data, 3600); // 缓存1小时
    }
    return originalJson(data);
  };

  next();
}

/**
 * 工具注册表缓存中间件
 */
function toolRegistryCacheMiddleware(req, res, next) {
  if (req.method !== 'GET') {
    return next();
  }

  const cacheKey = `tool-registry:${req.originalUrl}`;

  const cached = toolRegistryCache.get(cacheKey);
  if (cached) {
    return res.json({
      ...cached,
      _cached: true
    });
  }

  const originalJson = res.json.bind(res);
  res.json = function(data) {
    if (data && data.success !== false) {
      toolRegistryCache.set(cacheKey, data, 3600);
    }
    return originalJson(data);
  };

  next();
}

/**
 * Prompt 模板缓存中间件
 */
function promptTemplateCacheMiddleware(req, res, next) {
  if (req.method !== 'GET') {
    return next();
  }

  const cacheKey = `prompt-template:${req.originalUrl}`;

  const cached = promptTemplateCache.get(cacheKey);
  if (cached) {
    return res.json({
      ...cached,
      _cached: true
    });
  }

  const originalJson = res.json.bind(res);
  res.json = function(data) {
    if (data && data.success !== false) {
      promptTemplateCache.set(cacheKey, data, 1800);
    }
    return originalJson(data);
  };

  next();
}

/**
 * RAG 检索结果缓存
 */
function ragResultCacheMiddleware(req, res, next) {
  // RAG 检索通常在 POST body 中
  if (req.method !== 'POST') {
    return next();
  }

  // 生成缓存键：基于查询内容的哈希
  const query = req.body?.query || '';
  const kbId = req.body?.kbId || '';
  const cacheKey = `rag-result:${kbId}:${hashCode(query)}`;

  const cached = ragResultCache.get(cacheKey);
  if (cached) {
    return res.json({
      ...cached,
      _cached: true
    });
  }

  const originalJson = res.json.bind(res);
  res.json = function(data) {
    if (data && data.success !== false && data.data?.results) {
      ragResultCache.set(cacheKey, data, 300); // 缓存5分钟
    }
    return originalJson(data);
  };

  next();
}

/**
 * 简单的字符串哈希函数
 */
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * 缓存命中统计中间件
 */
function cacheStatsMiddleware(req, res, next) {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    // 可以在这里添加统计逻辑
  });

  next();
}

module.exports = {
  modelConfigCacheMiddleware,
  toolRegistryCacheMiddleware,
  promptTemplateCacheMiddleware,
  ragResultCacheMiddleware,
  cacheStatsMiddleware
};