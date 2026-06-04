#!/usr/bin/env node
/**
 * SimpleAgent - 5 分钟长时稳定性压测
 *
 * 测高负载下的 P50/P95/P99 延迟、错误率、内存增长
 * 用 autocannon（与生产工具同源）
 *
 * 已知约束: backend 未配置 trust proxy, X-Forwarded-For 不被信任
 *           req.ip 全部为 127.0.0.1 → 同一 rate limit bucket
 *           DISABLE_RATE_LIMIT=true 必须开启
 *
 * 用法: DISABLE_RATE_LIMIT=true node scripts/perf-stress-100.mjs
 */

import { writeFileSync } from 'node:fs';
import autocannon from '../backend/node_modules/autocannon/autocannon.js';

const TARGET = 'http://localhost:30000/api/health';
const DURATION = 300; // 60s (生产真测 300s 太长, 用 60s 验证稳定性)
const CONNECTIONS = 100;
const OUT_MD = 'docs/online/PERF-STRESS-5MIN.md';
const OUT_JSON = 'docs/online/perf-stress-5min-results.json';

console.log('=== SimpleAgent 5min 长时稳定性压测 ===\n');
console.log(`目标: ${TARGET}`);
console.log(`并发: ${CONNECTIONS}`);
console.log(`时长: ${DURATION}s`);
console.log(`前提: DISABLE_RATE_LIMIT=true 必开\n`);

const startTime = Date.now();
const memStart = process.memoryUsage();

const instance = autocannon(
  {
    url: TARGET,
    method: 'GET',
    connections: CONNECTIONS,
    duration: DURATION,
  },
  (err, result) => {
    const totalTime = Date.now() - startTime;
    const memEnd = process.memoryUsage();
    const memDelta = memEnd.heapUsed - memStart.heapUsed;

    if (err) {
      console.error('ERROR:', err);
      process.exit(1);
    }

    const total = result.requests.total;
    const non2xx = result.non2xx;
    const errors = result.errors;
    const timeouts = result.timeouts;
    const statusCodeStats = result.statusCodeStats || {};
    const lat = result.latency;

    const summary = {
      config: { target: TARGET, connections: CONNECTIONS, duration: DURATION },
      totalWallTimeMs: totalTime,
      requests: {
        total,
        avgRps: Math.round(total / DURATION),
        errors,
        timeouts,
        non2xx,
        successRate: total > 0 ? ((total - non2xx) / total * 100).toFixed(2) : 0,
      },
      statusCodeStats,
      latency: {
        avg: lat.mean,
        p50: lat.p50,
        p90: lat.p90,
        p99: lat.p99,
        max: lat.max,
      },
      memory: {
        startHeapMb: (memStart.heapUsed / 1024 / 1024).toFixed(1),
        endHeapMb: (memEnd.heapUsed / 1024 / 1024).toFixed(1),
        deltaMb: (memDelta / 1024 / 1024).toFixed(1),
      },
    };

    console.log('=== 结果 ===');
    console.log(`总请求: ${total} (avg ${summary.requests.avgRps} RPS)`);
    console.log(`错误: ${errors} / 超时: ${timeouts} / 非2xx: ${non2xx}`);
    console.log(`成功率: ${summary.requests.successRate}%`);
    console.log(`状态码分布:`, statusCodeStats);
    console.log(
      `延迟: avg=${lat.mean}ms p50=${lat.p50}ms p90=${lat.p90}ms p99=${lat.p99}ms max=${lat.max}ms`
    );
    console.log(
      `内存: start=${summary.memory.startHeapMb}MB end=${summary.memory.endHeapMb}MB Δ=${summary.memory.deltaMb}MB`
    );

    // 写报告
    const pass = {
      success: summary.requests.successRate >= 99,
      p99: lat.p99 < 3000,
      memLeak: memDelta < 100 * 1024 * 1024,
    };
    const verdict = pass.success && pass.p99 && pass.memLeak ? 'PASS' : 'FAIL';
    console.log(`\n=== 判定: ${verdict} ===`);

    const md = [
      '# SimpleAgent 5min 长时稳定性压测',
      '',
      `**生成时间**: ${new Date().toISOString()}`,
      `**目标**: ${TARGET}`,
      `**并发**: ${CONNECTIONS} 连接`,
      `**时长**: ${DURATION}s`,
      `**前提**: DISABLE_RATE_LIMIT=true 必开（后端未配 trust proxy, 127.0.0.1 单 bucket）`,
      '',
      '## 结果',
      '',
      '| 指标 | 数值 |',
      '|------|------|',
      `| 总请求数 | ${total} |`,
      `| 平均 RPS | ${summary.requests.avgRps} |`,
      `| 错误数 | ${errors} |`,
      `| 超时数 | ${timeouts} |`,
      `| 非 2xx | ${non2xx} |`,
      `| 成功率 | ${summary.requests.successRate}% |`,
      `| P50 延迟 | ${lat.p50}ms |`,
      `| P90 延迟 | ${lat.p90}ms |`,
      `| P99 延迟 | ${lat.p99}ms |`,
      `| 最大延迟 | ${lat.max}ms |`,
      `| 堆内存增长 | ${summary.memory.deltaMb}MB |`,
      '',
      '## 状态码分布',
      '',
      '| 状态码 | 次数 |',
      '|--------|------|',
      ...Object.entries(statusCodeStats).map(([code, count]) => `| ${code} | ${count} |`),
      '',
      '## 验收',
      '',
      `- 错误率 < 1% (成功率 ≥ 99%): **${pass.success ? 'PASS ✓' : 'FAIL ✗'}** (${summary.requests.successRate}%)`,
      `- P99 < 3000ms: **${pass.p99 ? 'PASS ✓' : 'FAIL ✗'}** (${lat.p99}ms)`,
      `- 内存增长 < 100MB: **${pass.memLeak ? 'PASS ✓' : 'FAIL ✗'}** (${summary.memory.deltaMb}MB)`,
      '',
      `**综合判定: ${verdict}**`,
      '',
      '## 注',
      '',
      '- 后端未配置 trust proxy, 所有请求 req.ip=127.0.0.1 → 同一 rate limit bucket',
      '- 必须 DISABLE_RATE_LIMIT=true, 否则 100 req 在 1s 内全部 429',
      '- 5min 长时测试验证稳定性, 检测内存泄漏和长尾延迟',
      '- 用 /api/health (零依赖), 真实混合负载需用 perf-bench.js',
    ].join('\n');

    writeFileSync(OUT_MD, md + '\n');
    writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2) + '\n');
    console.log(`\n输出: ${OUT_MD} + ${OUT_JSON}`);

    process.exit(verdict === 'PASS' ? 0 : 1);
  }
);

// 进度条
let elapsed = 0;
const tick = setInterval(() => {
  elapsed += 5;
  if (elapsed > DURATION) {
    clearInterval(tick);
    return;
  }
  process.stdout.write(`\r  ${elapsed}/${DURATION}s ...`);
}, 5000);

autocannon.track(instance, { renderProgressBar: false, renderResultsTable: false });
