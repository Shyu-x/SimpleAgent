/**
 * 监控模块导出
 * @description 统一导出监控相关的服务和控制器
 *
 * @author AI Chat 玩具团队
 * @date 2026-05-13
 */

const healthController = require('./health.controller');
const prometheusService = require('./prometheus.service');
const gatewayService = require('./gateway.service');

module.exports = {
  // 健康检查
  healthController,
  HealthCheckManager: healthController.HealthCheckManager,
  ModuleHealthChecker: healthController.ModuleHealthChecker,
  healthCheckManager: healthController.healthCheckManager,

  // Prometheus 指标
  prometheusService,
  PrometheusService: prometheusService.PrometheusService,
  getPrometheusService: prometheusService.getPrometheusService,

  // 网关服务
  gatewayService,
  GatewayService: gatewayService.GatewayService,
  getGatewayService: gatewayService.getGatewayService,
  DegradationLevel: gatewayService.DegradationLevel,
  DegradationReason: gatewayService.DegradationReason,
};