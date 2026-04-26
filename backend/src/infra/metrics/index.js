/**
 * 指标采集器模块
 * @description 提供全链路指标采集能力，支持 Prometheus 格式导出
 */

const { MetricsCollector, getMetricsCollector } = require('./MetricsCollector');

module.exports = {
  MetricsCollector,
  getMetricsCollector,
};
