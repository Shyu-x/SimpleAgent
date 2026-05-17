/**
 * 统计和分析 API
 */
const express = require('express');
const router = express.Router();
const { getGlobalStats, getIPStats, getAIUsageByIP, getClientIP } = require('../middleware/ipRateLimit');

// 全局统计
router.get('/stats', (req, res) => {
  res.json({
    success: true,
    data: getGlobalStats(),
  });
});

// IP 统计 (管理员)
router.get('/stats/ip/:ip', (req, res) => {
  const stats = getIPStats(req.params.ip);
  const aiUsage = getAIUsageByIP(req.params.ip);
  res.json({
    success: true,
    data: {
      ...stats,
      aiUsage,
    },
  });
});

// 当前 IP 统计
router.get('/stats/me', (req, res) => {
  const ip = getClientIP(req);
  const stats = getIPStats(ip);
  const aiUsage = getAIUsageByIP(ip);
  res.json({
    success: true,
    data: {
      ip,
      ...stats,
      aiUsage,
    },
  });
});

module.exports = router;