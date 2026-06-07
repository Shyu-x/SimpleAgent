// 旅程 3: 响应式 + 错误路径截图 (v2 修复版)
// 修复: 1) 用 addInitScript 预置 localStorage 跳过 welcome guide
//       2) 后端 STOP 改用子进程 PID 2908783 (非 --watch 父进程 2430827)
//       3) 用 ESC 键兜底关闭 welcome 弹窗
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCREENSHOTS_DIR = join(__dirname, '..', 'docs', 'online', 'journeys', 'resilience');
const BASE_URL = 'http://localhost:3001';
const BACKEND_URL = 'http://localhost:30000';
// 真实后端 node 进程（--watch 父进程是 2430827，子进程才是 2908783）
const BACKEND_PID = 2908783;

function killBackend() {
  try { execSync(`kill -STOP ${BACKEND_PID}`, { stdio: 'pipe' }); } catch {}
}
function wakeBackend() {
  try { execSync(`kill -CONT ${BACKEND_PID}`, { stdio: 'pipe' }); } catch {}
}

async function shoot(page, file) {
  const path = join(SCREENSHOTS_DIR, file);
  await page.screenshot({ path, fullPage: false });
  const stat = await import('fs').then(fs => fs.promises.stat(path));
  console.log(`  ✓ ${file} (${(stat.size / 1024).toFixed(1)} KB)`);
  return stat.size;
}

async function dismissWelcome(page) {
  // 多重保险：init script + ESC 键 + click skip 按钮
  for (let i = 0; i < 3; i++) {
    try { await page.keyboard.press('Escape'); } catch {}
    try {
      const skip = page.locator('button:has-text("跳过引导")');
      if (await skip.isVisible({ timeout: 500 })) await skip.click({ timeout: 1500 });
    } catch {}
    try {
      const close = page.locator('[aria-label="关闭"], [aria-label="Close"], button:has(svg.lucide-x)');
      if (await close.first().isVisible({ timeout: 300 })) await close.first().click({ timeout: 1000 });
    } catch {}
    await page.waitForTimeout(400);
    // 检查 welcome 弹窗是否还在
    const welcomeVisible = await page.locator('text=欢迎使用 AI Chat').isVisible().catch(() => false);
    if (!welcomeVisible) return;
  }
}

(async () => {
  console.log('=== 旅程 3: 响应式 + 错误路径 (v2) ===\n');
  const browser = await chromium.launch({ headless: true });
  const results = [];

  // 通用 init script：预置 localStorage + 抑制 Next.js 错误叠加层
  const initScript = `
    try {
      localStorage.setItem('onboarding-completed', 'true');
      localStorage.setItem('welcome-guide-dismissed', 'true');
    } catch(e) {}
  `;

  try {
    // ============== 01 mobile 375 ==============
    console.log('[1/6] mobile 375×667');
    {
      const ctx = await browser.newContext({
        viewport: { width: 375, height: 667 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      });
      await ctx.addInitScript(initScript);
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      await dismissWelcome(page);
      await page.waitForTimeout(800);
      const size = await shoot(page, '01-mobile-375.png');
      results.push({ name: '01-mobile-375.png', size });
      await ctx.close();
    }

    // ============== 02 tablet 768 ==============
    console.log('[2/6] tablet 768×1024');
    {
      const ctx = await browser.newContext({
        viewport: { width: 768, height: 1024 },
        deviceScaleFactor: 1,
      });
      await ctx.addInitScript(initScript);
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      await dismissWelcome(page);
      await page.waitForTimeout(800);
      const size = await shoot(page, '02-tablet-768.png');
      results.push({ name: '02-tablet-768.png', size });
      await ctx.close();
    }

    // ============== 03 skeleton loading ==============
    console.log('[3/6] skeleton loading (route 拦截延迟 5s)');
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await ctx.addInitScript(initScript);
      const page = await ctx.newPage();
      // 拦截 /api 请求延迟 5 秒 → 触发前端 loading/skeleton 状态
      await ctx.route('**/api/**', async (route) => {
        await new Promise(r => setTimeout(r, 5000));
        await route.continue();
      });
      await page.goto(`${BASE_URL}/?nocache=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // 在请求未完成时立即截图
      await page.waitForTimeout(1200);
      const size = await shoot(page, '03-skeleton-loading.png');
      results.push({ name: '03-skeleton-loading.png', size });
      await ctx.unroute('**/api/**');
      await ctx.close();
    }

    // ============== 04 backend down ==============
    console.log('[4/6] backend STOP → 降级 UI');
    {
      // 验证后端在线
      let preOk = false;
      try {
        preOk = execSync(`curl -s -o /dev/null -w "%{http_code}" --max-time 2 ${BACKEND_URL}/api/health`).toString() === '200';
      } catch {}
      console.log(`     pre-check: ${preOk ? '后端 200' : '后端未响应'}`);

      killBackend();
      // 验证 STOP 生效
      let stopped = false;
      try {
        const code = execSync(`curl -s -o /dev/null -w "%{http_code}" --max-time 3 ${BACKEND_URL}/api/health || echo TIMEOUT`).toString();
        stopped = code.includes('TIMEOUT') || code === '000' || !code.startsWith('2');
        console.log(`     STOP 后 curl: "${code}" → ${stopped ? '已冻结' : 'still up'}`);
      } catch (e) { stopped = true; console.log(`     STOP 后 curl 异常: ${e.message.slice(0, 60)}`); }

      if (!stopped) {
        // 再试 kill -STOP 一次（也许 PID 不对）
        try { execSync(`pkill -STOP -f "node.*src/index.js"`, { stdio: 'pipe' }); } catch {}
        await new Promise(r => setTimeout(r, 1000));
      }

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await ctx.addInitScript(initScript);
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // 等前端 fetch /api/* 超时（fetch 默认无超时 → 会挂起；前端一般 5-10s 触发降级）
      await page.waitForTimeout(10000);
      await dismissWelcome(page);
      const size = await shoot(page, '04-backend-down.png');
      results.push({ name: '04-backend-down.png', size });
      await ctx.close();

      wakeBackend();
      // 兜底 pkill CONT
      try { execSync(`pkill -CONT -f "node.*src/index.js"`, { stdio: 'pipe' }); } catch {}
      await new Promise(r => setTimeout(r, 2000));
      let postOk = false;
      try {
        postOk = execSync(`curl -s -o /dev/null -w "%{http_code}" --max-time 3 ${BACKEND_URL}/api/health`).toString() === '200';
      } catch {}
      console.log(`     CONT 恢复: ${postOk ? '后端 200' : '后端未响应'}`);
    }

    // ============== 05 rate limit 429 ==============
    console.log('[5/6] rate limit 429');
    {
      // 先确认限流窗口已过
      console.log('     等待 65s 让限流窗口重置...');
      await new Promise(r => setTimeout(r, 65000));

      // 110 次 POST /api/chat 打满限流
      console.log('     触发 110 次 /api/chat...');
      let count429 = 0, countOther = 0, lastCodes = [];
      for (let i = 0; i < 110; i++) {
        try {
          const code = execSync(
            `curl -s -o /dev/null -w "%{http_code}" --max-time 5 -X POST -H "Content-Type: application/json" -d '{"message":"ping"}' ${BACKEND_URL}/api/chat`
          ).toString().trim();
          if (code === '429') count429++;
          else countOther++;
          if (i >= 100) lastCodes.push(code);
        } catch {}
      }
      console.log(`     110 请求: 429=${count429}  other=${countOther}  最后10个=${lastCodes.join(',')}`);

      // 前端触发 (同 IP 应已限流)
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await ctx.addInitScript(initScript);
      const page = await ctx.newPage();
      // 监听响应,捕获 429
      const responseStatuses = [];
      page.on('response', resp => {
        if (resp.url().includes('/api/chat') || resp.url().includes('/api/')) {
          responseStatuses.push(`${resp.status()} ${resp.url().slice(-30)}`);
        }
      });
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500);
      await dismissWelcome(page);
      // 找输入框发消息
      const textarea = page.locator('textarea').first();
      try {
        await textarea.waitFor({ state: 'visible', timeout: 5000 });
        await textarea.fill('测试限流 429 触发');
        await page.waitForTimeout(500);
        // 找 enabled 的发送按钮（aria-label 或 svg）
        const sendBtn = page.locator('button:has(svg)').filter({ hasNot: page.locator(':disabled') }).last();
        await sendBtn.click({ timeout: 3000 });
        // 等 toast
        await page.waitForTimeout(6000);
      } catch (e) {
        console.log(`     UI 触发失败: ${e.message.slice(0, 100)}`);
      }
      console.log(`     API 响应: ${responseStatuses.slice(0, 8).join(' | ')}`);
      const size = await shoot(page, '05-rate-limit-429.png');
      results.push({ name: '05-rate-limit-429.png', size });
      await ctx.close();
    }

    // ============== 06 form validation ==============
    console.log('[6/6] form validation (空 + 5000 字)');
    {
      // 等待限流窗口过期
      console.log('     等待 65s 让限流过期...');
      await new Promise(r => setTimeout(r, 65000));

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await ctx.addInitScript(initScript);
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      await dismissWelcome(page);
      await page.waitForTimeout(500);

      const textarea = page.locator('textarea').first();
      await textarea.waitFor({ state: 'visible', timeout: 5000 });

      // 1) 空状态：确认发送按钮 disabled
      const sendBtn = page.locator('button:has(svg)').filter({ hasNot: page.locator(':disabled') }).last();
      const allSendBtns = page.locator('button').filter({ has: page.locator('svg') });
      const totalBtns = await allSendBtns.count();
      let enabledCount = 0;
      for (let i = 0; i < totalBtns; i++) {
        const btn = allSendBtns.nth(i);
        try {
          if (await btn.isEnabled()) enabledCount++;
        } catch {}
      }
      console.log(`     空消息: 按钮总数 ${totalBtns}  启用 ${enabledCount}  (期望: 发送按钮 disabled)`);

      // 2) 5000 字符
      const longText = 'A'.repeat(5000);
      await textarea.fill(longText);
      await page.waitForTimeout(500);
      const actualLen = await textarea.evaluate(el => el.value.length);
      const maxLen = await textarea.evaluate(el => el.maxLength > 0 ? el.maxLength : 'no maxLength').catch(() => 'err');
      console.log(`     5000 字符: 实际输入 ${actualLen}  maxLength=${maxLen}`);

      const size = await shoot(page, '06-form-validation.png');
      results.push({ name: '06-form-validation.png', size });
      await ctx.close();
    }

  } catch (e) {
    console.error('FATAL:', e.message);
    console.error(e.stack);
  } finally {
    wakeBackend();
    try { execSync(`pkill -CONT -f "node.*src/index.js"`, { stdio: 'pipe' }); } catch {}
    await new Promise(r => setTimeout(r, 1000));
    let finalCode = 'unknown';
    try {
      finalCode = execSync(`curl -s -o /dev/null -w "%{http_code}" --max-time 3 ${BACKEND_URL}/api/health`).toString().trim();
    } catch {}
    console.log(`\n=== 完成 ===`);
    console.log(`截图: ${results.length}/6`);
    for (const r of results) {
      console.log(`  ✓ ${r.name} (${(r.size / 1024).toFixed(1)} KB)`);
    }
    console.log(`后端最终状态: ${finalCode}`);
    await browser.close();
  }
})();
