// Agent 模式 E2E 验证 - 截图 07 (agent mode active) + 08 (agent response)
// 8 分钟时间盒内完成
import { chromium } from 'playwright';
import { mkdir, stat, writeFile } from 'fs/promises';
import { join } from 'path';

const SHOTS_DIR = '/home/xu/Develop/longTermProject/SimpleAgent/docs/online/journeys/agent';
const BASE = 'http://localhost:3001';

const t0 = Date.now();
const log = (m) => console.log(`[+${((Date.now()-t0)/1000).toFixed(1)}s] ${m}`);

(async () => {
  await mkdir(SHOTS_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => log(`PAGE ERR: ${e.message.substring(0, 120)}`));

  log('goto');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2500);

  // 关闭 welcome / modal
  for (let i = 0; i < 3; i++) {
    const closed = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const t = btns.find(b => /^(知道了|开始|完成|跳过|关闭|Close|Skip|OK|Got it|开始使用|我知道了)$/i.test((b.textContent||'').trim()));
      if (t) { t.click(); return 'btn'; }
      const c = document.querySelector('button[aria-label*="close"], button[aria-label*="关闭"]');
      if (c) { c.click(); return 'aria'; }
      return null;
    });
    if (closed) { log(`modal close #${i+1}: ${closed}`); await page.waitForTimeout(600); }
    else { await page.keyboard.press('Escape').catch(()=>{}); await page.waitForTimeout(300); }
  }

  // 切到 agent 模式 - 通过 UI 按钮 (a[href="/agent"]) 或 store
  let switchMethod = 'failed';
  const agentLink = await page.$('a[href="/agent"]');
  if (agentLink) {
    try {
      await agentLink.click({ timeout: 5000, force: true });
      switchMethod = 'ui-link';
      log(`switch: ${switchMethod}`);
      await page.waitForTimeout(3000);
    } catch (e) {
      log(`link click failed: ${e.message.substring(0, 80)}`);
    }
  }
  if (switchMethod === 'failed') {
    // 备选：直接 goto agent 页
    try {
      await page.goto(`${BASE}/agent`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      switchMethod = 'goto-agent';
      log(`switch: ${switchMethod}`);
      await page.waitForTimeout(3500);
    } catch (e) {
      log(`goto agent failed: ${e.message.substring(0, 80)}`);
    }
  }
  if (switchMethod === 'failed') {
    // 最后备选：回主页 + 尝试 toggle 按钮
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
    const toggled = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const t = btns.find(b => /Agent|agent|智能体/.test((b.textContent||'') + ' ' + (b.getAttribute('aria-label')||'') + ' ' + (b.getAttribute('title')||'')));
      if (t) { t.click(); return true; }
      return false;
    });
    if (toggled) { switchMethod = 'ui-toggle'; log(`switch: ${switchMethod}`); }
    await page.waitForTimeout(2000);
  }

  // 截图 07
  const f07 = join(SHOTS_DIR, '07-agent-mode-active.png');
  try {
    await page.screenshot({ path: f07, fullPage: false, timeout: 15000, animations: 'disabled' });
  } catch (e) {
    log(`07 v1 fail: ${e.message.substring(0, 60)}`);
    const client = await page.context().newCDPSession(page);
    const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(f07, Buffer.from(data, 'base64'));
    await client.detach();
  }
  const s07 = Math.round((await stat(f07)).size / 1024);
  log(`07 saved (${s07} KB)`);

  // 发送 agent 模式问题
  let sent = false;
  // 先尝试找输入框 (可能 agent 页有独立输入)
  const ta = page.locator('textarea').first();
  if (await ta.count() > 0) {
    try {
      await ta.click({ timeout: 3000 });
      await ta.fill('用一句话介绍 SimpleAgent', { timeout: 5000 });
      sent = true;
    } catch (e) { log(`fill failed: ${e.message.substring(0, 60)}`); }
  }
  if (sent) {
    const sent2 = await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label*="发送"], button[title*="发送"]')
        || Array.from(document.querySelectorAll('button')).find(b => /发送|Send/i.test(b.textContent || ''));
      if (btn) { btn.click(); return 'btn'; }
      return null;
    });
    if (!sent2) {
      await ta.press('Enter').catch(()=>{});
      log('send via Enter');
    } else {
      log(`send via ${sent2}`);
    }
  } else {
    log('WARN: no textarea found');
  }

  // 等响应 (agent 模式慢)
  await page.waitForTimeout(15000);

  // 截图 08
  const f08 = join(SHOTS_DIR, '08-agent-response.png');
  try {
    await page.screenshot({ path: f08, fullPage: false, timeout: 15000, animations: 'disabled' });
  } catch (e) {
    log(`08 v1 fail: ${e.message.substring(0, 60)}`);
    const client = await page.context().newCDPSession(page);
    const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(f08, Buffer.from(data, 'base64'));
    await client.detach();
  }
  const s08 = Math.round((await stat(f08)).size / 1024);
  log(`08 saved (${s08} KB)`);

  await browser.close();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  log(`DONE in ${elapsed}s | switch=${switchMethod} | 07=${s07}KB 08=${s08}KB`);
})();
