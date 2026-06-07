// SimpleAgent - React 19 styled-jsx 修复验证脚本
// 任务：访问 http://localhost:3001，等待 5s，统计 React warning 数量，截图
// 输出：docs/online/journeys/conversation/09-react19-no-warning.png

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync, readdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs/online/journeys/conversation');
const SHOT = join(OUT, '09-react19-no-warning.png');

const FRONTEND = 'http://localhost:3001';
const VIEWPORT = { width: 1440, height: 900 };
const WAIT_MS = 5000; // 等待 React warning 浮标出现

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('=== React 19 styled-jsx 修复验证 ===');
  console.log(`目标: ${FRONTEND}`);
  console.log(`等待时长: ${WAIT_MS}ms`);
  console.log(`输出截图: ${SHOT}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  // === 收集所有 console 消息 ===
  const allMessages = [];
  const reactWarnings = [];
  const consoleErrors = [];

  page.on('console', (msg) => {
    const entry = {
      type: msg.type(),
      text: msg.text(),
      location: msg.location(),
    };
    allMessages.push(entry);

    // React warning 检测：
    // 1. msg.type() === 'warning' 或 'warn'
    // 2. 或文本包含 "Warning:" / "received `%s`" 等 React 19 兼容性问题
    if (msg.type() === 'warning' || msg.type() === 'warn') {
      reactWarnings.push(entry);
    } else if (
      /Warning:/.test(msg.text()) ||
      /Received `%s` for a non-boolean attribute/.test(msg.text()) ||
      /styled-jsx/.test(msg.text())
    ) {
      reactWarnings.push(entry);
    }

    if (msg.type() === 'error') {
      consoleErrors.push(entry);
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push({ type: 'pageerror', text: err.message });
  });

  // === 1. 访问主页 ===
  console.log('\n[1/3] 访问主页...');
  await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // 等待页面 JS 加载完成
  try {
    await page.waitForLoadState('networkidle', { timeout: 10000 });
  } catch (e) {
    console.log('  [warn] networkidle 超时，继续');
  }

  // === 2. 等待 5 秒让 React warning 浮标出现 ===
  console.log(`[2/3] 等待 ${WAIT_MS}ms 让 React 收集 warning...`);
  await sleep(WAIT_MS);

  // === 3. 截取带浮标的整页截图 ===
  console.log('[3/3] 截图...');
  await page.screenshot({ path: SHOT, fullPage: false });
  const size = existsSync(SHOT) ? statSync(SHOT).size : 0;
  console.log(`  截图大小: ${(size / 1024).toFixed(1)} KB`);

  // === 4. 尝试读取 Next.js dev overlay 的 "Issues" 浮标 ===
  let overlayBadge = null;
  let overlayText = null;
  try {
    // Next.js 16 dev overlay 浮标（通常在左下角）
    // 不同版本的 selector: nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog-overlay]
    const candidateSelectors = [
      'nextjs-portal',
      '[data-nextjs-toast]',
      '[data-next-mark]',
      '[data-nextjs-build-error-toast]',
      'button[data-nextjs-errors-dialog-left-right]',
    ];
    for (const sel of candidateSelectors) {
      const handle = await page.$(sel);
      if (handle) {
        const text = await handle.evaluate((el) => el.innerText || el.textContent || '');
        const html = await handle.evaluate((el) => el.outerHTML.slice(0, 200));
        overlayText = text.trim().slice(0, 100);
        overlayBadge = { selector: sel, text: overlayText, html };
        break;
      }
    }
  } catch (e) {
    console.log('  [warn] 读取 dev overlay 失败:', e.message.slice(0, 100));
  }

  // 备用方案：查找文本 "Issues" / "N Issues"
  let issuesBadgeText = null;
  if (!overlayText) {
    try {
      issuesBadgeText = await page.evaluate(() => {
        // 查找左下角所有 button/div 包含 "Issue" 文本
        const all = Array.from(document.querySelectorAll('button, a, div, span'));
        const candidates = all
          .map((el) => el.textContent || '')
          .filter((t) => /Issue|Error|Warning/.test(t))
          .map((t) => t.trim().slice(0, 50))
          .filter((t, i, arr) => arr.indexOf(t) === i)
          .slice(0, 10);
        return candidates;
      });
    } catch (e) {}
  }

  await browser.close();

  // === 输出结果 ===
  console.log('\n=== 验证结果 ===');
  console.log(`console 总消息数: ${allMessages.length}`);
  console.log(`console error 数: ${consoleErrors.length}`);
  console.log(`React warning 数: ${reactWarnings.length}`);

  if (overlayBadge) {
    console.log(`Next.js dev overlay 浮标:`);
    console.log(`  selector: ${overlayBadge.selector}`);
    console.log(`  text: "${overlayBadge.text}"`);
  } else if (issuesBadgeText && issuesBadgeText.length > 0) {
    console.log(`Issues 相关文本: ${JSON.stringify(issuesBadgeText)}`);
  } else {
    console.log('Next.js dev overlay 浮标: 未检测到（可能无 warning 时不显示）');
  }

  if (reactWarnings.length > 0) {
    console.log('\n[React warnings 详情]');
    reactWarnings.slice(0, 5).forEach((w, i) => {
      console.log(`  ${i + 1}. [${w.type}] ${w.text.slice(0, 200)}`);
    });
  }

  if (consoleErrors.length > 0) {
    console.log('\n[Console errors 详情]');
    consoleErrors.slice(0, 5).forEach((e, i) => {
      console.log(`  ${i + 1}. [${e.type}] ${e.text.slice(0, 200)}`);
    });
  }

  // === 报告 ===
  const warningCount = reactWarnings.length;
  const pass = warningCount === 0;

  const badgeStatus = overlayBadge
    ? `显示 "${overlayBadge.text}"`
    : issuesBadgeText && issuesBadgeText.length > 0
    ? `检测到 ${issuesBadgeText.length} 个 Issues 文本`
    : '无浮标';

  console.log('\n=== 报告 ===');
  console.log(`warning 数量: ${warningCount}`);
  console.log(`浮标状态: ${badgeStatus}`);
  console.log(`截图: docs/online/journeys/conversation/09-react19-no-warning.png (${(size / 1024).toFixed(1)} KB)`);
  console.log(`结论: ${pass ? 'PASS' : 'FAIL'}（PASS = warning=0）`);

  process.exit(pass ? 0 : 1);
})().catch((e) => {
  console.error('脚本异常:', e);
  process.exit(2);
});
