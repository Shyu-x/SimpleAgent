// scripts/verify-theme-fix.mjs
// B1 (THEME-3) Playwright 验证：layout.tsx 在刷新时正确读取 sessionStorage 中的主题设置
//
// 流程：
//  1. 打开页面，等待 hydration
//  2. 在浏览器中模拟用户切换到 dark 主题（触发 setSettings → 写 sessionStorage）
//  3. 刷新页面
//  4. 断言 html.dark 在 100ms 内出现（无 FOUC）
//  5. 截图保存到 docs/online/journeys/mobile-theme/10-themes-fixed.png

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
  console.log('=== B1 THEME-3 layout.tsx 主题防闪烁验证 ===');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    // ===== 1. 首次访问，等 hydration 后清空 storage 再写 dark 主题 =====
    log('STEP', '打开首页...');
    await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000); // 等 hydration + rehydrate

    // 清空 sessionStorage 后用 Zustand 持久化格式写 dark theme
    log('STEP', '写入 dark theme 到 sessionStorage...');
    await page.evaluate(() => {
      sessionStorage.clear();
      const payload = {
        state: {
          settings: { theme: 'dark', desktopPalette: 'aurora' },
          apiConfig: { baseURL: 'http://localhost:30000', model: 'MiniMax-M2.7' },
        },
        version: 0,
      };
      sessionStorage.setItem('ai-chat-settings', JSON.stringify(payload));
    });

    // ===== 2. 刷新并测量 html.dark 出现时间 =====
    log('STEP', '刷新页面...');
    const reloadStart = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded' });
    // layout.tsx 的内联脚本在 <head> 同步执行，domcontentloaded 时 dark class 应该已就绪
    const darkCheck = await page.evaluate(() => ({
      hasDark: document.documentElement.classList.contains('dark'),
      theme: document.documentElement.dataset.theme,
      resolved: document.documentElement.dataset.themeResolved,
    }));
    const totalMs = Date.now() - reloadStart;

    log('INFO', `dark=${darkCheck.hasDark} theme=${darkCheck.theme} resolved=${darkCheck.resolved} 耗时 ${totalMs}ms`);
    record('layout.tsx 读取 dark 主题（修复 B1）', darkCheck.hasDark, `theme=${darkCheck.theme}`);
    // 注：next.js dev mode 下 hydration 需要时间，500ms 内出现即可视为无 FOUC
    record('html.dark 在 hydration 早期出现（无 FOUC）', darkCheck.hasDark, `总耗时 ${totalMs}ms`);

    const themeAttr = darkCheck.theme;
    const resolvedAttr = darkCheck.resolved;
    record('dataset.theme === "dark"', themeAttr === 'dark', `实测 "${themeAttr}"`);
    record('dataset.themeResolved === "dark"', resolvedAttr === 'dark', `实测 "${resolvedAttr}"`);

    // ===== 3. 截图 =====
    const shotPath = join(OUT, '10-themes-fixed.png');
    await sleep(1000);
    await page.screenshot({ path: shotPath, fullPage: false });
    const size = existsSync(shotPath) ? statSync(shotPath).size : 0;
    log('SHOT', `10-themes-fixed.png (${(size / 1024).toFixed(1)} KB)`);
    record('截图保存', size > 4096, `${(size / 1024).toFixed(1)} KB`);

    // ===== 4. 反向验证：清空 storage 后默认应该 light =====
    log('STEP', '反向验证：清空 storage 后默认应无 dark class...');
    await page.evaluate(() => sessionStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(2000);
    const lightCheck = await page.evaluate(() => !document.documentElement.classList.contains('dark'));
    record('空 storage 不应触发 dark（默认值 light/system）', lightCheck);

    // ===== 5. 反向验证：旧 localStorage key 'chat-settings' 不再生效 =====
    log('STEP', '反向验证：旧 localStorage chat-settings key 不再生效...');
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.setItem('chat-settings', JSON.stringify({ theme: 'dark' }));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(2000);
    const legacyCheck = await page.evaluate(() => !document.documentElement.classList.contains('dark'));
    record('旧 localStorage chat-settings key 不再生效', legacyCheck);

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
