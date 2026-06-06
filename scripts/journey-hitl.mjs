// SimpleAgent - HITL 人机协作确认 journey 截图脚本
// 真实场景：Agent 触发危险操作 (删文件/格式化/高费用调用) 时弹出 HumanConfirmationDialog
// 后端 11 个端点 (POST /api/hitl/request 等) + 60s 倒计时 + Y/N/C 键盘快捷键
// 真实运行:  node scripts/journey-hitl.mjs --live
// 默认 dry-run:  仅生成占位 PNG, 不启动浏览器

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs/online/journeys/hitl');
mkdirSync(OUT, { recursive: true });

const FRONTEND = 'http://localhost:3001';
const VIEWPORT = { width: 1440, height: 900 };
const LIVE = process.argv.includes('--live');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  if (!LIVE) {
    console.log('[journey-hitl] dry-run 模式: 仅占位, 加 --live 启动 chromium');
    return;
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  try {
    await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
    // TODO: 触发 HITL 对话框
    //   - await page.fill('textarea', '删除 /tmp/test.txt 文件');
    //   - await page.click('button[type="submit"]');
    //   - await page.waitForSelector('text=确认操作', { timeout: 30000 });
    //   - 截图: 01-confirm-dialog.png (含风险等级颜色 + 倒计时)
    //   - 点击 "确认" 或按 Y 键, 截图: 02-confirmed.png
    //   - 点击 "取消" 或按 N 键, 截图: 03-cancelled.png
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
