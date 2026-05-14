/**
 * Qdrant 向量数据库管理 API
 * Thin HTTP wrapper - 委托 QdrantService 处理所有业务逻辑
 */
const express = require('express');
const router = express.Router();
const qdrantService = require('../services/QdrantService');
const { apiKeyMiddleware, configurableRateLimitMiddleware } = require('../middleware/security');

router.use(apiKeyMiddleware);
router.use(configurableRateLimitMiddleware);

// 状态与集合管理
router.get('/status', async (req, res) => {
  try { res.json(await qdrantService.getStatus()); }
  catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/collections', async (req, res) => {
  try {
    const list = await qdrantService.listCollections();
    res.json({ success: list.success, collections: list.collections || [] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/collections/:collection', async (req, res) => {
  try {
    const info = await qdrantService.getCollectionInfo(req.params.collection);
    if (!info.success) return res.status(404).json({ success: false, error: 'Collection not found' });
    res.json({ success: true, collection: req.params.collection, info: info.info });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/collections/:collection', async (req, res) => {
  try {
    const result = await qdrantService.dropCollection(req.params.collection);
    res.json({ success: result.success, collection: req.params.collection, message: 'Collection deleted' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// 集合配置 (HNSW + 量化)
router.put('/collections/:collection', async (req, res) => {
  try {
    const { vectorSize, distance, ...rest } = req.body;
    const result = await qdrantService.createCollection({
      collection: req.params.collection,
      dimension: vectorSize,
      distance,
      ...rest
    });
    if (!result.success) return res.status(500).json({ success: false, error: result.error });
    res.json(result);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/collections/:collection/params', async (req, res) => {
  try {
    const params = await qdrantService.getCollectionParams(req.params.collection);
    if (!params.success) return res.status(404).json({ success: false, error: 'Collection not found' });
    res.json({ success: true, collection: req.params.collection, hnswConfig: params.hnswConfig, quantizationConfig: params.quantizationConfig, collectionInfo: params.collectionInfo });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/collections/:collection/params', async (req, res) => {
  try {
    const { m, ef_construction, full_scan_threshold, on_disk } = req.body;
    const result = await qdrantService.updateHNSWParams(req.params.collection, { m, ef_construction, full_scan_threshold, on_disk });
    if (!result.success) return res.status(500).json({ success: false, error: result.error });
    res.json({ success: true, collection: req.params.collection, hnswConfig: result.hnswConfig, message: 'HNSW 参数更新成功' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/collections/:collection/quantization', async (req, res) => {
  try {
    const params = await qdrantService.getCollectionParams(req.params.collection);
    if (!params.success) return res.status(404).json({ success: false, error: 'Collection not found' });
    res.json({ success: true, collection: req.params.collection, quantization: params.quantizationConfig });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/collections/:collection/quantization', async (req, res) => {
  try {
    const { quantile, compression, enabled } = req.body;
    const result = await qdrantService.updateQuantizationParams(req.params.collection, { quantile, compression, enabled });
    if (!result.success) return res.status(500).json({ success: false, error: result.error });
    res.json({ success: true, collection: req.params.collection, quantization: result.quantization, message: '量化参数更新成功' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/collections/:collection/optimize', async (req, res) => {
  try {
    const result = await qdrantService.getOptimizeSuggestions(req.params.collection);
    if (!result.success) return res.status(404).json({ success: false, error: 'Collection not found' });
    res.json({ success: true, collection: req.params.collection, pointCount: result.pointCount, suggestions: result.suggestions });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// 文档向量操作
router.post('/documents', async (req, res) => {
  try {
    const { collection, document, metadata, chunkSize = 512, chunkOverlap = 50 } = req.body;
    if (!document) return res.status(400).json({ success: false, error: 'document is required' });
    const result = await qdrantService.insertDocument(collection, document, { chunkSize, chunkOverlap, metadata: metadata || {} });
    res.json({ success: result.success, chunks: result.chunks, insertedCount: result.insertedCount, stats: result.stats });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/documents/batch', async (req, res) => {
  try {
    const { collection, documents, metadata } = req.body;
    if (!documents || !Array.isArray(documents)) return res.status(400).json({ success: false, error: 'documents array is required' });
    res.json(await qdrantService.batchInsertDocuments(documents, { collection, metadata }));
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/search', async (req, res) => {
  try {
    const { collection, query, topK = 10, filter } = req.body;
    if (!query) return res.status(400).json({ success: false, error: 'query is required' });
    const result = await qdrantService.search(collection, query, { topK, filter });
    res.json({ success: result.success, query, topK, results: result.results || [] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/documents', async (req, res) => {
  try {
    const { collection, ids } = req.body;
    if (!ids || !Array.isArray(ids)) return res.status(400).json({ success: false, error: 'ids array is required' });
    const result = await qdrantService.deleteDocuments(collection, ids);
    res.json({ success: result.success, deletedCount: result.deletedCount });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/stats/:collection', async (req, res) => {
  try {
    const stats = await qdrantService.getStats(req.params.collection);
    res.json({ success: stats.success, collection: req.params.collection, ...stats });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

module.exports = router;