// SimpleAgent - B3 SSE-1 指数退避自动重连 验证脚本
// 任务: sse.ts 加了 1/2/4/8/16s 指数退避 (max 5 次), 后端挂掉后 SSE 应能自动重连
//
// 流程:
//   1. 打开页面, 关闭 welcome guide
//   2. 在输入框发消息, 让前端开始 SSE 连接
//   3. kill -STOP 后端进程 (冻结), 让 fetch 失败
//   4. 等待 5-10s, 此时 SSE 应在重试 (1s/2s/4s 间隔)
//   5. kill -CONT 恢复后端, 让下一次重试成功
//   6. 等待 SSE 完成, 截图保存
//
// 安全: 全程使用 kill -STOP / -CONT, 不真杀进程, 测试后端一定在线

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import { statSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const SHOT = join(ROOT, 'docs/online/journeys/prod-build/02-sse-retry.png');

const FRONTEND = 'http://localhost:3001';
const BACKEND = 'http://localhost:30000';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getBackendPids() {
  try {
    const out = execSync(
      `ps -ef | grep -E "node.*src/index\\.js" | grep -v grep | awk '{print $2}'`,
      { encoding: 'utf-8' }
    ).trim();
    return out ? out.split('\n').filter(Boolean).map(s => parseInt(s, 10)) : [];
  } catch { return []; }
}

function stopBackend() {
  const pids = getBackendPids();
  for (const pid of pids) {
    try { execSync(`kill -STOP ${pid}`, { stdio: 'pipe' }); } catch {}
  }
  return pids;
}

function wakeBackend() {
  const pids = getBackendPids();
  for (const pid of pids) {
    try { execSync(`kill -CONT ${pid}`, { stdio: 'pipe' }); } catch {}
  }
  return pids;
}

function checkBackend() {
  try {
    const code = execSync(
      `curl -s -o /dev/null -w "%{http_code}" --max-time 2 ${BACKEND}/api/health`
    ).toString().trim();
    return code;
  } catch { return 'ERR'; }
}

async function dismissWelcome(page) {
  for (let i = 0; i < 3; i++) {
    try { await page.keyboard.press('Escape'); } catch {}
    try {
      const skip = page.locator('button:has-text("跳过引导")');
      if (await skip.isVisible({ timeout: 500 })) await skip.click({ timeout: 1500 });
    } catch {}
    await sleep(300);
    const visible = await page.locator('text=欢迎使用 AI Chat').isVisible().catch(() => false);
    if (!visible) return;
  }
}

(async () => {
  console.log('=== B3 SSE-1 指数退避重连验证 ===\n');

  // Pre-check
  const preCode = checkBackend();
  console.log(`[pre]  后端 /api/health: ${preCode}`);
  if (preCode !== '200') {
    console.log('!! 后端未启动, 退出');
    process.exit(1);
  }

  // Init script: skip welcome
  const initScript = `
    try {
      localStorage.setItem('onboarding-completed', 'true');
      localStorage.setItem('welcome-guide-dismissed', 'true');
    } catch(e) {}
  `;

  const browser = await chromium.launch({ headless: true });
  let sseResponseStatuses = [];
  let sseRequests = [];

  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(initScript);
    const page = await ctx.newPage();

    // 监控 SSE /api/chat 请求 (本地 backend, frontend 直调)
    page.on('request', (req) => {
      if (req.url().includes('/api/chat') || req.url().includes('/chat/completions')) {
        sseRequests.push({ method: req.method(), url: req.url(), time: Date.now() });
      }
    });
    page.on('response', (resp) => {
      if (resp.url().includes('/api/chat') || resp.url().includes('/chat/completions')) {
        sseResponseStatuses.push({ status: resp.status(), url: resp.url(), time: Date.now() });
      }
    });

    console.log('[1/5] 打开前端页面...');
    await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);
    await dismissWelcome(page);
    await sleep(500);

    console.log('[2/5] 发送消息触发 SSE 连接...');
    const textarea = page.locator('textarea[placeholder="发送消息..."]').first();
    await textarea.waitFor({ state: 'visible', timeout: 5000 });
    await textarea.fill('请用一句话介绍指数退避 (exponential backoff).');
    await sleep(300);

    // 用 data-testid 选 send-button (journey-conversation 验证可工作)
    const sendBtn = page.locator('[data-testid="send-button"]').first();
    const requestCountBefore = sseRequests.length;
    await sendBtn.click({ timeout: 3000 });
    console.log(`     已点击发送 (请求前计数: ${requestCountBefore})`);

    // 等 800ms 确保请求真的发出去了
    await sleep(800);
    const afterSend = sseRequests.length;
    console.log(`     点击后请求数: ${afterSend} (${afterSend > requestCountBefore ? '✓ 已发出' : '✗ 未发出'})`);

    console.log('[3/5] STOP 后端, 模拟服务挂掉...');
    const stoppedPids = stopBackend();
    console.log(`     STOP PIDs: ${stoppedPids.join(', ')}`);

    // 验证后端真的被冻住了
    await sleep(500);
    const stoppedCode = checkBackend();
    console.log(`     STOP 后 /api/health: "${stoppedCode}" (期望: 非 200)`);

    console.log('[4/5] 等待 8s, 让 SSE 触发 1s/2s/4s 退避重试...');
    // 8s 内会触发: 1s 重试 (失败) + 2s 重试 (失败) + 4s 重试 (失败, 累计 7s)
    await sleep(8000);

    // 恢复后端
    console.log('[5/5] CONT 恢复后端, 让下一次 (8s) 重试成功...');
    const wokePids = wakeBackend();
    console.log(`     CONT PIDs: ${wokePids.join(', ')}`);

    // 验证后端恢复
    await sleep(1000);
    const wokeCode = checkBackend();
    console.log(`     CONT 后 /api/health: ${wokeCode} (期望: 200)`);

    // 等待 SSE 重连并完成 (8s 后重试 + 处理时间)
    console.log('     等待 SSE 重连完成 (10s)...');
    await sleep(10000);

    // 截图
    await page.screenshot({ path: SHOT, fullPage: false });
    const size = existsSync(SHOT) ? statSync(SHOT).size : 0;
    console.log(`\n  ✓ 截图: ${SHOT} (${(size / 1024).toFixed(1)} KB)`);

    // 统计
    console.log('\n=== SSE 请求统计 ===');
    console.log(`  总请求数: ${sseRequests.length}`);
    console.log(`  响应状态:`);
    sseResponseStatuses.forEach((r, i) => {
      console.log(`    [${i + 1}] HTTP ${r.status}  (${new Date(r.time).toISOString().slice(11, 23)})`);
    });

    // 计算时间间隔
    if (sseRequests.length >= 2) {
      console.log(`  请求间隔 (ms):`);
      for (let i = 1; i < sseRequests.length; i++) {
        const gap = sseRequests[i].time - sseRequests[i - 1].time;
        console.log(`    ${i}→${i + 1}: ${gap}ms`);
      }
    }

    // 验证至少有一次重试
    const hasReconnect = sseRequests.length >= 2;
    const hasSuccess = sseResponseStatuses.some(r => r.status === 200);

    console.log('\n=== 验证结论 ===');
    console.log(`  ✓ 重试触发: ${hasReconnect ? 'YES' : 'NO'} (${sseRequests.length} 次请求)`);
    console.log(`  ✓ 最终成功: ${hasSuccess ? 'YES' : 'NO'}`);
    console.log(`  ✓ 后端恢复: ${wokeCode === '200' ? 'YES' : 'NO'}`);

    if (hasReconnect && hasSuccess && wokeCode === '200') {
      console.log('\n=== 全部通过 ===');
      process.exit(0);
    } else {
      console.log('\n=== 部分失败 ===');
      process.exit(1);
    }

  } catch (e) {
    console.error('FATAL:', e.message);
    console.error(e.stack);
    process.exit(1);
  } finally {
    // 兜底: 确保后端一定恢复
    wakeBackend();
    try { execSync(`pkill -CONT -f "node.*src/index.js"`, { stdio: 'pipe' }); } catch {}
    await sleep(500);
    const finalCode = checkBackend();
    console.log(`\n[fini] 后端最终状态: ${finalCode}`);
    await browser.close();
  }
})();
