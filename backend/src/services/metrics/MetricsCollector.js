/**
 * 指标收集器
 * 收集 QPS、延迟、错误率等指标
 */

class MetricsCollector {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000; // 1分钟窗口
    this.maxMetrics = options.maxMetrics || 1000;

    this.metrics = {
      requests: [],
      latencies: [],
      errors: [],
      byEndpoint: {}
    };
  }

  /**
   * 记录请求
   */
  recordRequest(endpoint, method, statusCode, latencyMs) {
    const now = Date.now();

    this.metrics.requests.push({
      timestamp: now,
      endpoint,
      method,
      statusCode,
      latencyMs
    });

    this.metrics.latencies.push({
      timestamp: now,
      value: latencyMs
    });

    if (statusCode >= 400) {
      this.metrics.errors.push({
        timestamp: now,
        endpoint,
        statusCode
      });
    }

    // 按端点统计
    if (!this.metrics.byEndpoint[endpoint]) {
      this.metrics.byEndpoint[endpoint] = {
        total: 0,
        errors: 0,
        totalLatency: 0
      };
    }
    this.metrics.byEndpoint[endpoint].total++;
    if (statusCode >= 400) {
      this.metrics.byEndpoint[endpoint].errors++;
    }
    this.metrics.byEndpoint[endpoint].totalLatency += latencyMs;

    // 清理过期数据
    this._cleanup();
  }

  /**
   * 获取当前指标
   */
  getMetrics() {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    const recentRequests = this.metrics.requests.filter(r => r.timestamp >= windowStart);
    const recentErrors = this.metrics.errors.filter(e => e.timestamp >= windowStart);
    const recentLatencies = this.metrics.latencies.filter(l => l.timestamp >= windowStart);

    // 计算延迟百分位数
    const sortedLatencies = recentLatencies.map(l => l.value).sort((a, b) => a - b);
    const p50 = this._percentile(sortedLatencies, 0.5);
    const p95 = this._percentile(sortedLatencies, 0.95);
    const p99 = this._percentile(sortedLatencies, 0.99);

    return {
      qps: recentRequests.length / (this.windowMs / 1000),
      totalRequests: recentRequests.length,
      errorRate: recentRequests.length > 0
        ? recentErrors.length / recentRequests.length
        : 0,
      latency: {
        p50,
        p95,
        p99,
        avg: recentLatencies.length > 0
          ? recentLatencies.reduce((sum, l) => sum + l.value, 0) / recentLatencies.length
          : 0
      },
      byEndpoint: this._summarizeEndpoints()
    };
  }

  /**
   * 重置指标
   */
  reset() {
    this.metrics = {
      requests: [],
      latencies: [],
      errors: [],
      byEndpoint: {}
    };
  }

  _cleanup() {
    const cutoff = Date.now() - this.windowMs * 2;

    this.metrics.requests = this.metrics.requests.filter(r => r.timestamp >= cutoff);
    this.metrics.latencies = this.metrics.latencies.filter(l => l.timestamp >= cutoff);
    this.metrics.errors = this.metrics.errors.filter(e => e.timestamp >= cutoff);
  }

  _percentile(sortedArr, p) {
    if (!sortedArr.length) return 0;
    const idx = Math.ceil(sortedArr.length * p) - 1;
    return sortedArr[Math.max(0, idx)];
  }

  _summarizeEndpoints() {
    const summary = {};
    for (const [endpoint, stats] of Object.entries(this.metrics.byEndpoint)) {
      summary[endpoint] = {
        total: stats.total,
        errors: stats.errors,
        errorRate: stats.total > 0 ? stats.errors / stats.total : 0,
        avgLatency: stats.total > 0 ? stats.totalLatency / stats.total : 0
      };
    }
    return summary;
  }
}

// 全局单例
const globalMetrics = new MetricsCollector();

module.exports = {
  MetricsCollector,
  globalMetrics
};
