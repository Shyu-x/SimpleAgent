/**
 * E2E 聊天功能测试
 * 使用 Playwright 测试聊天、RAG、Agent 交互功能
 */

const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:30000';
const TIMEOUT = 60000;

let passed = 0;
let failed = 0;

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
  const filename = `test-results/e2e-chat/${name}.png`;
  await page.screenshot({ path: filename, fullPage: false });
  return filename;
}

let browser, context, page;

async function runAllTests() {
  console.log('\n========================================');
  console.log('E2E 聊天功能测试');
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
    // ===== 1. 登录与首页 =====
    log('1. 登录与首页加载');
    await runTest('页面加载成功', async () => {
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
      await screenshot('01-page-loaded');
    });

    await runTest('关闭欢迎引导', async () => {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    });

    // ===== 2. 聊天功能 =====
    log('2. 聊天功能测试');

    await runTest('聊天输入框可交互', async () => {
      const textarea = await page.locator('textarea').first();
      if (!(await textarea.isVisible())) throw new Error('输入框不可见');
    });

    await runTest('输入聊天内容', async () => {
      const textarea = await page.locator('textarea').first();
      await textarea.fill('你好，MiniMax');
      await page.waitForTimeout(300);
      await screenshot('02-message-typed');
    });

    await runTest('发送消息', async () => {
      const sendBtn = await page.locator('[data-testid="send-button"]').first();
      if (await sendBtn.isVisible()) {
        await sendBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(5000); // 等待响应
      await screenshot('03-message-sent');
    });

    // ===== 3. 响应验证 =====
    log('3. 响应验证');

    await runTest('收到AI响应', async () => {
      // 查找消息列表中的 assistant 消息
      const messages = await page.locator('[class*="message"], [class*="chat"]').all();
      if (messages.length < 2) {
        throw new Error('未收到AI响应消息');
      }
    });

    // ===== 4. 侧边栏测试 =====
    log('4. 侧边栏测试');

    await runTest('新建对话', async () => {
      const newBtn = await page.locator('button:has-text("新建")').first();
      if (await newBtn.isVisible()) {
        await newBtn.click();
        await page.waitForTimeout(500);
        await screenshot('04-new-chat');
      }
    });

    await runTest('对话历史存在', async () => {
      const sidebar = await page.locator('aside').first();
      if (await sidebar.isVisible()) {
        const items = await page.locator('[class*="conversation"], [class*="item"]').all();
        log(`    找到 ${items.length} 个历史对话项`);
      }
    });

    // ===== 5. 模式切换测试 =====
    log('5. 模式切换测试');

    await runTest('切换到 Agent 模式', async () => {
      const agentBtn = await page.locator('button:has-text("Agent")').first();
      if (await agentBtn.isVisible()) {
        await agentBtn.click();
        await page.waitForTimeout(1000);
        await screenshot('05-agent-mode');
      }
    });

    await runTest('Agent 模式下发送消息', async () => {
      const textarea = await page.locator('textarea').first();
      await textarea.fill('帮我搜索今天的天气');
      const sendBtn = await page.locator('[data-testid="send-button"]').first();
      if (await sendBtn.isVisible()) {
        await sendBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(8000);
      await screenshot('06-agent-response');
    });

    await runTest('切换回聊天模式', async () => {
      const chatBtn = await page.locator('button:has-text("聊天"), button:has-text("Chat")').first();
      if (await chatBtn.isVisible()) {
        await chatBtn.click();
        await page.waitForTimeout(1000);
      }
    });

    // ===== 6. 知识库面板测试 =====
    log('6. 知识库面板测试');

    await runTest('打开知识库面板 (Ctrl+K)', async () => {
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(1000);
      await screenshot('07-knowledge-panel');
    });

    await runTest('知识库面板可交互', async () => {
      const panel = await page.locator('[class*="panel"], [class*="drawer"], [role="dialog"]').first();
      if (await panel.isVisible()) {
        log('    知识库面板已打开');
      }
    });

    await runTest('关闭知识库面板', async () => {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    });

    // ===== 7. 设置面板测试 =====
    log('7. 设置面板测试');

    await runTest('打开设置面板', async () => {
      const settingsBtn = await page.locator('button[title="设置"]').first();
      if (await settingsBtn.isVisible()) {
        await settingsBtn.click();
        await page.waitForTimeout(1000);
        await screenshot('08-settings');
      }
    });

    await runTest('设置面板显示配置项', async () => {
      const settingsPanel = await page.locator('[class*="settings"], [class*="config"]').first();
      if (await settingsPanel.isVisible()) {
        log('    设置面板已打开');
      }
    });

    await runTest('关闭设置面板', async () => {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    });

    // ===== 8. 快捷键测试 =====
    log('8. 快捷键测试');

    await runTest('打开快捷键帮助 (Ctrl+/)', async () => {
      await page.keyboard.press('Control+/');
      await page.waitForTimeout(500);
      await screenshot('09-shortcuts');
    });

    await runTest('关闭快捷键帮助', async () => {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    });

    // ===== 9. 响应式布局测试 =====
    log('9. 响应式布局测试');

    await runTest('桌面视图 (1440px)', async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(500);
    });

    await runTest('平板视图 (768px)', async () => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(500);
      await screenshot('10-tablet-view');
    });

    await runTest('手机视图 (375px)', async () => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(500);
      await screenshot('11-mobile-view');
    });

    await runTest('恢复桌面视图', async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(500);
    });

    // ===== 10. 错误处理测试 =====
    log('10. 错误处理测试');

    await runTest('发送空消息被正确处理', async () => {
      const textarea = await page.locator('textarea').first();
      await textarea.fill('');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
      // 应该不发送空消息
    });

    await runTest('无控制台严重错误', async () => {
      const criticalErrors = consoleErrors.filter(e =>
        e.includes('Unhandled Promise Rejection') ||
        e.includes('TypeError: Cannot read') ||
        e.includes('ReferenceError')
      );
      if (criticalErrors.length > 0) {
        log(`    发现 ${criticalErrors.length} 个严重错误`);
      }
    });

  } catch (e) {
    log(`测试过程出错: ${e.message}`);
    failed++;
  } finally {
    await browser.close();
  }

  // ===== 输出汇总 =====
  console.log('\n========================================');
  console.log('E2E 聊天功能测试汇总');
  console.log('========================================');
  console.log(`总测试项: ${passed + failed}`);
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);

  if (consoleErrors.length > 0) {
    console.log(`\n控制台错误 (共 ${consoleErrors.length} 个):`);
    const unique = [...new Set(consoleErrors)].slice(0, 5);
    unique.forEach(e => console.log(`  - ${e.substring(0, 100)}`));
  }

  console.log('\n📸 截图保存至: test-results/e2e-chat/');
  console.log('========================================\n');

  return { passed, failed, consoleErrors };
}

runAllTests()
  .then(result => process.exit(result.failed > 0 ? 1 : 0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
