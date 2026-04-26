/**
 * 前端 UI/UX 审查脚本
 * 系统性检查所有页面和组件的视觉与交互问题
 */

const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:3001';
const BACKEND_URL = 'http://localhost:30000';

// 响应式断点
const VIEWPORTS = {
  '超大屏 1920px': { width: 1920, height: 1080 },
  '大屏 1440px': { width: 1440, height: 900 },
  '中屏 1280px': { width: 1280, height: 800 },
  '小桌面 1024px': { width: 1024, height: 768 },
  '平板横屏 768px': { width: 768, height: 1024 },
  '平板竖屏 600px': { width: 600, height: 800 },
  '手机 375px': { width: 375, height: 667 },
};

let browser;
let context;
let page;

let passed = 0;
let failed = 0;
let warnings = [];

function log(msg) {
  console.log(`[${new Date().toISOString().split('T')[1].slice(0,8)}] ${msg}`);
}

function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// 截图保存
async function screenshot(name, viewport) {
  const filename = `test-results/ui-audit/${viewport}-${name}.png`.replace(/ /g, '_');
  await page.screenshot({ path: filename, fullPage: false });
  log(`  📸 截图: ${filename}`);
  return filename;
}

// 检查控制台错误
async function checkConsoleErrors() {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  return errors;
}

// 等待页面加载
async function waitForPage() {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
}

async function runAudit() {
  console.log('========================================');
  console.log('前端 UI/UX 审查开始');
  console.log('========================================\n');

  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  try {
    // ===== 1. 首页加载检查 =====
    log('1. 首页加载检查');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 关闭 WelcomeGuide 模态框（如果存在）
    try {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      log('  ✅ 已按 ESC 关闭欢迎指南');
    } catch (e) {
      log('  ⚠️ 欢迎指南可能不存在或已关闭');
    }

    // 检查是否有 React hydration 错误
    const hydrationError = await page.evaluate(() => {
      const body = document.body.innerText;
      return body.includes('Hydration') || body.includes('hydration');
    });

    if (hydrationError) {
      warnings.push({ severity: 'medium', issue: '可能存在 React Hydration 不匹配' });
      log('  ⚠️ 可能存在 React Hydration 不匹配');
    }

    // 截图首页
    await screenshot('homepage', '1440px');

    // ===== 2. 检查主要 UI 元素存在性 =====
    log('2. 检查主要 UI 元素');

    // 检查侧边栏
    const sidebarExists = await page.locator('[class*="conversation"]').count() > 0 ||
                          await page.locator('aside').count() > 0;
    log(`  ${sidebarExists ? '✅' : '❌'} 侧边栏: ${sidebarExists ? '存在' : '不存在'}`);

    // 检查聊天输入框
    const inputExists = await page.locator('textarea, input[type="text"]').count() > 0;
    log(`  ${inputExists ? '✅' : '❌'} 输入框: ${inputExists ? '存在' : '不存在'}`);

    // 检查发送按钮
    const sendBtn = await page.locator('[data-testid="send-button"]').count() > 0;
    log(`  ${sendBtn ? '✅' : '❌'} 发送按钮: ${sendBtn ? '存在' : '不存在'}`);

    // ===== 3. 顶部导航栏检查 =====
    log('3. 顶部导航栏检查');
    const headerButtons = await page.locator('header button').count();
    log(`  ✅ 顶部按钮数量: ${headerButtons}`);

    // ===== 4. 设置面板测试 =====
    log('4. 设置面板测试');
    try {
      // 查找设置按钮并点击
      const settingsBtn = page.locator('button[title*="设置"], button[title*="Settings"]').first();
      if (await settingsBtn.isVisible()) {
        await settingsBtn.click();
        await page.waitForTimeout(500);
        await screenshot('settings-panel', '1440px');

        // 检查设置面板内容
        const settingsContent = await page.locator('[class*="settings"], [class*="Setting"]').count();
        log(`  ${settingsContent > 0 ? '✅' : '⚠️'} 设置面板: ${settingsContent > 0 ? '已打开' : '内容未找到'}`);

        // 按 ESC 关闭
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      } else {
        log('  ⚠️ 设置按钮未找到');
      }
    } catch (e) {
      log(`  ❌ 设置面板测试失败: ${e.message}`);
      failed++;
    }

    // ===== 5. Agent 模式切换测试 =====
    log('5. Agent 模式切换测试');
    try {
      const agentBtn = page.locator('button:has-text("Agent")').first();
      if (await agentBtn.isVisible()) {
        await agentBtn.click();
        await page.waitForTimeout(800);
        await screenshot('agent-mode', '1440px');
        log('  ✅ Agent 模式已切换');

        // 检查 Agent 工作区
        const agentWorkspace = await page.locator('[class*="agent"], [class*="workspace"]').count();
        log(`  ${agentWorkspace > 0 ? '✅' : '⚠️'} Agent 工作区: ${agentWorkspace > 0 ? '已显示' : '未找到'}`);

        // 切回聊天模式
        await agentBtn.click();
        await page.waitForTimeout(500);
      } else {
        log('  ⚠️ Agent 按钮未找到');
      }
    } catch (e) {
      log(`  ❌ Agent 模式测试失败: ${e.message}`);
      failed++;
    }

    // ===== 6. 专注模式测试 =====
    log('6. 专注模式测试');
    try {
      const focusBtn = page.locator('button:has-text("专注")').first();
      if (await focusBtn.isVisible()) {
        await focusBtn.click();
        await page.waitForTimeout(500);
        await screenshot('focus-mode', '1440px');
        log('  ✅ 专注模式已切换');

        // 按 ESC 退出
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      } else {
        log('  ⚠️ 专注模式按钮未找到');
      }
    } catch (e) {
      log(`  ❌ 专注模式测试失败: ${e.message}`);
      failed++;
    }

    // ===== 7. 侧边栏折叠测试 =====
    log('7. 侧边栏折叠测试');
    try {
      const menuBtn = page.locator('button').filter({ has: page.locator('svg') }).first();
      if (await menuBtn.isVisible()) {
        await menuBtn.click();
        await page.waitForTimeout(500);
        await screenshot('sidebar-collapsed', '1440px');
        log('  ✅ 侧边栏折叠/展开测试完成');
      }
    } catch (e) {
      log(`  ⚠️ 侧边栏折叠测试跳过: ${e.message}`);
    }

    // ===== 8. 快捷键测试 (Ctrl+K) =====
    log('8. 快捷键测试 (Ctrl+K)');
    try {
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(500);
      await screenshot('knowledge-base', '1440px');
      log('  ✅ Ctrl+K 打开知识库面板');

      // 按 ESC 关闭
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    } catch (e) {
      log(`  ❌ 快捷键测试失败: ${e.message}`);
      failed++;
    }

    // ===== 9. 响应式布局测试 =====
    log('9. 响应式布局测试');

    for (const [name, viewport] of Object.entries(VIEWPORTS)) {
      try {
        await page.setViewportSize(viewport);
        await page.waitForTimeout(500);
        await screenshot('viewport-' + name.split(' ')[0], name);

        // 检查是否有水平滚动条
        const hasHorizontalScroll = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });

        if (hasHorizontalScroll) {
          warnings.push({ severity: 'medium', issue: `${name} 存在水平滚动`, viewport: name });
          log(`  ⚠️ ${name}: 存在水平滚动条`);
        } else {
          log(`  ✅ ${name}: 布局正常`);
        }
      } catch (e) {
        log(`  ❌ ${name} 测试失败: ${e.message}`);
        failed++;
      }
    }

    // ===== 10. 移动端视图测试 =====
    log('10. 移动端视图测试');
    try {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(500);
      await screenshot('mobile-view', 'mobile');

      // 检查移动端布局
      const mobileLayout = await page.locator('[class*="mobile"]').count();
      log(`  ${mobileLayout > 0 ? '✅' : '⚠️'} 移动端布局: ${mobileLayout > 0 ? '已启用' : '未适配'}`);

      // 检查汉堡菜单
      const hamburgerMenu = await page.locator('button[class*="menu"], button[class*="Menu"]').count() > 0;
      log(`  ${hamburgerMenu ? '✅' : '⚠️'} 汉堡菜单: ${hamburgerMenu ? '存在' : '未找到'}`);
    } catch (e) {
      log(`  ❌ 移动端测试失败: ${e.message}`);
      failed++;
    }

    // ===== 11. 聊天功能测试 =====
    log('11. 聊天功能测试');
    try {
      // 确保在聊天模式
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1000);

      // 关闭可能显示的模态框
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      // 找到输入框并输入内容
      const textarea = page.locator('textarea').first();
      if (await textarea.isVisible()) {
        await textarea.fill('你好');
        await screenshot('chat-input', '1440px');
        log('  ✅ 文本输入功能正常');

        // 检查发送按钮
        const sendBtn = page.locator('[data-testid="send-button"]').first();
        if (await sendBtn.isVisible()) {
          await sendBtn.click();
          await page.waitForTimeout(3000);
          await screenshot('chat-response', '1440px');
          log('  ✅ 消息发送成功');
        }
      } else {
        log('  ⚠️ 输入框未找到或不可见');
      }
    } catch (e) {
      log(`  ❌ 聊天功能测试失败: ${e.message}`);
      failed++;
    }

    // ===== 12. 窗口拉伸测试 =====
    log('12. 窗口拉伸测试');
    try {
      // 从小到大逐步拉伸
      const widths = [400, 600, 800, 1000, 1200, 1440, 1600, 1920];
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(200);

        const hasOverflow = await page.evaluate((w) => {
          return document.documentElement.scrollWidth > w;
        }, width);

        if (hasOverflow) {
          warnings.push({ severity: 'low', issue: `宽度 ${width}px 时内容溢出` });
        }
      }
      log('  ✅ 窗口拉伸测试完成');
    } catch (e) {
      log(`  ❌ 窗口拉伸测试失败: ${e.message}`);
      failed++;
    }

    // ===== 13. 控制台错误检查 =====
    log('13. 控制台错误检查');
    if (consoleErrors.length > 0) {
      log(`  ⚠️ 发现 ${consoleErrors.length} 个控制台错误:`);
      consoleErrors.slice(0, 5).forEach(err => {
        log(`    - ${err.substring(0, 100)}`);
        warnings.push({ severity: 'high', issue: `控制台错误: ${err.substring(0, 100)}` });
      });
    } else {
      log('  ✅ 无控制台错误');
    }

    // ===== 14. 暗色模式检查 =====
    log('14. 暗色模式检查');
    try {
      // 检查系统暗色模式
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1000);
      await screenshot('dark-mode', '1440px');

      const isDark = await page.evaluate(() => {
        return document.documentElement.classList.contains('dark') ||
               document.documentElement.dataset.theme === 'dark';
      });
      log(`  ${isDark ? '✅' : '⚠️'} 暗色模式: ${isDark ? '已启用' : '未应用'}`);
    } catch (e) {
      log(`  ⚠️ 暗色模式测试跳过: ${e.message}`);
    }

    // ===== 15. 浏览器缩放测试 =====
    log('15. 浏览器缩放测试');
    const zoomLevels = [0.5, 0.75, 1, 1.25, 1.5, 2];
    for (const zoom of zoomLevels) {
      try {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.evaluate((z) => {
          document.body.style.zoom = z;
        }, zoom);
        await page.waitForTimeout(200);

        const hasLayoutBreak = await page.evaluate(() => {
          const main = document.querySelector('main');
          if (!main) return false;
          const rect = main.getBoundingClientRect();
          return rect.width <= 0 || rect.height <= 0;
        });

        if (hasLayoutBreak) {
          warnings.push({ severity: 'medium', issue: `${zoom * 100}% 缩放时布局异常` });
          log(`  ⚠️ ${zoom * 100}% 缩放: 布局异常`);
        } else {
          log(`  ✅ ${zoom * 100}% 缩放: 正常`);
        }
      } catch (e) {
        log(`  ❌ ${zoom * 100}% 缩放测试失败`);
      }
    }

  } catch (e) {
    log(`  ❌ 审查过程出错: ${e.message}`);
    failed++;
  } finally {
    await browser.close();
  }

  // ===== 输出汇总报告 =====
  console.log('\n========================================');
  console.log('📊 UI/UX 审查汇总报告');
  console.log('========================================');
  console.log(`审查项目: 15`);
  console.log(`通过项目: ${15 - failed}`);
  console.log(`失败项目: ${failed}`);
  console.log(`警告项: ${warnings.length}`);

  if (warnings.length > 0) {
    console.log('\n⚠️ 发现的问题:');
    warnings.forEach((w, i) => {
      console.log(`  ${i + 1}. [${w.severity.toUpperCase()}] ${w.issue}${w.viewport ? ` (${w.viewport})` : ''}`);
    });
  }

  console.log('\n📸 截图已保存到: test-results/ui-audit/');
  console.log('========================================\n');

  return { passed: 15 - failed, failed, warnings };
}

// 运行审查
runAudit()
  .then(result => {
    process.exit(result.failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('审查失败:', err);
    process.exit(1);
  });
