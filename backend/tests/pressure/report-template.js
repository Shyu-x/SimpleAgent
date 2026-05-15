/**
 * 压测报告模板
 *
 * 生成标准化的压测报告结构
 */

/**
 * 生成压测报告
 * @param {Object} config - 压测配置
 * @param {Object} results - 压测结果
 * @returns {Object} 报告对象
 */
function generatePressureReport(config, results) {
  return {
    metadata: {
      timestamp: new Date().toISOString(),
      generator: 'AI Chat Pressure Test Suite',
      version: '1.0.0',
    },
    environment: {
      backendUrl: config.api.baseUrl,
      testMode: config.testMode || 'standard',
    },
    scenario: {
      name: results.scenario || 'unknown',
      duration: results.duration,
      concurrentUsers: results.concurrentUsers,
      totalRequests: results.totalRequests,
    },
    metrics: {
      latency: {
        avg: results.avgLatency,
        min: results.minLatency,
        max: results.maxLatency,
        p50: results.p50,
        p90: results.p90,
        p95: results.p95,
        p99: results.p99,
      },
      throughput: {
        qps: results.qps,
        targetQps: config.thresholds.qps.target,
      },
      errors: {
        total: results.failure,
        rate: results.errorRate,
        threshold: config.thresholds.errorRate.critical,
      },
    },
    status: calculateStatus(results, config.thresholds),
    recommendations: generateRecommendations(results, config.thresholds),
  };
}

/**
 * 计算压测状态
 */
function calculateStatus(results, thresholds) {
  const status = {
    latency: 'PASS',
    throughput: 'PASS',
    errorRate: 'PASS',
    overall: 'PASS',
  };

  // 检查延迟
  if (results.p99 > thresholds.latency.p99) {
    status.latency = 'FAIL';
    status.overall = 'FAIL';
  } else if (results.p95 > thresholds.latency.p95) {
    status.latency = 'WARNING';
    if (status.overall === 'PASS') status.overall = 'WARNING';
  }

  // 检查吞吐量
  if (results.qps < thresholds.qps.min) {
    status.throughput = 'FAIL';
    status.overall = 'FAIL';
  } else if (results.qps < thresholds.qps.min * 1.5) {
    status.throughput = 'WARNING';
    if (status.overall === 'PASS') status.overall = 'WARNING';
  }

  // 检查错误率
  if (results.errorRate > thresholds.errorRate.critical) {
    status.errorRate = 'FAIL';
    status.overall = 'FAIL';
  } else if (results.errorRate > thresholds.errorRate.warning) {
    status.errorRate = 'WARNING';
    if (status.overall === 'PASS') status.overall = 'WARNING';
  }

  return status;
}

/**
 * 生成优化建议
 */
function generateRecommendations(results, thresholds) {
  const recommendations = [];

  // 延迟建议
  if (results.p99 > thresholds.latency.p99) {
    recommendations.push({
      category: 'latency',
      priority: 'high',
      issue: `P99延迟 ${results.p99}ms 超过阈值 ${thresholds.latency.p99}ms`,
      suggestion: '考虑增加缓存、优化数据库查询、或升级硬件配置',
    });
  }

  // 吞吐量建议
  if (results.qps < thresholds.qps.min) {
    recommendations.push({
      category: 'throughput',
      priority: 'high',
      issue: `QPS ${results.qps.toFixed(2)} 低于目标 ${thresholds.qps.target}`,
      suggestion: '考虑增加实例数量、优化连接池配置、或使用负载均衡',
    });
  }

  // 错误率建议
  if (results.errorRate > thresholds.errorRate.warning) {
    recommendations.push({
      category: 'errorRate',
      priority: 'critical',
      issue: `错误率 ${(results.errorRate * 100).toFixed(2)}% 过高`,
      suggestion: '检查系统日志，定位错误原因，可能需要修复代码或增加容错机制',
    });
  }

  return recommendations;
}

module.exports = {
  generatePressureReport,
  calculateStatus,
  generateRecommendations,
};