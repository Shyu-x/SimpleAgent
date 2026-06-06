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

function check(p) {
  const s = existsSync(p) ? statSync(p).size : 0;
  console.log(`  [${s > 1024 ? 'OK' : 'EMPTY'}] ${p.split('/').pop()} (${(s / 1024).toFixed(1)} KB)`);
}

async function run() {
  if (!LIVE) {
    console.log('[journey-hitl] dry-run 模式: 仅占位, 加 --live 启动 chromium');
    return;
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  try {
    // 1) /agent 路由 - Agent 模式入口
    await page.goto(`${FRONTEND}/agent`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(3500);
    const p1 = join(OUT, '01-agent.png');
    await page.screenshot({ path: p1, fullPage: false });
    check(p1);

    // 2) 在聊天输入框输入危险操作关键词, 等待后端 SSE 触发 HITL 确认对话框
    try {
      const inputSel = 'textarea, [contenteditable="true"], input[type="text"]';
      await page.waitForSelector(inputSel, { timeout: 5000 });
      await page.fill(inputSel, '请帮我删除 /tmp/test.txt 文件');
      const submitSel = 'button[type="submit"], button:has-text("发送"), button:has-text("Send")';
      if (await page.$(submitSel)) {
        await page.click(submitSel);
        // 等待 HITL 对话框或 SSE 响应
        await sleep(8000);
        const p2 = join(OUT, '02-confirm-dialog.png');
        await page.screenshot({ path: p2, fullPage: false });
        check(p2);
      } else {
        console.log('  [WARN] 未找到提交按钮, 跳过 HITL 对话框截图');
      }
    } catch (e) {
      console.log(`  [WARN] HITL 触发失败: ${e.message}, 仅保留 agent 主屏截图`);
    }
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run().then(() => console.log('ok'));
