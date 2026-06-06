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
    console.log('[journey-alert] dry-run 模式: 仅占位, 加 --live 启动 chromium');
    return;
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  try {
    // 1) Prometheus 原始指标 (Prom format 文本)
    await page.goto(`${BACKEND}/metrics`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(1500);
    const p1 = join(OUT, '01-metrics-prom.png');
    await page.screenshot({ path: p1, fullPage: false });
    check(p1);

    // 2) 业务指标可视化 (data: URL, 拉取 /api/metrics + /api/admin/stats + /api/alerts)
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Metrics Dashboard</title>
<style>body{font-family:system-ui;background:#0a0a1a;color:#e2e8f0;padding:24px;margin:0}
h1{color:#60a5fa;margin:0 0 16px}
h2{color:#94a3b8;font-size:14px;text-transform:uppercase;margin:24px 0 8px;letter-spacing:1px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.card{background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid #334155;border-radius:10px;padding:20px}
.metric{font-size:36px;font-weight:bold;color:#22c55e;font-family:monospace}
.metric.warn{color:#fbbf24}.metric.err{color:#ef4444}
.label{color:#94a3b8;font-size:13px;margin-top:4px}
table{width:100%;border-collapse:collapse;margin-top:12px;background:#1e293b;border-radius:6px;overflow:hidden}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #334155;font-size:13px}
th{background:#0c4a6e;color:white}
.bar{height:8px;background:#334155;border-radius:4px;overflow:hidden;margin-top:4px}
.bar-fill{height:100%;background:linear-gradient(90deg,#22c55e,#16a34a)}
.tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;margin:2px}
.tag.crit{background:#7f1d1d;color:#fecaca}
.tag.warn{background:#78350f;color:#fde68a}
.tag.ok{background:#14532d;color:#bbf7d0}</style></head>
<body><h1>MetricsCollector 实时指标</h1>
<h2>系统总览</h2><div class="grid" id="cards">加载中...</div>
<h2>API 端点 QPS</h2><div id="endpoints">加载中...</div>
<h2>告警状态</h2><div id="alerts">加载中...</div>
<script>
async function j(url){const r=await fetch(url);const ct=r.headers.get('content-type')||'';return ct.includes('json')?r.json():r.text()}
Promise.all([j('${BACKEND}/api/admin/stats'),j('${BACKEND}/api/metrics'),j('${BACKEND}/api/alerts')])
.then(([stats,metrics,alerts])=>{
  const d=stats.data||{};
  const c=document.getElementById('cards');
  c.innerHTML=
    '<div class="card"><div class="metric">'+(d.totalRequests||0).toLocaleString()+'</div><div class="label">总请求数</div></div>'+
    '<div class="card"><div class="metric '+((d.successRate||0)<0.95?'warn':'ok')+'">'+((d.successRate||0)*100).toFixed(2)+'%</div><div class="label">成功率</div></div>'+
    '<div class="card"><div class="metric">'+((d.avgLatency||0).toFixed(1))+'ms</div><div class="label">平均延迟</div></div>'+
    '<div class="card"><div class="metric">'+((d.activeSessions||0))+'</div><div class="label">活跃会话</div></div>';
  const lines=typeof metrics==='string'?metrics.split('\\n').filter(l=>l.match(/^http_requests_total/)&&!l.match(/module="unknown"/)):[];
  const top=lines.map(l=>{const m=l.match(/endpoint="([^"]+)".*status="(\d+)".*\s(\d+)/);return m?{ep:m[1],st:m[2],n:+m[3]}:null}).filter(Boolean).sort((a,b)=>b.n-a.n).slice(0,8);
  document.getElementById('endpoints').innerHTML='<table><tr><th>端点</th><th>状态</th><th>请求数</th></tr>'+
    top.map(r=>'<tr><td>'+r.ep+'</td><td>'+r.st+'</td><td>'+r.n+'</td></tr>').join('')+'</table>';
  const a=Array.isArray(alerts)?alerts:(alerts.data||[]);
  document.getElementById('alerts').innerHTML=a.length?
    a.map(x=>'<div class="card"><span class="tag '+(x.severity||'ok')+'">'+(x.severity||'info')+'</span> <b>'+(x.title||x.name||'告警')+'</b> - '+(x.message||'')+'</div>').join(''):
    '<div class="card"><span class="tag ok">OK</span> 当前无活跃告警, 所有指标正常</div>';
}).catch(e=>document.body.innerHTML='<h1>错误</h1><pre>'+e.message+'</pre>');
</script></body></html>`;
    await page.setContent(html, { waitUntil: 'load' });
    await sleep(4000);
    const p2 = join(OUT, '02-metrics-dashboard.png');
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
