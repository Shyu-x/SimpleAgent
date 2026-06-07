// SimpleAgent - i18n 中英切换 journey 截图脚本
// 真实场景：Wave 8.2 后, 用户在右上角切换 zh-CN / en-US, 验证主聊天页 + 侧边栏 + 设置面板文案
// 当前 i18n agent 进行中, 截主页面 (默认 zh-CN) 作为占位
// 真实运行:  node scripts/journey-i18n.mjs --live
// 默认 dry-run:  仅生成占位 PNG, 不启动浏览器

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs/online/journeys/i18n');
mkdirSync(OUT, { recursive: true });

const FRONTEND = 'http://localhost:3001';
const VIEWPORT = { width: 1440, height: 900 };
const LIVE = process.argv.includes('--live');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(p) {
  const s = existsSync(p) ? statSync(p).size : 0;
  console.log(`  [${s > 1024 ? 'OK' : 'EMPTY'}] ${p.split('/').pop()} (${(s / 1024).toFixed(1)} KB)`);
}

async function run() {
  if (!LIVE) {
    console.log('[journey-i18n] dry-run 模式: 仅占位, 加 --live 启动 chromium');
    return;
  }
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: VIEWPORT, locale: 'zh-CN' });
  const page = await ctx.newPage();
  try {
    // 1) zh-CN 默认主页面
    await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(3000);
    const p1 = join(OUT, '01-zh-main.png');
    await page.screenshot({ path: p1, fullPage: true });
    check(p1);

    // 2) en-US 浏览器环境 (新建 context)
    await ctx.close();
    const ctx2 = await browser.newContext({ viewport: VIEWPORT, locale: 'en-US' });
    const page2 = await ctx2.newPage();
    await page2.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(3000);
    const p2 = join(OUT, '02-en-main.png');
    await page2.screenshot({ path: p2, fullPage: true });
    check(p2);
    await ctx2.close();
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run().then(() => console.log('ok'));
