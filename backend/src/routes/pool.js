/**
 * 模型池路由 - 仅负责参数校验和响应组装
 */
const express = require('express');
const router = express.Router();
const { ChatOrchestrator } = require('../application/ChatOrchestrator');
const oc = ChatOrchestrator.getInstance();

router.get('/status', (_req, res) => res.json({ success: true, ...oc.getPoolStatus() }));
router.get('/stats', (_req, res) => res.json({ success: true, stats: oc.getPoolStats() }));

router.post('/select', (req, res) => {
  const { capabilities, complexity, preferredProvider } = req.body;
  const modelId = oc.selectPoolModel({ capabilities, complexity, preferredProvider });
  if (!modelId) return res.status(503).json({ error: { message: 'No available models', type: 'no_available_models' } });
  res.json({ success: true, modelId, modelInfo: oc.modelPool.getModelInfo(modelId) });
});

router.post('/request/start', (req, res) => {
  const { modelId } = req.body;
  if (!modelId || !oc.modelPool.models.has(modelId)) return res.status(404).json({ error: { message: 'Model not found', type: 'not_found' } });
  oc.markPoolRequest(modelId);
  res.json({ success: true, modelId });
});

router.post('/request/success', (req, res) => {
  const { modelId, latency } = req.body;
  if (!modelId || !oc.modelPool.models.has(modelId)) return res.status(404).json({ error: { message: 'Model not found', type: 'not_found' } });
  oc.markPoolSuccess(modelId, latency);
  res.json({ success: true, modelId });
});

router.post('/request/failure', (req, res) => {
  const { modelId, errorType } = req.body;
  if (!modelId || !oc.modelPool.models.has(modelId)) return res.status(404).json({ error: { message: 'Model not found', type: 'not_found' } });
  oc.markPoolFailure(modelId, errorType);
  res.json({ success: true, modelId });
});

router.get('/fallback/:modelId', (req, res) => {
  const fb = oc.getPoolFallback(req.params.modelId);
  if (!fb) return res.status(503).json({ error: { message: 'No fallback model', type: 'no_fallback' } });
  res.json({ success: true, modelId: fb, modelInfo: oc.modelPool.getModelInfo(fb) });
});

router.post('/models/:modelId/enable', (req, res) => {
  const { modelId } = req.params;
  if (!oc.modelPool.models.has(modelId)) return res.status(404).json({ error: { message: 'Model not found', type: 'not_found' } });
  oc.enablePoolModel(modelId);
  res.json({ success: true, modelId, enabled: true });
});

router.post('/models/:modelId/disable', (req, res) => {
  const { modelId } = req.params;
  if (!oc.modelPool.models.has(modelId)) return res.status(404).json({ error: { message: 'Model not found', type: 'not_found' } });
  oc.disablePoolModel(modelId);
  res.json({ success: true, modelId, enabled: false });
});

router.post('/models', (req, res) => {
  const { id, provider, name, capabilities, maxTokens, costPer1kTokens, avgLatency, priority } = req.body;
  if (!id || !provider) return res.status(400).json({ error: { message: 'Missing required fields', type: 'validation_error' } });
  oc.registerPoolModel(id, { provider, name, capabilities, maxTokens, costPer1kTokens, avgLatency, priority });
  res.json({ success: true, modelId: id });
});

router.delete('/models/:modelId', (req, res) => {
  const { modelId } = req.params;
  if (!oc.modelPool.models.has(modelId)) return res.status(404).json({ error: { message: 'Model not found', type: 'not_found' } });
  oc.removePoolModel(modelId);
  res.json({ success: true, modelId });
});

router.post('/models/:modelId/reset', (req, res) => {
  const { modelId } = req.params;
  if (!oc.modelPool.models.has(modelId)) return res.status(404).json({ error: { message: 'Model not found', type: 'not_found' } });
  oc.resetPoolStats(modelId);
  res.json({ success: true, modelId });
});

router.post('/health-check', (_req, res) => {
  const results = {};
  for (const [id] of oc.modelPool.models) results[id] = 'healthy';
  res.json({ success: true, results, timestamp: new Date().toISOString() });
});

router.post('/reset', (req, res) => {
  const { modelId } = req.body;
  if (modelId) {
    if (!oc.modelPool.models.has(modelId)) return res.status(404).json({ error: { message: 'Model not found', type: 'not_found' } });
    oc.resetPoolStats(modelId);
    res.json({ success: true, message: `Reset model ${modelId}` });
  } else {
    oc.resetAllPoolStats();
    res.json({ success: true, message: 'Reset all models' });
  }
});

router.get('/export', (_req, res) => res.json({ success: true, config: oc.exportPoolConfig() }));

module.exports = router;
