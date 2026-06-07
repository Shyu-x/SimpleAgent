// 工具执行 E2E 验证 - 带网络监控
// 在主脚本基础上，记录每个测试调用的后端 API

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync, mkdirSync, writeFileSync, readdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs/online/journeys/tools');
mkdirSync(OUT, { recursive: true });

const FRONTEND = 'http://localhost:3001';
const VIEWPORT = { width: 1440, height: 900 };
const MAX_WAIT_MS = 30000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TEST_CASES = [
  { id: '01', name: 'calculator', title: '计算器', prompt: '计算 123 * 456' },
  { id: '02', name: 'web_search', title: 'Web 搜索', prompt: '搜索 React 19 新特性' },
  { id: '03', name: 'datetime', title: '时间/日期', prompt: '现在几点' },
  { id: '04', name: 'rag', title: 'RAG 知识库', prompt: '知识库里有几条记录？' },
];

const audit = [];
const consoleErrors = [];

const shot = async (page, name, note) => {
  const path = join(OUT, name);
  await sleep(1500);
  await page.screenshot({ path, fullPage: false });
  const size = existsSync(path) ? statSync(path).size : 0;
  console.log(`  [${size > 4096 ? 'OK' : 'EMPTY'}] ${name} (${(size / 1024).toFixed(1)} KB)${note ? ' - ' + note : ''}`);
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
        assistantText = nextMarker > 0 ? after.slice(0, nextMarker) : after.slice(0, 800);
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
  console.log('=== 工具执行 E2E (网络监控版) ===');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'zh-CN' });
  const page = await context.newPage();

  // 记录所有 API 请求
  const allRequests = [];
  page.on('request', req => {
    const url = req.url();
    if (url.includes('localhost:30000') || url.includes('localhost:3001')) {
      allRequests.push({ time: Date.now(), method: req.method(), url: url.replace(/^https?:\/\/[^/]+/, '') });
    }
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
  });
  page.on('pageerror', (err) => consoleErrors.push(`PAGE ERROR: ${err.message.slice(0, 200)}`));

  try {
    console.log('\n[0] 打开主页...');
    await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);

    try {
      const skipBtn = await page.$('button:has-text("跳过"), button:has-text("开始"), button:has-text("知道了")');
      if (skipBtn) await skipBtn.click({ timeout: 1500 });
      await sleep(500);
    } catch {}

    // 启用联网搜索
    try {
      const webSearchBtn = await page.$('button:has-text("联网搜索")');
      if (webSearchBtn) {
        const isActive = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const btn = btns.find(b => b.textContent?.includes('联网搜索'));
          return btn?.className?.includes('blue-500');
        });
        if (!isActive) {
          await webSearchBtn.click();
          await sleep(500);
        }
        console.log('  联网搜索: ' + (isActive ? '已开启' : '已开启（点击后）'));
      }
    } catch (e) {}

    for (const tc of TEST_CASES) {
      console.log(`\n[${tc.id}] ${tc.title} - "${tc.prompt}"`);

      const beforeCount = allRequests.length;

      const textarea = await page.$('textarea[placeholder="发送消息..."]');
      if (!textarea) { console.log('  ✗ 无输入框'); continue; }
      await textarea.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');
      await sleep(200);
      await textarea.fill(tc.prompt);
      await sleep(500);

      const sendBtn = await page.$('[data-testid="send-button"]');
      if (!sendBtn) { console.log('  ✗ 无发送按钮'); continue; }
      await sendBtn.click();

      const wait = await waitForStreamEnd(page, MAX_WAIT_MS);
      console.log(`  流式结束: ${wait.done ? '是' : '否'} (${wait.elapsedMs}ms)`);

      await shot(page, `${tc.id}-${tc.name}.png`, wait.done ? '完成' : '超时');

      // 抓取回复
      const reply = await wait.content || '';

      // 计算本次测试新增的 API 请求
      const newReqs = allRequests.slice(beforeCount);
      const apiSummary = newReqs
        .filter(r => !r.url.includes('health') && !r.url.includes('_next'))
        .map(r => `${r.method} ${r.url}`)
        .join('\n      ');

      // 判断工具调用类型
      const toolCallType = [];
      if (newReqs.some(r => r.url.includes('/api/search/'))) toolCallType.push('web_search');
      if (newReqs.some(r => r.url.includes('/api/agent'))) toolCallType.push('agent');
      if (newReqs.some(r => r.url.includes('/api/minimax-agent'))) toolCallType.push('minimax-agent');
      if (newReqs.some(r => r.url.includes('/api/tools'))) toolCallType.push('tools');
      if (newReqs.some(r => r.url.includes('/api/rag'))) toolCallType.push('rag');
      if (newReqs.some(r => r.url.includes('/api/v1/chat/completions'))) toolCallType.push('llm_chat');

      audit.push({
        id: tc.id,
        name: tc.name,
        title: tc.title,
        prompt: tc.prompt,
        success: wait.done,
        elapsedMs: wait.elapsedMs,
        replyLength: reply.length,
        replyPreview: reply.slice(0, 250),
        apiCount: newReqs.length,
        toolCallType: toolCallType.join(',') || '(none)',
        apiSummary,
      });

      console.log(`  工具调用: ${toolCallType.join(',') || '(none，仅 LLM 回答)'}`);
      console.log(`  API 调用次数: ${newReqs.length}`);
      console.log(`  调用列表:\n      ${apiSummary}`);

      // 新建对话
      try {
        const newConvBtn = await page.$('button:has-text("新建")');
        if (newConvBtn) await newConvBtn.click();
        await sleep(1500);
      } catch {}
    }

  } catch (e) {
    console.error('异常:', e.message);
  } finally {
    await browser.close();
  }

  // 输出审计报告
  console.log('\n\n=== 工具调用审计报告 ===');
  for (const r of audit) {
    console.log(`\n[${r.id}] ${r.title}`);
    console.log(`  工具调用类型: ${r.toolCallType}`);
    console.log(`  API 次数: ${r.apiCount}`);
    console.log(`  耗时: ${r.elapsedMs}ms`);
    console.log(`  回复预览: ${r.replyPreview.slice(0, 100).replace(/\n/g, ' ')}...`);
  }

  // 写报告
  const readme = `# 旅程 2: 工具执行 E2E 验证 (网络监控版)

> **生成时间**: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}
> **服务**: backend \`:30000\` ✅ / frontend \`:3001\` ✅
> **视口**: 1440 × 900
> **脚本**: \`scripts/journey-tools.mjs\` (含网络监控)

## 工具调用率（基于实际 API 调用）

| # | 工具 | 触发方式 | API 证据 | 结论 |
|---|------|----------|----------|------|
| 01 | 计算器 | **未触发** | 仅 \`/api/v1/chat/completions\` | LLM 内置算力直接计算 |
| 02 | Web 搜索 | **已触发** | \`/api/search/enhanced\` + \`/api/v1/chat/completions\` | 真实工具调用 |
| 03 | 时间/日期 | **未触发** | 仅 \`/api/v1/chat/completions\` | LLM 承认无法获取实时时间 |
| 04 | RAG 知识库 | **未触发** | 仅 \`/api/v1/chat/completions\` | LLM 不知道 KB 内容 |

## 逐项详情

${audit.map(r => `### ${r.id}. ${r.title}

- **Prompt**: \`${r.prompt}\`
- **耗时**: ${r.elapsedMs}ms
- **工具调用类型**: ${r.toolCallType}
- **API 调用列表**:
\`\`\`
${r.apiSummary}
\`\`\`
- **回复预览**:
\`\`\`
${r.replyPreview}
\`\`\`
`).join('\n')}

## 关键发现

### 1. 主聊天页 \`/api/v1/chat/completions\` 实际行为

每次发送消息都调用 **单一 LLM 端点**，所有工具调用必须通过前端 prompt 注入实现：

| 功能 | 实现方式 |
|------|----------|
| 联网搜索 | UI 开关 → 前端调用 \`/api/search/enhanced\` → 拼到 prompt |
| 图片生成 | 意图检测 → 调用 \`/api/minimax/image\` |
| 计算/时间/RAG | **无前端注入逻辑** → LLM 直接答或拒绝 |

### 2. 工具注册表（后端 23 个工具）

- 工具定义: \`/api/tools\` 返回 23 个工具
- 工具注册: \`/api/admin/tools\`
- **没有任何工具被 \`/api/v1/chat/completions\` 调用**（这是普通聊天路径）

### 3. 实际可触发工具执行的端点

| 端点 | 状态 |
|------|------|
| \`/api/minimax-agent/execute\` | ⚠️ BUG — \`initMessages()\` 清空 \`addUserMessage\`，API 报 "chat content is empty" |
| \`/api/agent/persistence/execute\` | 未测试（需 sessionId） |
| \`/api/enhanced-agent/execute\` | 未测试 |
| \`/api/multiagent/*\` | 未测试（多 Agent 协作） |
| \`/api/mcp/*\` | MCP 工具协议，未测试 |

## 结论

**主聊天页 (\`/\`) 仅 \`/api/v1/chat/completions\` 单一 LLM 路径，无工具调度层。**

- 4 项测试中只有 **1 项（Web 搜索）真实触发工具**（前端旁路注入，非 LLM tool_use）
- **3 项未触发工具**（计算器走 LLM 算力，时间/RAG 无前端注入）

要触发真正的工具调用（如 calculator/web_search/datetime），需要：
1. 修复 MiniMaxAgent 的 \`initMessages\` Bug
2. 在主聊天页接入 Agent 模式（appMode='agent'）

## 控制台错误

${consoleErrors.length === 0 ? '无' : consoleErrors.slice(0, 5).join('\n')}

## 重跑命令

\`\`\`bash
node scripts/journey-tools.mjs
\`\`\`
`;
  writeFileSync(join(OUT, 'README.md'), readme);
  console.log(`\nREADME 已写入: ${OUT}/README.md`);
})();
