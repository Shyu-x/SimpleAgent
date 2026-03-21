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

async function dismissBlockingLayer(page) {
  const closeSelectors = [
    'button:has-text("跳过")',
    'button:has-text("稍后")',
    'button:has-text("关闭")',
    'button:has-text("我知道了")',
    'button[aria-label*="关闭"]',
    'button[title*="关闭"]',
  ];

  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Escape').catch(() => {});
    for (const selector of closeSelectors) {
      const btn = page.locator(selector).first();
      if (await btn.count()) {
        await btn.click({ timeout: 1200 }).catch(() => {});
        break;
      }
    }
    await page.waitForTimeout(200);
  }
}

function normalizeBackground(v) {
  return String(v || '').replace(/\s+/g, '').toLowerCase();
}

function isSafeBackground(v) {
  const bg = normalizeBackground(v);
  return (
    bg === '' ||
    bg === 'transparent' ||
    bg === 'rgba(0,0,0,0)' ||
    bg === 'hsla(0,0%,0%,0)'
  );
}

async function run() {
  const tag = nowTag();
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1200);
    await dismissBlockingLayer(page);

    const input = page.locator('textarea').first();
    await input.waitFor({ state: 'visible', timeout: 8000 });

    // 快速连续提交代码块，模拟流式阶段的频繁刷新压力。
    for (let i = 0; i < 10; i++) {
      const payload = `\`\`\`javascript\nfunction demo${i}(){\n  return ${i} + 1;\n}\nconsole.log(demo${i}());\n\`\`\``;
      await input.fill(payload);
      await page.keyboard.press('Control+Enter');
      await page.waitForTimeout(140);
    }

    await page.waitForTimeout(800);

    const metrics = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('.shiki'));
      return nodes.map((el) => {
        const styleAttr = el.getAttribute('style') || '';
        const computed = window.getComputedStyle(el);
        return {
          styleAttr,
          backgroundColor: computed.backgroundColor,
          backgroundImage: computed.backgroundImage,
        };
      });
    });

    const screenshot = path.join(SCREENSHOT_DIR, `${tag}-codeblock-stability.png`);
    await page.screenshot({ path: screenshot, fullPage: true });

    if (!metrics.length) {
      throw new Error('未检测到 .shiki 代码块节点');
    }

    const backgroundViolations = metrics.filter((item) => !isSafeBackground(item.backgroundColor));
    const imageViolations = metrics.filter((item) => normalizeBackground(item.backgroundImage) !== 'none');
    const inlineBlackBackground = metrics.filter((item) =>
      /background(?:-color)?\s*:\s*(?:#000(?:000)?|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/i.test(item.styleAttr),
    );

    if (backgroundViolations.length || imageViolations.length || inlineBlackBackground.length) {
      const report = {
        totalShiki: metrics.length,
        backgroundViolations: backgroundViolations.slice(0, 5),
        imageViolations: imageViolations.slice(0, 5),
        inlineBlackBackground: inlineBlackBackground.slice(0, 5),
        screenshot,
      };
      throw new Error(`代码块背景稳定性校验失败: ${JSON.stringify(report)}`);
    }

    console.log(`PASS codeblock stability: totalShiki=${metrics.length}`);
    console.log(`SCREENSHOT ${screenshot}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch((error) => {
  console.error('FAIL codeblock stability:', error.message);
  process.exit(1);
});
