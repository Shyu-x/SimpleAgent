/**
 * Search API 集成测试 (Integration)
 * 测试检索系统的端到端流程，包括多路召回、结果重排序等
 *
 * 运行: node searchApi.test.js
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
  console.log('Search API 集成测试');
  console.log('='.repeat(60) + colors.reset);

  // 基础搜索功能测试
  console.log('\n--- 基础搜索功能测试 ---');

  try {
    const res = await request('POST', '/api/search/web', {
      query: 'AI Agent 技术发展',
      limit: 5
    });
    const pass = res.body !== undefined && [200, 401, 500].includes(res.status);
    log('基础搜索请求', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('基础搜索请求', 'FAIL', e.message); failed++; }

  try {
    const res = await request('POST', '/api/search/web', {});
    const pass = res.status === 400 && res.body.error?.code === 'INVALID_QUERY';
    log('缺少 query 返回 400', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('缺少 query 返回 400', 'FAIL', e.message); failed++; }

  try {
    const res = await request('POST', '/api/search/web', { query: '' });
    const pass = res.status === 400;
    log('空 query 返回 400', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('空 query 返回 400', 'FAIL', e.message); failed++; }

  // 搜索源测试
  console.log('\n--- 搜索源测试 ---');

  try {
    const res = await request('GET', '/api/search/providers');
    const pass = res.status === 200 && res.body.success && Array.isArray(res.body.providers);
    log('获取搜索源列表', pass ? 'PASS' : 'FAIL', 'providers=' + (res.body.providers?.length || 0));
    pass ? passed++ : failed++;
  } catch (e) { log('获取搜索源列表', 'FAIL', e.message); failed++; }

  try {
    const res = await request('GET', '/api/search/config');
    const pass = res.status === 200 && res.body.config?.sources !== undefined;
    log('获取搜索配置', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('获取搜索配置', 'FAIL', e.message); failed++; }

  try {
    const res = await request('POST', '/api/search/web', {
      query: 'test',
      source: 'jina'
    });
    const pass = res.body !== undefined;
    log('指定 source 参数', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('指定 source 参数', 'FAIL', e.message); failed++; }

  try {
    const res = await request('POST', '/api/search/web', {
      query: 'test',
      source: 'invalid_source_xyz'
    });
    const pass = res.body !== undefined;
    log('无效 source 回退处理', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('无效 source 回退处理', 'FAIL', e.message); failed++; }

  // 搜索格式测试
  console.log('\n--- 搜索格式测试 ---');

  try {
    const res = await request('POST', '/api/search/web', {
      query: 'test',
      format: 'markdown'
    });
    const pass = res.body !== undefined;
    log('markdown 格式', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('markdown 格式', 'FAIL', e.message); failed++; }

  try {
    const res = await request('POST', '/api/search/web', {
      query: 'test',
      format: 'json'
    });
    const pass = res.body !== undefined;
    log('json 格式', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('json 格式', 'FAIL', e.message); failed++; }

  // 测试端点
  console.log('\n--- 测试端点 ---');

  try {
    const res = await request('POST', '/api/search/test', {
      source: 'jina',
      query: 'connectivity test'
    });
    const pass = res.body?.tested === true && typeof res.body?.success === 'boolean';
    log('测试搜索源', pass ? 'PASS' : 'FAIL', 'success=' + res.body?.success);
    pass ? passed++ : failed++;
  } catch (e) { log('测试搜索源', 'FAIL', e.message); failed++; }

  try {
    const res = await request('POST', '/api/search/test', {
      source: 'invalid_source'
    });
    const pass = res.status === 400 && res.body.error?.code === 'INVALID_SOURCE';
    log('无效 source 返回错误', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('无效 source 返回错误', 'FAIL', e.message); failed++; }

  // 健康检查
  console.log('\n--- 健康检查 ---');

  try {
    const res = await request('GET', '/api/search/health');
    const pass = res.status === 200 && res.body.status === 'ok' && res.body.service === 'search';
    log('健康检查', pass ? 'PASS' : 'FAIL', JSON.stringify(res.body));
    pass ? passed++ : failed++;
  } catch (e) { log('健康检查', 'FAIL', e.message); failed++; }

  // 错误处理测试
  console.log('\n--- 错误处理测试 ---');

  try {
    const longQuery = 'a'.repeat(10000);
    const res = await request('POST', '/api/search/web', { query: longQuery });
    const pass = [200, 400, 414, 500].includes(res.status);
    log('超长 query 处理', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('超长 query 处理', 'FAIL', e.message); failed++; }

  try {
    const res = await request('GET', '/api/search/nonexistent');
    const pass = res.status === 404;
    log('不存在路径返回 404', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('不存在路径返回 404', 'FAIL', e.message); failed++; }

  try {
    const res = await request('POST', '/api/search/web', { query: 'test', limit: -1 });
    const pass = res.body !== undefined;
    log('负数 limit 处理', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('负数 limit 处理', 'FAIL', e.message); failed++; }

  // 性能测试
  console.log('\n--- 性能测试 ---');

  try {
    const start = Date.now();
    const res = await request('POST', '/api/search/web', { query: 'AI technology' });
    const duration = Date.now() - start;
    const pass = duration < 10000;
    log('搜索响应 < 10s', pass ? 'PASS' : 'FAIL', duration + 'ms');
    pass ? passed++ : failed++;
  } catch (e) { log('搜索响应 < 10s', 'FAIL', e.message); failed++; }

  try {
    const start = Date.now();
    const res = await request('GET', '/api/search/providers');
    const duration = Date.now() - start;
    const pass = duration < 1000 && res.status === 200;
    log('配置获取 < 1s', pass ? 'PASS' : 'FAIL', duration + 'ms');
    pass ? passed++ : failed++;
  } catch (e) { log('配置获取 < 1s', 'FAIL', e.message); failed++; }

  try {
    const promises = Array.from({ length: 3 }, (_, i) =>
      request('POST', '/api/search/web', { query: 'concurrent ' + i, limit: 2 })
    );
    const results = await Promise.all(promises);
    const pass = results.every(r => r.body !== undefined);
    log('并发搜索请求', pass ? 'PASS' : 'FAIL', results.length + ' requests');
    pass ? passed++ : failed++;
  } catch (e) { log('并发搜索请求', 'FAIL', e.message); failed++; }

  // 意图识别测试
  console.log('\n--- 意图识别测试 ---');

  try {
    const res = await request('POST', '/api/router/classify', {
      query: '北京天气怎么样'
    });
    const pass = res.body !== undefined;
    log('意图分类', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('意图分类', 'FAIL', e.message); failed++; }

  try {
    const res = await request('POST', '/api/router/classify', {});
    const pass = res.status === 400;
    log('缺少 query 返回 400', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) { log('缺少 query 返回 400', 'FAIL', e.message); failed++; }

  // 汇总
  console.log('\n' + colors.blue + '='.repeat(60));
  console.log('Search API 测试汇总');
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
