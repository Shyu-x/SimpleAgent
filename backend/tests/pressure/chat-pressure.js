/**
 * 聊天接口压测脚本
 *
 * 测试 /api/chat 端点的性能指标
 * 支持正常/峰值/极限三种负载场景
 *
 * 运行方式:
 *   node chat-pressure.js              # 运行所有场景
 *   node chat-pressure.js --normal    # 仅运行正常负载
 *   node chat-pressure.js --peak      # 仅运行峰值负载
 *   node chat-pressure.js --stress    # 仅运行极限负载
 */

const http = require('http');
const https = require('https');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

// 加载配置
const config = require('./config');

// 解析命令行参数
const args = process.argv.slice(2);
const runScenario = args.find(arg => arg.startsWith('--'))?.replace('--', '') || 'all';

/**
 * 性能指标收集器
 */
class MetricsCollector extends EventEmitter {
  constructor() {
    super();
    this.latencies = [];
    this.errors = [];
    this.startTime = null;
    this.endTime = null;
    this.requestCount = 0;
    this.successCount = 0;
    this.failureCount = 0;
  }

  record(latencyMs, success) {
    this.latencies.push(latencyMs);
    this.requestCount++;
    if (success) {
      this.successCount++;
    } else {
      this.failureCount++;
      this.errors.push(latencyMs);
    }
  }

  getStats() {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const sum = this.latencies.reduce((a, b) => a + b, 0);
    const count = this.latencies.length;

    return {
      total: count,
      success: this.successCount,
      failure: this.failureCount,
      errorRate: count > 0 ? this.failureCount / count : 0,
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
    if (!this.startTime || !this.endTime) return 0;
    const durationSec = (this.endTime - this.startTime) / 1000;
    return durationSec > 0 ? this.requestCount / durationSec : 0;
  }
}

/**
 * HTTP 请求封装
 */
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    const startTime = Date.now();

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AI-Chat-Pressure/1.0',
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
          resolve({ status: res.statusCode, data: jsonData, latency, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data: data, latency, headers: res.headers });
        }
      });
    });

    req.on('error', (err) => {
      reject({ error: err.message, latency: Date.now() - startTime });
    });

    req.setTimeout(config.api.timeout);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

/**
 * SSE 流式请求
 */
function sseRequest(url, body, onData, onEnd) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = http;

    const startTime = Date.now();
    let fullResponse = '';

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AI-Chat-Pressure/1.0',
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    };

    const req = client.request(requestOptions, (res) => {
      res.on('data', (chunk) => {
        const data = chunk.toString();
        fullResponse += data;

        // 解析 SSE 数据
        const lines = data.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (jsonStr.trim()) {
              try {
                const jsonData = JSON.parse(jsonStr);
                onData && onData(jsonData);
              } catch {
                // 忽略解析错误
              }
            }
          }
        }
      });

      res.on('end', () => {
        const latency = Date.now() - startTime;
        resolve({
          latency,
          fullResponse: fullResponse.substring(0, 500),
          status: res.statusCode
        });
        onEnd && onEnd();
      });
    });

    req.on('error', (err) => {
      reject({ error: err.message, latency: Date.now() - startTime });
    });

    req.setTimeout(config.api.timeout + 5000);
    req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * 单个虚拟用户模拟
 */
class VirtualUser {
  constructor(userId, scenario, metrics) {
    this.userId = userId;
    this.scenario = scenario;
    this.metrics = metrics;
    this.stopped = false;
  }

  async start() {
    const { concurrentUsers, requestsPerUser, thinkTime } = this.scenario;

    // 随机选择消息
    const getRandomMessage = () => {
      const messages = config.testData.chatMessages;
      return messages[Math.floor(Math.random() * messages.length)];
    };

    for (let i = 0; i < requestsPerUser && !this.stopped; i++) {
      try {
        await this.sendChatRequest(getRandomMessage());
      } catch (err) {
        console.log(`  User ${this.userId} error: ${err.error || err.message}`);
      }

      // 随机思考时间
      const jitter = Math.random() * thinkTime * 0.5;
      await this.sleep(thinkTime + jitter);
    }
  }

  async sendChatRequest(message) {
    const startTime = Date.now();

    try {
      const result = await sseRequest(
        `${config.api.baseUrl}/api/chat`,
        {
          messages: [{ role: 'user', content: message }],
          stream: true,
          model: 'MiniMax-M2.7'
        },
        null,
        null
      );

      const latency = Date.now() - startTime;
      const success = result.status >= 200 && result.status < 400;
      this.metrics.record(latency, success);

    } catch (err) {
      const latency = Date.now() - startTime;
      this.metrics.record(latency, false);
      throw err;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    this.stopped = true;
  }
}

/**
 * 运行压测场景
 */
async function runPressureTest(scenario) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`场景: ${scenario.name}`);
  console.log(`${'='.repeat(60)}`);

  const metrics = new MetricsCollector();
  const users = [];
  const { concurrentUsers, rampUp, requestsPerUser, thinkTime } = scenario;

  console.log(`  并发用户: ${concurrentUsers}`);
  console.log(`  每用户请求: ${requestsPerUser}`);
  console.log(`  预热时间: ${rampUp}ms`);
  console.log('');

  // 创建虚拟用户
  console.log('  创建虚拟用户...');
  for (let i = 0; i < concurrentUsers; i++) {
    users.push(new VirtualUser(i + 1, scenario, metrics));

    // 渐进式启动 (ramp-up)
    if (rampUp > 0 && i < concurrentUsers - 1) {
      await new Promise(resolve => setTimeout(resolve, rampUp / concurrentUsers));
    }
  }

  console.log(`  开始压测 (${new Date().toLocaleTimeString()})...`);
  metrics.startTime = Date.now();

  // 并发执行所有用户
  const userPromises = users.map(user => user.start().catch(err => {
    console.log(`  User error: ${err.message}`);
  }));

  // 等待所有用户完成
  await Promise.all(userPromises);

  metrics.endTime = Date.now();
  const duration = (metrics.endTime - metrics.startTime) / 1000;

  console.log(`\n  压测完成 (${new Date().toLocaleTimeString()})`);
  console.log(`  总耗时: ${duration.toFixed(2)}秒`);

  return metrics.getStats();
}

/**
 * 格式化指标输出
 */
function formatMetrics(stats, scenario) {
  const { thresholds } = config;

  const checkThreshold = (value, warnThreshold, critThreshold) => {
    if (value >= critThreshold) return 'CRITICAL';
    if (value >= warnThreshold) return 'WARNING';
    return 'OK';
  };

  return {
    scenario: scenario.name,
    duration: `${((stats.total / stats.qps)).toFixed(2)}s`,
    total: stats.total,
    success: stats.success,
    failure: stats.failure,
    errorRate: `${(stats.errorRate * 100).toFixed(2)}%`,
    latency: {
      avg: `${stats.avgLatency.toFixed(0)}ms`,
      min: `${stats.minLatency}ms`,
      max: `${stats.maxLatency}ms`,
      p50: `${stats.p50}ms`,
      p90: `${stats.p90}ms`,
      p95: `${stats.p95}ms`,
      p99: `${stats.p99}ms`,
      p50Status: checkThreshold(stats.p50, thresholds.latency.p50 * 1.2, thresholds.latency.p50 * 1.5),
      p90Status: checkThreshold(stats.p90, thresholds.latency.p90 * 1.2, thresholds.latency.p90 * 1.5),
      p95Status: checkThreshold(stats.p95, thresholds.latency.p95 * 1.2, thresholds.latency.p95 * 1.5),
      p99Status: checkThreshold(stats.p99, thresholds.latency.p99 * 1.2, thresholds.latency.p99 * 1.5),
    },
    qps: {
      value: stats.qps.toFixed(2),
      status: checkThreshold(stats.qps, thresholds.qps.min * 0.8, thresholds.qps.min * 0.5),
    },
    errorRateStatus: checkThreshold(
      stats.errorRate,
      thresholds.errorRate.warning,
      thresholds.errorRate.critical
    ),
  };
}

/**
 * 打印压测报告
 */
function printReport(stats) {
  console.log('\n' + '='.repeat(60));
  console.log('压测报告');
  console.log('='.repeat(60));

  console.log(`
请求统计:
  总请求数: ${stats.total}
  成功: ${stats.success} | 失败: ${stats.failure}
  错误率: ${stats.errorRate}

延迟分布:
  平均: ${stats.latency.avg} | 最小: ${stats.latency.min} | 最大: ${stats.latency.max}
  P50: ${stats.latency.p50} [${stats.latency.p50Status}]
  P90: ${stats.latency.p90} [${stats.latency.p90Status}]
  P95: ${stats.latency.p95} [${stats.latency.p95Status}]
  P99: ${stats.latency.p99} [${stats.latency.p99Status}]

吞吐量:
  QPS: ${stats.qps.value} [${stats.qps.status}]

状态:
  延迟状态: ${stats.errorRateStatus}
  错误率: ${stats.errorRateStatus}
`);
}

/**
 * 保存报告到文件
 */
function saveReport(report, scenarioName) {
  const reportDir = path.join(__dirname, config.output.reportDir);

  // 确保目录存在
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `chat-pressure-${scenarioName.replace(/\s+/g, '-').toLowerCase()}-${timestamp}.json`;
  const filepath = path.join(reportDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  console.log(`\n报告已保存: ${filepath}`);

  return filepath;
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
 * 主函数
 */
async function main() {
  console.log('\n' + '╔' + '═'.repeat(58) + '╗');
  console.log('║           AI Chat 玩具 - 聊天接口压测脚本              ║');
  console.log('╚' + '═'.repeat(58) + '╝');

  // 健康检查
  console.log('\n检查后端服务状态...');
  const isHealthy = await healthCheck();

  if (!isHealthy) {
    console.error('  错误: 后端服务不可用或未启动');
    console.error('  请确保后端服务正在运行 (默认: http://localhost:30000)');
    process.exit(1);
  }
  console.log('  后端服务正常');

  // 准备场景
  const scenarios = [];
  if (runScenario === 'all' || runScenario === 'normal') {
    scenarios.push(config.scenarios.normal);
  }
  if (runScenario === 'all' || runScenario === 'peak') {
    scenarios.push(config.scenarios.peak);
  }
  if (runScenario === 'all' || runScenario === 'stress') {
    scenarios.push(config.scenarios.stress);
  }

  // 运行压测
  const allReports = [];

  for (const scenario of scenarios) {
    const stats = await runPressureTest(scenario);
    const report = formatMetrics(stats, scenario);
    allReports.push(report);
    printReport(report);
  }

  // 保存综合报告
  const summaryReport = {
    timestamp: new Date().toISOString(),
    scenarios: allReports,
    thresholds: config.thresholds,
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const summaryPath = path.join(__dirname, config.output.reportDir, `chat-pressure-summary-${timestamp}.json`);
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, JSON.stringify(summaryReport, null, 2));

  console.log(`\n综合报告已保存: ${summaryPath}`);
  console.log('\n压测完成!');
}

// 运行
main().catch(console.error);