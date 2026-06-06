// SimpleAgent - 告警链路 journey 截图脚本
// 真实场景：MetricsCollector 检测到异常 -> AlertManager 触发 critical/warning -> SSE 通知前端 -> 用户确认 -> 恢复
// 关键路径: /api/metrics + /api/alerts (SSE) + AlertManager.emit()
// 真实运行:  node scripts/journey-alert.mjs --live
// 默认 dry-run:  仅生成占位 PNG, 不启动浏览器

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs/online/journeys/alert');
mkdirSync(OUT, { recursive: true });

const FRONTEND = 'http://localhost:3001';
const VIEWPORT = { width: 1440, height: 900 };
const LIVE = process.argv.includes('--live');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  if (!LIVE) {
    console.log('[journey-alert] dry-run 模式: 仅占位, 加 --live 启动 chromium');
    return;
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  try {
    await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
    // TODO: 触发告警全流程
    //   - 01-metrics-normal.png       正常指标面板 (P50/P99/QPS/错误率)
    //   - 02-alert-triggered.png      critical 告警弹出 (红/黄等级)
    //   - 03-alert-ack.png            用户点击确认/处理
    //   - 04-alert-recovered.png      指标恢复绿色状态
    //   触发方式: 直接调用 POST /api/alerts/test 或压测拉高错误率
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
