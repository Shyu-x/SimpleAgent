/**
 * 并发用户模拟脚本
 *
 * 模拟真实用户行为，测试系统在高并发下的稳定性
 *
 * 运行方式:
 *   node concurrent-users.js                    # 默认场景
 *   node concurrent-users.js --light           # 轻度用户
 *   node concurrent-users.js --medium         # 中度用户
 *   node concurrent-users.js --heavy           # 重度用户
 *   node concurrent-users.js --mixed           # 混合用户
 */

const http = require('http');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 加载配置
const config = require('./config');

// 解析命令行参数
const args = process.argv.slice(2);
const userType = args.find(arg => arg.startsWith('--'))?.replace('--', '') || 'mixed';

// ============ 类型定义 ============

/**
 * 用户会话状态
 */
class UserSession extends EventEmitter {
  constructor(userId, userConfig, globalMetrics) {
    super();
    this.userId = userId;
    this.config = userConfig;
    this.metrics = globalMetrics;
    this.active = true;
    this.requestCount = 0;
    this.messageCount = 0;
  }

  async start() {
    const startTime = Date.now();
    const sessionDuration = config.userSimulation.session.duration;
    const { thinkTime, messageDelay } = config.userSimulation.session;

    while (this.active && Date.now() - startTime < sessionDuration) {
      // 选择行为
      const behavior = this.selectBehavior();
      await this.executeBehavior(behavior);

      // 随机延迟
      const delay = this.randomInRange(messageDelay.min, messageDelay.max);
      await this.sleep(delay);

      // 检查是否停止
      if (Math.random() < 0.05) {  // 5% 概率提前结束会话
        this.active = false;
      }
    }

    this.metrics.recordSession(this.userId, {
      duration: Date.now() - startTime,
      requestCount: this.requestCount,
      messageCount: this.messageCount,
    });
  }

  selectBehavior() {
    const behaviors = config.userSimulation.behaviors;
    const totalWeight = behaviors.reduce((sum, b) => sum + b.weight, 0);
    let random = Math.random() * totalWeight;

    for (const b of behaviors) {
      random -= b.weight;
      if (random <= 0) return b.name;
    }

    return behaviors[0].name;
  }

  async executeBehavior(behavior) {
    switch (behavior) {
      case 'simple_chat':
        await this.simpleChat();
        break;
      case 'agent_task':
        await this.agentTask();
        break;
      case 'rag_query':
        await this.ragQuery();
        break;
      case 'admin_operation':
        await this.adminOperation();
        break;
    }
  }

  async simpleChat() {
    const messages = config.testData.chatMessages;
    const message = messages[Math.floor(Math.random() * messages.length)];

    const latency = await this.sendSSEChat(message);
    this.metrics.recordRequest('chat', latency, latency < 3000);
    this.messageCount++;
    this.requestCount++;
  }

  async agentTask() {
    const messages = config.testData.agentMessages;
    const message = messages[Math.floor(Math.random() * messages.length)];

    const latency = await this.sendSSEChat(message, { mode: 'agent' });
    this.metrics.recordRequest('agent', latency, latency < 5000);
    this.messageCount++;
    this.requestCount++;
  }

  async ragQuery() {
    const queries = config.testData.ragQueries;
    const query = queries[Math.floor(Math.random() * queries.length)];

    const latency = await this.sendRAGQuery(query);
    this.metrics.recordRequest('rag', latency, latency < 2000);
    this.requestCount++;
  }

  async adminOperation() {
    const endpoints = [
      { method: 'GET', path: '/api/admin/stats' },
      { method: 'GET', path: '/api/admin/models' },
      { method: 'GET', path: '/api/admin/tools' },
      { method: 'GET', path: '/api/admin/knowledge/docs' },
      { method: 'GET', path: '/api/admin/prompts' },
      { method: 'GET', path: '/api/admin/trace/stats' },
    ];

    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    const latency = await this.sendAdminRequest(endpoint);
    this.metrics.recordRequest('admin', latency, latency < 1000);
    this.requestCount++;
  }

  async sendSSEChat(message, options = {}) {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const urlObj = new URL(`${config.api.baseUrl}/api/chat`);
      const body = {
        messages: [{ role: 'user', content: message }],
        stream: true,
        model: 'MiniMax-M2.7',
        ...options,
      };

      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 80,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'AI-Chat-UserSim/1.0',
          'Accept': 'text/event-stream',
        }
      };

      const req = http.request(requestOptions, (res) => {
        let dataLength = 0;

        res.on('data', (chunk) => {
          dataLength += chunk.length;
        });

        res.on('end', () => {
          resolve(Date.now() - startTime);
        });
      });

      req.on('error', () => {
        resolve(Date.now() - startTime);
      });

      req.setTimeout(30000);
      req.write(JSON.stringify(body));
      req.end();
    });
  }

  async sendRAGQuery(query) {
    return this.sendRequest(`${config.api.baseUrl}/api/search`, {
      method: 'POST',
      body: { query, topK: 5 },
    });
  }

  async sendAdminRequest(endpoint) {
    return this.sendRequest(`${config.api.baseUrl}${endpoint.path}`, {
      method: endpoint.method,
    });
  }

  sendRequest(url, options = {}) {
    return new Promise((resolve) => {
      const urlObj = new URL(url);
      const startTime = Date.now();

      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 80,
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'AI-Chat-UserSim/1.0',
        }
      };

      const req = http.request(requestOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => { resolve(Date.now() - startTime); });
      });

      req.on('error', () => { resolve(Date.now() - startTime); });
      req.setTimeout(10000);

      if (options.body) {
        req.write(JSON.stringify(options.body));
      }
      req.end();
    });
  }

  randomInRange(min, max) {
    return min + Math.random() * (max - min);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    this.active = false;
  }
}

/**
 * 全局指标收集器
 */
class GlobalMetricsCollector extends EventEmitter {
  constructor() {
    super();
    this.requestMetrics = {
      chat: { latencies: [], success: 0, failure: 0 },
      agent: { latencies: [], success: 0, failure: 0 },
      rag: { latencies: [], success: 0, failure: 0 },
      admin: { latencies: [], success: 0, failure: 0 },
    };
    this.sessions = new Map();
    this.startTime = null;
    this.endTime = null;
  }

  recordRequest(type, latency, success) {
    const m = this.requestMetrics[type];
    m.latencies.push(latency);
    if (success) {
      m.success++;
    } else {
      m.failure++;
    }
  }

  recordSession(userId, stats) {
    this.sessions.set(userId, stats);
  }

  getStats() {
    const result = {
      duration: this.endTime - this.startTime,
      totalRequests: 0,
      totalSuccess: 0,
      totalFailure: 0,
      overallQPS: 0,
      types: {},
    };

    for (const [type, m] of Object.entries(this.requestMetrics)) {
      const sorted = [...m.latencies].sort((a, b) => a - b);
      const sum = m.latencies.reduce((a, b) => a + b, 0);
      const count = m.latencies.length;

      result.totalRequests += count;
      result.totalSuccess += m.success;
      result.totalFailure += m.failure;

      result.types[type] = {
        total: count,
        success: m.success,
        failure: m.failure,
        errorRate: count > 0 ? m.failure / count : 0,
        avgLatency: count > 0 ? sum / count : 0,
        p50: this.percentile(sorted, 0.5),
        p90: this.percentile(sorted, 0.9),
        p95: this.percentile(sorted, 0.95),
        p99: this.percentile(sorted, 0.99),
      };
    }

    if (result.duration > 0) {
      result.overallQPS = result.totalRequests / (result.duration / 1000);
    }

    // 汇总会话统计
    let totalSessionDuration = 0;
    let totalSessionRequests = 0;
    for (const stats of this.sessions.values()) {
      totalSessionDuration += stats.duration;
      totalSessionRequests += stats.requestCount;
    }
    result.sessionStats = {
      totalSessions: this.sessions.size,
      avgSessionDuration: this.sessions.size > 0 ? totalSessionDuration / this.sessions.size : 0,
      avgRequestsPerSession: this.sessions.size > 0 ? totalSessionRequests / this.sessions.size : 0,
    };

    return result;
  }

  percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  start() {
    this.startTime = Date.now();
  }

  end() {
    this.endTime = Date.now();
  }
}

/**
 * 并发用户管理器
 */
class ConcurrentUserManager {
  constructor(options = {}) {
    this.userCount = options.userCount || 50;
    this.userType = options.userType || 'mixed';
    this.metrics = new GlobalMetricsCollector();
    this.users = [];
  }

  getUserConfig(type) {
    const types = config.userSimulation.userTypes;
    return types[type] || types.medium;
  }

  async startUsers() {
    console.log(`\n启动 ${this.userCount} 个并发用户...`);
    console.log(`用户类型: ${this.userType}`);

    for (let i = 0; i < this.userCount; i++) {
      // 确定用户类型
      let userConfigType = this.userType;
      if (this.userType === 'mixed') {
        const roll = Math.random() * 100;
        if (roll < 30) userConfigType = 'light';
        else if (roll < 80) userConfigType = 'medium';
        else userConfigType = 'heavy';
      }

      const userConfig = this.getUserConfig(userConfigType);
      const user = new UserSession(i + 1, userConfig, this.metrics);
      this.users.push(user);

      // 渐进启动
      if (i > 0 && i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`已启动 ${this.users.length} 个用户`);

    // 并发运行所有用户
    this.metrics.start();
    const promises = this.users.map(user => user.start().catch(() => {}));
    await Promise.all(promises);
    this.metrics.end();
  }

  getReport() {
    return this.metrics.getStats();
  }
}

/**
 * 健康检查
 */
async function healthCheck() {
  return new Promise((resolve) => {
    const req = http.get(`${config.api.baseUrl}/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000);
  });
}

/**
 * 打印报告
 */
function printReport(report) {
  console.log('\n' + '='.repeat(60));
  console.log('并发用户模拟报告');
  console.log('='.repeat(60));

  console.log(`\n测试时长: ${(report.duration / 1000).toFixed(1)}秒`);
  console.log(`总请求数: ${report.totalRequests}`);
  console.log(`成功: ${report.totalSuccess} | 失败: ${report.totalFailure}`);
  console.log(`错误率: ${(report.totalFailure / report.totalRequests * 100).toFixed(2)}%`);
  console.log(`整体 QPS: ${report.overallQPS.toFixed(2)}`);

  console.log('\n分类型统计:');
  for (const [type, stats] of Object.entries(report.types)) {
    const status = stats.errorRate < 0.01 ? 'OK' : stats.errorRate < 0.05 ? 'WARN' : 'CRIT';
    console.log(`\n  [${type.toUpperCase()}] ${status}`);
    console.log(`    请求: ${stats.total} | 成功: ${stats.success} | 失败: ${stats.failure}`);
    console.log(`    错误率: ${(stats.errorRate * 100).toFixed(2)}%`);
    console.log(`    延迟: avg=${stats.avgLatency.toFixed(0)}ms, p90=${stats.p90}ms, p99=${stats.p99}ms`);
  }

  console.log('\n会话统计:');
  console.log(`  总会话数: ${report.sessionStats.totalSessions}`);
  console.log(`  平均会话时长: ${(report.sessionStats.avgSessionDuration / 1000).toFixed(1)}秒`);
  console.log(`  平均每会话请求: ${report.sessionStats.avgRequestsPerSession.toFixed(1)}`);
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
  const filename = `concurrent-users-${userType}-${timestamp}.json`;
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
  console.log('║      AI Chat 玩具 - 并发用户模拟脚本              ║');
  console.log('╚' + '═'.repeat(58) + '╝');

  // 健康检查
  console.log('\n检查后端服务状态...');
  const isHealthy = await healthCheck();

  if (!isHealthy) {
    console.error('  错误: 后端服务不可用');
    process.exit(1);
  }
  console.log('  后端服务正常');

  // 创建用户管理器
  const userCounts = {
    light: 30,
    medium: 50,
    heavy: 20,
    mixed: 50,
  };

  const manager = new ConcurrentUserManager({
    userCount: userCounts[userType] || 50,
    userType: userType,
  });

  // 启动并发用户
  await manager.startUsers();

  // 生成报告
  const report = manager.getReport();
  printReport(report);
  saveReport(report);

  console.log('\n模拟完成!');
}

// 运行
main().catch(console.error);