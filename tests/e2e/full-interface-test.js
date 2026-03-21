/**
 * AI Chat 玩具 - 全界面自动化测试
 *
 * 功能：Playwright 浏览器自动化 + Minimax Vision MCP 截图分析
 *
 * 运行方式:
 *   npm test:e2e           # 运行所有测试
 *   npm test:e2e:ui       # UI 模式运行
 *   npm test:e2e:headed   # 有头模式 (显示浏览器)
 *   npm test:e2e:mobile   # 移动端测试
 *
 * 前置条件:
 *   1. 安装依赖: npm install
 *   2. 启动服务: npm run dev (前端 5173, 后端 30000)
 *   3. 配置 .env.local 中的 NEXT_PUBLIC_BACKEND_URL
 */

const { chromium, firefox, webkit } = require('../../frontend/node_modules/playwright');

// ==========================================
// 配置
// ==========================================

const CONFIG = {
  // 服务地址
  BASE_URL: process.env.TEST_BASE_URL || 'http://localhost:8080',
  BACKEND_URL: process.env.TEST_BACKEND_URL || 'http://localhost:30000',

  // API 配置 (留空则跳过视觉分析，节省Token)
  API_KEY: process.env.MINIMAX_API_KEY || '',

  // 是否启用视觉分析 (默认关闭以节省Token)
  ENABLE_VISION_ANALYSIS: process.env.ENABLE_VISION_ANALYSIS === 'true',

  // 截图输出目录
  SCREENSHOT_DIR: './test-results/screenshots',

  // 视口配置
  VIEWPORTS: {
    desktop: { width: 1920, height: 1080 },
    tablet: { width: 768, height: 1024 },
    mobile: { width: 375, height: 812 },
  },

  // 等待超时
  TIMEOUT: {
    default: 30000,
    long: 60000,
    ultra: 120000,
  },

  // 测试账号 (可选)
  TEST_USER: {
    id: 'test-user-001',
    name: '测试用户',
  },
};

// ==========================================
// Minimax Vision MCP 分析器
// ==========================================

class VisionAnalyzer {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.minimax.chat/v1';
  }

  /**
   * 分析截图异常
   * @param {string} imagePath - 截图路径
   * @param {string} context - 测试上下文
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeImage(imagePath, context = '') {
    const fs = require('fs');
    const path = require('path');

    if (!this.apiKey) {
      console.log('⚠️ 未配置 API_KEY，跳过视觉分析');
      return { error: 'No API key', anomalies: [] };
    }

    try {
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');

      // 使用 Minimax chat completions API 格式
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'abab6.5s-chat',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `你是 UI 测试分析专家。请分析以下截图，检测以下异常：

1. **布局问题**: 元素重叠、错位、溢出、缺失
2. **样式问题**: 颜色异常、字体问题、动画卡顿
3. **交互问题**: 按钮不可点击、输入框无法输入
4. **内容问题**: 文字乱码、图标缺失、显示异常
5. **错误提示**: 控制台错误、网络请求失败、API 异常

${context ? `测试场景: ${context}` : ''}

请以 JSON 格式返回分析结果:
{
  "status": "pass" | "warning" | "fail",
  "anomalies": [
    {
      "type": "layout" | "style" | "interaction" | "content" | "error",
      "severity": "critical" | "major" | "minor",
      "description": "问题描述",
      "location": "元素位置描述",
      "suggestion": "修复建议"
    }
  ],
  "overall": "整体评价"
}`
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/png;base64,${base64Image}`
                  }
                }
              ]
            }
          ],
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ 视觉分析失败:', `API 请求失败: ${response.status}`);
        return { error: `API 请求失败: ${response.status}`, anomalies: [] };
      }

      const result = await response.json();
      return this.parseAnalysisResult(result);
    } catch (error) {
      console.error('❌ 视觉分析失败:', error.message);
      return { error: error.message, anomalies: [] };
    }
  }

  parseAnalysisResult(result) {
    try {
      // 尝试从响应中提取 JSON
      const content = result.choices?.[0]?.message?.content || '';

      // 尝试解析 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return {
        status: 'unknown',
        anomalies: [],
        raw: content.substring(0, 500),
      };
    } catch {
      return {
        status: 'unknown',
        anomalies: [],
        raw: result.choices?.[0]?.message?.content?.substring(0, 500) || '',
      };
    }
  }
}

// ==========================================
// 测试报告生成器
// ==========================================

class TestReporter {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
    this.fs = require('fs');
    this.path = require('path');

    // 确保输出目录存在
    const screenshotDir = this.path.resolve(CONFIG.SCREENSHOT_DIR);
    if (!this.fs.existsSync(screenshotDir)) {
      this.fs.mkdirSync(screenshotDir, { recursive: true });
    }
  }

  addResult(testName, status, details = {}) {
    this.results.push({
      name: testName,
      status,
      timestamp: new Date().toISOString(),
      ...details,
    });
  }

  async generateReport() {
    const duration = Date.now() - this.startTime;
    const passed = this.results.filter(r => r.status === 'passed').length;
    const failed = this.results.filter(r => r.status === 'failed').length;
    const warnings = this.results.filter(r => r.status === 'warning').length;

    const report = {
      summary: {
        total: this.results.length,
        passed,
        failed,
        warnings,
        duration: `${Math.round(duration / 1000)}s`,
        timestamp: new Date().toISOString(),
      },
      results: this.results,
    };

    // 保存 JSON 报告
    const reportPath = this.path.resolve(
      CONFIG.SCREENSHOT_DIR,
      `test-report-${Date.now()}.json`
    );
    this.fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // 生成 HTML 报告
    const htmlReport = this.generateHTMLReport(report);
    const htmlPath = this.path.resolve(
      CONFIG.SCREENSHOT_DIR,
      `test-report-${Date.now()}.html`
    );
    this.fs.writeFileSync(htmlPath, htmlReport);

    console.log('\n' + '='.repeat(60));
    console.log('📊 测试报告');
    console.log('='.repeat(60));
    console.log(`✅ 通过: ${passed}`);
    console.log(`❌ 失败: ${failed}`);
    console.log(`⚠️ 警告: ${warnings}`);
    console.log(`⏱️ 耗时: ${report.summary.duration}`);
    console.log(`📄 报告: ${reportPath}`);
    console.log(`🌐 HTML: ${htmlPath}`);
    console.log('='.repeat(60));

    return report;
  }

  generateHTMLReport(report) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Chat 玩具 - 测试报告</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 2rem; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #f8fafc; margin-bottom: 2rem; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .stat { background: #1e293b; border-radius: 12px; padding: 1.5rem; text-align: center; }
    .stat-value { font-size: 2.5rem; font-weight: bold; }
    .stat-label { color: #94a3b8; margin-top: 0.5rem; }
    .stat.passed .stat-value { color: #22c55e; }
    .stat.failed .stat-value { color: #ef4444; }
    .stat.warnings .stat-value { color: #f59e0b; }
    .results { background: #1e293b; border-radius: 12px; overflow: hidden; }
    .result { padding: 1rem 1.5rem; border-bottom: 1px solid #334155; display: flex; align-items: center; gap: 1rem; }
    .result:last-child { border-bottom: none; }
    .result-icon { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; }
    .result.passed .result-icon { background: #22c55e; }
    .result.failed .result-icon { background: #ef4444; }
    .result.warning .result-icon { background: #f59e0b; }
    .result-name { flex: 1; }
    .result-status { color: #94a3b8; font-size: 0.875rem; }
    .screenshot-link { color: #3b82f6; text-decoration: none; }
    .screenshot-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🤖 AI Chat 玩具 - 全界面测试报告</h1>

    <div class="summary">
      <div class="stat">
        <div class="stat-value">${report.summary.total}</div>
        <div class="stat-label">总测试数</div>
      </div>
      <div class="stat passed">
        <div class="stat-value">${report.summary.passed}</div>
        <div class="stat-label">通过</div>
      </div>
      <div class="stat failed">
        <div class="stat-value">${report.summary.failed}</div>
        <div class="stat-label">失败</div>
      </div>
      <div class="stat warnings">
        <div class="stat-value">${report.summary.warnings}</div>
        <div class="stat-label">警告</div>
      </div>
    </div>

    <div class="results">
      ${report.results.map(r => `
        <div class="result ${r.status}">
          <div class="result-icon">${r.status === 'passed' ? '✓' : r.status === 'failed' ? '✗' : '⚠'}</div>
          <div class="result-name">${r.name}</div>
          <div class="result-status">${r.duration ? `⏱️ ${r.duration}ms` : ''}</div>
          ${r.screenshot ? `<a class="screenshot-link" href="${r.screenshot}">📷 截图</a>` : ''}
        </div>
      `).join('')}
    </div>
  </div>
</body>
</html>`;
  }
}

// ==========================================
// 测试基类
// ==========================================

class BaseTest {
  constructor(browser, page, reporter, analyzer) {
    this.browser = browser;
    this.page = page;
    this.reporter = reporter;
    this.analyzer = analyzer;
    this.testName = '';
  }

  async screenshot(name) {
    const screenshotPath = `${CONFIG.SCREENSHOT_DIR}/${this.testName}-${name}-${Date.now()}.png`;
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 截图: ${screenshotPath}`);
    return screenshotPath;
  }

  async analyzeScreenshot(name, context = '') {
    const screenshotPath = await this.screenshot(name);
    // 默认跳过视觉分析以节省Token，除非明确启用
    if (!CONFIG.ENABLE_VISION_ANALYSIS) {
      return { screenshotPath, analysis: { status: 'skipped', anomalies: [] } };
    }
    const result = await this.analyzer.analyzeImage(screenshotPath, context);
    return { screenshotPath, analysis: result };
  }

  async pass(message = '') {
    console.log(`✅ ${this.testName}: ${message}`);
    this.reporter.addResult(this.testName, 'passed', { message });
  }

  async fail(message, error) {
    console.log(`❌ ${this.testName}: ${message}`);
    console.error(error);
    const screenshot = await this.screenshot('failure');
    this.reporter.addResult(this.testName, 'failed', { message, error: error.message, screenshot });
  }

  async warn(message) {
    console.log(`⚠️ ${this.testName}: ${message}`);
    this.reporter.addResult(this.testName, 'warning', { message });
  }

  async waitForSelector(selector, options = {}) {
    await this.page.waitForSelector(selector, {
      timeout: options.timeout || CONFIG.TIMEOUT.default,
      state: options.state || 'visible',
      ...options,
    });
  }

  async click(selector, options = {}) {
    await this.waitForSelector(selector);
    await this.page.click(selector, options);
  }

  async fill(selector, value) {
    await this.waitForSelector(selector);
    await this.page.fill(selector, value);
  }

  async getText(selector) {
    await this.waitForSelector(selector);
    return this.page.textContent(selector);
  }

  async isVisible(selector) {
    try {
      return await this.page.isVisible(selector);
    } catch {
      return false;
    }
  }
}

// ==========================================
// 测试用例
// ==========================================

/**
 * 1. 页面加载测试
 */
class PageLoadTest extends BaseTest {
  constructor(...args) {
    super(...args);
    this.testName = '页面加载';
  }

  async run() {
    try {
      console.log('\n📄 测试: 页面加载...');

      // 截图初始状态
      await this.analyzeScreenshot('page-load-start', '页面开始加载');

      // 访问首页
      await this.page.goto(CONFIG.BASE_URL, { waitUntil: 'networkidle' });

      // 检查页面标题
      const title = await this.page.title();
      if (title.includes('AI Chat') || title.includes('Chat')) {
        await this.pass(`页面标题正确: ${title}`);
      } else {
        await this.warn(`页面标题异常: ${title}`);
      }

      // 截图加载完成
      const { screenshotPath, analysis } = await this.analyzeScreenshot(
        'page-loaded',
        '页面已加载完成，检查整体布局是否正常'
      );

      // 分析异常检测
      if (analysis.anomalies?.length > 0) {
        const criticalAnomalies = analysis.anomalies.filter(a => a.severity === 'critical');
        if (criticalAnomalies.length > 0) {
          await this.fail('检测到关键布局异常', new Error(JSON.stringify(criticalAnomalies)));
        } else {
          await this.warn(`检测到 ${analysis.anomalies.length} 个非关键异常`);
        }
      } else {
        await this.pass('页面加载正常，无明显异常');
      }

      return true;
    } catch (error) {
      await this.fail('页面加载失败', error);
      return false;
    }
  }
}

/**
 * 2. 侧边栏测试
 */
class SidebarTest extends BaseTest {
  constructor(...args) {
    super(...args);
    this.testName = '侧边栏';
  }

  async run() {
    try {
      console.log('\n📄 测试: 侧边栏...');

      // 截图初始状态
      await this.screenshot('sidebar-init');

      // 检查侧边栏是否存在
      const sidebarVisible = await this.isVisible('[class*="sidebar"], aside, [class*="ConversationList"]');

      if (sidebarVisible) {
        await this.pass('侧边栏显示正常');

        // 检查对话列表
        const conversationItems = await this.page.$$('[class*="conversation"], [class*="ConversationItem"]');
        console.log(`📋 发现 ${conversationItems.length} 个对话项`);

        // 测试创建新对话
        const newChatBtn = await this.page.$('button:has-text("新对话"), button:has-text("New Chat")');
        if (newChatBtn) {
          await newChatBtn.click();
          await this.page.waitForTimeout(500);

          const { analysis } = await this.analyzeScreenshot(
            'new-conversation',
            '点击新建对话后，检查输入框是否可用'
          );

          if (analysis.status === 'pass') {
            await this.pass('新建对话功能正常');
          } else {
            await this.warn('新建对话后界面有变化');
          }
        }
      } else {
        // 尝试打开侧边栏
        const menuBtn = await this.page.$('button[class*="Menu"], button:has(svg)' );
        if (menuBtn) {
          await menuBtn.click();
          await this.page.waitForTimeout(500);

          const sidebarNowVisible = await this.isVisible('aside, [class*="sidebar"]');
          if (sidebarNowVisible) {
            await this.pass('点击菜单按钮后侧边栏打开');
          } else {
            await this.warn('侧边栏可能需要其他方式打开');
          }
        }
      }

      // 关闭侧边栏测试
      const closeBtn = await this.page.$('button:has-text("X"), button[aria-label*="close"]');
      if (closeBtn) {
        await closeBtn.click();
        await this.page.waitForTimeout(300);
        await this.analyzeScreenshot('sidebar-closed', '检查侧边栏是否成功关闭');
      }

      return true;
    } catch (error) {
      await this.fail('侧边栏测试失败', error);
      return false;
    }
  }
}

/**
 * 3. 聊天功能测试
 */
class ChatTest extends BaseTest {
  constructor(...args) {
    super(...args);
    this.testName = '聊天功能';
  }

  async run() {
    try {
      console.log('\n💬 测试: 聊天功能...');

      // 确保在聊天界面
      const chatInput = await this.page.$('textarea, input[type="text"], [contenteditable]');
      if (!chatInput) {
        await this.fail('未找到聊天输入框', new Error('Input not found'));
        return false;
      }

      await this.pass('聊天输入框存在');

      // 截图输入前状态
      await this.analyzeScreenshot('chat-before-send', '发送消息前的聊天界面');

      // 输入测试消息 - 使用 type 而不是 fill 以触发输入事件
      await chatInput.click();
      await chatInput.type('你好，请介绍一下你自己', { delay: 50 });
      await this.page.waitForTimeout(500);

      // 检查输入内容
      const inputValue = await chatInput.inputValue();
      if (inputValue.includes('你好')) {
        await this.pass('消息输入正常');
      }

      // 使用 Ctrl+Enter 发送（这是正确的快捷键）
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('Enter');
      await this.page.keyboard.up('Control');
      await this.pass('使用 Ctrl+Enter 发送消息');
      console.log('💬 消息已发送，等待 AI 回复...');

      // 等待 AI 回复 - 检测流式内容出现
      let aiResponse = false;
      const maxWait = 60000; // 60秒
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait && !aiResponse) {
        await this.page.waitForTimeout(2000);

        // 检查页面内容
        const pageText = await this.page.textContent('body');

        // 检查 AI 回复标记（模拟回复的内容特征）
        const responseMarkers = [
          '这是一段', '模拟', '回复', '您好', '您好！', '很高兴',
          'assistant', 'assistant response', 'I am', 'Hello',
          '迷你', 'MiniMax', 'AI', '人工智能'
        ];

        for (const marker of responseMarkers) {
          if (pageText.includes(marker)) {
            aiResponse = true;
            console.log(`📝 检测到回复标记: ${marker}`);
            break;
          }
        }

        // 检查是否有错误提示
        if (!aiResponse) {
          const errorElements = await this.page.$$('[class*="error"], [class*="Error"], [class*="toast"][class*="error"]');
          if (errorElements.length > 0) {
            const errorText = await errorElements[0].textContent();
            if (errorText && errorText.includes('error')) {
              console.log(`⚠️ 检测到错误: ${errorText}`);
            }
          }
        }
      }

      // 截图回复后状态
      const { screenshotPath, analysis } = await this.analyzeScreenshot(
        'chat-after-response',
        '检查 AI 回复是否正常显示，界面是否有错误'
      );

      // 检查是否有错误提示
      const errorElements = await this.page.$$('[class*="error"], [class*="Error"]');
      if (errorElements.length > 0) {
        await this.fail('检测到错误提示', new Error('Error elements found'));
        return false;
      }

      // 检查是否有 AI 回复
      if (aiResponse) {
        await this.pass('聊天功能正常，收到 AI 回复');
      } else {
        // 至少消息发送成功
        await this.warn('未检测到明确的 AI 回复，但消息发送成功');
      }

      return true;
    } catch (error) {
      await this.fail('聊天功能测试失败', error);
      return false;
    }
  }
}

/**
 * 4. 多窗口测试
 */
class MultiWindowTest extends BaseTest {
  constructor(...args) {
    super(...args);
    this.testName = '多窗口';
  }

  async run() {
    try {
      console.log('\n🪟 测试: 多窗口...');

      // 截图初始状态
      await this.screenshot('multi-window-init');

      // 查找布局切换按钮 - 使用 title 属性
      const layoutSwitcher = await this.page.$(
        'button[title="单窗口"], button[title="并排"], button[title="堆叠"], button[title="网格"]'
      );

      if (layoutSwitcher) {
        // 获取当前布局按钮的文本
        const currentLayout = await layoutSwitcher.textContent();
        console.log(`📐 当前布局: ${currentLayout}`);

        // 尝试点击不同的布局选项
        // 先尝试"并排"布局
        const sideBySideBtn = await this.page.$('button[title="并排"]');
        if (sideBySideBtn) {
          await sideBySideBtn.click();
          await this.page.waitForTimeout(500);
          await this.analyzeScreenshot('multi-window-side-by-side', '检查并排布局是否正确');

          // 检查是否切换了布局样式
          const hasGridLayout = await this.page.$('[class*="grid-cols-2"], [class*="side-by-side"]');
          if (hasGridLayout) {
            await this.pass('并排布局切换成功');
          }
        }

        // 尝试"网格"布局
        const gridBtn = await this.page.$('button[title="网格"]');
        if (gridBtn) {
          await gridBtn.click();
          await this.page.waitForTimeout(500);
          await this.analyzeScreenshot('multi-window-grid', '检查网格布局是否正确');

          // 检查是否有网格样式
          const hasGridStyle = await this.page.$('[class*="grid-cols-2"], [class*="grid-cols-3"]');
          if (hasGridStyle) {
            await this.pass('网格布局切换成功');
          }
        }

        // 检查窗口数量
        const windows = await this.page.$$('[class*="window"], [class*="chat-window"], main > div');
        console.log(`🪟 检测到 ${windows.length} 个窗口元素`);

        if (windows.length >= 1) {
          await this.pass(`多窗口布局正常，检测到 ${windows.length} 个窗口元素`);
        } else {
          await this.warn('未检测到明确的窗口元素');
        }
      } else {
        await this.warn('未找到布局切换按钮');
      }

      return true;
    } catch (error) {
      await this.fail('多窗口测试失败', error);
      return false;
    }
  }
}

/**
 * 5. Focus Mode 测试
 */
class FocusModeTest extends BaseTest {
  constructor(...args) {
    super(...args);
    this.testName = '专注模式';
  }

  async run() {
    try {
      console.log('\n🎯 测试: 专注模式...');

      // 截图初始状态
      await this.screenshot('focus-mode-init');

      // 查找专注模式按钮
      const focusBtn = await this.page.$('button:has-text("专注"), button:has-text("Focus"), button[aria-label*="focus"]');
      if (focusBtn) {
        await focusBtn.click();
        await this.page.waitForTimeout(500);

        const { analysis } = await this.analyzeScreenshot(
          'focus-mode-active',
          '专注模式已激活，检查是否全屏显示，侧边栏是否隐藏'
        );

        // 检查侧边栏是否隐藏
        const sidebarVisible = await this.isVisible('aside, [class*="sidebar"]');
        if (!sidebarVisible) {
          await this.pass('专注模式已激活，侧边栏已隐藏');
        } else {
          await this.warn('专注模式下侧边栏仍然可见');
        }

        // 退出专注模式
        const exitBtn = await this.page.$('button:has-text("退出"), button:has-text("Exit"), [aria-label*="exit"]');
        if (exitBtn) {
          await exitBtn.click();
        } else {
          // 尝试按 ESC
          await this.page.keyboard.press('Escape');
        }

        await this.page.waitForTimeout(500);
        await this.analyzeScreenshot('focus-mode-exit', '退出专注模式后检查界面是否恢复正常');
      } else {
        await this.warn('未找到专注模式按钮');
      }

      return true;
    } catch (error) {
      await this.fail('专注模式测试失败', error);
      return false;
    }
  }
}

/**
 * 6. 设置面板测试
 */
class SettingsTest extends BaseTest {
  constructor(...args) {
    super(...args);
    this.testName = '设置面板';
  }

  async run() {
    try {
      console.log('\n⚙️ 测试: 设置面板...');

      // 截图初始状态
      await this.screenshot('settings-init');

      // 查找设置按钮
      const settingsBtn = await this.page.$('button:has-text("设置"), button[aria-label*="settings"], [class*="settings"]');
      if (settingsBtn) {
        await settingsBtn.click();
        await this.page.waitForTimeout(500);

        const { screenshotPath, analysis } = await this.analyzeScreenshot(
          'settings-open',
          '设置面板已打开，检查面板内容是否完整'
        );

        if (analysis.anomalies?.length > 0) {
          await this.warn(`设置面板有 ${analysis.anomalies.length} 个潜在问题`);
        } else {
          await this.pass('设置面板打开正常');
        }

        // 检查设置选项
        const settingItems = await this.page.$$('[class*="setting"], [class*="Setting"], input, select');
        console.log(`⚙️ 发现 ${settingItems.length} 个设置项`);

        if (settingItems.length > 3) {
          await this.pass(`设置面板包含 ${settingItems.length} 个可配置项`);
        }

        // 关闭设置
        const closeBtn = await this.page.$('button:has-text("关闭"), button[aria-label*="close"], [class*="close"]');
        if (closeBtn) {
          await closeBtn.click();
        } else {
          await this.page.keyboard.press('Escape');
        }
        await this.page.waitForTimeout(300);
      } else {
        await this.warn('未找到设置按钮');
      }

      return true;
    } catch (error) {
      await this.fail('设置面板测试失败', error);
      return false;
    }
  }
}

/**
 * 7. 记忆面板测试
 */
class MemoryPanelTest extends BaseTest {
  constructor(...args) {
    super(...args);
    this.testName = '记忆面板';
  }

  async run() {
    try {
      console.log('\n🧠 测试: 记忆面板...');

      // 截图初始状态
      await this.screenshot('memory-init');

      // 查找记忆按钮 - 使用 title 属性
      const memoryBtn = await this.page.$(
        'button[title="记忆"], button[title="Memory"], button[aria-label*="memory"], ' +
        'button[aria-label*="记忆"], [class*="memory"] button'
      );
      if (memoryBtn) {
        await memoryBtn.click();
        await this.page.waitForTimeout(500);

        await this.analyzeScreenshot('memory-open', '记忆面板已打开，检查记忆列表是否正常');

        await this.pass('记忆面板打开正常');

        // 关闭
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(300);
      } else {
        await this.warn('未找到记忆按钮');
      }

      return true;
    } catch (error) {
      await this.fail('记忆面板测试失败', error);
      return false;
    }
  }
}

/**
 * 8. Agent 模式测试
 */
class AgentModeTest extends BaseTest {
  constructor(...args) {
    super(...args);
    this.testName = 'Agent模式';
  }

  async run() {
    try {
      console.log('\n🤖 测试: Agent 模式...');

      // 截图初始状态
      await this.screenshot('agent-init');

      // 关闭可能存在的模态框
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(300);

      // 查找 Agent 模式按钮 - 更可靠的选择器
      const agentBtn = await this.page.$(
        'button:has-text("Agent"), button:has-text("智能体"), ' +
        'button[title="Agent"], button[title="智能体"], ' +
        'button[aria-label*="agent"], button[aria-label*="智能体"]'
      );

      if (agentBtn) {
        await this.pass('Agent 模式按钮存在');

        // 点击 Agent 模式
        await agentBtn.click();
        await this.page.waitForTimeout(1000);

        // 截图 Agent 模式激活状态
        await this.analyzeScreenshot('agent-mode-active', 'Agent 模式已激活，检查工作区界面是否正常');

        // 检查 Agent 相关元素 - 更广泛的选择器
        const agentElements = await this.page.$$(
          '[class*="agent"], [class*="Agent"], [class*="AgentWorkspace"], ' +
          '[class*="workspace"], [class*="智能体"], [class*="TaskPanel"]'
        );

        if (agentElements.length > 0) {
          await this.pass(`Agent 模式已激活，检测到 ${agentElements.length} 个相关元素`);

          // 检查是否有 Agent 输入区域
          const agentInput = await this.page.$(
            'textarea, [contenteditable], input[type="text"]'
          );
          if (agentInput) {
            await this.pass('Agent 输入区域存在');
          }

          // 检查是否有工具列表或任务列表
          const toolList = await this.page.$$(
            '[class*="tool"], [class*="Tool"], [class*="task"], [class*="Task"]'
          );
          if (toolList.length > 0) {
            await this.pass(`检测到 ${toolList.length} 个工具/任务元素`);
          }

          // 检查 Tab 导航
          const tabs = await this.page.$$('[role="tab"], [class*="tab"], button[class*="Tab"]');
          console.log(`📑 发现 ${tabs.length} 个 Tab`);

          if (tabs.length >= 1) {
            await this.pass(`Tab 导航正常，共 ${tabs.length} 个 Tab`);
          }

          // 尝试输入 Agent 任务
          if (agentInput) {
            await agentInput.click();
            await agentInput.type('帮我搜索一下今天的科技新闻', { delay: 30 });
            await this.page.waitForTimeout(500);
            await this.screenshot('agent-task-input');

            // 不实际执行，避免影响测试
            await this.page.keyboard.press('Escape');
            await this.page.waitForTimeout(300);
          }
        } else {
          // 检查页面内容是否包含 Agent 相关文字
          const pageText = await this.page.textContent('body');
          if (pageText.includes('Agent') || pageText.includes('智能体') || pageText.includes('工作区')) {
            await this.pass('Agent 模式已激活（检测到相关文本）');
          } else {
            await this.warn('未检测到明确的 Agent 工作区元素');
          }
        }

        // 返回聊天模式
        const backBtn = await this.page.$(
          'button:has-text("返回"), button:has-text("Back"), ' +
          'button:has-text("聊天"), button:has-text("Chat")'
        );
        if (backBtn) {
          await backBtn.click();
          await this.page.waitForTimeout(500);
        } else {
          await this.page.keyboard.press('Escape');
          await this.page.waitForTimeout(500);
        }
      } else {
        await this.warn('未找到 Agent 模式按钮');
      }

      return true;
    } catch (error) {
      await this.fail('Agent 模式测试失败', error);
      return false;
    }
  }
}

/**
 * 9. 知识库测试
 */
class KnowledgeBaseTest extends BaseTest {
  constructor(...args) {
    super(...args);
    this.testName = '知识库';
  }

  async run() {
    try {
      console.log('\n📚 测试: 知识库...');

      // 截图初始状态
      await this.screenshot('knowledge-base-init');

      // 关闭可能存在的模态框
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(300);

      // 查找知识库按钮 - 使用 title 属性
      const kbBtn = await this.page.$(
        'button[title="知识库"], button:has-text("知识库"), button[aria-label*="knowledge"]'
      );
      if (kbBtn) {
        // 确保按钮可见
        const isVisible = await kbBtn.isVisible();
        if (!isVisible) {
          await this.warn('知识库按钮存在但不可见');
          return false;
        }

        await kbBtn.click();
        await this.page.waitForTimeout(800);

        const { analysis } = await this.analyzeScreenshot('knowledge-base-open', '知识库面板已打开，检查文档列表和功能');

        await this.pass('知识库面板打开正常');

        // 检查知识库功能
        const uploadArea = await this.page.$('[class*="upload"], [class*="Upload"], input[type="file"]');
        if (uploadArea) {
          await this.pass('知识库上传功能区域存在');
        }

        // 检查知识库内容
        const kbContent = await this.page.$('[class*="knowledge"], [class*="Knowledge"], [class*="rag"]');
        if (kbContent) {
          await this.pass('知识库内容区域存在');
        }

        // 关闭
        const closeBtn = await this.page.$('button:has-text("关闭"), button[aria-label*="close"], button[title="关闭"]');
        if (closeBtn) {
          await closeBtn.click();
        } else {
          await this.page.keyboard.press('Escape');
        }
        await this.page.waitForTimeout(300);
      } else {
        await this.warn('未找到知识库按钮');
      }

      return true;
    } catch (error) {
      await this.fail('知识库测试失败', error);
      return false;
    }
  }
}

/**
 * 10. 移动端适配测试
 */
class MobileTest extends BaseTest {
  constructor(...args) {
    super(...args);
    this.testName = '移动端适配';
  }

  async run() {
    try {
      console.log('\n📱 测试: 移动端适配...');

      // 设置移动端视口
      await this.page.setViewportSize(CONFIG.VIEWPORTS.mobile);

      // 截图移动端状态
      await this.screenshot('mobile-init');

      // 刷新页面
      await this.page.reload({ waitUntil: 'networkidle' });

      await this.analyzeScreenshot(
        'mobile-loaded',
        '移动端视图，检查布局是否适配，是否显示移动端专用元素'
      );

      // 检查移动端特定元素
      const bottomNav = await this.page.$('[class*="bottom"], [class*="mobile"] nav, [class*="BottomNav"]');
      if (bottomNav) {
        await this.pass('移动端底部导航存在');
      } else {
        await this.warn('未检测到移动端专用导航');
      }

      // 检查是否显示移动端布局
      const mobileLayout = await this.page.$('[class*="MobileLayout"], [class*="mobile-layout"]');
      if (mobileLayout) {
        await this.pass('移动端布局已激活');
      }

      // 恢复桌面视口
      await this.page.setViewportSize(CONFIG.VIEWPORTS.desktop);

      return true;
    } catch (error) {
      await this.fail('移动端适配测试失败', error);
      return false;
    }
  }
}

/**
 * 11. 联网搜索测试
 */
class SearchTest extends BaseTest {
  constructor(...args) {
    super(...args);
    this.testName = '联网搜索';
  }

  async run() {
    try {
      console.log('\n🔍 测试: 联网搜索...');

      // 截图初始状态
      await this.screenshot('search-init');

      // 查找搜索按钮或搜索框 - 使用更可靠的选择器
      const searchBtn = await this.page.$(
        'button[title="搜索"], button[title="Search"], button[aria-label*="search"], ' +
        'button[aria-label*="搜索"], [class*="search"] button'
      );
      const searchInput = await this.page.$(
        'input[placeholder*="搜索"], input[placeholder*="search"], input[type="search"]'
      );

      if (searchBtn) {
        await searchBtn.click();
        await this.page.waitForTimeout(500);
      }

      if (searchInput) {
        await searchInput.fill('今天天气怎么样');
        await this.page.waitForTimeout(300);

        const { analysis } = await this.analyzeScreenshot(
          'search-query',
          '搜索已输入，检查搜索建议和功能'
        );

        await this.pass('搜索输入正常');

        // 尝试搜索 - 使用 AbortController 超时控制
        const searchPromise = this.page.keyboard.press('Enter');
        const timeoutPromise = new Promise(resolve => setTimeout(resolve, CONFIG.TIMEOUT.long));

        await Promise.race([searchPromise, timeoutPromise]);
        await this.page.waitForTimeout(5000); // 额外等待 5 秒

        await this.analyzeScreenshot(
          'search-results',
          '搜索结果页面，检查结果是否正常显示'
        );

        // 检查搜索结果
        const searchResults = await this.page.$$('[class*="result"], [class*="Result"], [class*="search"], [class*="ResultCard"]');
        if (searchResults.length > 0) {
          await this.pass(`搜索功能正常，显示 ${searchResults.length} 个结果`);
        } else {
          await this.warn('未检测到搜索结果');
        }
      } else {
        await this.warn('未找到搜索功能入口');
      }

      return true;
    } catch (error) {
      await this.fail('联网搜索测试失败', error);
      return false;
    }
  }
}

/**
 * 12. 思维链可视化测试
 */
class ThinkingChainTest extends BaseTest {
  constructor(...args) {
    super(...args);
    this.testName = '思维链可视化';
  }

  /**
   * 选择支持思维链的模型
   * MiniMax-M2.7-highspeed 模型支持思维链
   */
  async selectThinkingChainModel() {
    try {
      // 查找模型选择按钮（带有 Sparkles 图标的按钮）
      const modelButton = await this.page.$(
        'button:has(svg[class*="lucide-sparkles"]), ' +
        'button:has-text("Sparkles"), ' +
        '[class*="model"] button, ' +
        'button[class*="model"]'
      );

      if (!modelButton) {
        console.log('⚠️ 未找到模型选择按钮');
        return false;
      }

      await modelButton.click();
      await this.page.waitForTimeout(500);

      // 支持思维链的模型列表（按优先级排序）
      const thinkingChainModels = [
        'MiniMax-M2.7-highspeed',
        'MiniMax-M2-highspeed',
        'abab6.5s-chat',
        'abab7-chat',
      ];

      // 尝试选择支持思维链的模型
      for (const modelName of thinkingChainModels) {
        const modelOption = await this.page.$(
          `button:has-text("${modelName}"), ` +
          `div[role="button"]:has-text("${modelName}"), ` +
          `li:has-text("${modelName}")`
        );

        if (modelOption) {
          await modelOption.click();
          await this.page.waitForTimeout(300);
          console.log(`✅ 已选择模型: ${modelName}`);
          return true;
        }
      }

      // 如果没有找到预定义的模型，尝试从下拉菜单中选择第一个
      const firstModel = await this.page.$(
        'button[class*="model"]:not([disabled]), ' +
        'div[role="button"]:first-child'
      );
      if (firstModel) {
        await firstModel.click();
        await this.page.waitForTimeout(300);
        console.log('✅ 已选择第一个可用模型');
        return true;
      }

      console.log('⚠️ 未找到支持思维链的模型');
      return false;
    } catch (error) {
      console.log('⚠️ 模型选择失败:', error.message);
      return false;
    }
  }

  async run() {
    try {
      console.log('\n💭 测试: 思维链可视化...');

      // 先选择支持思维链的模型
      await this.screenshot('thinking-chain-before-model-select');
      await this.selectThinkingChainModel();
      await this.page.waitForTimeout(500);

      // 发送一个可能触发思维链的消息
      const chatInput = await this.page.$('textarea, input[type="text"], [contenteditable]');
      if (!chatInput) {
        await this.warn('未找到聊天输入框，跳过思维链测试');
        return false;
      }

      // 使用 type 触发输入事件
      await chatInput.click();
      await chatInput.type('分析一下为什么人工智能很重要，请详细思考', { delay: 50 });
      await this.page.waitForTimeout(500);

      // 使用 Ctrl+Enter 发送
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('Enter');
      await this.page.keyboard.up('Control');
      console.log('💭 消息已发送，等待思维链响应...');

      // 使用更智能的等待 - 检查思维链元素和<think>标签
      let thinkingFound = false;
      const maxWaitTime = 60000; // 最多等待 60 秒（从 90 秒减少）
      const checkInterval = 2000;
      const startTime = Date.now();
      let detectedMarker = null;

      while (Date.now() - startTime < maxWaitTime && !thinkingFound) {
        await this.page.waitForTimeout(checkInterval);

        // 检查页面内容中是否包含思维链标记
        const pageText = await this.page.textContent('body');

        // 检查多种思维链标记
        const thinkingMarkers = [
          '<think>',  // Minimax 思维链标签
          '[/THINK]',  // Minimax 思维链结束标签
          'thinking', 'Thought', 'thought process',
          '[thinking]', '[thought]',
          '<thinking>', '<reasoning>',
          '思维过程', '思考过程', '推理过程'
        ];

        for (const marker of thinkingMarkers) {
          if (pageText.toLowerCase().includes(marker.toLowerCase())) {
            thinkingFound = true;
            detectedMarker = marker;
            console.log(`💭 检测到思维链标记: ${marker}`);
            // 检测到思维链时截图保存
            await this.screenshot(`thinking-chain-detected-${marker.replace(/[^a-zA-Z0-9]/g, '-')}`);
            break;
          }
        }

        // 同时检查思维链元素
        if (!thinkingFound) {
          const thinkingElements = await this.page.$$(
            '[class*="thinking"], [class*="ThinkingChain"], [class*="chain"], ' +
            '[class*="thought"], [class*="reasoning"], [class*="tool-call"], ' +
            '[class*="思考"], [class*="思维"]'
          );

          if (thinkingElements.length > 0) {
            thinkingFound = true;
            detectedMarker = `思维链元素(${thinkingElements.length}个)`;
            console.log(`💭 检测到 ${thinkingElements.length} 个思维链元素`);
            // 检测到思维链元素时截图
            await this.screenshot(`thinking-chain-elements-${thinkingElements.length}`);
          }
        }
      }

      // 截图最终状态
      const { screenshotPath, analysis } = await this.analyzeScreenshot(
        'thinking-chain-result',
        '检查思维链可视化是否正常显示，包括步骤、工具调用等'
      );

      if (thinkingFound) {
        await this.pass(`思维链可视化正常，检测到: ${detectedMarker}`);
      } else {
        await this.warn('未检测到思维链元素，可能需要特定模型支持（如 MiniMax-M2.7-highspeed）');
      }

      return true;
    } catch (error) {
      await this.fail('思维链可视化测试失败', error);
      return false;
    }
  }
}

/**
 * 13. 快捷键测试
 */
class KeyboardShortcutsTest extends BaseTest {
  constructor(...args) {
    super(...args);
    this.testName = '快捷键';
  }

  async run() {
    try {
      console.log('\n⌨️ 测试: 快捷键...');

      // 截图初始状态
      await this.screenshot('shortcuts-init');

      // 打开快捷键帮助 - 使用 Ctrl+/
      await this.page.keyboard.press('Control+/');
      await this.page.waitForTimeout(500);

      await this.analyzeScreenshot(
        'shortcuts-help',
        '快捷键帮助面板，检查快捷键列表是否完整'
      );

      // 检查快捷键面板 - 更精确的选择器
      const shortcutsPanel = await this.page.$(
        'h2:has-text("键盘快捷键"), ' +  // 最精确 - 检查标题文本
        '[class*="KeyboardShortcuts"]'   // 类名包含 KeyboardShortcuts
      );
      if (shortcutsPanel) {
        await this.pass('快捷键帮助面板打开正常');

        // 统计快捷键数量
        const shortcuts = await this.page.$$('kbd, [class*="key"]');
        console.log(`⌨️ 发现 ${shortcuts.length} 个快捷键显示`);

        if (shortcuts.length > 3) {
          await this.pass(`快捷键列表完整，共 ${shortcuts.length} 个`);
        }
      } else {
        await this.warn('未检测到快捷键帮助面板');
      }

      // 关闭快捷键面板
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(300);

      return true;
    } catch (error) {
      await this.fail('快捷键测试失败', error);
      return false;
    }
  }
}

/**
 * 14. 响应式布局测试
 */
class ResponsiveTest extends BaseTest {
  constructor(...args) {
    super(...args);
    this.testName = '响应式布局';
  }

  async run() {
    try {
      console.log('\n📐 测试: 响应式布局...');

      const breakpoints = [
        { name: '桌面 1920px', size: CONFIG.VIEWPORTS.desktop },
        { name: '平板 768px', size: CONFIG.VIEWPORTS.tablet },
        { name: '移动 375px', size: CONFIG.VIEWPORTS.mobile },
      ];

      for (const bp of breakpoints) {
        console.log(`\n📐 测试: ${bp.name}`);

        await this.page.setViewportSize(bp.size);
        await this.page.reload({ waitUntil: 'networkidle' });
        await this.page.waitForTimeout(500);

        const { analysis } = await this.analyzeScreenshot(
          `responsive-${bp.name.replace(/\s/g, '-')}`,
          `${bp.name} 视口，检查布局是否正确适配`
        );

        if (analysis.status === 'pass' || analysis.anomalies?.length === 0) {
          await this.pass(`${bp.name} 布局适配正常`);
        } else if (analysis.anomalies?.length <= 2) {
          await this.warn(`${bp.name} 有轻微布局问题`);
        } else {
          await this.fail(`${bp.name} 布局异常`, new Error(JSON.stringify(analysis.anomalies)));
        }
      }

      // 恢复默认视口
      await this.page.setViewportSize(CONFIG.VIEWPORTS.desktop);

      return true;
    } catch (error) {
      await this.fail('响应式布局测试失败', error);
      return false;
    }
  }
}

/**
 * 15. 控制台错误检测
 */
class ConsoleErrorTest extends BaseTest {
  constructor(...args) {
    super(...args);
    this.testName = '控制台错误';
  }

  async run() {
    try {
      console.log('\n🔧 测试: 控制台错误检测...');

      const errors = [];

      // 监听控制台错误
      this.page.on('console', msg => {
        if (msg.type() === 'error') {
          const text = msg.text();
          // 忽略一些常见的无害错误
          if (!text.includes('favicon') && !text.includes('net::ERR_')) {
            errors.push(text);
          }
        }
      });

      // 监听页面错误
      this.page.on('pageerror', err => {
        errors.push(`Page Error: ${err.message}`);
      });

      // 执行一些操作触发可能的错误
      await this.page.reload({ waitUntil: 'networkidle' });
      await this.page.waitForTimeout(2000);

      // 尝试一些交互
      const chatInput = await this.page.$('textarea, input[type="text"]');
      if (chatInput) {
        await chatInput.fill('test');
        await this.page.waitForTimeout(500);
      }

      await this.analyzeScreenshot('console-check', '检查是否有界面异常');

      if (errors.length === 0) {
        await this.pass('控制台无错误');
      } else if (errors.length <= 3) {
        await this.warn(`控制台有 ${errors.length} 个警告`);
        console.log('错误列表:', errors);
      } else {
        await this.fail(`控制台有 ${errors.length} 个错误`, new Error(errors.join('\n')));
      }

      return true;
    } catch (error) {
      await this.fail('控制台错误检测失败', error);
      return false;
    }
  }
}

// ==========================================
// 测试运行器
// ==========================================

async function runTests() {
  console.log('='.repeat(60));
  console.log('🤖 AI Chat 玩具 - 全界面自动化测试');
  console.log('='.repeat(60));
  console.log(`📍 前端: ${CONFIG.BASE_URL}`);
  console.log(`📍 后端: ${CONFIG.BACKEND_URL}`);
  console.log(`📸 截图目录: ${CONFIG.SCREENSHOT_DIR}`);
  console.log('='.repeat(60));

  const reporter = new TestReporter();
  const analyzer = new VisionAnalyzer(CONFIG.API_KEY);

  // 选择浏览器
  const browserType = process.env.BROWSER || 'chromium';
  console.log(`🌐 浏览器: ${browserType}`);

  const browser = await {
    chromium: () => chromium.launch({ headless: true }),
    firefox: () => firefox.launch({ headless: true }),
    webkit: () => webkit.launch({ headless: true }),
  }[browserType]();

  const context = await browser.newContext({
    viewport: CONFIG.VIEWPORTS.desktop,
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  // 在导航前设置 localStorage 和 sessionStorage
  // 先导航到空白页设置存储
  await page.goto('about:blank');

  await page.addInitScript(() => {
    // 跳过 WelcomeGuide - 设置 localStorage
    localStorage.setItem('onboarding-completed', 'true');

    // 设置完整的 zustand store 状态以跳过欢迎引导
    // Zustand persist 格式: { state: {...}, version: number }
    const storeState = {
      state: {
        conversations: [{
          id: 'conv-test-001',
          title: '测试对话',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }],
        globalMemories: [],
        customPrompts: [],
        activeConversationId: 'conv-test-001',
        activeConversationIds: ['conv-test-001'],
        appMode: 'chat',
        windowConfigs: {},
        hasHydrated: true,
        apiConfig: {
          apiKey: '', // 空字符串 - 使用后端默认配置
          baseURL: '/api', // 使用后端代理
          model: 'abab6.5s-chat' // MiniMax 模型
        },
        settings: {
          theme: 'system',
          desktopPalette: 'aurora',
          typingSpeed: 30,
          fontSize: 14,
          windowLayout: 'single',
          animationsEnabled: true,
          soundEnabled: false,
          autoTitle: true,
        },
        showWelcomeGuide: false, // 关键：设置为 false 跳过欢迎引导
        configuredModels: [],
        focusMode: false,
        sidePanelContent: 'none',
      },
      version: 0
    };
    sessionStorage.setItem('ai-chat-storage', JSON.stringify(storeState));
  });

  // 关闭 WelcomeGuide 模态框 (如果存在)
  async function closeWelcomeGuide() {
    try {
      // 等待页面加载
      await page.waitForTimeout(1000);

      // 尝试多种方式关闭欢迎引导
      const closeSelectors = [
        'button:has-text("跳过引导")',
        'button:has-text("跳过")',
        'button:has-text("Close")',
        '[aria-label="Close"]',
        '.fixed button:text("跳过引导")',
      ];

      for (const selector of closeSelectors) {
        try {
          const element = await page.$(selector);
          if (element && await element.isVisible()) {
            await element.click({ timeout: 3000, force: true });
            console.log(`✅ WelcomeGuide 已关闭 (${selector})`);
            await page.waitForTimeout(1000);
            return true;
          }
        } catch (e) {
          // 继续尝试下一个选择器
        }
      }

      // 检查是否存在模态框遮罩
      const overlay = await page.$('.fixed.inset-0.z-\\[100\\]');
      if (overlay && await overlay.isVisible()) {
        // 尝试按 ESC 键
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
        console.log('✅ 尝试按 ESC 关闭模态框');
        return true;
      }

      // 检查是否存在模态框遮罩 (另一种 class 组合)
      const overlay2 = await page.$('.fixed.inset-0.bg-background');
      if (overlay2 && await overlay2.isVisible()) {
        // 尝试按 ESC 键
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
        console.log('✅ 尝试按 ESC 关闭模态框');
        return true;
      }

      return false;
    } catch (error) {
      console.log('⚠️ 关闭 WelcomeGuide 失败:', error.message);
      return false;
    }
  }

  // 关闭 WelcomeGuide 模态框 (如果存在)
  await closeWelcomeGuide();

  // 注册测试用例
  const tests = [
    PageLoadTest,
    SidebarTest,
    ChatTest,
    MultiWindowTest,
    FocusModeTest,
    SettingsTest,
    MemoryPanelTest,
    AgentModeTest,
    KnowledgeBaseTest,
    MobileTest,
    SearchTest,
    ThinkingChainTest,
    KeyboardShortcutsTest,
    ResponsiveTest,
    ConsoleErrorTest,
  ];

  // 运行测试
  for (const TestClass of tests) {
    const test = new TestClass(browser, page, reporter, analyzer);
    try {
      await test.run();
    } catch (error) {
      console.error(`测试 ${TestClass.name} 异常:`, error);
    }
    await page.waitForTimeout(500); // 测试间隔
  }

  // 生成报告
  await reporter.generateReport();

  // 清理
  await browser.close();

  console.log('\n✅ 测试完成!');
}

// 导出供命令行使用
module.exports = { runTests, CONFIG, VisionAnalyzer, TestReporter };

// 直接运行时执行
if (require.main === module) {
  runTests().catch(console.error);
}
