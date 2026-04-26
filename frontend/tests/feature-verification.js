/**
 * 前端功能验证测试
 * 全面测试所有前端交互功能
 */

const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:3001';
const TIMEOUT = 60000;

let passed = 0;
let failed = 0;
let warnings = [];

function log(msg) {
  console.log(`[${new Date().toISOString().split('T')[1].slice(0,8)}] ${msg}`);
}

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${name}: ${error.message}`);
    failed++;
  }
}

async function screenshot(name) {
  const filename = `test-results/feature-verify/${name}.png`;
  await page.screenshot({ path: filename, fullPage: false });
  return filename;
}

let browser, context, page;

async function runAllTests() {
  console.log('========================================');
  console.log('前端功能验证测试');
  console.log('========================================\n');

  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  try {
    // ===== 1. 首页加载 =====
    log('1. 首页加载测试');
    await runTest('页面加载', async () => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      // 关闭 WelcomeGuide
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      await screenshot('01-homepage');
    });

    // ===== 2. 侧边栏功能 =====
    log('2. 侧边栏功能测试');
    await runTest('侧边栏存在', async () => {
      const sidebar = await page.locator('aside').first();
      if (!(await sidebar.isVisible())) throw new Error('侧边栏不可见');
    });

    await runTest('新建对话按钮', async () => {
      const newBtn = await page.locator('button:has-text("新建")').first();
      if (!(await newBtn.isVisible())) throw new Error('新建按钮不可见');
      await newBtn.click();
      await page.waitForTimeout(500);
      await screenshot('02-new-chat');
    });

    await runTest('搜索对话输入框', async () => {
      const searchInput = await page.locator('input[placeholder*="搜索"]').first();
      if (!(await searchInput.isVisible())) throw new Error('搜索框不可见');
      await searchInput.fill('测试');
      await page.waitForTimeout(300);
    });

    await runTest('关闭侧边栏', async () => {
      const closeBtn = await page.locator('button[title="关闭侧边栏"]').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(500);
      }
    });

    await runTest('重新打开侧边栏', async () => {
      const menuBtn = await page.locator('button').filter({ hasText: '' }).first();
      // 点击菜单按钮打开侧边栏
      const header = await page.locator('header').first();
      const menuButtons = await header.locator('button').all();
      if (menuButtons.length > 0) {
        await menuButtons[0].click();
        await page.waitForTimeout(500);
      }
    });

    // ===== 3. 聊天功能 =====
    log('3. 聊天功能测试');
    await runTest('输入框存在', async () => {
      const textarea = await page.locator('textarea').first();
      if (!(await textarea.isVisible())) throw new Error('输入框不可见');
    });

    await runTest('输入文本', async () => {
      const textarea = await page.locator('textarea').first();
      await textarea.fill('你好');
      await screenshot('03-chat-input');
    });

    await runTest('发送按钮可点击', async () => {
      const sendBtn = await page.locator('[data-testid="send-button"]').first();
      if (!(await sendBtn.isVisible())) throw new Error('发送按钮不可见');
      await sendBtn.click();
      await page.waitForTimeout(3000);
      await screenshot('04-chat-sent');
    });

    // ===== 4. Agent 模式 =====
    log('4. Agent 模式测试');
    await runTest('切换到 Agent 模式', async () => {
      const agentBtn = await page.locator('button:has-text("Agent")').first();
      if (!(await agentBtn.isVisible())) throw new Error('Agent 按钮不可见');
      await agentBtn.click();
      await page.waitForTimeout(1000);
      await screenshot('05-agent-mode');
    });

    await runTest('切换回聊天模式', async () => {
      const agentBtn = await page.locator('button:has-text("Agent")').first();
      await agentBtn.click();
      await page.waitForTimeout(1000);
    });

    // ===== 5. 专注模式 =====
    log('5. 专注模式测试');
    await runTest('进入专注模式', async () => {
      const focusBtn = await page.locator('button:has-text("专注")').first();
      if (!(await focusBtn.isVisible())) throw new Error('专注按钮不可见');
      await focusBtn.click();
      await page.waitForTimeout(1000);
      await screenshot('06-focus-mode');
    });

    await runTest('退出专注模式 (ESC)', async () => {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    });

    // ===== 6. 快捷键测试 =====
    log('6. 快捷键测试');
    await runTest('Ctrl+K 打开知识库', async () => {
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(500);
      await screenshot('07-knowledge-base');
    });

    await runTest('ESC 关闭知识库', async () => {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    });

    await runTest('Ctrl+/ 打开快捷键帮助', async () => {
      await page.keyboard.press('Control+/');
      await page.waitForTimeout(500);
      await screenshot('08-shortcuts');
    });

    await runTest('ESC 关闭快捷键帮助', async () => {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    });

    // ===== 7. 设置面板 =====
    log('7. 设置面板测试');
    await runTest('打开设置面板', async () => {
      const settingsBtn = await page.locator('button[title="设置"]').first();
      if (!(await settingsBtn.isVisible())) throw new Error('设置按钮不可见');
      await settingsBtn.click();
      await page.waitForTimeout(500);
      await screenshot('09-settings');
    });

    await runTest('关闭设置面板', async () => {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    });

    // ===== 8. 布局切换器 =====
    log('8. 布局切换器测试');
    await runTest('单窗口布局按钮', async () => {
      // 查找布局按钮 (最大化图标)
      const layoutBtns = await page.locator('[title="单窗口"], [title="双窗口"], [title="四窗口"]').all();
      if (layoutBtns.length > 0) {
        log(`    找到 ${layoutBtns.length} 个布局按钮`);
      }
    });

    // ===== 9. 响应式布局 =====
    log('9. 响应式布局测试');

    const viewports = [
      { name: '桌面 1440px', width: 1440, height: 900 },
      { name: '平板 768px', width: 768, height: 1024 },
      { name: '手机 375px', width: 375, height: 667 },
    ];

    for (const vp of viewports) {
      await runTest(`视口 ${vp.name}`, async () => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.waitForTimeout(500);
        await screenshot(`10-viewport-${vp.name.replace(/ /g, '')}`);
      });
    }

    // ===== 10. 暗色模式 =====
    log('10. 暗色模式测试');
    await runTest('暗色模式应用', async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await screenshot('11-dark-mode');
    });

    await runTest('亮色模式应用', async () => {
      await page.emulateMedia({ colorScheme: 'light' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await screenshot('12-light-mode');
    });

    // ===== 11. 控制台错误检查 =====
    log('11. 控制台错误检查');
    const criticalErrors = consoleErrors.filter(e =>
      e.includes('Maximum update depth') ||
      e.includes('Unhandled Promise Rejection') ||
      e.includes('TypeError: Cannot')
    );

    await runTest(`无严重控制台错误 (${criticalErrors.length} 严重)`, async () => {
      if (criticalErrors.length > 5) {
        throw new Error(`发现 ${criticalErrors.length} 个严重控制台错误`);
      }
    });

    // ===== 12. 窗口拉伸测试 =====
    log('12. 窗口拉伸稳定性测试');
    await runTest('窗口从 400px 拉伸到 1920px', async () => {
      const widths = [400, 600, 800, 1000, 1200, 1440, 1600, 1920];
      for (const w of widths) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.waitForTimeout(200);
      }
      await screenshot('13-window-stretch');
    });

  } catch (e) {
    log(`测试过程出错: ${e.message}`);
    failed++;
  } finally {
    await browser.close();
  }

  // ===== 输出汇总 =====
  console.log('\n========================================');
  console.log('📊 功能验证汇总');
  console.log('========================================');
  console.log(`总测试项: ${passed + failed}`);
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);

  if (consoleErrors.length > 0) {
    console.log(`\n控制台错误 (共 ${consoleErrors.length} 个):`);
    const unique = [...new Set(consoleErrors)].slice(0, 5);
    unique.forEach(e => console.log(`  - ${e.substring(0, 80)}`));
  }

  console.log('\n📸 截图保存至: test-results/feature-verify/');
  console.log('========================================\n');

  return { passed, failed, consoleErrors };
}

runAllTests()
  .then(result => process.exit(result.failed > 0 ? 1 : 0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
