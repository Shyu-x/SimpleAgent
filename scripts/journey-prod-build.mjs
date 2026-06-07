// SimpleAgent - 前端生产构建 (standalone) 截图脚本
// 输出到 docs/online/journeys/prod-build/

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs/online/journeys/prod-build');

const FRONTEND = 'http://localhost:3001';
const VIEWPORT = { width: 1440, height: 900 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const shot = async (page, name) => {
  const path = join(OUT, name);
  await page.waitForTimeout(1500);
  await page.screenshot({ path, fullPage: false });
  const size = existsSync(path) ? statSync(path).size : 0;
  const status = size > 1024 ? 'OK' : 'EMPTY';
  console.log(`  [${status}] ${name} (${(size / 1024).toFixed(1)} KB)`);
  return { path, size, status };
};

async function dismissWelcomeGuide(page) {
  try {
    await page.keyboard.press('Escape');
    await sleep(500);
  } catch {}
  const closeBtn = await page.$(
    'button:has-text("跳过"), button:has-text("开始"), button:has-text("知道了"), button[aria-label*="关闭"]'
  );
  if (closeBtn) {
    try {
      await closeBtn.click({ timeout: 1000 });
    } catch {}
  }
}

(async () => {
  console.log('=== SimpleAgent 前端生产构建 (standalone) 截图 ===');
  console.log(`输出目录: ${OUT}`);
  console.log(`视口: ${VIEWPORT.width}x${VIEWPORT.height}`);
  console.log(`目标: ${FRONTEND}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
  });
  page.on('pageerror', (err) =>
    consoleErrors.push(`PAGE ERROR: ${err.message.slice(0, 200)}`)
  );

  const results = [];

  try {
    // === 1. 生产模式主页 ===
    console.log('\n[1/1] 访问生产模式主页...');
    const response = await page.goto(FRONTEND, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    console.log(`  HTTP status: ${response.status()}`);
    await sleep(3000);
    results.push(await shot(page, '01-prod-main.png'));
    await dismissWelcomeGuide(page);

    // 再补一张（关闭引导后）
    await sleep(1000);
    results.push(await shot(page, '01-prod-main-clean.png'));

    if (consoleErrors.length > 0) {
      console.log('\nConsole 错误:');
      consoleErrors.slice(0, 5).forEach((e) => console.log(`  - ${e}`));
    } else {
      console.log('\n无 console 错误');
    }

    const ok = results.filter((r) => r.status === 'OK').length;
    console.log(`\n=== 完成: ${ok}/${results.length} 截图 OK ===`);
    process.exit(0);
  } catch (err) {
    console.error('脚本失败:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
