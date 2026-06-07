// scripts/verify-theme2-fix.mjs
// B2 (THEME-2) Playwright 验证：桌面主题切换实时生效（无需点击"保存"）
//
// 流程：
//  1. 打开首页，等 hydration
//  2. 关闭 WelcomeGuide（如有）
//  3. 点击设置齿轮
//  4. 切换到"外观" Tab
//  5. 点击"深色" 按钮
//  6. 等待 500ms → 检查 html.dark class
//  7. 截图保存到 docs/online/journeys/mobile-theme/11-theme2-realtime.png

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs/online/journeys/mobile-theme');
mkdirSync(OUT, { recursive: true });

const FRONTEND = 'http://localhost:3001';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const log = (label, value) => console.log(`  [${label}] ${value}`);

const results = [];
const record = (name, ok, note = '') => {
  results.push({ name, ok, note });
  log(ok ? 'PASS' : 'FAIL', `${name}${note ? ' - ' + note : ''}`);
};

(async () => {
  console.log('=== B2 THEME-2 桌面主题实时切换验证 ===');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    // ===== 1. 打开首页，等 hydration =====
    log('STEP', '打开首页...');
    await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000); // 等 hydration + rehydrate

    // 初始状态：默认 light，html.dark 应不存在
    const initialDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    log('INFO', `初始 html.dark = ${initialDark}`);
    record('初始无 dark class（默认 light/system）', !initialDark);

    // 清空 storage 确保纯净初始状态
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.clear();
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(3000);

    // ===== 2. 关闭 WelcomeGuide =====
    log('STEP', '关闭 WelcomeGuide...');
    const closeGuideBtn = page.locator('button:has-text("跳过"), button:has-text("关闭"), button:has-text("稍后"), [aria-label*="close"], [aria-label*="关闭"]').first();
    if (await closeGuideBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeGuideBtn.click();
      await sleep(500);
      log('STEP', 'WelcomeGuide 已关闭');
    } else {
      log('STEP', 'WelcomeGuide 未出现或已关闭');
    }

    // ===== 3. 点击设置齿轮 =====
    log('STEP', '点击设置按钮...');
    // 齿轮图标按钮 - 用 title 定位
    const settingsBtn = page.locator('button[title="设置"]').first();
    await settingsBtn.waitFor({ state: 'visible', timeout: 5000 });
    await settingsBtn.click();
    await sleep(800);

    // ===== 4. 切换到"外观" Tab =====
    log('STEP', '切换到外观 Tab...');
    const appearanceTab = page.locator('button:has-text("外观")').first();
    await appearanceTab.waitFor({ state: 'visible', timeout: 3000 });
    await appearanceTab.click();
    await sleep(800);

    // ===== 5. 点击"深色"按钮 =====
    log('STEP', '点击"深色"按钮...');
    // "深色" 文字在 span 内，按钮结构是 motion.button > span
    const darkBtn = page.locator('button:has-text("深色")').first();
    await darkBtn.waitFor({ state: 'visible', timeout: 3000 });
    await darkBtn.click();

    // ===== 6. 等待 500ms 后检查 =====
    log('STEP', '等待 500ms 后检查 html.dark...');
    await sleep(500);
    const afterDark = await page.evaluate(() => ({
      hasDark: document.documentElement.classList.contains('dark'),
      theme: document.documentElement.dataset.theme,
      resolved: document.documentElement.dataset.themeResolved,
    }));
    log('INFO', `dark=${afterDark.hasDark} theme=${afterDark.theme} resolved=${afterDark.resolved}`);

    record('点击"深色"后 html.dark 出现（实时生效）', afterDark.hasDark);
    record('dataset.theme === "dark"', afterDark.theme === 'dark', `实测 "${afterDark.theme}"`);
    record('dataset.themeResolved === "dark"', afterDark.resolved === 'dark', `实测 "${afterDark.resolved}"`);

    // 验证 sessionStorage 已写入（全局 store 同步）
    const sessionStored = await page.evaluate(() => {
      const raw = sessionStorage.getItem('ai-chat-settings');
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return parsed?.state?.settings?.theme || null;
      } catch {
        return null;
      }
    });
    log('INFO', `sessionStorage.ai-chat-settings.theme = ${sessionStored}`);
    record('sessionStorage 实时同步 dark 主题', sessionStored === 'dark', `实测 "${sessionStored}"`);

    // ===== 7. 截图 =====
    const shotPath = join(OUT, '11-theme2-realtime.png');
    await sleep(500);
    await page.screenshot({ path: shotPath, fullPage: false });
    const size = existsSync(shotPath) ? statSync(shotPath).size : 0;
    log('SHOT', `11-theme2-realtime.png (${(size / 1024).toFixed(1)} KB)`);
    record('截图保存', size > 4096, `${(size / 1024).toFixed(1)} KB`);

    // ===== 8. 反向验证：切回"浅色" 立即移除 dark =====
    log('STEP', '反向验证：点击"浅色" 立即移除 dark...');
    const lightBtn = page.locator('button:has-text("浅色")').first();
    await lightBtn.waitFor({ state: 'visible', timeout: 3000 });
    await lightBtn.click();
    await sleep(500);
    const afterLight = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    record('点击"浅色"后 html.dark 移除', !afterLight, `实测 hasDark=${afterLight}`);

    // ===== 9. 持久化验证：刷新后仍然是浅色 =====
    log('STEP', '持久化验证：刷新后 theme=light 仍生效...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(3000);
    const afterReload = await page.evaluate(() => ({
      hasDark: document.documentElement.classList.contains('dark'),
      theme: document.documentElement.dataset.theme,
    }));
    record('刷新后保持 light（无 FOUC）', !afterReload.hasDark, `theme=${afterReload.theme}`);

    if (consoleErrors.length) {
      log('WARN', `${consoleErrors.length} 个 console error (非致命):`);
      consoleErrors.slice(0, 5).forEach((e) => console.log(`    - ${e.slice(0, 200)}`));
    }
  } finally {
    await browser.close();
  }

  // ===== 汇总 =====
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n=== 结果: ${passed}/${results.length} 通过 ===`);
  if (failed > 0) {
    console.error(`FAIL: ${failed} 项验证未通过`);
    results.filter((r) => !r.ok).forEach((r) => console.error(`  - ${r.name}: ${r.note}`));
    process.exit(1);
  }
  process.exit(0);
})();
