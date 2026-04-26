/**
 * Qdrant 向量数据库管理 API
 *
 * 提供向量集合的 CRUD 操作接口
 * 支持 HNSW 索引配置和 PQ 量化参数管理
 *
 * @swagger
 * tags:
 *   - name: qdrant
 *     description: Qdrant向量数据库接口
 */

const express = require('express');
const router = express.Router();
const { getQdrantRouter } = require('../services/vector');
const { apiKeyMiddleware, roleMiddleware, configurableRateLimitMiddleware } = require('../middleware/security');

// 应用安全中间件
router.use(apiKeyMiddleware);
router.use(configurableRateLimitMiddleware);

/**
 * 获取 Qdrant 路由状态
 */
router.get('/status', async (req, res) => {
  try {
    const router = getQdrantRouter();
    const health = await router.healthCheck();
    res.json({
      success: health.success,
      healthy: health.success,
      status: health.vectorStore,
      embeddingModel: router.embeddingModel,
      collection: router.vectorStore.collectionName,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建或更新集合 (支持生产级 HNSW + 量化参数)
 */
router.put('/collections/:collection', async (req, res) => {
  try {
    const { collection } = req.params;
    const {
      dimension = 1024,
      distance = 'Cosine',
      hnswM = 32,
      hnswEfConstruction = 128,
      hnswFullScanThreshold = 10000,
      hnswOnDisk = false,
      quantizationEnabled = true,
      quantile = 0.99,
      compression = 'compression16',
    } = req.body;

    const router = getQdrantRouter({
      collection,
      dimension,
      distance,
      hnswM,
      hnswEfConstruction,
      hnswFullScanThreshold,
      hnswOnDisk,
      quantizationEnabled,
      quantile,
      compression,
    });

    const result = await router.vectorStore.connect();
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    // 使用生产级参数创建集合
    const createResult = await router.vectorStore.createCollectionWithProductionParams();
    res.json({
      success: createResult.success,
      collection,
      dimension,
      distance,
      hnsw: {
        m: hnswM,
        efConstruction: hnswEfConstruction,
        fullScanThreshold: hnswFullScanThreshold,
        onDisk: hnswOnDisk,
      },
      quantization: {
        enabled: quantizationEnabled,
        quantile,
        compression,
      },
      message: createResult.exists ? 'Collection already exists' : 'Collection created with production params',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取集合 HNSW 参数
 */
router.get('/collections/:collection/params', async (req, res) => {
  try {
    const { collection } = req.params;
    const router = getQdrantRouter({ collection });
    const store = router.vectorStore;
    store.collectionName = collection;

    const params = await store.getCollectionParams();
    if (!params.success) {
      return res.status(404).json({ success: false, error: 'Collection not found' });
    }

    res.json({
      success: true,
      collection,
      hnswConfig: params.hnswConfig,
      quantizationConfig: params.quantizationConfig,
      collectionInfo: params.collectionInfo,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 更新集合 HNSW 参数
 */
router.put('/collections/:collection/params', async (req, res) => {
  try {
    const { collection } = req.params;
    const { m, ef_construction, full_scan_threshold, on_disk } = req.body;

    const router = getQdrantRouter({ collection });
    const store = router.vectorStore;
    store.collectionName = collection;

    const result = await store.updateHNSWParams({
      m,
      ef_construction,
      full_scan_threshold,
      on_disk,
    });

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      collection,
      hnswConfig: result.hnswConfig,
      message: 'HNSW 参数更新成功',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取集合量化配置
 */
router.get('/collections/:collection/quantization', async (req, res) => {
  try {
    const { collection } = req.params;
    const router = getQdrantRouter({ collection });
    const store = router.vectorStore;
    store.collectionName = collection;

    const params = await store.getCollectionParams();
    if (!params.success) {
      return res.status(404).json({ success: false, error: 'Collection not found' });
    }

    res.json({
      success: true,
      collection,
      quantization: params.quantizationConfig,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 更新集合量化配置
 */
router.put('/collections/:collection/quantization', async (req, res) => {
  try {
    const { collection } = req.params;
    const { quantile, compression, enabled } = req.body;

    const router = getQdrantRouter({ collection });
    const store = router.vectorStore;
    store.collectionName = collection;

    const result = await store.updateQuantizationParams({
      quantile,
      compression,
      enabled,
    });

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      collection,
      quantization: result.quantization,
      message: '量化参数更新成功',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取集合优化建议
 */
router.get('/collections/:collection/optimize', async (req, res) => {
  try {
    const { collection } = req.params;
    const router = getQdrantRouter({ collection });
    const store = router.vectorStore;
    store.collectionName = collection;

    const suggestions = await store.getOptimizeSuggestions();
    if (!suggestions.success) {
      return res.status(404).json({ success: false, error: 'Collection not found' });
    }

    res.json({
      success: true,
      collection,
      pointCount: suggestions.pointCount,
      suggestions: suggestions.suggestions,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取集合信息
 */
router.get('/collections/:collection', async (req, res) => {
  try {
    const { collection } = req.params;
    const router = getQdrantRouter({ collection });
    const router2 = router.vectorStore;
    router2.collectionName = collection;

    const info = await router2.getCollectionInfo();
    if (!info.success) {
      return res.status(404).json({ success: false, error: 'Collection not found' });
    }

    res.json({
      success: true,
      collection,
      info: info.info,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 列出所有集合
 */
router.get('/collections', async (req, res) => {
  try {
    const router = getQdrantRouter();
    const list = await router.vectorStore.listCollections();
    res.json({
      success: list.success,
      collections: list.collections || [],
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除集合
 */
router.delete('/collections/:collection', async (req, res) => {
  try {
    const { collection } = req.params;
    const router = getQdrantRouter({ collection });
    const store = router.vectorStore;
    store.collectionName = collection;

    const result = await store.dropCollection();
    res.json({
      success: result.success,
      collection,
      message: 'Collection deleted',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 插入文档向量
 */
router.post('/documents', async (req, res) => {
  try {
    const { collection, document, metadata, chunkSize = 512, chunkOverlap = 50 } = req.body;

    if (!document) {
      return res.status(400).json({
        success: false,
        error: 'document is required',
      });
    }

    const router = getQdrantRouter({ collection });
    const result = await router.embedDocument(document, {
      chunkSize,
      overlap: chunkOverlap,
      metadata: metadata || {},
    });

    res.json({
      success: result.success,
      chunks: result.chunks,
      insertedCount: result.insertedCount,
      stats: result.stats,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 批量插入文档向量
 */
router.post('/documents/batch', async (req, res) => {
  try {
    const { collection, documents, metadata } = req.body;

    if (!documents || !Array.isArray(documents)) {
      return res.status(400).json({
        success: false,
        error: 'documents array is required',
      });
    }

    const router = getQdrantRouter({ collection });
    const results = [];
    let totalInserted = 0;

    for (const doc of documents) {
      const text = typeof doc === 'string' ? doc : doc.text;
      const meta = typeof doc === 'object' ? doc.metadata : {};

      const result = await router.embedDocument(text, {
        metadata: { ...metadata, ...meta },
      });

      results.push(result);
      if (result.success) {
        totalInserted += result.insertedCount || 0;
      }
    }

    res.json({
      success: true,
      totalInserted,
      documentCount: documents.length,
      results,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 搜索相似文档
 */
router.post('/search', async (req, res) => {
  try {
    const { collection, query, topK = 10, filter } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'query is required',
      });
    }

    const router = getQdrantRouter({ collection });
    const result = await router.search(query, { topK, filter });

    res.json({
      success: result.success,
      query,
      topK,
      results: result.results || [],
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除文档向量
 */
router.delete('/documents', async (req, res) => {
  try {
    const { collection, ids } = req.body;

    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({
        success: false,
        error: 'ids array is required',
      });
    }

    const router = getQdrantRouter({ collection });
    const result = await router.deleteDocuments(ids);

    res.json({
      success: result.success,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取集合统计
 */
router.get('/stats/:collection', async (req, res) => {
  try {
    const { collection } = req.params;
    const router = getQdrantRouter({ collection });
    const store = router.vectorStore;
    store.collectionName = collection;

    const stats = await store.getStats();
    res.json({
      success: stats.success,
      collection,
      ...stats,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
