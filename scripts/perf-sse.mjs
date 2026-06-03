#!/usr/bin/env node
/**
 * SimpleAgent - SSE 流式响应性能测试
 *
 * 测 TTFB / 总时长 / Token rate
 * 不依赖 autocannon（不兼容 SSE），用 node:http
 *
 * 用法: node scripts/perf-sse.mjs
 */

import http from 'node:http';

const BACKEND = 'http://localhost:30000';
const TRIALS_PER_SCENARIO = 5;

const SCENARIOS = [
  {
    name: '短消息 (自我介绍)',
    body: { message: '用一句话介绍你自己', stream: true },
  },
  {
    name: '长消息 (五言绝句)',
    body: { message: '请写一首关于人工智能的五言绝句，押韵', stream: true },
  },
];

function sseRequest(body) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let firstByteAt = null;
    let bytes = 0;
    let chunks = 0;
    const data = JSON.stringify(body);

    const req = http.request(
      `${BACKEND}/api/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          Accept: 'text/event-stream',
        },
        timeout: 30000,
      },
      (res) => {
        res.on('data', (chunk) => {
          if (firstByteAt === null) firstByteAt = Date.now() - start;
          bytes += chunk.length;
          chunks++;
        });
        res.on('end', () => {
          resolve({
            ttfb: firstByteAt,
            total: Date.now() - start,
            bytes,
            chunks,
            status: res.statusCode,
          });
        });
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.write(data);
    req.end();
  });
}

function percentile(arr, p) {
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) * p);
  return sorted[idx];
}

async function run() {
  console.log('=== SimpleAgent SSE 流式性能 ===\n');
  const results = [];

  for (const scenario of SCENARIOS) {
    console.log(`>>> ${scenario.name}`);
    const trials = [];
    for (let i = 0; i < TRIALS_PER_SCENARIO; i++) {
      try {
        const r = await sseRequest(scenario.body);
        trials.push(r);
        console.log(
          `  trial ${i + 1}: ttfb=${r.ttfb}ms total=${r.total}ms chunks=${r.chunks} bytes=${r.bytes} status=${r.status}`
        );
      } catch (e) {
        console.log(`  trial ${i + 1}: ERROR ${e.message}`);
      }
    }

    if (trials.length === 0) {
      console.log(`  全部失败, 跳过\n`);
      continue;
    }

    const ttfbs = trials.map((t) => t.ttfb);
    const totals = trials.map((t) => t.total);
    const tokenRates = trials.map((t) => (t.chunks / t.total) * 1000);
    const summary = {
      scenario: scenario.name,
      n: trials.length,
      ttfb: { p50: percentile(ttfbs, 0.5), p95: percentile(ttfbs, 0.95), p99: percentile(ttfbs, 0.99) },
      total: { p50: percentile(totals, 0.5), p95: percentile(totals, 0.95), p99: percentile(totals, 0.99) },
      tokenRateAvg: tokenRates.reduce((a, b) => a + b, 0) / tokenRates.length,
    };
    results.push(summary);
    console.log(
      `  P50 ttfb=${summary.ttfb.p50}ms total=${summary.total.p50}ms | token rate ${summary.tokenRateAvg.toFixed(1)} tok/s\n`
    );
  }

  console.log('=== 汇总 ===');
  const ttfbOk = results.every((r) => r.ttfb.p95 < 800);
  const totalOk = results.every((r) => r.total.p95 < 30000);
  console.log(`短/长消息 TTFB P95 < 800ms: ${ttfbOk ? '✓' : '✗'}`);
  console.log(`短/长消息 总时长 P95 < 30s: ${totalOk ? '✓' : '✗'}`);

  // 输出 Markdown
  const md = [
    '# SimpleAgent SSE 流式性能报告',
    '',
    `**生成时间**: ${new Date().toISOString()}`,
    `**目标**: ${BACKEND}`,
    `**模型**: MiniMax-M2.7 (通过 Token Plan)`,
    '',
    '## 结果',
    '',
    '| 场景 | 样本 | TTFB P50 | TTFB P95 | TTFB P99 | 总时长 P50 | 总时长 P95 | Token rate |',
    '|------|------|----------|----------|----------|------------|------------|------------|',
  ];
  for (const r of results) {
    md.push(
      `| ${r.scenario} | ${r.n} | ${r.ttfb.p50}ms | ${r.ttfb.p95}ms | ${r.ttfb.p99}ms | ${r.total.p50}ms | ${r.total.p95}ms | ${r.tokenRateAvg.toFixed(1)} tok/s |`
    );
  }
  md.push('', '## 验收', '');
  md.push(`- TTFB P95 < 800ms: **${ttfbOk ? 'PASS ✓' : 'FAIL ✗'}**`);
  md.push(`- 总时长 P95 < 30s: **${totalOk ? 'PASS ✓' : 'FAIL ✗'}**`);
  md.push('', '## 注', '', '- TTFB = Time To First Byte (从发送到收到首个字节)');
  md.push('- Token rate = chunks/秒 粗略估计 (SSE event 数 / 总时长)');
  md.push('- 跑 5 次取中位数, P95/P99 是 trial 间分布');
  md.push('- DISABLE_RATE_LIMIT=true 时跑 (避免限流影响流式测试)');

  const fs = await import('node:fs');
  fs.writeFileSync('docs/online/PERF-SSE.md', md.join('\n') + '\n');
  fs.writeFileSync('docs/online/perf-sse-results.json', JSON.stringify(results, null, 2) + '\n');
  console.log('\n输出: docs/online/PERF-SSE.md + perf-sse-results.json');

  process.exit(ttfbOk && totalOk ? 0 : 1);
}

run().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
