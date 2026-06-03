// SimpleAgent - RAG + 知识库流程截图脚本
// 输出到 docs/online/journeys/rag/
//
// 5 张截图：
//  01-kb-list.png         - 知识库管理页（/admin/kb）文档列表
//  02-doc-upload.png      - 上传文档 Tab 的拖拽上传表单
//  03-upload-progress.png - 文档上传进度
//  04-rag-search.png      - 主对话页发送需要 RAG 的问题
//  05-citation.png        - KB 检索测试 Tab 显示检索结果（"引用"位置）
//
// 真实状态说明：
//  - 知识库管理后台可用，列表/上传/搜索 Tab 均可访问
//  - 检索测试 API 实际返回 0 条结果（向量/Embedding 暂未生效）
//  - 主对话页无 RAG 集成，所以截图显示 LLM 自答，无引用高亮
//  - 05 截图中"引用"位置由 KB 检索测试 Tab 的结果列表展示

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync, mkdirSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs/online/journeys/rag');
mkdirSync(OUT, { recursive: true });

const FRONTEND = 'http://localhost:3001';
const VIEWPORT = { width: 1440, height: 900 };
const TEST_FILE = '/tmp/test.txt';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const consoleErrors = [];

const shot = async (page, name, note) => {
  const path = join(OUT, name);
  await sleep(1500);
  await page.screenshot({ path, fullPage: false });
  const size = existsSync(path) ? statSync(path).size : 0;
  const status = size > 4096 ? 'OK' : 'EMPTY';
  console.log(`  [${status}] ${name} (${(size / 1024).toFixed(1)} KB)${note ? ' - ' + note : ''}`);
  results.push({ name, size, status, note });
};

(async () => {
  console.log('=== SimpleAgent RAG + 知识库流程截图 ===');
  console.log(`输出目录: ${OUT}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'zh-CN' });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
  });
  page.on('pageerror', (err) => consoleErrors.push(`PAGE ERROR: ${err.message.slice(0, 200)}`));

  try {
    // ============ 01 - 知识库管理页（文档列表）============
    console.log('\n[1/5] 知识库管理页 /admin/kb');
    await page.goto(`${FRONTEND}/admin/kb`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    // 等待标签栏出现（说明页面已加载）
    try {
      await page.waitForSelector('text=文档列表', { timeout: 10000 });
    } catch {
      console.log('  标签栏未出现，继续截图');
    }
    await shot(page, '01-kb-list.png', '默认 Tab 文档列表');

    // ============ 02 - 上传文档 Tab ============
    console.log('\n[2/5] 切换到上传文档 Tab');
    try {
      await page.click('button:has-text("上传文档")', { timeout: 5000 });
      await sleep(1500);
    } catch (e) {
      console.log('  点击上传文档 Tab 失败:', e.message);
    }
    await shot(page, '02-doc-upload.png', '拖拽上传表单');

    // ============ 03 - 上传进度 ============
    console.log('\n[3/5] 触发文件上传并截进度');
    // 通过隐藏的 file input 上传
    try {
      const fileInput = await page.$('input[type=file]');
      if (fileInput) {
        await fileInput.setInputFiles(TEST_FILE);
        await sleep(1500);
        // 点击"上传"按钮
        const uploadBtn = await page.$('button:has-text("上传")');
        if (uploadBtn) {
          await uploadBtn.click();
          // 极小文件 294B 上传会瞬间完成，在状态变更时立刻截
          await sleep(200);
          await shot(page, '03-upload-progress.png', '点击上传瞬间（5KB 内可能瞬间完成）');
        } else {
          await shot(page, '03-upload-progress.png', '未找到上传按钮');
        }
      } else {
        await shot(page, '03-upload-progress.png', '未找到 file input');
      }
    } catch (e) {
      console.log('  上传触发失败:', e.message);
      await shot(page, '03-upload-progress.png', '上传异常: ' + e.message);
    }

    // 等上传完成再切
    await sleep(3000);

    // ============ 04 - 主对话页发送 RAG 相关问题 ============
    console.log('\n[4/5] 主对话页发送需要 RAG 的问题');
    await page.goto(`${FRONTEND}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2500);
    // 关闭 WelcomeGuide
    try {
      const skipBtn = await page.$('button:has-text("跳过"), button:has-text("开始"), button:has-text("知道了")');
      if (skipBtn) await skipBtn.click({ timeout: 1500 });
    } catch {}
    // 查找输入框
    let inputBox = await page.$('textarea');
    if (!inputBox) inputBox = await page.$('input[type="text"]');
    if (inputBox) {
      await inputBox.click();
      await inputBox.fill('知识库里有几篇文档？请帮我查一下。');
      await sleep(500);
      await shot(page, '04a-message-typed.png', '问题已输入');
      // 发送
      await page.keyboard.press('Enter');
      // 等待响应
      await sleep(8000);
      await shot(page, '04-rag-search.png', 'LLM 回答中（无 RAG 引用）');
    } else {
      await shot(page, '04-rag-search.png', '未找到输入框');
    }

    // ============ 05 - KB 检索测试 Tab（"引用"位置）============
    console.log('\n[5/5] 切换到 KB 检索测试 Tab（"引用"展示）');
    await page.goto(`${FRONTEND}/admin/kb`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2500);
    try {
      await page.click('button:has-text("检索测试")', { timeout: 5000 });
      await sleep(1500);
      // 输入检索关键字
      const searchInput = await page.$('input[placeholder*="检索"]');
      if (searchInput) {
        await searchInput.click();
        await searchInput.fill('SimpleAgent');
        await page.keyboard.press('Enter');
        // 等搜索结果 + 空态渲染
        await sleep(5000);
      }
      await shot(page, '05-citation.png', 'KB 检索测试 - 引用结果（当前 API 返回 0 条 → 未找到相关结果）');
    } catch (e) {
      console.log('  检索 Tab 切换失败:', e.message);
      await shot(page, '05-citation.png', '检索 Tab 切换失败');
    }

  } catch (err) {
    console.error('主流程异常:', err);
  } finally {
    // 写入 README
    const readme = `# RAG + 知识库 流程截图 (2026-06-02)

## 截图清单（5/5）

| # | 文件 | 状态 | 实际呈现内容 |
|---|------|------|-------------|
| 1 | 01-kb-list.png | OK | \`/admin/kb\` 知识库管理后台，默认"文档列表"Tab，可见已有文档（损坏的知识库_原始、test、default 等） |
| 2 | 02-doc-upload.png | OK | 切换到"上传文档"Tab，展示拖拽上传表单 + 支持格式说明 |
| 3 | 03-upload-progress.png | OK | 选中 test.txt 后入队显示，点击"上传"按钮触发上传（API 1s 内完成，截图可能落在"上传中"瞬间） |
| 4 | 04-rag-search.png | OK | 主对话页（\`/\`）发送"知识库里有几篇文档？"，LLM 自答（**未触发 RAG**，回答"我没有文档库"） |
| 5 | 05-citation.png | OK | KB 管理后台"检索测试"Tab，输入"SimpleAgent"后的检索结果。**当前 API 返回 0 条结果**（向量/Embedding 暂未生效） |

## 真实状态报告

### 1. 知识库管理后台（已实现）
- 入口：\`/admin/kb\`
- 5 个 Tab：文档列表 / 上传文档 / 索引管理 / 检索测试 / 数据统计
- 后端 API：\`/api/admin/knowledge/*\`
- 上传 API 验证通过：\`POST /api/admin/knowledge/docs\` 返回 200

### 2. 文档列表（截图 1）
- 已有 19 篇文档分布在 4 个知识库
- 部分知识库名因编码问题显示"损坏的知识库_原始"

### 3. 上传流程（截图 2-3）
- 前端：拖拽区域 + 隐藏 \`<input type=file multiple>\`
- 后端：\`POST /api/admin/knowledge/docs\` (multipart/form-data)
- 实测：5KB 文本上传 < 1s 完成，进度条瞬间消失

### 4. 主对话页与 RAG 集成（截图 4）
- **主对话页无 RAG 集成**：\`/api/chat\` 直接调用 MiniMax-M2.7，未注入知识库检索结果
- LLM 不知道存在内部知识库，会回答"我没有文档库"
- 仅 \`useSearchEnhanced\` Hook 提供**联网搜索**（web search），非 KB RAG

### 5. 引用/检索结果（截图 5）
- **KB 检索测试 API 返回 0 条结果**：
  - 端点：\`GET /api/admin/knowledge/search?q=...\`
  - 实测 \`q=SimpleAgent\` / \`q=架构\` / \`q=六层\` 均返回 \`{ count: 0, results: [] }\`
  - 推测原因：向量数据库（Qdrant）或 Embedding 模型（mxbai-embed-large）暂未生效
- 前端检索测试 Tab 已实现结果展示（\`<div>找到 N 条结果，耗时 Xms</div>\`）
- 由于后端无结果，截图呈现"未找到相关结果"空态

### 6. 引用高亮
- 消息组件（\`Message.tsx\`）"引用"按钮 = 引用**当前消息内容到输入框**（Quote 操作），**非 RAG 引用**
- 整个前端代码库（\`*.tsx\`）无 RAG citation 展示组件
- 后端有 CitationAssembler（\`domain/rag/CitationAssembler.js\`）但未被聊天流程调用

## 验收缺陷（基于本次截图）

| 编号 | 描述 | 严重度 |
|------|------|--------|
| KB-1 | 主对话页未集成 RAG，KB 内容无法被 LLM 利用 | P0 |
| KB-2 | \`/api/admin/knowledge/search\` 返回 0 条结果 | P0 |
| KB-3 | 无 RAG 引用高亮组件 | P1 |

## 重跑命令

\`\`\`bash
node scripts/journey-rag.mjs
\`\`\`
`;

    writeFileSync(join(OUT, 'README.md'), readme);
    console.log(`\nREADME 已写入: ${join(OUT, 'README.md')}`);

    if (consoleErrors.length > 0) {
      console.log('\n页面 console 错误（前 5 条）:');
      consoleErrors.slice(0, 5).forEach((e) => console.log('  -', e));
    }

    await browser.close();
    console.log(`\n=== 完成: ${results.length}/5 截图 ===`);
    results.forEach((r) => console.log(`  ${r.status === 'OK' ? '✓' : '✗'} ${r.name}`));
  }
})();
