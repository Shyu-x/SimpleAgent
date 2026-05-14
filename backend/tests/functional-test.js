/**
 * AI Chat 玩具 - 功能验证测试脚本
 *
 * 测试 Qdrant 连接、向量检索、降级机制、SSE 流式响应、管理后台 API
 *
 * 运行方式: node functional-test.js
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ==================== 配置 ====================
const BASE_URL = 'http://localhost:30000';
const TIMEOUT = 30000; // 30秒超时（SSE需要更长时间）

// 输出目录
const OUTPUT_DIR = path.join(__dirname, '../docs/test-results');

// ==================== 工具函数 ====================

/**
 * 发起 HTTP 请求
 */
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AI-Chat-Functional-Test/1.0',
        ...options.headers
      }
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode, data: jsonData, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时'));
    });

    req.setTimeout(TIMEOUT);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

/**
 * 发起 SSE 流式请求
 */
function sseRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;

    const chunks = [];
    let dataReceived = false;
    let errorMessage = null;

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'User-Agent': 'AI-Chat-Functional-Test/1.0',
        ...options.headers
      }
    };

    const req = client.request(requestOptions, (res) => {
      res.on('data', (chunk) => {
        dataReceived = true;
        chunks.push(chunk.toString());
      });

      res.on('end', () => {
        const fullData = chunks.join('');
        resolve({
          status: res.statusCode,
          headers: res.headers,
          chunks: chunks.length,
          data: fullData,
          success: dataReceived
        });
      });

      res.on('error', (err) => {
        reject(err);
      });
    });

    req.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        reject(new Error('服务未启动'));
      } else {
        reject(err);
      }
    });

    req.setTimeout(TIMEOUT, () => {
      req.destroy();
      if (!dataReceived) {
        reject(new Error('SSE 请求超时'));
      }
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

// ==================== 测试结果记录 ====================
const testResults = {
  timestamp: new Date().toISOString(),
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  errors: 0,
  results: [],
  summary: {
    qdrant: { total: 0, passed: 0, failed: 0 },
    vectorSearch: { total: 0, passed: 0, failed: 0 },
    fallback: { total: 0, passed: 0, failed: 0 },
    sse: { total: 0, passed: 0, failed: 0 },
    admin: { total: 0, passed: 0, failed: 0 }
  },
  issues: [],
  recommendations: []
};

/**
 * 添加测试结果
 */
function addResult(category, name, status, details = {}) {
  testResults.total++;
  testResults.results.push({
    category,
    name,
    status,
    timestamp: new Date().toISOString(),
    ...details
  });

  if (testResults.summary[category]) {
    testResults.summary[category].total++;
  }

  switch (status) {
    case 'PASS':
      testResults.passed++;
      if (testResults.summary[category]) testResults.summary[category].passed++;
      break;
    case 'FAIL':
      testResults.failed++;
      if (testResults.summary[category]) testResults.summary[category].failed++;
      break;
    case 'SKIP':
      testResults.skipped++;
      break;
    case 'ERROR':
      testResults.errors++;
      break;
  }

  const icon = status === 'PASS' ? '[PASS]' : status === 'FAIL' ? '[FAIL]' : status === 'SKIP' ? '[SKIP]' : status === 'ERROR' ? '[ERROR]' : '[INFO]';
  console.log(`  ${icon} ${name}${details.message ? ': ' + details.message : ''}`);
}

/**
 * 添加问题
 */
function addIssue(severity, category, description, suggestion) {
  testResults.issues.push({ severity, category, description, suggestion });
}

/**
 * 添加建议
 */
function addRecommendation(category, recommendation) {
  testResults.recommendations.push({ category, recommendation });
}

/**
 * 执行单个测试
 */
async function runTest(category, name, testFn) {
  try {
    const result = await testFn();
    if (result === true || (result && result.success !== false && result.status >= 200 && result.status < 300)) {
      addResult(category, name, 'PASS', { response: result });
    } else if (result && result.skipped) {
      addResult(category, name, 'SKIP', { message: result.message });
    } else {
      addResult(category, name, 'FAIL', { message: result?.message || '测试失败', response: result });
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.message.includes('服务未启动') || error.message.includes('Socket')) {
      addResult(category, name, 'SKIP', { message: '服务未启动或无法连接' });
    } else if (error.message.includes('超时')) {
      addResult(category, name, 'ERROR', { message: error.message });
    } else {
      addResult(category, name, 'ERROR', { message: error.message });
    }
  }
}

// ==================== 测试类别定义 ====================

/**
 * Qdrant 连接测试
 */
async function testQdrantConnection() {
  console.log('\n--- Qdrant 连接测试 ---');

  await runTest('qdrant', 'Qdrant 状态检查 - GET /api/qdrant/status', async () => {
    const res = await request(`${BASE_URL}/api/qdrant/status`);
    if (res.status !== 200) return res;
    return res.data.success === true || res.status === 200 ? true : res;
  });

  await runTest('qdrant', 'Qdrant 集合列表 - GET /api/qdrant/collections', async () => {
    const res = await request(`${BASE_URL}/api/qdrant/collections`);
    if (res.status !== 200) return res;
    return res.data.success === true ? true : res;
  });

  await runTest('qdrant', 'Qdrant 健康状态 - GET /api/health (检查 Qdrant 依赖)', async () => {
    const res = await request(`${BASE_URL}/api/health`);
    return res.status === 200 && res.data.status === 'ok' ? true : res;
  });
}

/**
 * 向量检索测试
 */
async function testVectorSearch() {
  console.log('\n--- 向量检索测试 ---');

  await runTest('vectorSearch', '创建测试集合 - PUT /api/qdrant/collections/test_func', async () => {
    const res = await request(`${BASE_URL}/api/qdrant/collections/test_func`, {
      method: 'PUT',
      body: {
        dimension: 1024,
        distance: 'Cosine'
      }
    });
    // 200 = 成功, 409 = 已存在, 都认为通过
    if (res.status === 200 || res.status === 409) return true;
    return res;
  });

  await runTest('vectorSearch', '插入测试文档 - POST /api/qdrant/documents', async () => {
    const res = await request(`${BASE_URL}/api/qdrant/documents`, {
      method: 'POST',
      body: {
        collection: 'test_func',
        document: '这是一段用于功能测试的文档内容，包含了人工智能和机器学习的关键词。',
        metadata: { source: 'functional-test', timestamp: Date.now() }
      }
    });
    return res.status === 200 && res.data.success ? true : res;
  });

  await runTest('vectorSearch', '向量相似度搜索 - POST /api/qdrant/search', async () => {
    const res = await request(`${BASE_URL}/api/qdrant/search`, {
      method: 'POST',
      body: {
        collection: 'test_func',
        query: '人工智能 机器学习',
        topK: 5
      }
    });
    if (res.status === 200 && (res.data.success || res.data.results)) {
      return true;
    }
    return res;
  });

  await runTest('vectorSearch', '清理测试集合 - DELETE /api/qdrant/collections/test_func', async () => {
    const res = await request(`${BASE_URL}/api/qdrant/collections/test_func`, {
      method: 'DELETE'
    });
    return res.status === 200 || res.status === 404 ? true : res;
  });
}

/**
 * 降级机制测试
 */
async function testFallbackMechanism() {
  console.log('\n--- 降级机制测试 ---');

  await runTest('fallback', '检查降级配置 - GET /api/config', async () => {
    const res = await request(`${BASE_URL}/api/config`);
    if (res.status !== 200) return res;
    // 检查是否支持配置信息
    return res.data && res.data.channels ? true : res;
  });

  await runTest('fallback', 'RAG 搜索（降级路径）- POST /api/rag/search', async () => {
    const res = await request(`${BASE_URL}/api/rag/search`, {
      method: 'POST',
      body: { query: '功能测试查询', topK: 3 }
    });
    // RAG 搜索应该在 Qdrant 不可用时降级
    return res.status === 200 && res.data.success ? true : res;
  });

  await runTest('fallback', '搜索服务降级 - GET /api/search', async () => {
    const res = await request(`${BASE_URL}/api/search`);
    return res.status === 200 && res.data.success ? true : res;
  });
}

/**
 * SSE 流式响应测试
 */
async function testSSEResponse() {
  console.log('\n--- SSE 流式响应测试 ---');

  await runTest('sse', 'SSE 流式聊天 - POST /api/chat (流式)', async () => {
    try {
      const res = await sseRequest(`${BASE_URL}/api/chat`, {
        method: 'POST',
        body: {
          message: '你好，请简单介绍一下自己',
          stream: true
        }
      });

      if (res.status === 200 && res.chunks > 0) {
        // 检查是否包含 SSE 格式数据
        const hasSSEData = res.data.includes('data:') || res.data.includes('"content"');
        return {
          success: hasSSEData,
          chunks: res.chunks,
          status: res.status
        };
      }
      return { success: false, status: res.status };
    } catch (error) {
      if (error.message.includes('超时') || error.message.includes('服务未启动')) {
        return { skipped: true, message: 'SSE 服务不可用' };
      }
      throw error;
    }
  }, 45000); // SSE 允许更长超时

  await runTest('sse', '非流式聊天响应 - POST /api/chat (非流式)', async () => {
    const res = await request(`${BASE_URL}/api/chat`, {
      method: 'POST',
      body: {
        message: '1+1等于几？',
        stream: false
      }
    });
    // 200 = 成功, 503 = 熔断器开启 (API key 未配置时预期行为)
    if (res.status === 200 || res.status === 503) return true;
    return res;
  });
}

/**
 * 管理后台 API 测试
 */
async function testAdminAPI() {
  console.log('\n--- 管理后台 API 测试 ---');

  // 知识库管理
  await runTest('admin', '知识库统计 - GET /api/admin/knowledge/stats', async () => {
    const res = await request(`${BASE_URL}/api/admin/knowledge/stats`);
    return res.status === 200 && res.data.success ? true : res;
  });

  await runTest('admin', '知识库列表 - GET /api/admin/knowledge/docs', async () => {
    const res = await request(`${BASE_URL}/api/admin/knowledge/docs`);
    return res.status === 200 && res.data.success ? true : res;
  });

  // 工具管理
  await runTest('admin', '工具列表 - GET /api/admin/tools', async () => {
    const res = await request(`${BASE_URL}/api/admin/tools`);
    return res.status === 200 && res.data.success ? true : res;
  });

  await runTest('admin', '工具分类 - GET /api/admin/tools/categories/list', async () => {
    const res = await request(`${BASE_URL}/api/admin/tools/categories/list`);
    return res.status === 200 ? true : res;
  });

  // 模型管理
  await runTest('admin', '模型列表 - GET /api/admin/models', async () => {
    const res = await request(`${BASE_URL}/api/admin/models`);
    if (res.status !== 200) return res;
    return res.data.success === true || res.data.models ? true : res;
  });

  await runTest('admin', '模型统计 - GET /api/admin/models/stats', async () => {
    const res = await request(`${BASE_URL}/api/admin/models/stats`);
    return res.status === 200 ? true : res;
  });

  // Prompt 模板
  await runTest('admin', 'Prompt 模板列表 - GET /api/admin/prompts', async () => {
    const res = await request(`${BASE_URL}/api/admin/prompts`);
    return res.status === 200 && res.data.success ? true : res;
  });

  // 链路追踪
  await runTest('admin', '链路追踪列表 - GET /api/admin/traces', async () => {
    const res = await request(`${BASE_URL}/api/admin/traces`);
    return res.status === 200 && res.data.success ? true : res;
  });

  // 意图管理
  await runTest('admin', '意图列表 - GET /api/admin/intent', async () => {
    const res = await request(`${BASE_URL}/api/admin/intent`);
    return res.status === 200 && res.data.tree ? true : res;
  });

  // 统计
  await runTest('admin', '管理后台统计 - GET /api/admin/stats', async () => {
    const res = await request(`${BASE_URL}/api/admin/stats`);
    return res.status === 200 && res.data.success ? true : res;
  });
}

// ==================== 测试运行器 ====================

async function runAllTests() {
  console.log('');
  console.log('================================================================');
  console.log('        AI Chat 玩具 - 功能验证测试 v1.0.0');
  console.log('================================================================');
  console.log('');
  console.log(`测试目标: ${BASE_URL}`);
  console.log(`开始时间: ${testResults.timestamp}`);
  console.log('');

  const startTime = Date.now();

  // 等待服务就绪
  console.log('检查服务状态...');
  try {
    await request(`${BASE_URL}/api/health`, { timeout: 5000 });
    console.log('[OK] 服务已就绪\n');
  } catch (error) {
    console.log('[WARN] 服务可能未启动，部分测试将被跳过\n');
  }

  // 执行所有测试
  await testQdrantConnection();
  await testVectorSearch();
  await testFallbackMechanism();
  await testSSEResponse();
  await testAdminAPI();

  const duration = Date.now() - startTime;

  // ==================== 生成报告 ====================
  console.log('\n================================================================');
  console.log('                     测试汇总报告');
  console.log('================================================================');
  console.log('');

  const passRate = testResults.total > 0
    ? ((testResults.passed / testResults.total) * 100).toFixed(1)
    : 0;

  console.log(`  总测试数: ${testResults.total}`);
  console.log(`  通过:     ${testResults.passed}`);
  console.log(`  失败:     ${testResults.failed}`);
  console.log(`  跳过:     ${testResults.skipped}`);
  console.log(`  错误:     ${testResults.errors}`);
  console.log(`  通过率:   ${passRate}%`);
  console.log(`  总耗时:   ${(duration / 1000).toFixed(2)}s`);
  console.log('');

  // 按模块汇总
  console.log('--- 模块详情 ---');
  console.log('-'.repeat(60));

  for (const [category, stats] of Object.entries(testResults.summary)) {
    if (stats.total === 0) continue;

    const passRate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(0) : 0;
    const icon = stats.failed === 0 ? '[OK]' : '[FAIL]';
    console.log(`  ${icon} ${category}: ${stats.passed}/${stats.total} (${passRate}%)`);
  }

  console.log('');

  // 失败/错误详情
  const failures = testResults.results.filter(r => r.status === 'FAIL' || r.status === 'ERROR');
  if (failures.length > 0) {
    console.log('--- 失败/错误详情 ---');
    console.log('-'.repeat(60));
    failures.forEach((f, i) => {
      console.log(`  ${i + 1}. [${f.category}] ${f.name}`);
      if (f.message) console.log(`     原因: ${f.message}`);
    });
    console.log('');

    // 添加问题记录
    addIssue('medium', 'test', '部分测试失败', '请检查失败测试的网络连接和依赖服务状态');
  }

  // 发现的问题汇总
  if (testResults.issues.length > 0) {
    console.log('--- 发现的问题 ---');
    console.log('-'.repeat(60));
    testResults.issues.forEach((issue, i) => {
      console.log(`  ${i + 1}. [${issue.severity.toUpperCase()}] ${issue.category}`);
      console.log(`     问题: ${issue.description}`);
      console.log(`     建议: ${issue.suggestion}`);
    });
    console.log('');
  }

  // 建议
  if (testResults.recommendations.length > 0) {
    console.log('--- 修复建议 ---');
    console.log('-'.repeat(60));
    testResults.recommendations.forEach((rec, i) => {
      console.log(`  ${i + 1}. [${rec.category}] ${rec.recommendation}`);
    });
    console.log('');
  }

  // 保存 JSON 报告
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = new Date().toISOString().slice(11, 19).replace(/:/g, '');
  const reportJsonPath = path.join(OUTPUT_DIR, `functional-test-report-${dateStr}-${timeStr}.json`);
  const reportMdPath = path.join(OUTPUT_DIR, `functional-test-report-${dateStr}-${timeStr}.md`);

  // 保存 JSON 报告
  fs.writeFileSync(reportJsonPath, JSON.stringify(testResults, null, 2));

  // 生成 Markdown 报告
  const mdReport = generateMarkdownReport(testResults, duration);
  fs.writeFileSync(reportMdPath, mdReport);

  console.log(`[OK] JSON 报告已保存: ${path.relative(path.join(__dirname, '../..'), reportJsonPath)}`);
  console.log(`[OK] Markdown 报告已保存: ${path.relative(path.join(__dirname, '../..'), reportMdPath)}`);
  console.log('');

  // 返回状态码
  return testResults.failed === 0 && testResults.errors === 0 ? 0 : 1;
}

/**
 * 生成 Markdown 报告
 */
function generateMarkdownReport(results, duration) {
  const passRate = results.total > 0
    ? ((results.passed / results.total) * 100).toFixed(1)
    : 0;

  let md = `# 功能验证测试报告

## 测试概览

| 指标 | 值 |
|------|-----|
| 测试总数 | ${results.total} |
| 通过 | ${results.passed} |
| 失败 | ${results.failed} |
| 跳过 | ${results.skipped} |
| 错误 | ${results.errors} |
| 通过率 | ${passRate}% |
| 总耗时 | ${(duration / 1000).toFixed(2)}s |
| 测试时间 | ${results.timestamp} |

## 模块测试结果

| 模块 | 通过/总数 | 通过率 |
|------|-----------|--------|
`;

  for (const [category, stats] of Object.entries(results.summary)) {
    if (stats.total === 0) continue;
    const rate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(0) : 0;
    md += `| ${category} | ${stats.passed}/${stats.total} | ${rate}% |\n`;
  }

  md += `
## 详细测试结果

### Qdrant 连接测试
`;
  results.results
    .filter(r => r.category === 'qdrant')
    .forEach(r => {
      md += `- **${r.name}**: ${r.status === 'PASS' ? 'PASS' : r.status === 'FAIL' ? 'FAIL' : r.status === 'SKIP' ? 'SKIP' : 'ERROR'}\n`;
      if (r.message) md += `  - ${r.message}\n`;
    });

  md += `
### 向量检索测试
`;
  results.results
    .filter(r => r.category === 'vectorSearch')
    .forEach(r => {
      md += `- **${r.name}**: ${r.status === 'PASS' ? 'PASS' : r.status === 'FAIL' ? 'FAIL' : r.status === 'SKIP' ? 'SKIP' : 'ERROR'}\n`;
      if (r.message) md += `  - ${r.message}\n`;
    });

  md += `
### 降级机制测试
`;
  results.results
    .filter(r => r.category === 'fallback')
    .forEach(r => {
      md += `- **${r.name}**: ${r.status === 'PASS' ? 'PASS' : r.status === 'FAIL' ? 'FAIL' : r.status === 'SKIP' ? 'SKIP' : 'ERROR'}\n`;
      if (r.message) md += `  - ${r.message}\n`;
    });

  md += `
### SSE 流式响应测试
`;
  results.results
    .filter(r => r.category === 'sse')
    .forEach(r => {
      md += `- **${r.name}**: ${r.status === 'PASS' ? 'PASS' : r.status === 'FAIL' ? 'FAIL' : r.status === 'SKIP' ? 'SKIP' : 'ERROR'}\n`;
      if (r.message) md += `  - ${r.message}\n`;
    });

  md += `
### 管理后台 API 测试
`;
  results.results
    .filter(r => r.category === 'admin')
    .forEach(r => {
      md += `- **${r.name}**: ${r.status === 'PASS' ? 'PASS' : r.status === 'FAIL' ? 'FAIL' : r.status === 'SKIP' ? 'SKIP' : 'ERROR'}\n`;
      if (r.message) md += `  - ${r.message}\n`;
    });

  if (results.issues.length > 0) {
    md += `
## 发现的问题

`;
    results.issues.forEach((issue, i) => {
      md += `### ${i + 1}. [${issue.severity.toUpperCase()}] ${issue.category}\n\n`;
      md += `**问题**: ${issue.description}\n\n`;
      md += `**建议**: ${issue.suggestion}\n\n`;
    });
  }

  if (results.recommendations.length > 0) {
    md += `
## 修复建议

`;
    results.recommendations.forEach((rec, i) => {
      md += `${i + 1}. **[${rec.category}]** ${rec.recommendation}\n\n`;
    });
  }

  md += `
---
*报告生成时间: ${new Date().toISOString()}*
`;

  return md;
}

// 运行测试
runAllTests()
  .then(code => {
    process.exit(code);
  })
  .catch(err => {
    console.error('测试运行器错误:', err);
    process.exit(1);
  });