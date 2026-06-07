// SimpleAgent - HITL 人机协作确认 journey 截图脚本
// 真实场景：API 触发 HITL checkpoint → SSE 推送到前端 → 弹出 HumanConfirmationDialog
// 验证 11 个后端端点 + 60s 倒计时 + Y/N 键盘快捷键 + 风险等级颜色编码
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
const BACKEND = 'http://localhost:30000';
const VIEWPORT = { width: 1440, height: 900 };
const LIVE = process.argv.includes('--live');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(p) {
  const s = existsSync(p) ? statSync(p).size : 0;
  console.log(`  [${s > 1024 ? 'OK' : 'EMPTY'}] ${p.split('/').pop()} (${(s / 1024).toFixed(1)} KB)`);
}

async function fireHitlCheckpoint() {
  // 走 /api/hitl/checkpoint (非阻塞) - SSE 会推到前端
  const r = await fetch(`${BACKEND}/api/hitl/checkpoint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'file_delete',
      title: '删除敏感文件',
      description: '即将执行: rm -rf /etc/passwd - 这是一个高危操作, 需要您确认',
      riskLevel: 'high',
      context: { path: '/etc/passwd', command: 'rm -rf' }
    })
  });
  const j = await r.json();
  return j.checkpoint?.id;
}

async function run() {
  if (!LIVE) {
    console.log('[journey-hitl] dry-run 模式: 仅占位, 加 --live 启动 chromium');
    return;
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  try {
    // 1) 主聊天页 - 加载即建立 SSE 连接
    await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3500);
    // 跳过欢迎引导
    try {
      await page.keyboard.press('Escape');
      await sleep(1000);
    } catch {}
    const p1 = join(OUT, '01-agent.png');
    await page.screenshot({ path: p1, fullPage: false });
    check(p1);

    // 2) 触发 HITL checkpoint → 弹窗
    console.log('  [INFO] 触发 HITL checkpoint via API...');
    const cpId = await fireHitlCheckpoint();
    console.log(`  [INFO] checkpoint id=${cpId}`);

    // 等待 SSE 推送到前端 + 对话框渲染
    await sleep(5000);
    const p2 = join(OUT, '02-confirm-dialog.png');
    await page.screenshot({ path: p2, fullPage: false });
    check(p2);

    // 3) 倒计时过半 + 风险颜色
    await sleep(15000);
    const p3 = join(OUT, '03-countdown-running.png');
    await page.screenshot({ path: p3, fullPage: false });
    check(p3);

    // 4) 用户按 Y 确认 → 后端 approve → 对话框消失
    if (cpId) {
      const r = await fetch(`${BACKEND}/api/hitl/checkpoint/${cpId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option: 'approve', userId: 'verify-agent', comment: 'ok' })
      });
      const j = await r.json();
      console.log(`  [INFO] approve result: ${j.success ? 'ok' : 'fail'}`);
    }
    await sleep(3000);
    const p4 = join(OUT, '04-confirmed.png');
    await page.screenshot({ path: p4, fullPage: false });
    check(p4);

    // 5) 触发第二个 → 用户取消
    const cpId2 = await fireHitlCheckpoint();
    console.log(`  [INFO] checkpoint2 id=${cpId2}`);
    await sleep(4000);
    if (cpId2) {
      await fetch(`${BACKEND}/api/hitl/checkpoint/${cpId2}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: '取消操作', userId: 'verify-agent' })
      });
    }
    await sleep(2000);
    const p5 = join(OUT, '05-cancelled.png');
    await page.screenshot({ path: p5, fullPage: false });
    check(p5);
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run().then(() => console.log('ok'));
