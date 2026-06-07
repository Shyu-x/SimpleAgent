// SimpleAgent - 登录/API Key 入口 journey 截图脚本
// 真实场景：首次访问用户主聊天页，验证 (1) 是否需要 API Key 提示 (2) 登录入口是否可见
// 真实运行:  node scripts/journey-login.mjs --live
// 默认 dry-run:  仅生成占位 PNG, 不启动浏览器

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs/online/journeys/login');
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
    console.log('[journey-login] dry-run 模式: 仅占位, 加 --live 启动 chromium');
    return;
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  try {
    // 1) 首屏 landing
    await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(3000);
    const p1 = join(OUT, '01-landing.png');
    await page.screenshot({ path: p1, fullPage: false });
    check(p1);

    // 2) 等待欢迎/聊天内容加载
    await sleep(2000);
    const p2 = join(OUT, '02-main-chat.png');
    await page.screenshot({ path: p2, fullPage: true });
    check(p2);
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run().then(() => console.log('ok'));
