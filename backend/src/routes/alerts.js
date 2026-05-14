/**
 * Alerts API 路由
 * 提供告警查询接口，对接 MetricsCollector 的告警系统
 *
 * @date 2026-05-14
 */

const express = require('express');
const router = express.Router();
const { getMetricsCollector } = require('../infra/metrics');

// 获取 MetricsCollector 实例
const getCollector = () => {
  try {
    return getMetricsCollector();
  } catch {
    return null;
  }
};

/**
 * GET /api/alerts
 * 获取所有活跃告警
 */
router.get('/', (_req, res) => {
  const collector = getCollector();
  if (collector && collector.getActiveAlerts) {
    res.json({
      success: true,
      data: collector.getActiveAlerts(),
    });
  } else {
    res.json({
      success: true,
      data: [],
    });
  }
});

/**
 * GET /api/alerts/critical
 * 获取严重级别告警
 */
router.get('/critical', (_req, res) => {
  const collector = getCollector();
  if (collector && collector.getAlertsByLevel) {
    res.json({
      success: true,
      data: collector.getAlertsByLevel('critical'),
    });
  } else {
    res.json({
      success: true,
      data: [],
    });
  }
});

/**
 * GET /api/alerts/warning
 * 获取警告级别告警
 */
router.get('/warning', (_req, res) => {
  const collector = getCollector();
  if (collector && collector.getAlertsByLevel) {
    res.json({
      success: true,
      data: collector.getAlertsByLevel('warning'),
    });
  } else {
    res.json({
      success: true,
      data: [],
    });
  }
});

/**
 * DELETE /api/alerts/:id
 * 解决指定告警
 */
router.delete('/:id', (req, res) => {
  const collector = getCollector();
  if (collector && collector.resolveAlert) {
    const success = collector.resolveAlert(req.params.id);
    res.json({
      success,
      message: success ? '告警已解决' : '告警不存在或已解决',
    });
  } else {
    res.json({
      success: false,
      message: '告警系统不可用',
    });
  }
});

/**
 * DELETE /api/alerts
 * 清除所有已解决的告警
 */
router.delete('/', (_req, res) => {
  const collector = getCollector();
  if (collector && collector.clearResolvedAlerts) {
    collector.clearResolvedAlerts();
    res.json({
      success: true,
      message: '已解决告警已清除',
    });
  } else {
    res.json({
      success: true,
      message: '无已解决告警',
    });
  }
});

module.exports = router;