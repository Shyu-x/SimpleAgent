// SimpleAgent - A2A 多 Agent 协作 journey 截图脚本
// 真实场景：team_leader 模式下分发 3+ 子任务给 code-reviewer / researcher / tester 并行执行
// 后端 /api/a2a/collaborate + /api/a2a/collaboration/:id/result 标准化结果汇总
// 真实运行:  node scripts/journey-a2a.mjs --live
// 默认 dry-run:  仅生成占位 PNG, 不启动浏览器

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs/online/journeys/a2a');
mkdirSync(OUT, { recursive: true });

const FRONTEND = 'http://localhost:3001';
const VIEWPORT = { width: 1440, height: 900 };
const LIVE = process.argv.includes('--live');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  if (!LIVE) {
    console.log('[journey-a2a] dry-run 模式: 仅占位, 加 --live 启动 chromium');
    return;
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  try {
    await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
    // TODO: 触发 A2A 多 Agent 协作
    //   - await page.fill('textarea', '协作完成: 调研 React 19 + 写测试 + 代码审查');
    //   - await page.click('button:has-text("协作")');
    //   - 01-task-distribution.png  任务分发列表 (含 dependencies/timeout/effort)
    //   - 02-parallel-running.png   多个 Agent SSE 实时状态
    //   - 03-result-aggregated.png  依赖图 + 标准化结果 + 验证 criteria
    await page.screenshot({ path: join(OUT, '01-placeholder.png'), fullPage: false });
    const size = existsSync(join(OUT, '01-placeholder.png')) ? statSync(join(OUT, '01-placeholder.png')).size : 0;
    console.log(`  [${size > 1024 ? 'OK' : 'EMPTY'}] 01-placeholder.png (${(size / 1024).toFixed(1)} KB)`);
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run().then(() => console.log('ok'));
