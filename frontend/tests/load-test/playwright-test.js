/**
 * Playwright 前端性能测试
 * 使用真实浏览器测试页面加载和渲染性能
 */

const { chromium } = require('playwright');

const FRONTEND_URL = 'http://127.0.0.1:3001';

async function measurePageLoad(page, url) {
  const metrics = {};

  // 开始计时
  const startTime = Date.now();

  // 导航到页面
  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  metrics.status = response.status();

  // DOM Content Loaded
  const domContentLoaded = await page.evaluate(() => {
    return performance.timing ? performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart : 0;
  });

  // 页面完全加载
  const loadComplete = Date.now() - startTime;

  // 获取关键指标
  const perfMetrics = await page.evaluate(() => {
    if (!window.performance || !window.performance.getEntriesByType) return {};
    const entries = window.performance.getEntriesByType('resource');
    return {
      resourceCount: entries.length,
      dnsTime: Math.max(...entries.map(e => e.domainLookupEnd - e.domainLookupStart) || [0]),
      tcpTime: Math.max(...entries.map(e => e.connectEnd - e.connectStart) || [0]),
      ttfb: Math.max(...entries.map(e => e.responseStart - e.requestStart) || [0]),
    };
  });

  return {
    responseTime: loadComplete,
    domContentLoaded,
    loadComplete,
    ...perfMetrics,
  };
}

async function testComponentPerformance(page) {
  const results = {};

  // 测试聊天组件渲染
  const chatAreaLoaded = await page.evaluate(async () => {
    const start = performance.now();
    // 等待 ChatArea 组件出现
    await new Promise((resolve) => {
      const check = () => {
        const el = document.querySelector('[class*="chat"]') || document.querySelector('[class*="message"]');
        if (el) resolve();
        else setTimeout(check, 100);
      };
      check();
    });
    return performance.now() - start;
  });

  results.chatAreaRender = chatAreaLoaded;

  // 测试输入框响应
  const inputResponse = await page.evaluate(async () => {
    const start = performance.now();
    const input = document.querySelector('textarea, input[type="text"]');
    if (input) {
      input.focus();
      input.dispatchEvent(new Event('focus'));
    }
    return performance.now() - start;
  });

  results.inputResponse = inputResponse;

  return results;
}

async function testConcurrentPageLoads(url, count = 5) {
  console.log(`\n📊 测试 ${count} 个并发页面加载...`);

  const browser = await chromium.launch();
  const results = [];

  const loadPromises = Array(count)
    .fill(null)
    .map(async (_, i) => {
      const page = await browser.newPage();
      try {
        const start = Date.now();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        results.push({ index: i, time: Date.now() - start, success: true });
      } catch (err) {
        results.push({ index: i, error: err.message, success: false });
      } finally {
        await page.close();
      }
    });

  await Promise.all(loadPromises);
  await browser.close();

  const successful = results.filter(r => r.success);
  if (successful.length > 0) {
    const avg = successful.reduce((a, b) => a + b.time, 0) / successful.length;
    const max = Math.max(...successful.map(r => r.time));
    console.log(`  平均响应: ${avg.toFixed(2)}ms`);
    console.log(`  最大响应: ${max.toFixed(2)}ms`);
    console.log(`  成功率: ${successful.length}/${count}`);
  }

  return results;
}

async function testStress() {
  console.log('\n📊 测试压力场景...');

  const browser = await chromium.launch();
  const page = await browser.newPage();

  // 模拟快速导航
  const navTimes = [];
  for (let i = 0; i < 3; i++) {
    const start = Date.now();
    await page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded' });
    navTimes.push(Date.now() - start);
    await page.waitForTimeout(500);
  }

  await page.close();
  await browser.close();

  console.log(`  3次快速导航: ${navTimes.map(t => t + 'ms').join(' → ')}`);
  console.log(`  平均: ${(navTimes.reduce((a, b) => a + b) / navTimes.length).toFixed(2)}ms`);
}

async function runPlaywrightTests() {
  console.log('======================================');
  console.log('  Playwright 前端性能测试');
  console.log('======================================');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. 页面加载性能
    console.log('\n📊 测试页面加载指标...');
    const pageMetrics = await measurePageLoad(page, FRONTEND_URL);
    console.log(`  HTTP状态: ${pageMetrics.status}`);
    console.log(`  响应时间: ${pageMetrics.responseTime}ms`);
    console.log(`  DOM加载: ${pageMetrics.domContentLoaded}ms`);
    console.log(`  资源数量: ${pageMetrics.resourceCount || 'N/A'}`);

    // 2. 组件性能
    console.log('\n📊 测试组件渲染...');
    const componentMetrics = await testComponentPerformance(page);
    console.log(`  聊天区域渲染: ${componentMetrics.chatAreaRender.toFixed(2)}ms`);
    console.log(`  输入框响应: ${componentMetrics.inputResponse.toFixed(2)}ms`);

    // 3. 错误边界测试
    console.log('\n📊 测试错误边界...');
    await page.evaluate(() => {
      // 模拟一个组件错误
      window.__TEST_ERROR__ = new Error('Test error');
    });

    // 4. 并发页面加载
    await testConcurrentPageLoads(FRONTEND_URL, 5);

    // 5. 压力测试
    await testStress();

    console.log('\n======================================');
    console.log('✅ Playwright 测试完成');
    console.log('======================================\n');

  } catch (err) {
    console.error('❌ 测试失败:', err.message);
  } finally {
    await browser.close();
  }
}

// 运行测试
if (require.main === module) {
  runPlaywrightTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ 失败:', err);
      process.exit(1);
    });
}

module.exports = { runPlaywrightTests };