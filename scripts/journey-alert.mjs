// SimpleAgent - 告警链路 journey 截图脚本
// 真实场景：MetricsCollector 检测指标 → AlertManager 触发告警 → 前端告警中心
// 关键路径: /api/alerts (实时) + /api/metrics (Prom) + /api/admin/stats
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
    // 1) Prometheus 原始指标
    await page.goto(`${BACKEND}/metrics`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
    const p1 = join(OUT, '01-metrics-prom.png');
    await page.screenshot({ path: p1, fullPage: false });
    check(p1);

    // 2) 业务指标可视化 - 用 fetch 拉取数据再渲染
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Metrics Dashboard</title>
<style>
body{font-family:system-ui;background:#0a0a1a;color:#e2e8f0;padding:24px;margin:0}
h1{color:#60a5fa;margin:0 0 16px;font-size:24px}
h2{color:#94a3b8;font-size:14px;text-transform:uppercase;margin:24px 0 12px;letter-spacing:1px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.card{background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid #334155;border-radius:10px;padding:20px}
.metric{font-size:36px;font-weight:bold;color:#22c55e;font-family:monospace}
.metric.warn{color:#fbbf24}
.metric.err{color:#ef4444}
.label{color:#94a3b8;font-size:13px;margin-top:4px}
table{width:100%;border-collapse:collapse;margin-top:12px;background:#1e293b;border-radius:6px;overflow:hidden}
th,td{padding:10px 14px;text-align:left;border-bottom:1px solid #334155;font-size:13px;color:#e2e8f0}
th{background:#0c4a6e;color:white;font-weight:bold;text-transform:uppercase;font-size:11px;letter-spacing:1px}
tr:last-child td{border-bottom:none}
.bar{height:6px;background:#334155;border-radius:3px;overflow:hidden;margin-top:4px}
.bar-fill{height:100%;background:linear-gradient(90deg,#22c55e,#16a34a)}
.tag{display:inline-block;padding:3px 10px;border-radius:4px;font-size:11px;margin:2px;font-weight:bold}
.tag.crit{background:#7f1d1d;color:#fecaca}
.tag.warn{background:#78350f;color:#fde68a}
.tag.ok{background:#14532d;color:#bbf7d0}
.tag.info{background:#1e3a8a;color:#bfdbfe}
.empty{color:#94a3b8;font-style:italic;padding:12px 0}
</style></head>
<body>
<h1>MetricsCollector 实时指标</h1>
<h2>系统总览</h2><div class="grid" id="cards">加载中...</div>
<h2>API 端点 QPS (Top 8)</h2><div id="endpoints">加载中...</div>
<h2>错误率分布 (按状态码)</h2><div id="status">加载中...</div>
<h2>活跃告警</h2><div id="alerts">加载中...</div>
<script>
async function j(url) {
  const r = await fetch(url);
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : r.text();
}

Promise.all([
  j('${BACKEND}/api/admin/stats'),
  j('${BACKEND}/api/metrics'),
  j('${BACKEND}/api/alerts'),
  j('${BACKEND}/api/alerts/critical'),
  j('${BACKEND}/api/alerts/warning')
]).then(([stats, metrics, alerts, critical, warning]) => {
  const d = (stats && stats.data) || {};
  const c = document.getElementById('cards');
  c.innerHTML =
    '<div class="card"><div class="metric">' + (d.totalRequests || 0).toLocaleString() + '</div><div class="label">总请求数</div></div>' +
    '<div class="card"><div class="metric ' + ((d.successRate || 0) < 0.95 ? 'warn' : 'ok') + '">' + ((d.successRate || 0) * 100).toFixed(2) + '%</div><div class="label">成功率</div></div>' +
    '<div class="card"><div class="metric">' + ((d.avgLatency || 0).toFixed(1)) + 'ms</div><div class="label">平均延迟</div></div>' +
    '<div class="card"><div class="metric">' + (d.activeSessions || 0) + '</div><div class="label">活跃会话</div></div>';

  // 解析 metrics 文本
  const lines = (typeof metrics === 'string' ? metrics : '').split('\\n').filter(function (l) {
    return l.indexOf('http_requests_total{') === 0 && l.indexOf('module="unknown"') === -1;
  });
  const parsed = lines.map(function (l) {
    const ep = (l.match(/endpoint="([^"]+)"/) || [])[1] || '?';
    const st = (l.match(/status="([^"]+)"/) || [])[1] || '?';
    const n = +(l.split(' ').pop() || 0);
    return { ep: ep, st: st, n: n };
  }).sort(function (a, b) { return b.n - a.n; }).slice(0, 8);

  document.getElementById('endpoints').innerHTML = parsed.length ?
    '<table><thead><tr><th>端点</th><th>状态</th><th>请求数</th><th>占比</th></tr></thead><tbody>' +
    parsed.map(function (r) {
      const total = parsed.reduce(function (s, x) { return s + x.n; }, 0);
      const pct = total > 0 ? ((r.n / total) * 100).toFixed(1) : 0;
      return '<tr><td>' + r.ep + '</td><td>' + r.st + '</td><td>' + r.n + '</td><td><div class="bar"><div class="bar-fill" style="width:' + pct + '%"></div></div></td></tr>';
    }).join('') + '</tbody></table>' :
    '<div class="empty">暂无数据</div>';

  // 状态码分布
  const byStatus = {};
  parsed.forEach(function (r) {
    byStatus[r.st] = (byStatus[r.st] || 0) + r.n;
  });
  const statusHtml = Object.keys(byStatus).length ?
    Object.keys(byStatus).map(function (st) {
      const color = st.startsWith('2') ? 'ok' : (st.startsWith('4') ? 'warn' : 'err');
      return '<div class="card"><div class="metric ' + color + '">' + byStatus[st] + '</div><div class="label">HTTP ' + st + ' (' + color + ')</div></div>';
    }).join('') :
    '<div class="empty">暂无数据</div>';
  document.getElementById('status').innerHTML = '<div class="grid">' + statusHtml + '</div>';

  // 告警状态
  const allAlerts = (Array.isArray(alerts) ? alerts : (alerts && alerts.data) || [])
    .concat(Array.isArray(critical) ? critical : (critical && critical.data) || [])
    .concat(Array.isArray(warning) ? warning : (warning && warning.data) || []);
  const unique = [];
  const seen = {};
  allAlerts.forEach(function (a) {
    if (a && a.id && !seen[a.id]) { seen[a.id] = 1; unique.push(a); }
  });
  document.getElementById('alerts').innerHTML = unique.length ?
    unique.map(function (a) {
      const sev = (a.severity || a.level || 'info').toLowerCase();
      return '<div class="card"><span class="tag ' + sev + '">' + sev + '</span> <b>' + (a.title || a.name || a.ruleName || '告警') + '</b> - ' + (a.message || a.description || '') + '</div>';
    }).join('') :
    '<div class="card"><span class="tag ok">OK</span> 当前无活跃告警 - 系统未注册告警规则, 需要在 backend/src/infra/metrics/MetricsCollector.js 中调用 registerAlertRule() 注册</div>';
}).catch(function (e) {
  document.body.innerHTML = '<h1>错误</h1><pre>' + e.message + '</pre>';
});
</script>
</body></html>`;
    await page.setContent(html, { waitUntil: 'load' });
    await sleep(5000);
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
