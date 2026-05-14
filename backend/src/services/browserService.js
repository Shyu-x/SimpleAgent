/**
 * Browser 服务
 * 浏览器自动化管理
 */

const { browserAgent } = require('../browser');

async function initBrowser(browserType = 'chromium') {
  return await browserAgent.init(browserType);
}

async function createSession(sessionId) {
  const id = sessionId || `session_${Date.now()}`;
  return await browserAgent.createSession(id);
}

async function navigate(sessionId, url) {
  if (!sessionId || !url) throw new Error('Missing sessionId or url');
  return await browserAgent.navigate(sessionId, url);
}

async function click(sessionId, selector) {
  if (!sessionId || !selector) throw new Error('Missing sessionId or selector');
  return await browserAgent.click(sessionId, selector);
}

async function type(sessionId, selector, text) {
  if (!sessionId || !selector || text === undefined) throw new Error('Missing required parameters');
  return await browserAgent.type(sessionId, selector, text);
}

async function getContent(sessionId) {
  if (!sessionId) throw new Error('Missing sessionId');
  return await browserAgent.getContent(sessionId);
}

async function extractText(sessionId, selector, options = {}) {
  if (!sessionId || !selector) throw new Error('Missing sessionId or selector');
  return await browserAgent.extractText(sessionId, selector, options);
}

async function takeScreenshot(sessionId) {
  if (!sessionId) throw new Error('Missing sessionId');
  const screenshot = await browserAgent.takeScreenshot(sessionId);
  return { success: !!screenshot, screenshot };
}

async function evaluate(sessionId, script) {
  if (!sessionId || !script) throw new Error('Missing sessionId or script');
  return await browserAgent.evaluate(sessionId, script);
}

async function waitFor(sessionId, selector, timeout = 10000) {
  if (!sessionId) throw new Error('Missing sessionId');
  if (!selector && !timeout) throw new Error('Missing selector or milliseconds');
  return await browserAgent.waitFor(sessionId, selector || '', timeout);
}

async function scroll(sessionId, direction = 'down', amount = 500) {
  if (!sessionId) throw new Error('Missing sessionId');
  return await browserAgent.scroll(sessionId, direction, amount);
}

async function getElementInfo(sessionId, selector) {
  if (!sessionId || !selector) throw new Error('Missing sessionId or selector');
  return await browserAgent.getElementInfo(sessionId, selector);
}

async function closeSession(sessionId) {
  if (!sessionId) throw new Error('Missing sessionId');
  return await browserAgent.closeSession(sessionId);
}

function getStatus() {
  return browserAgent.getStatus();
}

module.exports = {
  initBrowser,
  createSession,
  navigate,
  click,
  type,
  getContent,
  extractText,
  takeScreenshot,
  evaluate,
  waitFor,
  scroll,
  getElementInfo,
  closeSession,
  getStatus
};