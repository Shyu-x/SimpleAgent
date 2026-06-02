// SimpleAgent - 完整对话流程截图脚本
// 输出到 docs/online/journeys/conversation/

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync, readdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs/online/journeys/conversation');

const FRONTEND = 'http://localhost:3001';
const VIEWPORT = { width: 1440, height: 900 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const shot = async (page, name) => {
  const path = join(OUT, name);
  await page.waitForTimeout(2000);
  await page.screenshot({ path, fullPage: false });
  const size = existsSync(path) ? statSync(path).size : 0;
  const status = size > 1024 ? 'OK' : 'EMPTY';
  console.log(`  [${status}] ${name} (${(size / 1024).toFixed(1)} KB)`);
  return { path, size, status };
};

async function dismissWelcomeGuide(page) {
  // 尝试按 ESC 或点击空白处关闭 WelcomeGuide
  try {
    await page.keyboard.press('Escape');
    await sleep(500);
  } catch {}
  // 查找关闭按钮（不同文案）
  const closeBtn = await page.$('button:has-text("跳过"), button:has-text("开始"), button:has-text("知道了"), button[aria-label*="关闭"]');
  if (closeBtn) {
    try { await closeBtn.click({ timeout: 1000 }); } catch {}
  }
}

(async () => {
  console.log('=== SimpleAgent 对话流程截图 ===');
  console.log(`输出目录: ${OUT}`);
  console.log(`视口: ${VIEWPORT.width}x${VIEWPORT.height}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  // 收集 console 错误以便诊断
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
  });
  page.on('pageerror', (err) => consoleErrors.push(`PAGE ERROR: ${err.message.slice(0, 200)}`));

  const results = [];

  try {
    // === 1. 首次访问主页 ===
    console.log('\n[1/8] 首次访问主页...');
    await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);
    results.push(await shot(page, '01-landing.png'));
    await dismissWelcomeGuide(page);

    // === 2. 点击输入框 ===
    console.log('[2/8] 点击输入框...');
    const textarea = await page.$('textarea[placeholder="发送消息..."]');
    if (!textarea) throw new Error('找不到 textarea');
    await textarea.click();
    await sleep(500);
    results.push(await shot(page, '02-input-focused.png'));

    // === 3. 输入消息（不发送） ===
    console.log('[3/8] 输入消息...');
    await textarea.fill('你好，介绍下你自己');
    await sleep(800);
    results.push(await shot(page, '03-message-typed.png'));

    // === 4. 发送并捕获流式状态 ===
    console.log('[4/8] 发送消息，等待流式...');
    const sendBtn = await page.$('[data-testid="send-button"]');
    if (!sendBtn) throw new Error('找不到 send-button');
    await sendBtn.click();
    // 流式响应可能在 0.5s 内可见
    await sleep(500);
    results.push(await shot(page, '04-streaming.png'));

    // === 5. 等待流式结束（最多 8s） ===
    console.log('[5/8] 等待完整回复...');
    // 检测流式结束的标志：发送按钮重新可用 或 出现停止按钮消失
    let streamingDone = false;
    for (let i = 0; i < 16; i++) {
      await sleep(500);
      // 检查 textarea 是否可重新输入
      const disabled = await page.evaluate(() => {
        const btn = document.querySelector('[data-testid="send-button"]');
        return btn ? btn.hasAttribute('disabled') : true;
      });
      // 简单判断：等到 send 按钮 disabled=false（流式完成）
      // 或者 8s 后强制截图
      if (!disabled && i > 1) {
        // 再多等 1s 让最后字符渲染
        await sleep(1000);
        streamingDone = true;
        break;
      }
    }
    console.log(`  流式结束: ${streamingDone ? '是' : '否（8s超时）'}`);
    results.push(await shot(page, '05-response-received.png'));

    // === 6. 思维链（如果有） ===
    console.log('[6/8] 检查思维链...');
    const thinkingToggle = await page.$('button:has-text("思维链"), button:has-text("思考"), [class*="thinking"] button, details summary, button[aria-expanded]');
    if (thinkingToggle) {
      try {
        await thinkingToggle.click({ timeout: 1500 });
        await sleep(800);
        console.log('  已展开思维链');
      } catch (e) {
        console.log('  思维链点击失败:', e.message.slice(0, 80));
      }
    } else {
      console.log('  未检测到思维链组件');
    }
    results.push(await shot(page, '06-thinking-chain.png'));

    // === 7. 多轮对话 ===
    console.log('[7/8] 多轮对话...');
    const textarea2 = await page.$('textarea[placeholder="发送消息..."]');
    if (textarea2) {
      await textarea2.click();
      await textarea2.fill('再讲个笑话');
      await sleep(500);
      const sendBtn2 = await page.$('[data-testid="send-button"]');
      if (sendBtn2) {
        await sendBtn2.click();
        // 等待回复
        for (let i = 0; i < 16; i++) {
          await sleep(500);
          const disabled = await page.evaluate(() => {
            const btn = document.querySelector('[data-testid="send-button"]');
            return btn ? btn.hasAttribute('disabled') : true;
          });
          if (!disabled && i > 1) {
            await sleep(1000);
            break;
          }
        }
      }
    } else {
      console.log('  未找到 textarea，跳过');
    }
    results.push(await shot(page, '07-multi-turn.png'));

    // === 8. 新建对话（清空） ===
    console.log('[8/8] 新建对话...');
    const newConvBtn = await page.$('button:has-text("新建")');
    if (newConvBtn) {
      await newConvBtn.click();
      await sleep(1500);
    } else {
      console.log('  未找到"新建"按钮，尝试 ESC 清空...');
      await page.keyboard.press('Escape');
      await sleep(500);
    }
    results.push(await shot(page, '08-after-clear.png'));

  } catch (e) {
    console.error('脚本异常:', e.message);
    results.push({ path: '', size: 0, status: 'ERROR: ' + e.message });
  } finally {
    await browser.close();
  }

  // === 验证输出 ===
  console.log('\n=== 截图清单 ===');
  const files = existsSync(OUT) ? readdirSync(OUT).filter((f) => f.endsWith('.png')) : [];
  for (const f of files.sort()) {
    const fp = join(OUT, f);
    const size = statSync(fp).size;
    console.log(`  ${f} (${(size / 1024).toFixed(1)} KB)`);
  }
  console.log(`\n共 ${files.length} 张截图`);
  if (consoleErrors.length > 0) {
    console.log(`\n[浏览器控制台错误] ${consoleErrors.length} 条:`);
    consoleErrors.slice(0, 5).forEach((e) => console.log('  -', e));
  }
})();
