/**
 * AI Chat 玩具 - 后端 API 快速集成测试
 *
 * 特点:
 * - 短超时 (5秒) 避免长时间等待阻塞端点
 * - 并行测试快速获取结果
 * - 简化的测试报告
 *
 * 运行: node tests/api-integration-test.js
 */

const http = require('http');

const BASE_URL = 'http://localhost:30000';
const TIMEOUT = 5000; // 5秒短超时

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(level, msg) {
  const prefix = {
    info: `${colors.blue}[INFO]${colors.reset}`,
    success: `${colors.green}[PASS]${colors.reset}`,
    error: `${colors.red}[FAIL]${colors.reset}`,
    warn: `${colors.yellow}[WARN]${colors.reset}`,
  }[level] || '[LOG]';
  console.log(`${prefix} ${msg}`);
}

function logSection(title) {
  console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}${title}${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
}

const results = { total: 0, passed: 0, failed: 0, details: [] };

function request(options) {
  return new Promise((resolve) => {
    const url = new URL(options.path, BASE_URL);
    const req = http.request({
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      timeout: TIMEOUT,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', () => resolve({ status: 0, body: null, error: true }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: null, timeout: true }); });
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

async function testEndpoint(category, name, path, method = 'GET', body = null) {
  results.total++;
  const start = Date.now();
  const res = await request({ path, method, body });
  const duration = Date.now() - start;

  let passed = false;
  let reason = '';

  if (res.timeout) {
    reason = '请求超时 (5s)';
  } else if (res.error) {
    reason = '连接错误';
  } else if (res.status === 503) {
    // 503 可能是因为健康检查返回 degraded 状态，检查是否有响应体
    passed = res.body && res.body.status === 'degraded';
    if (!passed) reason = `HTTP ${res.status} (服务降级)`;
  } else if (res.status >= 200 && res.status < 300) {
    passed = true;
  } else {
    reason = `HTTP ${res.status}`;
  }

  if (passed) results.passed++;
  else results.failed++;

  results.details.push({ category, name, path, status: res.status || 0, passed, reason });

  const icon = passed ? '✓' : '✗';
  const statusColor = passed ? colors.green : colors.red;
  console.log(`  ${statusColor}${icon}${colors.reset} ${path} (${duration}ms) ${passed ? '' : '- ' + reason}`);
}

// 测试定义
const testGroups = [
  { name: '健康检查', tests: [
    ['health', '/api/health'],
    ['health', '/health'],
    ['health', '/api/gateway/status'],
  ]},
  { name: '核心聊天', tests: [
    ['chat', '/api/sessions'],
    ['chat', '/api/config'],
    ['chat', '/api/conversations'],
  ]},
  { name: 'Agent/MCP', tests: [
    ['agent', '/api/mcp/status'],
    ['agent', '/api/minimax/status'],
    ['agent', '/api/tools'],
  ]},
  { name: '管理后台-模型', tests: [
    ['admin', '/api/admin/models'],
    ['admin', '/api/admin/models/stats'],
  ]},
  { name: '管理后台-工具', tests: [
    ['admin', '/api/admin/tools'],
    ['admin', '/api/admin/tools/categories/list'],
  ]},
  { name: '管理后台-模板', tests: [
    ['admin', '/api/admin/prompts'],
  ]},
  { name: '管理后台-追踪', tests: [
    ['admin', '/api/admin/traces'],
  ]},
  { name: '管理后台-意图', tests: [
    ['admin', '/api/admin/intent/tree'],
  ]},
  { name: '管理后台-知识库', tests: [
    ['admin', '/api/admin/knowledge/docs'],
    ['admin', '/api/admin/knowledge/stats'],
  ]},
  { name: 'RAG/向量', tests: [
    ['rag', '/api/rag/kb'],
    ['rag', '/api/rag/stats'],
    ['rag', '/api/qdrant/status'],
    ['rag', '/api/qdrant/collections'],
  ]},
  { name: '搜索', tests: [
    ['search', '/api/search'],
    ['search', '/api/search/config'],
    ['search', '/api/search/health'],
  ]},
  { name: '指标/监控', tests: [
    ['metrics', '/api/metrics'],
    ['metrics', '/api/alerts'],
  ]},
  { name: '记忆系统', tests: [
    ['memory', '/api/memory'],
    ['memory', '/api/memory/stats'],
  ]},
  { name: 'HITL', tests: [
    ['hitl', '/api/hitl/health'],
    ['hitl', '/api/hitl/pending'],
  ]},
  { name: 'A2A协作', tests: [
    ['a2a', '/api/a2a/agents'],
    ['a2a', '/api/a2a/coordination/modes'],
  ]},
  { name: '任务控制', tests: [
    ['mission', '/api/mission/tasks'],
    ['mission', '/api/mission/stats'],
  ]},
];

async function main() {
  console.log(`\n${colors.cyan}${'#'.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}# AI Chat 玩具 - 后端 API 快速集成测试${colors.reset}`);
  console.log(`${colors.cyan}${'#'.repeat(60)}${colors.reset}`);
  console.log(`\n目标: ${BASE_URL}`);
  console.log(`超时: ${TIMEOUT/1000}秒/端点`);
  console.log(`时间: ${new Date().toISOString()}\n`);

  // 检查服务
  const healthCheck = await request({ path: '/api/health' });
  if (healthCheck.status !== 200) {
    log('warn', '服务可能未就绪，继续测试...\n');
  } else {
    log('success', '服务正常\n');
  }

  const startTime = Date.now();

  // 执行测试组
  for (const group of testGroups) {
    logSection(group.name);
    // 并行执行组内测试
    await Promise.all(group.tests.map(([cat, path]) => testEndpoint(cat, path, path)));
  }

  const duration = Date.now() - startTime;

  // 汇总报告
  logSection('测试结果汇总');

  const passRate = results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0;

  console.log(`  总计: ${results.total}`);
  console.log(`  ${colors.green}通过: ${results.passed}${colors.reset}`);
  console.log(`  ${colors.red}失败: ${results.failed}${colors.reset}`);
  console.log(`  通过率: ${passRate}%`);
  console.log(`  耗时: ${(duration / 1000).toFixed(2)}s`);

  // 按模块汇总
  const byCategory = {};
  for (const d of results.details) {
    if (!byCategory[d.category]) byCategory[d.category] = { total: 0, passed: 0 };
    byCategory[d.category].total++;
    if (d.passed) byCategory[d.category].passed++;
  }

  console.log(`\n${colors.cyan}模块详情:${colors.reset}`);
  console.log('-'.repeat(50));
  for (const [cat, s] of Object.entries(byCategory)) {
    const rate = s.total > 0 ? ((s.passed / s.total) * 100).toFixed(0) : 0;
    const icon = s.passed === s.total ? '✓' : s.passed > 0 ? '⚠' : '✗';
    const color = s.passed === s.total ? colors.green : s.passed > 0 ? colors.yellow : colors.red;
    console.log(`  ${color}${icon}${colors.reset} ${cat}: ${s.passed}/${s.total} (${rate}%)`);
  }

  // 失败列表
  const failures = results.details.filter(d => !d.passed);
  if (failures.length > 0) {
    console.log(`\n${colors.red}失败的端点:${colors.reset}`);
    failures.forEach((f, i) => console.log(`  ${i+1}. ${f.path} - ${f.reason}`));
  }

  console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);

  if (results.failed === 0) {
    log('success', '所有测试通过!');
    process.exit(0);
  } else {
    log('error', `${results.failed} 个端点测试失败`);
    process.exit(1);
  }
}

main().catch(e => { log('error', e.message); process.exit(1); });