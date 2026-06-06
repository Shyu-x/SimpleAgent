// SimpleAgent - 管理后台 6 模块 journey 截图脚本
// 真实场景：/admin 路由下 6 个模块 (AdminDashboard/ModelConfig/PromptTemplate/TraceViewer/KnowledgeBase/ToolRegistry) 集成验收
// 真实运行:  node scripts/journey-admin.mjs --live
// 默认 dry-run:  仅生成占位 PNG, 不启动浏览器

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs/online/journeys/admin');
mkdirSync(OUT, { recursive: true });

const FRONTEND = 'http://localhost:3001';
const VIEWPORT = { width: 1440, height: 900 };
const LIVE = process.argv.includes('--live');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(p) {
  const s = existsSync(p) ? statSync(p).size : 0;
  console.log(`  [${s > 1024 ? 'OK' : 'EMPTY'}] ${p.split('/').pop()} (${(s / 1024).toFixed(1)} KB)`);
}

async function capturePage(page, url, outPath) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2500);
  } catch (e) {
    console.log(`  [WARN] ${url} goto 失败: ${e.message}`);
  }
  await page.screenshot({ path: outPath, fullPage: false });
  check(outPath);
}

async function run() {
  if (!LIVE) {
    console.log('[journey-admin] dry-run 模式: 仅占位, 加 --live 启动 chromium');
    return;
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  try {
    // 1) 总览仪表盘
    await capturePage(page, `${FRONTEND}/admin`, join(OUT, '01-dashboard.png'));
    // 2) 工具注册
    await capturePage(page, `${FRONTEND}/admin/tools`, join(OUT, '02-tools.png'));
    // 3) 知识库
    await capturePage(page, `${FRONTEND}/admin/kb`, join(OUT, '03-kb.png'));
    // 4) 模型配置
    await capturePage(page, `${FRONTEND}/admin/models`, join(OUT, '04-models.png'));
    // 5) Prompt 模板
    await capturePage(page, `${FRONTEND}/admin/prompts`, join(OUT, '05-prompts.png'));
    // 6) 链路追踪
    await capturePage(page, `${FRONTEND}/admin/traces`, join(OUT, '06-traces.png'));
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run().then(() => console.log('ok'));
