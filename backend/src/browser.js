/**
 * 浏览器自动化模块
 * 基于 Playwright 实现浏览器自动化
 * 参考 browser-use 设计理念
 */

const { chromium, firefox, webkit } = require('playwright');
const { createLogger } = require('./infra/logger/AgentLogger');

const logger = createLogger('browser');

// 浏览器会话管理
const sessions = new Map();

/**
 * 浏览器自动化管理器
 */
class BrowserAgent {
  constructor() {
    this.browser = null;
    this.defaultContext = null;
  }

  /**
   * 初始化浏览器
   */
  async init(browserType = 'chromium') {
    try {
      let browser;
      switch (browserType) {
        case 'firefox':
          browser = await firefox.launch({ headless: true });
          break;
        case 'webkit':
          browser = await webkit.launch({ headless: true });
          break;
        case 'chromium':
        default:
          browser = await chromium.launch({ headless: true });
      }
      this.browser = browser;
      this.defaultContext = await browser.newContext();
      logger.info('Initialized', { browserType });
      return { success: true, browserType };
    } catch (error) {
      logger.error('Init error', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * 创建新会话
   */
  async createSession(sessionId) {
    try {
      if (!this.browser) {
        await this.init();
      }

      const context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });

      const page = await context.newPage();

      const session = {
        id: sessionId,
        context,
        page,
        createdAt: Date.now(),
        history: []
      };

      sessions.set(sessionId, session);
      logger.info('Created session', { sessionId });

      return { success: true, sessionId };
    } catch (error) {
      logger.error('Create session error', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取会话
   */
  getSession(sessionId) {
    return sessions.get(sessionId);
  }

  /**
   * 导航到 URL
   */
  async navigate(sessionId, url) {
    const session = sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    try {
      await session.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      const title = await session.page.title();

      session.history.push({
        action: 'navigate',
        url,
        timestamp: Date.now()
      });

      return {
        success: true,
        url,
        title,
        screenshot: await this.takeScreenshot(sessionId)
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 点击元素
   */
  async click(sessionId, selector) {
    const session = sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    try {
      await session.page.click(selector, { timeout: 10000 });

      session.history.push({
        action: 'click',
        selector,
        timestamp: Date.now()
      });

      return {
        success: true,
        selector,
        screenshot: await this.takeScreenshot(sessionId)
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 输入文本
   */
  async type(sessionId, selector, text) {
    const session = sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    try {
      await session.page.fill(selector, text);

      session.history.push({
        action: 'type',
        selector,
        text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
        timestamp: Date.now()
      });

      return { success: true, selector };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取页面内容
   */
  async getContent(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    try {
      const content = await session.page.content();
      const title = await session.page.title();
      const url = session.page.url();

      return {
        success: true,
        title,
        url,
        content: content.substring(0, 50000) // 限制内容长度
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 提取文本内容
   */
  async extractText(sessionId, selector, options = {}) {
    const session = sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    try {
      const { attribute, limit = 10 } = options;

      if (attribute) {
        // 提取属性
        const elements = await session.page.$$(selector);
        const results = elements.slice(0, limit).map(async (el) => {
          return await el.evaluate((node, attr) => node.getAttribute(attr), attribute);
        });
        const data = await Promise.all(results);
        return { success: true, data };
      } else {
        // 提取文本
        const elements = await session.page.$$(selector);
        const results = elements.slice(0, limit).map(async (el) => {
          return await el.evaluate(node => node.textContent?.trim() || '');
        });
        const data = await Promise.all(results);
        return { success: true, data };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 截图
   */
  async takeScreenshot(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) {
      return null;
    }

    try {
      const screenshot = await session.page.screenshot({
        type: 'png',
        fullPage: false
      });
      return `data:image/png;base64,${screenshot.toString('base64')}`;
    } catch (error) {
      return null;
    }
  }

  /**
   * 执行 JavaScript
   */
  async evaluate(sessionId, script) {
    const session = sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    try {
      const result = await session.page.evaluate(script);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 等待元素
   */
  async waitFor(sessionId, selector, timeout = 10000) {
    const session = sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    try {
      await session.page.waitForSelector(selector, { timeout });
      return { success: true, selector };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 滚动
   */
  async scroll(sessionId, direction = 'down', amount = 500) {
    const session = sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    try {
      const scrollAmount = direction === 'up' ? -amount : amount;
      await session.page.evaluate((y) => {
        window.scrollBy(0, y);
      }, scrollAmount);

      return { success: true, direction, amount: scrollAmount };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取元素信息
   */
  async getElementInfo(sessionId, selector) {
    const session = sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    try {
      const info = await session.page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;

        const rect = el.getBoundingClientRect();
        return {
          tagName: el.tagName,
          text: el.textContent?.substring(0, 200),
          href: el.href,
          src: el.src,
          visible: rect.width > 0 && rect.height > 0,
          attributes: Array.from(el.attributes).map(a => ({ name: a.name, value: a.value }))
        };
      }, selector);

      return { success: true, info };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 关闭会话
   */
  async closeSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    try {
      await session.context.close();
      sessions.delete(sessionId);
      logger.info('Closed session', { sessionId });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 关闭浏览器
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.defaultContext = null;
      sessions.clear();
      logger.info('Closed');
    }
  }

  /**
   * 获取状态
   */
  getStatus() {
    return {
      initialized: !!this.browser,
      sessions: Array.from(sessions.keys()),
      sessionCount: sessions.size
    };
  }
}

// 导出单例
const browserAgent = new BrowserAgent();

module.exports = {
  browserAgent,
  BrowserAgent
};
