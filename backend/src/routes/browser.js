/**
 * Browser 路由
 * 轻量级 HTTP 包装器，委托给 browserService
 */

const express = require('express');
const router = express.Router();
const browserService = require('../services/browserService');
const { AppError } = require('../common/errors');
const { sendError } = require('../middleware/errorHandler');

router.post('/init', async (req, res) => {
  try {
    const result = await browserService.initBrowser(req.body.browserType || 'chromium');
    res.json(result);
  } catch (error) {
    sendError(res, 500, 6000, error.message);
  }
});

router.post('/session', async (req, res) => {
  try {
    const result = await browserService.createSession(req.body.sessionId);
    res.json(result);
  } catch (error) {
    sendError(res, 500, 6000, error.message);
  }
});

router.post('/navigate', async (req, res) => {
  try {
    res.json(await browserService.navigate(req.body.sessionId, req.body.url));
  } catch (error) {
    sendError(res, 400, 1001, error.message);
  }
});

router.post('/click', async (req, res) => {
  try {
    res.json(await browserService.click(req.body.sessionId, req.body.selector));
  } catch (error) {
    sendError(res, 400, 5003, error.message);
  }
});

router.post('/type', async (req, res) => {
  try {
    res.json(await browserService.type(req.body.sessionId, req.body.selector, req.body.text));
  } catch (error) {
    sendError(res, 400, 5003, error.message);
  }
});

router.post('/content', async (req, res) => {
  try {
    res.json(await browserService.getContent(req.body.sessionId));
  } catch (error) {
    sendError(res, 400, 5003, error.message);
  }
});

router.post('/extract', async (req, res) => {
  try {
    res.json(await browserService.extractText(req.body.sessionId, req.body.selector, req.body));
  } catch (error) {
    sendError(res, 400, 5003, error.message);
  }
});

router.post('/screenshot', async (req, res) => {
  try {
    res.json(await browserService.takeScreenshot(req.body.sessionId));
  } catch (error) {
    sendError(res, 500, 6000, error.message);
  }
});

router.post('/evaluate', async (req, res) => {
  try {
    res.json(await browserService.evaluate(req.body.sessionId, req.body.script));
  } catch (error) {
    sendError(res, 400, 5003, error.message);
  }
});

router.post('/wait', async (req, res) => {
  try {
    res.json(await browserService.waitFor(req.body.sessionId, req.body.selector, req.body.timeout));
  } catch (error) {
    sendError(res, 500, 5004, error.message);
  }
});

router.post('/scroll', async (req, res) => {
  try {
    res.json(await browserService.scroll(req.body.sessionId, req.body.direction, req.body.amount));
  } catch (error) {
    sendError(res, 500, 6000, error.message);
  }
});

router.post('/element', async (req, res) => {
  try {
    res.json(await browserService.getElementInfo(req.body.sessionId, req.body.selector));
  } catch (error) {
    sendError(res, 400, 5003, error.message);
  }
});

router.post('/close', async (req, res) => {
  try {
    res.json(await browserService.closeSession(req.body.sessionId));
  } catch (error) {
    sendError(res, 400, 5003, error.message);
  }
});

router.get('/status', (_req, res) => {
  res.json({ success: true, ...browserService.getStatus() });
});

module.exports = router;