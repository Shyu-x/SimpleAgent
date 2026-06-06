// SimpleAgent - MCP 工具市场 UI journey 截图脚本
// 真实场景：ToolMarketplace 组件展示可用 MCP 工具, 用户启用/禁用/配置工具
// 当前完成度 40% (连接有, 工具管理无后端) - 此 journey 验证 UI 渲染 + 占位 API
// 真实运行:  node scripts/journey-mcp.mjs --live
// 默认 dry-run:  仅生成占位 PNG, 不启动浏览器

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs/online/journeys/mcp');
mkdirSync(OUT, { recursive: true });

const FRONTEND = 'http://localhost:3001';
const VIEWPORT = { width: 1440, height: 900 };
const LIVE = process.argv.includes('--live');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  if (!LIVE) {
    console.log('[journey-mcp] dry-run 模式: 仅占位, 加 --live 启动 chromium');
    return;
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  try {
    await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
    // TODO: 打开工具市场面板
    //   - 01-marketplace-list.png    工具列表 (含已连接/未连接状态)
    //   - 02-tool-detail.png         工具详情 (参数/描述/MCP server URL)
    //   - 03-toggle-enable.png       启用/禁用 toggle 操作
    //   - 04-mcp-status.png          MCP 连接状态 (来自 /api/minimax/status)
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
