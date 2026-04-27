/**
 * 路由层 - 委托业务逻辑给 ChatOrchestrator
 */
const express = require('express');
const router = express.Router();
const { ChatOrchestrator } = require('../application/ChatOrchestrator');
const poolRouter = require('./pool');

const oc = ChatOrchestrator.getInstance();
router.use('/pool', poolRouter);

// 意图分类
router.post('/intent', (req, res) => {
  try {
    const c = oc.classifyIntent(req.body);
    res.json({ success: true, ...c });
  } catch (error) {
    res.status(500).json({ error: { message: error.message, type: 'intent_classification_error' } });
  }
});

router.get('/intents', (_req, res) => res.json({ success: true, intents: [] }));

// 查询改写
router.post('/rewrite', async (req, res) => {
  try {
    const result = await oc.rewriteQuery(req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: { message: error.message, type: 'query_rewrite_error' } });
  }
});

// 检索
router.post('/search', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: { message: 'Missing query', type: 'validation_error' } });
  try {
    const result = await oc.search(req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: { message: error.message, type: 'search_error' } });
  }
});

router.get('/search/config', (_req, res) => res.json({ success: true, config: oc.getSearchStats() }));

// 聊天
router.post('/chat', async (req, res) => {
  const { messages, model, stream = true, temperature, max_tokens, options } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, error: { type: 'validation_error', message: 'messages must be a non-empty array', code: 'VAL_MISSING' } });
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg.role || !['user', 'assistant', 'system'].includes(msg.role)) {
      return res.status(400).json({ success: false, error: { type: 'validation_error', message: `Invalid role at index ${i}`, code: 'VAL_TYPE' } });
    }
    if (!msg.content || typeof msg.content !== 'string') {
      return res.status(400).json({ success: false, error: { type: 'validation_error', message: `Invalid content at index ${i}`, code: 'VAL_INVALID' } });
    }
  }

  try {
    const result = await oc.executeChat({ messages, model, stream, temperature, max_tokens, options });

    if (!result.success) {
      let errorType = 'routing_error';
      const msg = result.error || '';
      if (msg.includes('API') || msg.includes('MiniMax')) errorType = 'api_error';
      else if (msg.includes('timeout')) errorType = 'timeout_error';
      else if (msg.includes('auth') || msg.includes('key')) errorType = 'authentication_error';

      return res.status(500).json({ success: false, error: { message: result.error, type: errorType, requestId: result.requestId } });
    }

    if (stream && result.result instanceof ReadableStream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no', 'X-Model-Used': result.model, 'X-Request-Id': result.requestId });
      const reader = result.result.getReader(), decoder = new TextDecoder();
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(decoder.decode(value, { stream: true }));
          }
          res.end();
        } catch (e) { if (!res.writableEnded) res.end(); }
      })();
    } else {
      res.json({ ...result.result, _routing: { model: result.model, requestId: result.requestId, taskClassification: result.classification, fallback: result.fallback || false } });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message, type: 'routing_error' } });
  }
});

// 模型管理
router.get('/models', (_req, res) => res.json({ models: oc.getModels(), defaultStrategy: oc.modelRouter.strategy }));
router.get('/stats', (_req, res) => res.json(oc.getStats()));

router.post('/config', (req, res) => {
  const { strategy, costSensitivity, performanceSensitivity, maxRetries } = req.body;
  res.json({ success: true, config: oc.configure({ strategy, costSensitivity, performanceSensitivity, maxRetries }) });
});

router.post('/models/:modelId/toggle', (req, res) => {
  const { modelId } = req.params;
  if (!oc.modelRouter.models.has(modelId)) return res.status(404).json({ error: { message: `Model not found: ${modelId}`, type: 'not_found' } });
  oc.toggleModel(modelId, req.body.enabled);
  res.json({ success: true, modelId, enabled: req.body.enabled });
});

router.post('/models', (req, res) => {
  const { id, provider, capabilities, maxTokens, costPer1kTokens, avgLatency, complexityLimit } = req.body;
  if (!id || !provider || !capabilities) return res.status(400).json({ error: { message: 'Missing required fields', type: 'validation_error' } });
  oc.registerModel(id, { provider, capabilities, maxTokens, costPer1kTokens, avgLatency, complexityLimit });
  res.json({ success: true, modelId: id });
});

router.post('/predict', (req, res) => res.json(oc.predictModel(req.body.messages, req.body.options)));

module.exports = router;