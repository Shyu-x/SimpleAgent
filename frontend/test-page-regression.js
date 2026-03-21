const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const HEADLESS = process.env.HEADLESS !== 'false';
const SCREENSHOT_DIR = path.join(__dirname, 'test-screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function nowTag() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
}

async function shot(page, name, tag) {
  const file = path.join(SCREENSHOT_DIR, `${tag}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    if (await loc.count()) {
      try {
        await loc.waitFor({ state: 'visible', timeout: 1200 });
        return loc;
      } catch {
        continue;
      }
    }
  }
  return null;
}

async function dismissBlockingLayer(page) {
  // 处理欢迎引导/浮层等阻塞点击的覆盖层
  const closeSelectors = [
    'button:has-text("跳过")',
    'button:has-text("稍后")',
    'button:has-text("关闭")',
    'button:has-text("我知道了")',
    'button[aria-label*="关闭"]',
    'button[title*="关闭"]'
  ];

  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Escape').catch(() => {});
    const btn = await firstVisible(page, closeSelectors);
    if (btn) {
      await btn.click({ timeout: 1200 }).catch(() => {});
    }
    await page.waitForTimeout(250);
  }
}

async function waitForEnabled(locator, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if ((await locator.count()) && (await locator.isEnabled())) {
      return true;
    }
    await locator.page().waitForTimeout(200);
  }
  return false;
}

async function run() {
  const tag = nowTag();
  const browser = await chromium.launch({ headless: HEADLESS });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();

  const result = {
    appUrl: APP_URL,
    runAt: new Date().toISOString(),
    checks: []
  };

  const push = (name, status, detail, screenshot) => {
    result.checks.push({ name, status, detail, screenshot });
    console.log(`${status === 'PASS' ? 'PASS' : 'FAIL'} ${name} - ${detail}`);
  };

  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1200);
  await dismissBlockingLayer(page);
  push('页面加载', 'PASS', '主页面加载成功', await shot(page, 'desktop-home', tag));

  const runCheck = async (name, fn, failShotName) => {
    try {
      await fn();
    } catch (error) {
      push(name, 'FAIL', error.message, await shot(page, failShotName, tag));
    }
  };

  // 1) 输入框
  const input = page.locator('textarea').first();
  await runCheck('输入框', async () => {
    await input.waitFor({ state: 'visible', timeout: 6000 });
    await dismissBlockingLayer(page);
    const enabled = await waitForEnabled(input);
    if (!enabled) throw new Error('输入框可见但未启用');
    push('输入框', 'PASS', '检测到可输入聊天框', await shot(page, 'input-visible', tag));
  }, 'input-fail');

  // 2) 历史切换（ArrowUp / ArrowDown）
  await runCheck('历史切换', async () => {
    const enabled = await waitForEnabled(input);
    if (!enabled) throw new Error('输入框未启用，无法验证历史切换');

    const firstMsg = `回归测试第一条-${Date.now()}`;
    const secondMsg = `回归测试第二条-${Date.now()}`;

    await input.fill(firstMsg);
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(500);
    await input.fill(secondMsg);
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(650);

    await input.click();
    await input.fill('');
    await page.keyboard.press('ArrowUp');
    const up1 = await input.inputValue();
    await page.keyboard.press('ArrowUp');
    const up2 = await input.inputValue();
    await page.keyboard.press('ArrowDown');
    const down1 = await input.inputValue();

    const historyOk = up1.includes(secondMsg) && up2.includes(firstMsg) && down1.includes(secondMsg);
    if (!historyOk) {
      throw new Error(`历史切换异常 up1="${up1}" up2="${up2}" down1="${down1}"`);
    }
    push('历史切换', 'PASS', '上下键可在历史消息间切换', await shot(page, 'history-switch', tag));
  }, 'history-fail');

  // 3) 模板面板
  await runCheck('模板面板', async () => {
    const templateBtn = await firstVisible(page, [
      'button[title="智能体"]',
      'button[title*="智能体"]',
      'button[title*="Agent"]',
      'button:has-text("智能体")'
    ]);
    if (!templateBtn) throw new Error('未找到智能体模板入口按钮');

    await templateBtn.click();
    await page.waitForTimeout(700);
    const panelText = await page.content();
    const ok = /(选择智能工作流模板|选择预设的多Agent协作工作流|调研写作|代码开发|多角度分析)/.test(panelText);
    if (!ok) throw new Error('未检测到智能体模板面板内容');
    push('模板面板', 'PASS', '智能体模板面板可打开', await shot(page, 'template-panel', tag));
    try {
      const closeBtn = await firstVisible(page, ['button[aria-label="关闭智能体面板"]']);
      if (closeBtn) {
        await closeBtn.click({ timeout: 1200 });
      } else {
        await page.keyboard.press('Escape');
      }
    } catch {
      await page.keyboard.press('Escape').catch(() => {});
    }
    await page.waitForTimeout(300);
  }, 'template-fail');

  // 4) 工具市场
  await runCheck('工具市场', async () => {
    const toolBtn = await firstVisible(page, [
      'button[title*="工具市场"]',
      'button[title*="工具"]',
      'button[title*="Tool"]',
      'button:has-text("工具市场")',
      'button:has-text("工具")'
    ]);
    if (!toolBtn) throw new Error('未找到工具市场入口按钮');

    await toolBtn.click();
    await page.waitForTimeout(700);
    const panelText = await page.content();
    const ok = /(工具市场|工具|Tool|插件)/.test(panelText);
    if (!ok) throw new Error('未检测到工具市场面板内容');
    push('工具市场', 'PASS', '工具市场可打开', await shot(page, 'tool-market', tag));
    try {
      const closeBtn = await firstVisible(page, ['button[aria-label="关闭工具市场面板"]']);
      if (closeBtn) {
        await closeBtn.click({ timeout: 1200 });
      } else {
        await page.keyboard.press('Escape');
      }
    } catch {
      await page.keyboard.press('Escape').catch(() => {});
    }
    await page.waitForTimeout(300);
  }, 'tool-fail');

  // 5) 记忆面板
  await runCheck('记忆面板', async () => {
    const memoryBtn = await firstVisible(page, [
      'button[title*="记忆"]',
      'button[title*="Memory"]',
      'button:has-text("记忆")',
      'button:has-text("Memory")'
    ]);
    if (!memoryBtn) throw new Error('未找到记忆入口按钮');

    await memoryBtn.click();
    await page.waitForTimeout(700);
    const panelText = await page.content();
    const ok = /(会话记忆|记忆|Memory|memory)/.test(panelText);
    if (!ok) throw new Error('未检测到记忆面板内容');
    push('记忆面板', 'PASS', '记忆面板可打开', await shot(page, 'memory-panel', tag));
    try {
      const closeBtn = await firstVisible(page, ['button[aria-label="关闭记忆面板"]']);
      if (closeBtn) {
        await closeBtn.click({ timeout: 1200 });
      } else {
        await page.keyboard.press('Escape');
      }
    } catch {
      await page.keyboard.press('Escape').catch(() => {});
    }
    await page.waitForTimeout(300);
  }, 'memory-fail');

  // 6) 移动端入口
  try {
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    });
    const mPage = await mobile.newPage();
    await mPage.goto(APP_URL, { waitUntil: 'networkidle', timeout: 45000 });
    await mPage.waitForTimeout(1200);

    const menuBtn = mPage.locator('button[aria-label*="菜单"]').first();
    const bottomNav = mPage.locator('nav').first();

    const hasMenu = await menuBtn.count();
    const hasNav = await bottomNav.count();

    const ok = Boolean(hasMenu || hasNav);
    push('移动端入口', ok ? 'PASS' : 'FAIL', ok ? '检测到移动端菜单或底部导航入口' : '未检测到移动端入口', await shot(mPage, 'mobile-entry', tag));
    await mobile.close();
  } catch (error) {
    push('移动端入口', 'FAIL', error.message, null);
  }

  await desktop.close();
  await browser.close();

  const pass = result.checks.filter(c => c.status === 'PASS').length;
  const fail = result.checks.length - pass;
  result.summary = { pass, fail, total: result.checks.length };

  const reportPath = path.join(SCREENSHOT_DIR, `${tag}-page-regression-report.json`);
  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`REPORT ${reportPath}`);
  console.log(`SUMMARY pass=${pass} fail=${fail} total=${result.checks.length}`);
}

run().catch((error) => {
  console.error('回归脚本异常:', error);
  process.exit(1);
});
