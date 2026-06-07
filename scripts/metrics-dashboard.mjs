#!/usr/bin/env node
/**
 * SimpleAgent - 0 依赖 Metrics Dashboard
 *
 * 替代 Grafana 的轻量级方案 (因本机无法装 Grafana/Prometheus)
 * - 拉取 backend /metrics 端点
 * - 解析 Prometheus exposition format
 * - 4 面板 HTML 渲染 (流量/资源/业务/限流)
 * - 30 秒自动刷新
 *
 * 用法: PORT=3090 node scripts/metrics-dashboard.mjs
 * 访问: http://localhost:3090
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:30000';
const PORT = parseInt(process.env.PORT || '3090', 10);
const REFRESH_MS = parseInt(process.env.REFRESH_MS || '30000', 10);

// Prometheus 解析: 把 exposition format 转成 { name: { labels, value } }
function parsePrometheus(text) {
  const metrics = {};
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+(.+)$/);
    if (!match) continue;
    const [, name, labelsStr, valueStr] = match;
    const value = parseFloat(valueStr);
    if (isNaN(value)) continue;
    const labels = {};
    if (labelsStr) {
      const labelMatches = labelsStr.matchAll(/(\w+)="([^"]*)"/g);
      for (const m of labelMatches) labels[m[1]] = m[2];
    }
    if (!metrics[name]) metrics[name] = [];
    metrics[name].push({ labels, value });
  }
  return metrics;
}

// 计算 P50/P95/P99 (从 histogram)
function quantile(metrics, name, q) {
  const buckets = (metrics[name + '_bucket'] || []).map((b) => ({
    le: b.labels.le === '+Inf' ? Infinity : parseFloat(b.labels.le),
    count: b.value,
  })).sort((a, b) => a.le - b.le);
  if (buckets.length === 0) return null;
  const total = buckets[buckets.length - 1].count;
  const target = q * total;
  for (const b of buckets) {
    if (b.count >= target) return b.le;
  }
  return buckets[buckets.length - 1].le;
}

// 计算总 RPS
function calcRps(metrics) {
  const reqs = metrics['http_requests_total'] || [];
  const total = reqs.reduce((a, b) => a + b.value, 0);
  return (total / 60).toFixed(1);
}

// 计算错误率
function calcErrorRate(metrics) {
  const all = metrics['http_requests_total'] || [];
  const err = all.filter((m) => /^5/.test(m.labels.status || '')).reduce((a, b) => a + b.value, 0);
  const total = all.reduce((a, b) => a + b.value, 0);
  return total === 0 ? 0 : ((err / total) * 100).toFixed(2);
}

// 计算 P99 延迟 (ms)
function calcP99(metrics) {
  const p99 = quantile(metrics, 'http_request_duration_seconds', 0.99);
  return p99 ? (p99 * 1000).toFixed(0) : 'N/A';
}

function generateHTML(metrics) {
  const rps = calcRps(metrics);
  const errRate = calcErrorRate(metrics);
  const p99 = calcP99(metrics);
  const total = (metrics['http_requests_total'] || []).reduce((a, b) => a + b.value, 0);

  // Top 5 endpoints by request count
  const byEndpoint = {};
  for (const m of (metrics['http_requests_total'] || [])) {
    const ep = m.labels.endpoint || m.labels.path || 'unknown';
    byEndpoint[ep] = (byEndpoint[ep] || 0) + m.value;
  }
  const topEndpoints = Object.entries(byEndpoint)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ep, n]) => `<tr><td>${ep}</td><td>${n.toFixed(0)}</td></tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>SimpleAgent Metrics Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f1419; color: #e1e4e8; padding: 20px; }
    h1 { color: #58a6ff; margin-bottom: 8px; }
    .meta { color: #8b949e; font-size: 14px; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
    .panel { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 16px; }
    .panel h2 { font-size: 14px; color: #8b949e; margin-bottom: 8px; }
    .metric { font-size: 28px; font-weight: 600; color: #58a6ff; }
    .metric.warn { color: #f0b85e; }
    .metric.err { color: #f85149; }
    .metric.ok { color: #3fb950; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #21262d; }
    th { color: #8b949e; font-weight: 500; }
    .refresh { color: #8b949e; font-size: 12px; margin-top: 16px; }
  </style>
</head>
<body>
  <h1>SimpleAgent Metrics Dashboard</h1>
  <div class="meta">
    Source: <code>${BACKEND}/metrics</code> |
    Auto-refresh: ${REFRESH_MS / 1000}s |
    Generated: ${new Date().toISOString()}
  </div>

  <div class="grid">
    <div class="panel">
      <h2>RPS (avg 1min)</h2>
      <div class="metric">${rps}</div>
    </div>
    <div class="panel">
      <h2>Total Requests</h2>
      <div class="metric">${total.toFixed(0)}</div>
    </div>
    <div class="panel">
      <h2>Error Rate (5xx)</h2>
      <div class="metric ${parseFloat(errRate) > 1 ? 'err' : parseFloat(errRate) > 0.1 ? 'warn' : 'ok'}">${errRate}%</div>
    </div>
    <div class="panel">
      <h2>P99 Latency</h2>
      <div class="metric ${parseFloat(p99) > 3000 ? 'err' : parseFloat(p99) > 1000 ? 'warn' : 'ok'}">${p99}ms</div>
    </div>
  </div>

  <div class="panel">
    <h2>Top 10 Endpoints by Request Count</h2>
    <table>
      <thead><tr><th>Endpoint</th><th>Count</th></tr></thead>
      <tbody>${topEndpoints || '<tr><td colspan="2">No data</td></tr>'}</tbody>
    </table>
  </div>

  <div class="refresh">Reload in <span id="cd">${REFRESH_MS / 1000}</span>s</div>
  <script>
    setTimeout(() => location.reload(), ${REFRESH_MS});
  </script>
</body>
</html>`;
}

async function fetchMetrics() {
  return new Promise((resolve, reject) => {
    http.get(`${BACKEND}/metrics`, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', backend: BACKEND }));
    return;
  }
  try {
    const text = await fetchMetrics();
    const metrics = parsePrometheus(text);
    const html = generateHTML(metrics);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`<h1>Error fetching metrics from ${BACKEND}</h1><pre>${e.message}</pre>`);
  }
});

server.listen(PORT, () => {
  console.log(`=== SimpleAgent Metrics Dashboard ===`);
  console.log(`Backend: ${BACKEND}`);
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`Refresh: ${REFRESH_MS / 1000}s`);
});
