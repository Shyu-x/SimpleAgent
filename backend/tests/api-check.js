/**
 * 后端 API 测试脚本
 * 验证后端 API 端点是否正常工作
 */

const http = require('http');
const https = require('https');
const path = require('path');

const CONFIG = {
  backendUrl: process.env.BACKEND_URL || 'http://localhost:30000',
  timeout: 30000,
  verbose: process.argv.includes('--verbose') || process.argv.includes('-v'),
  retry: parseInt(process.argv.includes('--retry') ? '3' : '0', 10),
  skipHealth: process.argv.includes('--skip-health'),
};

// 彩色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m',
};

function log(level, msg) {
  const prefix = {
    info: `${colors.blue}[INFO]${colors.reset}`,
    success: `${colors.green}[PASS]${colors.reset}`,
    error: `${colors.red}[FAIL]${colors.reset}`,
    warn: `${colors.yellow}[WARN]${colors.reset}`,
    skip: `${colors.dim}[SKIP]${colors.reset}`,
  }[level] || '[LOG]';
  console.log(`${prefix} ${msg}`);
}

function logSection(title) {
  console.log(`\n${colors.cyan}${'='.repeat(50)}${colors.reset}`);
  console.log(`${colors.cyan}${title}${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(50)}${colors.reset}\n`);
}

function logTest(name, passed, duration = null) {
  const status = passed ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
  const durationStr = duration ? ` ${colors.dim}(${duration}ms)${colors.reset}` : '';
  console.log(`  ${status} ${name}${durationStr}`);
}

/**
 * HTTP 请求封装
 */
function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.path, CONFIG.backendUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const requestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AI-Chat-Test/1.0',
        'Accept': 'application/json',
        ...options.headers,
      },
      timeout: CONFIG.timeout,
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }

        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed,
          raw: data,
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * 等待服务就绪
 */
async function waitForService(maxAttempts = 30, intervalMs = 1000) {
  log('info', `等待服务就绪 (最多 ${maxAttempts} 次尝试)...`);

  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const response = await httpRequest({
        method: 'GET',
        path: '/api/health',
      });

      if (response.status === 200) {
        log('success', `服务已就绪 (第 ${i} 次尝试)`);
        return true;
      }
    } catch (error) {
      // 继续等待
    }

    if (i < maxAttempts) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  log('error', '服务未在预期时间内就绪');
  return false;
}

/**
 * 测试健康检查端点
 */
async function testHealthCheck() {
  logSection('健康检查');

  const tests = [];

  // /api/health
  try {
    const start = Date.now();
    const response = await httpRequest({ method: 'GET', path: '/api/health' });
    const duration = Date.now() - start;

    const passed = response.status === 200 &&
      response.body?.status === 'ok';

    logTest('/api/health', passed, duration);
    tests.push({ name: 'Health Check API', passed });

    if (CONFIG.verbose) {
      console.log(`  ${colors.dim}${JSON.stringify(response.body)}${colors.reset}`);
    }
  } catch (error) {
    logTest('/api/health', false);
    tests.push({ name: 'Health Check API', passed: false, error: error.message });
  }

  // /health
  try {
    const start = Date.now();
    const response = await httpRequest({ method: 'GET', path: '/health' });
    const duration = Date.now() - start;

    const passed = response.status === 200;
    logTest('/health', passed, duration);
    tests.push({ name: 'Health Endpoint', passed });
  } catch (error) {
    logTest('/health', false);
    tests.push({ name: 'Health Endpoint', passed: false });
  }

  return tests;
}

/**
 * 测试聊天 API
 */
async function testChatAPI() {
  logSection('聊天 API 测试');

  const tests = [];

  // 测试发送消息
  try {
    const start = Date.now();
    const response = await httpRequest({
      method: 'POST',
      path: '/api/chat',
    }, {
      message: '你好',
      stream: false,
    });
    const duration = Date.now() - start;

    const passed = response.status === 200;
    logTest('POST /api/chat 响应正常', passed, duration);
    tests.push({ name: 'Chat API', passed });

    if (CONFIG.verbose && response.body) {
      console.log(`  ${colors.dim}${JSON.stringify(response.body).substring(0, 200)}${colors.reset}`);
    }
  } catch (error) {
    logTest('POST /api/chat', false);
    tests.push({ name: 'Chat API', passed: false, error: error.message });
  }

  return tests;
}

/**
 * 测试管理后台 API
 */
async function testAdminAPI() {
  logSection('管理后台 API 测试');

  const tests = [];

  const endpoints = [
    { path: '/api/admin/models', name: 'Models Config' },
    { path: '/api/admin/stats', name: 'Admin Stats' },
    { path: '/api/admin/knowledge', name: 'Knowledge Base' },
    { path: '/api/admin/tools', name: 'Tool Registry' },
    { path: '/api/admin/prompts', name: 'Prompt Templates' },
    { path: '/api/admin/traces', name: 'Trace Viewer' },
  ];

  for (const endpoint of endpoints) {
    try {
      const start = Date.now();
      const response = await httpRequest({
        method: 'GET',
        path: endpoint.path,
      });
      const duration = Date.now() - start;

      const passed = response.status === 200;
      logTest(`GET ${endpoint.path}`, passed, duration);
      tests.push({ name: endpoint.name, passed });
    } catch (error) {
      logTest(`GET ${endpoint.path}`, false);
      tests.push({ name: endpoint.name, passed: false, error: error.message });
    }
  }

  return tests;
}

/**
 * 测试 RAG API
 */
async function testRAGAPI() {
  logSection('RAG API 测试');

  const tests = [];

  // 测试 RAG 搜索
  try {
    const start = Date.now();
    const response = await httpRequest({
      method: 'POST',
      path: '/api/rag/search',
    }, {
      query: '测试查询',
      topK: 3,
    });
    const duration = Date.now() - start;

    const passed = response.status === 200;
    logTest('POST /api/rag/search', passed, duration);
    tests.push({ name: 'RAG Search', passed });
  } catch (error) {
    logTest('POST /api/rag/search', false);
    tests.push({ name: 'RAG Search', passed: false, error: error.message });
  }

  // 测试 Qdrant 状态
  try {
    const start = Date.now();
    const response = await httpRequest({
      method: 'GET',
      path: '/api/qdrant/status',
    });
    const duration = Date.now() - start;

    const passed = response.status === 200;
    logTest('GET /api/qdrant/status', passed, duration);
    tests.push({ name: 'Qdrant Status', passed });
  } catch (error) {
    logTest('GET /api/qdrant/status', false);
    tests.push({ name: 'Qdrant Status', passed: false });
  }

  return tests;
}

/**
 * 测试指标 API
 */
async function testMetricsAPI() {
  logSection('指标 API 测试');

  const tests = [];

  // 测试 Prometheus 指标
  try {
    const start = Date.now();
    const response = await httpRequest({
      method: 'GET',
      path: '/api/metrics',
    });
    const duration = Date.now() - start;

    const passed = response.status === 200;
    logTest('GET /api/metrics', passed, duration);
    tests.push({ name: 'Metrics API', passed });
  } catch (error) {
    logTest('GET /api/metrics', false);
    tests.push({ name: 'Metrics API', passed: false });
  }

  // 测试告警 API
  try {
    const start = Date.now();
    const response = await httpRequest({
      method: 'GET',
      path: '/api/alerts',
    });
    const duration = Date.now() - start;

    const passed = response.status === 200;
    logTest('GET /api/alerts', passed, duration);
    tests.push({ name: 'Alerts API', passed });
  } catch (error) {
    logTest('GET /api/alerts', false);
    tests.push({ name: 'Alerts API', passed: false });
  }

  return tests;
}

/**
 * 测试 A2A 协作 API
 */
async function testA2AAPI() {
  logSection('A2A 协作 API 测试');

  const tests = [];

  try {
    const start = Date.now();
    const response = await httpRequest({
      method: 'GET',
      path: '/api/a2a/agents',
    });
    const duration = Date.now() - start;

    const passed = response.status === 200;
    logTest('GET /api/a2a/agents', passed, duration);
    tests.push({ name: 'A2A Agents', passed });
  } catch (error) {
    logTest('GET /api/a2a/agents', false);
    tests.push({ name: 'A2A Agents', passed: false });
  }

  try {
    const start = Date.now();
    const response = await httpRequest({
      method: 'GET',
      path: '/api/mission',
    });
    const duration = Date.now() - start;

    const passed = response.status === 200;
    logTest('GET /api/mission', passed, duration);
    tests.push({ name: 'Mission Control', passed });
  } catch (error) {
    logTest('GET /api/mission', false);
    tests.push({ name: 'Mission Control', passed: false });
  }

  return tests;
}

/**
 * 测试 HITL API
 */
async function testHITLAPI() {
  logSection('HITL 人机协作 API 测试');

  const tests = [];

  try {
    const start = Date.now();
    const response = await httpRequest({
      method: 'GET',
      path: '/api/hitl/requests',
    });
    const duration = Date.now() - start;

    const passed = response.status === 200;
    logTest('GET /api/hitl/requests', passed, duration);
    tests.push({ name: 'HITL Requests', passed });
  } catch (error) {
    logTest('GET /api/hitl/requests', false);
    tests.push({ name: 'HITL Requests', passed: false });
  }

  return tests;
}

/**
 * 主测试流程
 */
async function main() {
  console.log(`\n${colors.cyan}${'#'.repeat(50)}${colors.reset}`);
  console.log(`${colors.cyan}# 后端 API 测试${colors.reset}`);
  console.log(`${colors.cyan}${'#'.repeat(50)}${colors.reset}`);
  console.log(`后端地址: ${CONFIG.backendUrl}`);
  console.log(`运行时间: ${new Date().toISOString()}\n`);

  const allTests = [];
  let totalPassed = 0;
  let totalFailed = 0;

  // 等待服务就绪
  if (!CONFIG.skipHealth) {
    const ready = await waitForService();
    if (!ready) {
      log('error', '后端服务未就绪，测试终止');
      process.exit(1);
    }
  }

  // 1. 健康检查
  const healthTests = await testHealthCheck();
  allTests.push(...healthTests);

  // 2. 聊天 API
  const chatTests = await testChatAPI();
  allTests.push(...chatTests);

  // 3. 管理后台 API
  const adminTests = await testAdminAPI();
  allTests.push(...adminTests);

  // 4. RAG API
  const ragTests = await testRAGAPI();
  allTests.push(...ragTests);

  // 5. 指标 API
  const metricsTests = await testMetricsAPI();
  allTests.push(...metricsTests);

  // 6. A2A API
  const a2aTests = await testA2AAPI();
  allTests.push(...a2aTests);

  // 7. HITL API
  const hitlTests = await testHITLAPI();
  allTests.push(...hitlTests);

  // 统计结果
  for (const test of allTests) {
    if (test.passed) {
      totalPassed++;
    } else {
      totalFailed++;
    }
  }

  // 输出汇总
  logSection('测试结果汇总');

  console.log(`${colors.cyan}${'='.repeat(50)}${colors.reset}`);
  console.log(`总计: ${allTests.length} | ${colors.green}通过: ${totalPassed}${colors.reset} | ${colors.red}失败: ${totalFailed}${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(50)}${colors.reset}\n`);

  // 失败详情
  if (totalFailed > 0) {
    logSection('失败详情');
    for (const test of allTests) {
      if (!test.passed) {
        log('error', `${test.name}${test.error ? `: ${test.error}` : ''}`);
      }
    }
    console.log();
  }

  if (totalFailed === 0) {
    log('success', '所有 API 测试通过！');
    process.exit(0);
  } else {
    log('error', `${totalFailed} 个测试失败`);
    process.exit(1);
  }
}

// 错误处理
process.on('uncaughtException', (error) => {
  log('error', `未捕获的异常: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log('error', `未处理的 Promise 拒绝: ${reason}`);
  process.exit(1);
});

main().catch((error) => {
  log('error', `执行失败: ${error.message}`);
  process.exit(1);
});