// SimpleAgent - i18n 中英切换 journey 截图脚本
// 真实场景：Wave 8.2 后, 用户在右上角切换 zh-CN / en-US, 验证主聊天页 + 侧边栏 + 设置面板文案
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

async function run() {
  if (!LIVE) {
    console.log('[journey-i18n] dry-run 模式: 仅占位, 加 --live 启动 chromium');
    return;
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  try {
    await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
    // TODO: 中英切换截图
    //   - 01-zh-main.png       中文主聊天页 (默认)
    //   - 02-zh-sidebar.png    中文侧边栏
    //   - 03-en-main.png       切换到英文 -> 截图
    //   - 04-en-settings.png   英文设置面板
    //   - 切换入口: page.click('[aria-label="language switcher"]')
    //   - 验证文案: 找硬编码 "新建对话" / "New Chat" 作为反例
    await page.screenshot({ path: join(OUT, '01-placeholder.png'), fullPage: false });
    const size = existsSync(join(OUT, '01-placeholder.png')) ? statSync(join(OUT, '01-placeholder.png')).size : 0;
    console.log(`  [${size > 1024 ? 'OK' : 'EMPTY'}] 01-placeholder.png (${(size / 1024).toFixed(1)} KB)`);
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run().then(() => console.log('ok'));
