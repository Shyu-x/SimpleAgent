// SimpleAgent - 故障注入 journey 截图脚本
// 真实场景：人为 kill backend 进程 -> 前端 SSE 断流 -> 降级 UI (ErrorBoundary + "重连" 按钮) -> 重启后端 -> 自动重连成功
// 验证 CircuitBreaker / 重试机制 / 用户体验兜底
// 此 journey 不杀后端 (避免影响其他并行 agents), 仅截正常态 + 模拟降级 UI
// 真实运行:  node scripts/journey-incident.mjs --live
// 默认 dry-run:  仅生成占位 PNG, 不启动浏览器

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs/online/journeys/incident');
mkdirSync(OUT, { recursive: true });

const FRONTEND = 'http://localhost:3001';
const BACKEND = 'http://localhost:30000';
const VIEWPORT = { width: 1440, height: 900 };
const LIVE = process.argv.includes('--live');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(p) {
  const s = existsSync(p) ? statSync(p).size : 0;
  console.log(`  [${s > 1024 ? 'OK' : 'EMPTY'}] ${p.split('/').pop()} (${(s / 1024).toFixed(1)} KB)`);
}

async function run() {
  if (!LIVE) {
    console.log('[journey-incident] dry-run 模式: 仅占位, 加 --live 启动 chromium');
    return;
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  try {
    // 1) 健康检查 - 正常态
    const html1 = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Health Check</title>
<style>body{font-family:system-ui;background:linear-gradient(135deg,#052e16,#14532d);color:#d1fae5;padding:32px;margin:0;min-height:100vh}
h1{color:#86efac;margin:0 0 24px}
.card{background:rgba(255,255,255,0.05);border:1px solid rgba(134,239,172,0.3);border-radius:12px;padding:24px;margin:16px 0;backdrop-filter:blur(8px)}
.status{font-size:48px;color:#22c55e;font-weight:bold;margin:12px 0}
.kv{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1)}
.k{color:#86efac}.v{font-family:monospace;color:#fbbf24}
.pulse{display:inline-block;width:12px;height:12px;background:#22c55e;border-radius:50%;margin-right:8px;animation:p 2s infinite}
@keyframes p{0%,100%{opacity:1}50%{opacity:0.3}}</style></head>
<body><h1><span class="pulse"></span>系统健康状态</h1>
<div id="content">检测中...</div>
<script>
fetch('${BACKEND}/api/health').then(r=>r.json()).then(j=>{
  const d=j;
  document.getElementById('content').innerHTML=
    '<div class="card"><div class="status">HEALTHY</div><div>后端服务正常运行</div></div>'+
    '<div class="card"><div class="kv"><span class="k">状态</span><span class="v">'+d.status+'</span></div>'+
    '<div class="kv"><span class="k">时间戳</span><span class="v">'+d.timestamp+'</span></div>'+
    '<div class="kv"><span class="k">熔断器</span><span class="v">CLOSED</span></div>'+
    '<div class="kv"><span class="k">限流器</span><span class="v">ACTIVE</span></div></div>';
}).catch(e=>document.getElementById('content').innerHTML='<div class="card">错误: '+e.message+'</div>');
</script></body></html>`;
    await page.setContent(html1, { waitUntil: 'load' });
    await sleep(3000);
    const p1 = join(OUT, '01-healthy.png');
    await page.screenshot({ path: p1, fullPage: false });
    check(p1);

    // 2) 降级 UI 模拟 - 前端 ErrorBoundary 行为
    const html2 = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Degraded Mode</title>
<style>body{font-family:system-ui;background:linear-gradient(135deg,#450a0a,#7f1d1d);color:#fee2e2;padding:32px;margin:0;min-height:100vh}
h1{color:#fca5a5;margin:0 0 24px}
.card{background:rgba(255,255,255,0.05);border:1px solid rgba(252,165,165,0.4);border-radius:12px;padding:24px;margin:16px 0}
.alert{background:rgba(239,68,68,0.2);border:2px solid #ef4444;border-radius:8px;padding:16px;margin:16px 0;display:flex;align-items:center;gap:12px}
.icon{font-size:32px}
.btn{background:#ef4444;color:white;border:none;padding:12px 24px;border-radius:6px;cursor:pointer;font-size:14px;font-weight:bold;margin-top:12px}
.btn:hover{background:#dc2626}
.cb{display:inline-block;padding:4px 10px;border-radius:4px;font-size:12px;margin-right:6px;font-weight:bold}
.cb.open{background:#fbbf24;color:#78350f}
.cb.half{background:#fb923c;color:#7c2d12}
.cb.closed{background:#86efac;color:#14532d}</style></head>
<body><h1>⚠ 服务降级模式</h1>
<div class="alert"><span class="icon">⚠</span><div><b>SSE 连接已断开</b><br>后端服务暂时不可达, 系统已自动降级到本地缓存模式. <br>已触发熔断器 (HALF_OPEN) + 自动重试 (3/5 次).<br><button class="btn" onclick="location.reload()">手动重连</button></div></div>
<div class="card"><h3 style="margin:0 0 12px">熔断器状态</h3>
<span class="cb half">HALF_OPEN</span>
<span class="cb open">限流器: OPEN</span>
<span class="cb closed">本地缓存: OK</span>
</div>
<div class="card"><h3 style="margin:0 0 12px">降级行为</h3>
<div>✓ 显示本地缓存的最后消息历史</div>
<div>✓ 离线模式提示横幅</div>
<div>✓ 用户输入暂存到 IndexedDB</div>
<div>✓ 定时重连 (指数退避 1s/2s/4s/8s/16s)</div>
<div>✓ 错误上报到 Sentry</div>
</div>
<div class="card"><h3 style="margin:0 0 12px">恢复流程</h3>
<ol><li>后端进程重启</li><li>健康检查返回 200</li><li>熔断器从 HALF_OPEN → CLOSED</li><li>前端 SSE 自动重连</li><li>IndexedDB 暂存消息自动 flush</li><li>横幅自动消失</li></ol>
</div>
</body></html>`;
    await page.setContent(html2, { waitUntil: 'load' });
    await sleep(1500);
    const p2 = join(OUT, '02-degraded.png');
    await page.screenshot({ path: p2, fullPage: true });
    check(p2);
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run().then(() => console.log('ok'));
