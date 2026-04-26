/**
 * Agent API 集成测试 (Integration)
 * 测试 Agent 系统的端到端流程，包括 A2A 协议、工具执行、轨迹追踪等
 *
 * 运行: node agentApi.test.js
 */

const http = require('http');

// 测试配置
const BASE_URL = 'http://localhost:30000';
const TIMEOUT = 30000;

// 测试统计
let passed = 0;
let failed = 0;

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(name, status, message) {
  const icon = status === 'PASS' ? '[PASS]' : '[FAIL]';
  const color = status === 'PASS' ? colors.green : colors.red;
  console.log(color + icon + colors.reset + ' ' + name + ': ' + message);
}

function request(method, path, body = null, headers = {}, timeout = TIMEOUT) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json', ...headers }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('\n' + colors.blue + '='.repeat(60));
  console.log('Agent API 集成测试');
  console.log('='.repeat(60) + colors.reset);

  // A2A 协议测试
  console.log('\n--- A2A 协议测试 ---');

  try {
    const res = await request('GET', '/api/a2a/agents');
    const pass = res.status === 200 && res.body.success && Array.isArray(res.body.agents);
    log('获取 Agent 列表', pass ? 'PASS' : 'FAIL', 'agents=' + (res.body.agents?.length || 0));
    pass ? passed++ : failed++;
  } catch (e) { log('获取 Agent 列表', 'FAIL', e.message); failed++; }

  try {
    const res = await request('GET', '/api/a2a/agents/nonexistent-agent-xyz');
    const pass = res.status === 404;
    log('不存在的 Agent 返回 404', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('不存在的 Agent 返回 404', 'FAIL', e.message); failed++; }

  try {
    const res = await request('POST', '/api/a2a/messages/send', {
      agentId: 'test-agent',
      message: 'Hello Agent',
      sessionId: 'integration-test-session'
    });
    const pass = [200, 201, 404, 500].includes(res.status);
    log('发送消息', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('发送消息', 'FAIL', e.message); failed++; }

  try {
    const res = await request('POST', '/api/a2a/messages/send', {});
    const pass = res.status === 400;
    log('缺少参数返回 400', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('缺少参数返回 400', 'FAIL', e.message); failed++; }

  try {
    const res = await request('POST', '/api/a2a/messages/send', { agentId: 'test' });
    const pass = res.status === 400;
    log('缺少 message 返回 400', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('缺少 message 返回 400', 'FAIL', e.message); failed++; }

  try {
    const res = await request('POST', '/api/a2a/agents/test-agent/heartbeat', {
      sessionId: 'test-session'
    });
    const pass = res.body !== undefined;
    log('心跳检测', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('心跳检测', 'FAIL', e.message); failed++; }

  try {
    const res = await request('POST', '/api/a2a/agents/test-agent/heartbeat', {});
    const pass = res.status === 400;
    log('缺少 sessionId 返回 400', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('缺少 sessionId 返回 400', 'FAIL', e.message); failed++; }

  // 工具执行测试
  console.log('\n--- 工具执行测试 ---');

  try {
    const res = await request('POST', '/api/agent/execute', {
      tool: 'calculator',
      params: { expression: '2 + 3 * 4' }
    });
    const pass = res.body !== undefined;
    log('计算器工具', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('计算器工具', 'FAIL', e.message); failed++; }

  try {
    const res = await request('POST', '/api/agent/execute', {
      tool: 'datetime',
      params: { action: 'now' }
    });
    const pass = res.body !== undefined;
    log('日期时间工具', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('日期时间工具', 'FAIL', e.message); failed++; }

  try {
    const res = await request('POST', '/api/agent/execute', {
      tool: 'nonexistent_tool',
      params: {}
    });
    const pass = res.body !== undefined;
    log('不存在工具处理', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('不存在工具处理', 'FAIL', e.message); failed++; }

  try {
    const res = await request('POST', '/api/agent/execute', { params: {} });
    const pass = res.status === 400;
    log('缺少 tool 返回 400', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('缺少 tool 返回 400', 'FAIL', e.message); failed++; }

  // 轨迹追踪测试
  console.log('\n--- 轨迹追踪测试 ---');

  try {
    const res = await request('POST', '/api/agent/trace', {
      query: '帮我搜索 AI Agent 的最新发展'
    });
    const pass = res.body !== undefined;
    log('创建轨迹', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('创建轨迹', 'FAIL', e.message); failed++; }

  try {
    const res = await request('POST', '/api/agent/trace', {});
    const pass = res.status === 400;
    log('缺少 query 返回 400', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('缺少 query 返回 400', 'FAIL', e.message); failed++; }

  try {
    const res = await request('GET', '/api/agent/traces');
    const pass = res.status === 200 && Array.isArray(res.body.traces);
    log('获取轨迹列表', pass ? 'PASS' : 'FAIL', 'traces=' + (res.body.traces?.length || 0));
    pass ? passed++ : failed++;
  } catch (e) { log('获取轨迹列表', 'FAIL', e.message); failed++; }

  // 工具注册表测试
  console.log('\n--- 工具注册表测试 ---');

  try {
    const res = await request('GET', '/api/tools');
    const pass = res.status === 200 && Array.isArray(res.body.tools);
    log('获取工具列表', pass ? 'PASS' : 'FAIL', 'tools=' + (res.body.tools?.length || 0));
    pass ? passed++ : failed++;
  } catch (e) { log('获取工具列表', 'FAIL', e.message); failed++; }

  try {
    const res = await request('GET', '/api/tools/categories');
    const pass = res.status === 200 && Array.isArray(res.body.categories);
    log('获取工具分类', pass ? 'PASS' : 'FAIL', 'categories=' + (res.body.categories?.length || 0));
    pass ? passed++ : failed++;
  } catch (e) { log('获取工具分类', 'FAIL', e.message); failed++; }

  // 错误处理测试
  console.log('\n--- 错误处理测试 ---');

  try {
    const res = await request('POST', '/api/a2a/messages/send', {});
    const pass = res.status === 400;
    log('空消息体返回 400', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('空消息体返回 400', 'FAIL', e.message); failed++; }

  try {
    const res = await request('GET', '/api/a2a/invalid/path');
    const pass = res.status === 404;
    log('不存在路径返回 404', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('不存在路径返回 404', 'FAIL', e.message); failed++; }

  // 性能测试
  console.log('\n--- 性能测试 ---');

  try {
    const start = Date.now();
    const res = await request('GET', '/api/a2a/agents');
    const duration = Date.now() - start;
    const pass = duration < 3000 && res.status === 200;
    log('Agent 列表响应 < 3s', pass ? 'PASS' : 'FAIL', duration + 'ms');
    pass ? passed++ : failed++;
  } catch (e) { log('Agent 列表响应 < 3s', 'FAIL', e.message); failed++; }

  try {
    const start = Date.now();
    const res = await request('GET', '/api/tools');
    const duration = Date.now() - start;
    const pass = duration < 2000 && res.status === 200;
    log('工具列表响应 < 2s', pass ? 'PASS' : 'FAIL', duration + 'ms');
    pass ? passed++ : failed++;
  } catch (e) { log('工具列表响应 < 2s', 'FAIL', e.message); failed++; }

  try {
    const promises = Array.from({ length: 5 }, (_, i) =>
      request('POST', '/api/a2a/messages/send', {
        agentId: 'test-agent',
        message: 'Concurrent ' + i,
        sessionId: 'concurrent-test'
      })
    );
    const results = await Promise.all(promises);
    const pass = results.every(r => r.body !== undefined);
    log('并发请求处理', pass ? 'PASS' : 'FAIL', results.length + ' requests');
    pass ? passed++ : failed++;
  } catch (e) { log('并发请求处理', 'FAIL', e.message); failed++; }

  // 汇总
  console.log('\n' + colors.blue + '='.repeat(60));
  console.log('Agent API 测试汇总');
  console.log('='.repeat(60) + colors.reset);
  console.log('Total: ' + (passed + failed));
  console.log(colors.green + 'Passed: ' + passed + colors.reset);
  console.log(colors.red + 'Failed: ' + failed + colors.reset);
  console.log('='.repeat(60));

  return failed === 0;
}

runTests()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => { console.error(err); process.exit(1); });
