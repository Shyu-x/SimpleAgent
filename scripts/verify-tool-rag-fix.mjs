// 验证 B4 (TOOL-1) + B5 (RAG-1) 修复
// 关闭 welcome 面板, 发两条消息, 截图

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TOOLS_OUT = join(ROOT, 'docs/online/journeys/tools');
const RAG_OUT = join(ROOT, 'docs/online/journeys/rag');
mkdirSync(TOOLS_OUT, { recursive: true });
mkdirSync(RAG_OUT, { recursive: true });

const FRONTEND = 'http://localhost:3001';
const VIEWPORT = { width: 1440, height: 900 };
const MAX_WAIT_MS = 45000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const shot = async (page, dir, name) => {
  const path = join(dir, name);
  await sleep(1500);
  await page.screenshot({ path, fullPage: false });
  const size = existsSync(path) ? statSync(path).size : 0;
  console.log(`  [${size > 4096 ? 'OK' : 'EMPTY'}] ${dir.split('/').pop()}/${name} (${(size / 1024).toFixed(1)} KB)`);
  return { path, size };
};

const waitForStreamEnd = async (page, maxMs = MAX_WAIT_MS) => {
  const startTime = Date.now();
  await sleep(1500);
  let lastContent = '';
  let stableCount = 0;
  for (let i = 0; i < Math.ceil((maxMs - 1500) / 1000); i++) {
    await sleep(1000);
    const state = await page.evaluate(() => {
      const main = document.querySelector('main');
      const fullText = main ? main.innerText : '';
      const hasGenerating = fullText.includes('生成中') || fullText.includes('正在生成') || fullText.includes('▍');
      const idx = fullText.lastIndexOf('ASSISTANT');
      let assistantText = '';
      if (idx >= 0) {
        const after = fullText.slice(idx + 'ASSISTANT'.length);
        const nextMarker = after.search(/(USER|工具:|输入消息|新建对话|专注模式|管理后台)/);
        assistantText = nextMarker > 0 ? after.slice(0, nextMarker) : after.slice(0, 1200);
        assistantText = assistantText.replace(/^\s*(刚刚|生成中|正在生成)\s*/g, '').trim();
        assistantText = assistantText.replace(/^🔍\s*正在联网搜索相关信息\.*\s*/g, '').trim();
      }
      return { text: assistantText, hasGenerating };
    });
    if (state.text && state.text.length > 5 && state.text === lastContent && !state.hasGenerating) {
      stableCount++;
      if (stableCount >= 2) return { done: true, elapsedMs: Date.now() - startTime, content: state.text };
    } else {
      stableCount = 0;
    }
    lastContent = state.text;
  }
  return { done: false, elapsedMs: Date.now() - startTime, content: lastContent };
};

(async () => {
  console.log('=== B4 (TOOL-1) + B5 (RAG-1) 验证 ===\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'zh-CN' });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
  });
  page.on('pageerror', (err) => consoleErrors.push(`PAGE ERROR: ${err.message.slice(0, 200)}`));

  // 抓取 /api/chat 和 /api/v1/chat/completions 请求体
  // 前端默认走 /api/v1/chat/completions (proxy 路由)
  const capturedRequests = [];
  page.on('request', (req) => {
    if (req.method() !== 'POST') return;
    if (!req.url().includes('/chat/completions') && !req.url().includes('/api/chat')) return;
    if (req.url().includes('/stop')) return;
    try {
      const body = JSON.parse(req.postData() || '{}');
      capturedRequests.push({
        url: req.url(),
        messages: body.messages || []
      });
      console.log(`    [REQ] ${req.url().replace(/^https?:\/\/[^/]+/, '')} (${(body.messages || []).length} msgs)`);
    } catch {}
  });

  try {
    console.log('[0] 打开主页并关闭 welcome...');
    await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    try {
      const skipBtn = await page.$('button:has-text("跳过"), button:has-text("开始"), button:has-text("知道了")');
      if (skipBtn) await skipBtn.click({ timeout: 1500 });
      await sleep(500);
    } catch {}
    // 关闭 welcome 弹窗/侧边栏
    try {
      const closeBtns = await page.$$('button[aria-label*="close"], button:has-text("关闭"), button:has-text("收起")');
      for (const btn of closeBtns) {
        try { await btn.click({ timeout: 500 }); } catch {}
      }
    } catch {}

    // B4: 工具声明测试 - 计算器
    console.log('\n[B4] 计算器: 计算 123*456');
    {
      const beforeReqCount = capturedRequests.length;
      const textarea = await page.$('textarea[placeholder="发送消息..."]');
      if (textarea) {
        await textarea.click();
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Delete');
        await sleep(200);
        await textarea.fill('计算 123*456');
        await sleep(500);
        const sendBtn = await page.$('[data-testid="send-button"]');
        if (sendBtn) await sendBtn.click();
        const wait = await waitForStreamEnd(page, MAX_WAIT_MS);
        console.log(`  流式: ${wait.done ? '完成' : '超时'} (${wait.elapsedMs}ms)`);
        console.log(`  回复前200字: ${wait.content.slice(0, 200).replace(/\n/g, ' ')}`);
        // 检查是否含计算结果或工具协议痕迹
        const has56088 = wait.content.includes('56088');
        const hasToolCall = wait.content.includes('<<<TOOL:') || wait.content.includes('calculator');
        const hasToolDecl = capturedRequests.slice(beforeReqCount).some(r => {
          const sys = r.messages.find(m => m.role === 'system');
          return sys && sys.content && (sys.content.includes('get_current_time') || sys.content.includes('calculator'));
        });
        console.log(`  含 56088 结果: ${has56088}`);
        console.log(`  含工具协议痕迹: ${hasToolCall}`);
        console.log(`  请求体含工具声明: ${hasToolDecl}`);
        await shot(page, TOOLS_OUT, '05-tools-all-triggered.png');
      }
    }

    // 新建对话
    await sleep(1500);
    try {
      const newConvBtn = await page.$('button:has-text("新建")');
      if (newConvBtn) await newConvBtn.click();
      await sleep(1500);
    } catch {}

    // B5: RAG 知识库测试
    console.log('\n[B5] RAG: 知识库里有几条');
    {
      const beforeReqCount = capturedRequests.length;
      const textarea = await page.$('textarea[placeholder="发送消息..."]');
      if (textarea) {
        await textarea.click();
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Delete');
        await sleep(200);
        await textarea.fill('知识库里有几条');
        await sleep(500);
        const sendBtn = await page.$('[data-testid="send-button"]');
        if (sendBtn) await sendBtn.click();
        const wait = await waitForStreamEnd(page, MAX_WAIT_MS);
        console.log(`  流式: ${wait.done ? '完成' : '超时'} (${wait.elapsedMs}ms)`);
        console.log(`  回复前200字: ${wait.content.slice(0, 200).replace(/\n/g, ' ')}`);
        // 检查注入的 KB 上下文是否到达 LLM
        const hasKBInjection = capturedRequests.slice(beforeReqCount).some(r => {
          return r.messages.some(m => m.role === 'system' && m.content && m.content.includes('[知识库:'));
        });
        console.log(`  请求体含 [知识库: 注入: ${hasKBInjection}`);
        await shot(page, RAG_OUT, '06-rag-citation.png');
      }
    }

  } catch (e) {
    console.error('异常:', e.message);
  } finally {
    await browser.close();
  }

  console.log('\n=== 控制台错误 ===');
  if (consoleErrors.length === 0) {
    console.log('  无');
  } else {
    consoleErrors.slice(0, 5).forEach((e, i) => console.log(`  [${i}] ${e}`));
  }
})();
