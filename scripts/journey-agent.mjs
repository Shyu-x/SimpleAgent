// Playwright 截图脚本 - Agent 协作流程 (旅程 2)
// 严格捕获真实状态，禁止伪造
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdir } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCREENSHOTS_DIR = join(__dirname, '..', 'docs', 'online', 'journeys', 'agent');
const BASE_URL = 'http://localhost:3001';
const VIEWPORT = { width: 1440, height: 900 };

const results = [];
const notes = [];

function logResult(idx, name, status, file, kb) {
  results.push({ idx, name, status, file, kb });
  const icon = status === 'ok' ? 'OK' : status === 'partial' ? 'P' : 'X';
  console.log(`  [${icon}] ${String(idx).padStart(2,'0')} ${name} -> ${file} (${kb} KB)`);
}

async function dismissModal(page) {
  // 关闭欢迎弹窗: 按 ESC、点击关闭按钮、或通过 store 关闭
  for (let i = 0; i < 5; i++) {
    const modal = await page.$('div.fixed.inset-0.z-\\[100\\]');
    if (!modal) break;
    // 尝试点关闭按钮 (X) 或"知道了" / 跳过
    const closed = await page.evaluate(() => {
      // 找带"知道了"/"开始"/"Skip"/"close"/"完成"等字样的按钮
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find(b => {
        const t = (b.textContent || '').trim();
        return /^(知道了|开始|完成|跳过|关闭|Close|Skip|OK|Got it|开始使用|我知道了|稍后)$/i.test(t);
      });
      if (target) { target.click(); return true; }
      // 备选：找带 X 图标的 close 按钮
      const closeBtn = document.querySelector('button[aria-label*="close"], button[aria-label*="关闭"], button[aria-label*="关"]');
      if (closeBtn) { closeBtn.click(); return true; }
      return false;
    });
    if (closed) {
      await page.waitForTimeout(800);
    } else {
      // 备选 ESC
      await page.keyboard.press('Escape').catch(()=>{});
      await page.waitForTimeout(500);
    }
  }
}

async function shoot(page, file, label) {
  await page.waitForTimeout(2000);
  const path = join(SCREENSHOTS_DIR, file);
  try {
    await page.screenshot({ path, fullPage: false, timeout: 15000, animations: 'disabled' });
  } catch (e) {
    console.log(`  [shoot-fail-v1] ${file}: ${e.message.substring(0, 80)}, try CDP fallback`);
    // 回退方案：使用 CDP 强制截图
    try {
      const client = await page.context().newCDPSession(page);
      const { data } = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const { writeFile } = await import('fs/promises');
      await writeFile(path, Buffer.from(data, 'base64'));
      await client.detach();
    } catch (e2) {
      console.log(`  [shoot-fail-v2] ${file}: ${e2.message.substring(0, 100)}`);
    }
  }
  return path;
}

async function fileSize(p) {
  try {
    const { stat } = await import('fs/promises');
    const s = await stat(p);
    return Math.round(s.size / 1024);
  } catch { return 0; }
}

(async () => {
  await mkdir(SCREENSHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();

  // 收集 console 错误（用于评估真实状态）
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`console.error: ${m.text()}`);
  });

  try {
    // 1) 主对话页 - Agent 模式开关
    console.log('\n[1/6] 主对话页 + Agent 入口');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    await dismissModal(page);
    // 验证 Agent 按钮存在
    const agentBtn = await page.$('a[href="/agent"]');
    if (!agentBtn) notes.push('未找到 Agent 入口按钮 (a[href="/agent"])');
    let p1 = await shoot(page, '01-agent-mode-toggle.png', '01-agent-mode-toggle');
    logResult(1, '主对话页 + Agent 入口', agentBtn ? 'ok' : 'partial', '01-agent-mode-toggle.png', await fileSize(p1));

    // 2) 点击 Agent 进入 /agent 页 (MissionControl) -> 工具选择面板
    console.log('\n[2/6] Agent 页 - 工具/Mission 选择');
    await dismissModal(page);
    if (agentBtn) {
      try {
        await agentBtn.click({ timeout: 8000, force: true });
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(()=>{});
      } catch (e) {
        notes.push(`点击 Agent 入口失败: ${e.message.substring(0, 100)}`);
        await page.goto(`${BASE_URL}/agent`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(()=>{});
      }
    } else {
      await page.goto(`${BASE_URL}/agent`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(()=>{});
    }
    await page.waitForTimeout(4000);
    await dismissModal(page);
    // 检查工具/Mission 相关元素
    const toolArea = await page.$('text=/工具|Tool|tool|任务|Mission|Broadcast|Action/i');
    let p2 = await shoot(page, '02-tool-selector.png', '02-tool-selector');
    logResult(2, 'Agent 页工具/Mission 面板', toolArea ? 'ok' : 'partial', '02-tool-selector.png', await fileSize(p2));
    if (!toolArea) notes.push('Agent 页 (MissionControl) 未检测到 Tool/任务 相关字样');

    // 3) 返回主对话页 - 发送天气查询 - agent 思考状态
    console.log('\n[3/6] 发送"今天北京天气怎么样" - thinking');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    await dismissModal(page);
    // 找到 textarea 并输入
    const textarea = await page.$('textarea[placeholder*="发送"]') || await page.$('textarea');
    if (textarea) {
      await textarea.click();
      await textarea.fill('今天北京天气怎么样');
      // 触发发送 (Enter 或点击发送按钮)
      const sent = await page.evaluate(() => {
        const btn = document.querySelector('button[aria-label*="发送"], button[title*="发送"]')
          || Array.from(document.querySelectorAll('button')).find(b => /发送|Send/i.test(b.textContent || ''));
        if (btn) { btn.click(); return 'button'; }
        return null;
      });
      if (!sent) {
        await textarea.press('Enter').catch(()=>{});
      }
    } else {
      notes.push('未找到聊天输入框 (textarea)');
    }
    // 短延迟以抓取"思考中"状态
    await page.waitForTimeout(2500);
    let p3 = await shoot(page, '03-agent-thinking.png', '03-agent-thinking');
    logResult(3, 'Agent 思考/工具调用状态', textarea ? 'ok' : 'partial', '03-agent-thinking.png', await fileSize(p3));

    // 4) 等待工具调用结果 - 截图结果回填
    console.log('\n[4/6] 等待工具结果回填');
    // 等待更长时间让流式响应完成
    await page.waitForTimeout(8000);
    let p4 = await shoot(page, '04-tool-result.png', '04-tool-result');
    logResult(4, '工具结果回填', textarea ? 'ok' : 'partial', '04-tool-result.png', await fileSize(p4));

    // 5) 多 agent 面板 (智能体 side panel)
    console.log('\n[5/6] 打开多 Agent 面板 (智能体)');
    // 关闭可能存在的结果弹窗
    await page.keyboard.press('Escape').catch(()=>{});
    await page.waitForTimeout(500);
    // 找智能体 tab - 通过 title 包含"智能体"
    const agentTab = await page.$('button[title="智能体"]');
    if (!agentTab) {
      // 备选：通过图标位置或文字
      const allBtns = await page.$$('button[title]');
      for (const b of allBtns) {
        const t = await b.getAttribute('title');
        if (t && /智能体|Agent|agents/i.test(t)) {
          await b.click().catch(()=>{});
          break;
        }
      }
    } else {
      await agentTab.click().catch(()=>{});
    }
    await page.waitForTimeout(3500);
    // 检测多 agent 面板是否出现
    const multiPanel = await page.$('text=/A2A|多智能体|multi.agent|协作|Agent.*协作/i');
    let p5 = await shoot(page, '05-multi-agent-panel.png', '05-multi-agent-panel');
    logResult(5, '多 Agent 面板', multiPanel ? 'ok' : 'partial', '05-multi-agent-panel.png', await fileSize(p5));
    if (!multiPanel) notes.push('未检测到 A2A/多智能体 面板文本');

    // 6) 触发协作任务 - A2A 状态更新
    console.log('\n[6/6] 触发 A2A 协作任务');
    // 查找"协作"/"开始"/"启动"/"Start"等按钮
    const collabTriggered = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const candidates = buttons.filter(b => {
        const t = (b.textContent || '').trim();
        return /开始协作|启动协作|协作|start.*collab|collab.*start|delegate|派发|广播|broadcast/i.test(t);
      });
      if (candidates.length > 0) {
        candidates[0].click();
        return candidates[0].textContent.trim();
      }
      return null;
    });
    if (collabTriggered) {
      console.log(`  -> 触发按钮: ${collabTriggered}`);
    } else {
      notes.push('未找到明显的"协作"触发按钮 (尝试通过 evaluate)');
      // 备选：进入 /agent 页用 MissionControl
      await page.goto(`${BASE_URL}/agent`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(()=>{});
      await page.waitForTimeout(2500);
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const playBtn = buttons.find(b => {
          const t = (b.textContent || '') + ' ' + (b.getAttribute('title') || '') + ' ' + (b.getAttribute('aria-label') || '');
          return /start|开始|启动|play/i.test(t);
        });
        if (playBtn) playBtn.click();
      });
    }
    // 等待 A2A 状态更新
    await page.waitForTimeout(4000);
    let p6 = await shoot(page, '06-collaboration-status.png', '06-collaboration-status');
    logResult(6, 'A2A 协作状态', collabTriggered ? 'ok' : 'partial', '06-collaboration-status.png', await fileSize(p6));

    // 控制台错误收集
    if (consoleErrors.length > 0) {
      notes.push(`页面共发现 ${consoleErrors.length} 条 console error / pageerror`);
      console.log('\nConsole errors:');
      consoleErrors.slice(0, 8).forEach(e => console.log('  -', e.substring(0, 200)));
    }
  } catch (e) {
    console.error('Screenshot script failed:', e.message);
    notes.push(`脚本异常: ${e.message}`);
  } finally {
    await browser.close();
  }

  console.log('\n=== 结果汇总 ===');
  const okCount = results.filter(r => r.status === 'ok').length;
  console.log(`截图: ${results.length}/6  (OK=${okCount})`);
  if (notes.length > 0) {
    console.log('\n附注:');
    notes.forEach(n => console.log(`  - ${n}`));
  }
})();
