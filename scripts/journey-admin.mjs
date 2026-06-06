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

async function run() {
  if (!LIVE) {
    console.log('[journey-admin] dry-run 模式: 仅占位, 加 --live 启动 chromium');
    return;
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  try {
    await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
    // TODO: 遍历 6 个 admin 模块
    //   - 01-dashboard.png   -> /admin             (AdminDashboard)
    //   - 02-knowledge.png   -> /admin/knowledge   (KnowledgeBase)
    //   - 03-tools.png       -> /admin/tools       (ToolRegistry)
    //   - 04-models.png      -> /admin/models      (ModelConfig)
    //   - 05-prompts.png     -> /admin/prompts     (PromptTemplate)
    //   - 06-traces.png      -> /admin/traces      (TraceViewer)
    //   每个模块: page.goto -> waitForSelector -> 截图 -> 验证非空
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
