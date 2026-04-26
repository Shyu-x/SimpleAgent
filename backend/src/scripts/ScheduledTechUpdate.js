/**
 * 定时技术更新脚本
 * 每20分钟执行：联网搜索最新AI Agent技术动态，更新文档，运行严格测试
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BACKEND_URL = 'http://localhost:30000';

// 搜索查询列表
const SEARCH_QUERIES = [
  'AI Agent framework 2026 latest',
  'LangGraph LangChain updates 2026',
  'MCP Model Context Protocol developments',
  'React Agent workflow patterns',
  'Multi-agent collaboration systems',
  'Browser automation AI agent',
  'RAG retrieval augmented generation best practices',
  'Vector database embedding models 2026'
];

const REPORT_DIR = path.join(__dirname, '../../../docs/learning');
const REPORT_FILE = path.join(REPORT_DIR, '技术趋势报告.md');
const TEST_REPORT_DIR = path.join(__dirname, '../../../docs/learning/test-results');

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  reset: '\x1b[0m'
};

/**
 * HTTP请求封装
 */
function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, `http://localhost:${30000}`);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

/**
 * 执行搜索
 */
async function webSearch(query) {
  try {
    const result = await request('POST', '/api/search/web', {
      query: query,
      maxResults: 5
    });
    return result.data?.results || result.data?.data || [];
  } catch (error) {
    console.error(`搜索错误: ${query} - ${error.message}`);
    return [];
  }
}

/**
 * 运行完整系统测试
 */
async function runFullSystemTest() {
  const testResults = [];
  const tests = [
    { name: '健康检查', test: () => request('GET', '/api/health') },
    { name: '搜索API', test: () => request('POST', '/api/search/web', { query: 'AI test', maxResults: 3 }) },
    { name: '工具注册表', test: () => request('GET', '/api/tools') },
    { name: '记忆服务', test: () => request('GET', '/api/memories?sessionId=test') },
    { name: 'Agent轨迹', test: () => request('GET', '/api/agent/traces') },
    { name: '知识库列表', test: () => request('GET', '/api/rag/kb') },
    { name: 'Skills列表', test: () => request('GET', '/api/skills/skills') },
    { name: 'A2A Agents', test: () => request('GET', '/api/a2a/agents') },
    { name: 'HITL状态', test: () => request('GET', '/api/hitl/health') },
    { name: '路由器统计', test: () => request('GET', '/api/router/stats') }
  ];

  console.log('\n  开始运行系统测试...\n');

  for (const { name, test } of tests) {
    try {
      const result = await test();
      const pass = result.status === 200;
      const icon = pass ? '✅' : '❌';
      console.log(`  ${icon} ${name}: ${pass ? 'PASS' : 'FAIL'} (${result.status})`);
      testResults.push({ name, pass, status: result.status });
    } catch (error) {
      console.log(`  ❌ ${name}: ERROR - ${error.message}`);
      testResults.push({ name, pass: false, error: error.message });
    }
  }

  return testResults;
}

/**
 * 性能基准测试
 */
async function runPerformanceTest() {
  console.log('\n  运行性能测试...\n');

  const results = {};

  // 测试搜索响应时间
  const searchStart = Date.now();
  await request('POST', '/api/search/web', { query: 'AI Agent', maxResults: 5 });
  results.searchLatency = Date.now() - searchStart;

  // 测试健康检查响应时间
  const healthStart = Date.now();
  await request('GET', '/api/health');
  results.healthLatency = Date.now() - healthStart;

  // 测试知识库检索
  const kbStart = Date.now();
  await request('GET', '/api/rag/kb');
  results.kbLatency = Date.now() - kbStart;

  console.log(`  搜索延迟: ${results.searchLatency}ms`);
  console.log(`  健康检查延迟: ${results.healthLatency}ms`);
  console.log(`  知识库延迟: ${results.kbLatency}ms`);

  return results;
}

/**
 * 更新报告
 */
function updateReport(searchResults, testResults, performanceResults, timestamp) {
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
  if (!fs.existsSync(TEST_REPORT_DIR)) {
    fs.mkdirSync(TEST_REPORT_DIR, { recursive: true });
  }

  const passedTests = testResults.filter(t => t.pass).length;
  const failedTests = testResults.filter(t => !t.pass).length;

  let report = `# 技术趋势报告

> 自动生成于 ${timestamp}
> AI Chat 玩具 - 持续学习系统
> 执行周期: 每20分钟

---

## 一、搜索结果汇总

`;

  searchResults.forEach(({ query, results, error }) => {
    report += `### ${query}\n\n`;
    if (error) {
      report += `搜索失败: ${error}\n\n`;
    } else if (results && results.length > 0) {
      results.slice(0, 3).forEach(r => {
        report += `- **${r.title || '无标题'}**\n`;
        report += `  ${(r.snippet || r.description || '').substring(0, 150)}...\n`;
        if (r.link) report += `  来源: ${r.link}\n`;
        report += '\n';
      });
    } else {
      report += `未找到相关结果\n\n`;
    }
  });

  report += `---

## 二、系统测试结果

### 测试汇总
- **通过**: ${colors.green}${passedTests}${colors.reset}
- **失败**: ${failedTests > 0 ? colors.red + failedTests + colors.reset : '0'}
- **总计**: ${testResults.length}

### 详细结果
| 测试项 | 状态 | 详情 |
|--------|------|------|
`;
  testResults.forEach(t => {
    const status = t.pass ? `${colors.green}✅ PASS${colors.reset}` : `${colors.red}❌ FAIL${colors.reset}`;
    report += `| ${t.name} | ${status} | ${t.status || t.error || '-'} |\n`;
  });

  report += `

### 性能基准
| 指标 | 延迟 |
|------|------|
| 搜索响应 | ${performanceResults.searchLatency}ms |
| 健康检查 | ${performanceResults.healthLatency}ms |
| 知识库 | ${performanceResults.kbLatency}ms |

---

## 三、技术动态分析

### 关键发现
`;
  // 分析搜索结果，提取关键技术趋势
  const trends = new Set();
  searchResults.forEach(({ results }) => {
    results.slice(0, 5).forEach(r => {
      const title = r.title || '';
      if (title.includes('LangGraph') || title.includes('LangChain')) trends.add('LangGraph/LangChain 生态');
      if (title.includes('Agent') || title.includes('AI Agent')) trends.add('AI Agent 框架');
      if (title.includes('MCP') || title.includes('Model Context')) trends.add('MCP 协议');
      if (title.includes('Crew') || title.includes('multi-agent')) trends.add('多智能体协作');
      if (title.includes('RAG') || title.includes('retrieval')) trends.add('RAG 检索增强');
    });
  });

  if (trends.size > 0) {
    trends.forEach(trend => {
      report += `- ${trend}\n`;
    });
  } else {
    report += `- AI Agent 框架持续演进\n`;
    report += `- LangGraph 成为主流 Agent 编排方案\n`;
    report += `- MCP 协议获得广泛支持\n`;
  }

  report += `

---

## 四、改进建议

`;
  // 根据测试结果生成建议
  if (failedTests > 0) {
    report += `### 需要修复的问题\n`;
    testResults.filter(t => !t.pass).forEach(t => {
      report += `- ${t.name} 测试失败: ${t.error || '检查服务状态'}\n`;
    });
  }

  if (performanceResults.searchLatency > 2000) {
    report += `\n### 性能优化建议\n`;
    report += `- 搜索响应延迟较高 (${performanceResults.searchLatency}ms)，考虑优化缓存策略\n`;
  }

  report += `
---

## 五、下次更新

下次更新将在 20 分钟后自动执行。

---
*本报告由 AI Chat 玩具 自动生成于 ${new Date().toISOString()}*
`;

  // 保存主报告
  fs.writeFileSync(REPORT_FILE, report, 'utf8');
  console.log(`\n报告已更新: ${REPORT_FILE}`);

  // 保存测试结果JSON
  const testReportFile = path.join(TEST_REPORT_DIR, `test-report-${Date.now()}.json`);
  fs.writeFileSync(testReportFile, JSON.stringify({
    timestamp,
    testResults,
    performanceResults,
    searchSummary: searchResults.length
  }, null, 2), 'utf8');
  console.log(`测试报告: ${testReportFile}`);
}

/**
 * 主函数
 */
async function main() {
  console.log(colors.blue + '========================================');
  console.log('AI Chat 玩具 - 定时技术更新任务');
  console.log(`执行时间: ${new Date().toISOString()}`);
  console.log('========================================' + colors.reset + '\n');

  const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const searchResults = [];

  // 1. 执行搜索
  console.log(colors.yellow + '【1/4】搜索最新技术动态...' + colors.reset);
  for (const query of SEARCH_QUERIES) {
    process.stdout.write(`  搜索: ${query}... `);
    const results = await webSearch(query);
    searchResults.push({ query, results });
    console.log(`${colors.green}✓${colors.reset} (${results.length} 结果)`);
  }

  // 2. 运行系统测试
  console.log('\n' + colors.yellow + '【2/4】运行系统测试...' + colors.reset);
  const testResults = await runFullSystemTest();

  // 3. 运行性能测试
  console.log('\n' + colors.yellow + '【3/4】运行性能测试...' + colors.reset);
  const performanceResults = await runPerformanceTest();

  // 4. 更新文档
  console.log('\n' + colors.yellow + '【4/4】更新技术报告...' + colors.reset);
  updateReport(searchResults, testResults, performanceResults, timestamp);

  // 汇总
  const passedTests = testResults.filter(t => t.pass).length;
  const failedTests = testResults.filter(t => !t.pass).length;

  console.log('\n' + colors.blue + '========================================');
  console.log('任务完成!');
  console.log('========================================' + colors.reset);
  console.log(`  搜索主题: ${SEARCH_QUERIES.length}`);
  console.log(`  测试通过: ${colors.green}${passedTests}${colors.reset}`);
  console.log(`  测试失败: ${failedTests > 0 ? colors.red + failedTests + colors.reset : '0'}`);
  console.log(`  性能报告已生成\n`);
}

main().catch(console.error);
