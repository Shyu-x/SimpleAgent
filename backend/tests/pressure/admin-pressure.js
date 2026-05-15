/**
 * 管理后台压测脚本
 *
 * 测试 /api/admin/* 所有端点的性能和稳定性
 *
 * 运行方式:
 *   node admin-pressure.js              # 运行所有测试
 *   node admin-pressure.js --knowledge  # 仅测试知识库管理
 *   node admin-pressure.js --tools     # 仅测试工具管理
 *   node admin-pressure.js --model      # 仅测试模型管理
 *   node admin-pressure.js --stats      # 仅测试统计接口
 */

const http = require('http');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

// 加载配置
const config = require('./config');

// 解析命令行参数
const args = process.argv.slice(2);
const targetModule = args.find(arg => arg.startsWith('--'))?.replace('--', '') || 'all';

/**
 * 性能指标收集器
 */
class AdminMetricsCollector extends EventEmitter {
  constructor() {
    super();
    this.moduleMetrics = {};
    this.globalMetrics = {
      latencies: [],
      errors: [],
      startTime: null,
      endTime: null,
      requestCount: 0,
      successCount: 0,
      failureCount: 0,
    };
  }

  record(module, latencyMs, success, statusCode) {
    if (!this.moduleMetrics[module]) {
      this.moduleMetrics[module] = {
        latencies: [],
        errors: [],
        requestCount: 0,
        successCount: 0,
        failureCount: 0,
      };
    }

    const m = this.moduleMetrics[module];
    const g = this.globalMetrics;

    m.latencies.push(latencyMs);
    m.requestCount++;
    g.latencies.push(latencyMs);
    g.requestCount++;

    if (success) {
      m.successCount++;
      g.successCount++;
    } else {
      m.failureCount++;
      g.failureCount++;
      m.errors.push({ latency: latencyMs, status: statusCode });
      g.errors.push({ latency: latencyMs, status: statusCode });
    }
  }

  getModuleStats(module) {
    const m = this.moduleMetrics[module];
    if (!m) return null;

    const sorted = [...m.latencies].sort((a, b) => a - b);
    const sum = m.latencies.reduce((a, b) => a + b, 0);
    const count = m.latencies.length;

    return {
      module,
      total: count,
      success: m.successCount,
      failure: m.failureCount,
      errorRate: count > 0 ? m.failureCount / count : 0,
      avgLatency: count > 0 ? sum / count : 0,
      p50: this.percentile(sorted, 0.5),
      p90: this.percentile(sorted, 0.9),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
    };
  }

  getGlobalStats() {
    const g = this.globalMetrics;
    const sorted = [...g.latencies].sort((a, b) => a - b);
    const sum = g.latencies.reduce((a, b) => a + b, 0);
    const count = g.latencies.length;

    return {
      total: count,
      success: g.successCount,
      failure: g.failureCount,
      errorRate: count > 0 ? g.failureCount / count : 0,
      avgLatency: count > 0 ? sum / count : 0,
      minLatency: count > 0 ? sorted[0] : 0,
      maxLatency: count > 0 ? sorted[sorted.length - 1] : 0,
      p50: this.percentile(sorted, 0.5),
      p90: this.percentile(sorted, 0.9),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
      qps: this.calculateQPS(),
    };
  }

  percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  calculateQPS() {
    if (!this.globalMetrics.startTime || !this.globalMetrics.endTime) return 0;
    const durationSec = (this.globalMetrics.endTime - this.globalMetrics.startTime) / 1000;
    return durationSec > 0 ? this.globalMetrics.requestCount / durationSec : 0;
  }

  start() {
    this.globalMetrics.startTime = Date.now();
  }

  end() {
    this.globalMetrics.endTime = Date.now();
  }
}

/**
 * HTTP 请求封装
 */
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = http;
    const startTime = Date.now();

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AI-Chat-Admin-Pressure/1.0',
        ...options.headers
      }
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const latency = Date.now() - startTime;
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode, data: jsonData, latency });
        } catch {
          resolve({ status: res.statusCode, data: data, latency });
        }
      });
    });

    req.on('error', (err) => {
      reject({ error: err.message, latency: Date.now() - startTime });
    });

    req.setTimeout(config.api.timeout);
    req.end();
  });
}

/**
 * 模块压测任务
 */
class AdminModuleTester {
  constructor(moduleName, endpoints, metrics, options = {}) {
    this.moduleName = moduleName;
    this.endpoints = endpoints;
    this.metrics = metrics;
    this.iterations = options.iterations || 50;
    this.concurrency = options.concurrency || 5;
  }

  async test() {
    console.log(`\n  模块: ${this.moduleName}`);
    console.log(`    端点数量: ${this.endpoints.length}`);
    console.log(`    迭代次数: ${this.iterations}`);
    console.log(`    并发数: ${this.concurrency}`);

    const tasks = [];

    for (let i = 0; i < this.iterations; i++) {
      // 随机选择一个端点 (按权重)
      const endpoint = this.selectWeightedEndpoint();
      tasks.push(this.callEndpoint(endpoint));

      // 控制并发
      if (tasks.length >= this.concurrency) {
        await Promise.all(tasks.splice(0, this.concurrency));
      }
    }

    // 等待剩余任务
    if (tasks.length > 0) {
      await Promise.all(tasks);
    }

    const stats = this.metrics.getModuleStats(this.moduleName);
    console.log(`    结果: ${stats.success}/${stats.total} 成功, 错误率 ${(stats.errorRate * 100).toFixed(2)}%`);

    return stats;
  }

  selectWeightedEndpoint() {
    const totalWeight = this.endpoints.reduce((sum, ep) => sum + ep.weight, 0);
    let random = Math.random() * totalWeight;

    for (const ep of this.endpoints) {
      random -= ep.weight;
      if (random <= 0) return ep;
    }

    return this.endpoints[0];
  }

  async callEndpoint(endpoint) {
    const url = `${config.api.baseUrl}${endpoint.path}`;
    const startTime = Date.now();

    try {
      const result = await request(url, { method: endpoint.method });
      const latency = Date.now() - startTime;
      const success = result.status >= 200 && result.status < 400;
      this.metrics.record(this.moduleName, latency, success, result.status);
    } catch (err) {
      const latency = Date.now() - startTime;
      this.metrics.record(this.moduleName, latency, false, 0);
    }
  }
}

/**
 * 执行压测
 */
async function runAdminPressureTest() {
  const metrics = new AdminMetricsCollector();
  metrics.start();

  console.log('\n开始管理后台压测...');

  const modulesToTest = [];

  if (targetModule === 'all' || targetModule === 'knowledge') {
    modulesToTest.push(['knowledge', config.adminEndpoints.knowledge]);
  }
  if (targetModule === 'all' || targetModule === 'tools') {
    modulesToTest.push(['tools', config.adminEndpoints.tools]);
  }
  if (targetModule === 'all' || targetModule === 'model') {
    modulesToTest.push(['model', config.adminEndpoints.model]);
  }
  if (targetModule === 'all' || targetModule === 'prompt') {
    modulesToTest.push(['prompt', config.adminEndpoints.prompt]);
  }
  if (targetModule === 'all' || targetModule === 'trace') {
    modulesToTest.push(['trace', config.adminEndpoints.trace]);
  }
  if (targetModule === 'all' || targetModule === 'stats') {
    modulesToTest.push(['stats', config.adminEndpoints.stats]);
  }

  const moduleStats = [];

  for (const [moduleName, endpoints] of modulesToTest) {
    const tester = new AdminModuleTester(moduleName, endpoints, metrics);
    const stats = await tester.test();
    moduleStats.push(stats);
  }

  metrics.end();

  return {
    global: metrics.getGlobalStats(),
    modules: moduleStats,
  };
}

/**
 * 健康检查
 */
async function healthCheck() {
  try {
    const result = await request(`${config.api.baseUrl}/health`);
    return result.status === 200;
  } catch {
    return false;
  }
}

/**
 * 打印报告
 */
function printReport(report) {
  console.log('\n' + '='.repeat(60));
  console.log('管理后台压测报告');
  console.log('='.repeat(60));

  console.log('\n全局统计:');
  console.log(`  总请求数: ${report.global.total}`);
  console.log(`  成功: ${report.global.success} | 失败: ${report.global.failure}`);
  console.log(`  错误率: ${(report.global.errorRate * 100).toFixed(2)}%`);
  console.log(`  平均延迟: ${report.global.avgLatency.toFixed(0)}ms`);
  console.log(`  P50: ${report.global.p50}ms | P90: ${report.global.p90}ms | P99: ${report.global.p99}ms`);
  console.log(`  QPS: ${report.global.qps.toFixed(2)}`);

  console.log('\n模块统计:');
  for (const mod of report.modules) {
    const status = mod.errorRate < 0.01 ? 'OK' : mod.errorRate < 0.05 ? 'WARNING' : 'CRITICAL';
    console.log(`\n  [${mod.module.toUpperCase()}] ${status}`);
    console.log(`    请求: ${mod.total} | 成功: ${mod.success} | 失败: ${mod.failure}`);
    console.log(`    错误率: ${(mod.errorRate * 100).toFixed(2)}%`);
    console.log(`    延迟: avg=${mod.avgLatency.toFixed(0)}ms, p90=${mod.p90}ms, p99=${mod.p99}ms`);
  }
}

/**
 * 保存报告
 */
function saveReport(report) {
  const reportDir = path.join(__dirname, config.output.reportDir);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `admin-pressure-${timestamp}.json`;
  const filepath = path.join(reportDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  console.log(`\n报告已保存: ${filepath}`);

  return filepath;
}

/**
 * 主函数
 */
async function main() {
  console.log('\n' + '╔' + '═'.repeat(58) + '╗');
  console.log('║        AI Chat 玩具 - 管理后台压测脚本               ║');
  console.log('╚' + '═'.repeat(58) + '╝');

  // 健康检查
  console.log('\n检查后端服务状态...');
  const isHealthy = await healthCheck();

  if (!isHealthy) {
    console.error('  错误: 后端服务不可用');
    process.exit(1);
  }
  console.log('  后端服务正常');

  // 运行压测
  const report = await runAdminPressureTest();
  printReport(report);

  // 保存报告
  const filepath = saveReport(report);

  console.log('\n压测完成!');
}

// 运行
main().catch(console.error);