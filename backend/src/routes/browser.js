const express = require('express');
const router = express.Router();
const { browserAgent } = require('../browser');

/**
 * 初始化浏览器
 * POST /api/browser/init
 */
router.post('/init', async (req, res) => {
  const { browserType = 'chromium' } = req.body;

  try {
    const result = await browserAgent.init(browserType);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建会话
 * POST /api/browser/session
 */
router.post('/session', async (req, res) => {
  const { sessionId } = req.body;
  const id = sessionId || `session_${Date.now()}`;

  try {
    const result = await browserAgent.createSession(id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 导航到 URL
 * POST /api/browser/navigate
 */
router.post('/navigate', async (req, res) => {
  const { sessionId, url } = req.body;

  if (!sessionId || !url) {
    return res.status(400).json({ success: false, error: 'Missing sessionId or url' });
  }

  try {
    const result = await browserAgent.navigate(sessionId, url);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 点击元素
 * POST /api/browser/click
 */
router.post('/click', async (req, res) => {
  const { sessionId, selector } = req.body;

  if (!sessionId || !selector) {
    return res.status(400).json({ success: false, error: 'Missing sessionId or selector' });
  }

  try {
    const result = await browserAgent.click(sessionId, selector);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 输入文本
 * POST /api/browser/type
 */
router.post('/type', async (req, res) => {
  const { sessionId, selector, text } = req.body;

  if (!sessionId || !selector || text === undefined) {
    return res.status(400).json({ success: false, error: 'Missing required parameters' });
  }

  try {
    const result = await browserAgent.type(sessionId, selector, text);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取页面内容
 * POST /api/browser/content
 */
router.post('/content', async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'Missing sessionId' });
  }

  try {
    const result = await browserAgent.getContent(sessionId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 提取文本
 * POST /api/browser/extract
 */
router.post('/extract', async (req, res) => {
  const { sessionId, selector, attribute, limit = 10 } = req.body;

  if (!sessionId || !selector) {
    return res.status(400).json({ success: false, error: 'Missing sessionId or selector' });
  }

  try {
    const result = await browserAgent.extractText(sessionId, selector, { attribute, limit });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 截图
 * POST /api/browser/screenshot
 */
router.post('/screenshot', async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'Missing sessionId' });
  }

  try {
    const screenshot = await browserAgent.takeScreenshot(sessionId);
    res.json({ success: !!screenshot, screenshot });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 执行 JavaScript
 * POST /api/browser/evaluate
 */
router.post('/evaluate', async (req, res) => {
  const { sessionId, script } = req.body;

  if (!sessionId || !script) {
    return res.status(400).json({ success: false, error: 'Missing sessionId or script' });
  }

  try {
    const result = await browserAgent.evaluate(sessionId, script);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 等待元素或时间
 * POST /api/browser/wait
 */
router.post('/wait', async (req, res) => {
  const { sessionId, selector, milliseconds, timeout = 10000 } = req.body;

  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'Missing sessionId' });
  }

  try {
    // 支持时间等待
    if (milliseconds) {
      await new Promise(resolve => setTimeout(resolve, milliseconds));
      return res.json({ success: true, message: `Waited ${milliseconds}ms` });
    }

    // 支持元素等待
    if (selector) {
      const result = await browserAgent.waitFor(sessionId, selector, timeout);
      return res.json(result);
    }

    return res.status(400).json({ success: false, error: 'Missing selector or milliseconds' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 滚动
 * POST /api/browser/scroll
 */
router.post('/scroll', async (req, res) => {
  const { sessionId, direction = 'down', amount = 500 } = req.body;

  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'Missing sessionId' });
  }

  try {
    const result = await browserAgent.scroll(sessionId, direction, amount);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取元素信息
 * POST /api/browser/element
 */
router.post('/element', async (req, res) => {
  const { sessionId, selector } = req.body;

  if (!sessionId || !selector) {
    return res.status(400).json({ success: false, error: 'Missing sessionId or selector' });
  }

  try {
    const result = await browserAgent.getElementInfo(sessionId, selector);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 关闭会话
 * POST /api/browser/close
 */
router.post('/close', async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'Missing sessionId' });
  }

  try {
    const result = await browserAgent.closeSession(sessionId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取状态
 * GET /api/browser/status
 */
router.get('/status', (_req, res) => {
  const status = browserAgent.getStatus();
  res.json({ success: true, ...status });
});

module.exports = router;