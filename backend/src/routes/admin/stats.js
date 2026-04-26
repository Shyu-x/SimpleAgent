/**
 * Admin Stats API
 * 提供管理后台仪表盘所需的系统统计信息
 *
 * @date 2026-04-03
 *
 * @swagger
 * tags:
 *   - name: admin
 *     description: 管理后台接口
 *   - name: stats
 *     description: 系统统计
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

/**
 * 获取工具注册表实例
 */
function getRegistry(req) {
  const registry = req.app.get('toolRegistry');
  if (!registry) {
    throw new Error('Tool registry not initialized');
  }
  return registry;
}

/**
 * 读取 agent state 文件获取会话统计
 */
function getSessionStats() {
  const dataDir = path.join(process.cwd(), 'data', 'agent-states');
  let totalSessions = 0;
  let activeSessions = 0;

  try {
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
      totalSessions = files.length;

      // 简单假设最近10分钟内修改的文件为活跃会话
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      files.forEach(file => {
        const filePath = path.join(dataDir, file);
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs > tenMinutesAgo) {
          activeSessions++;
        }
      });
    }
  } catch (error) {
    console.warn('读取会话统计失败:', error.message);
  }

  return { totalSessions, activeSessions };
}

/**
 * 读取 RAG 知识库统计
 */
function getKnowledgeBaseStats() {
  const dataDir = path.join(process.cwd(), 'data', 'rag');
  const knowledgeBases = [];

  try {
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
      files.forEach(file => {
        try {
          const filePath = path.join(dataDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(content);
          knowledgeBases.push({
            name: data.name || file.replace('.json', ''),
            docCount: data.documents?.length || 0
          });
        } catch (e) {
          // 忽略解析失败的文件
        }
      });
    }
  } catch (error) {
    console.warn('读取知识库统计失败:', error.message);
  }

  return knowledgeBases;
}

/**
 * 获取模型调用统计
 * 从 MetricsCollector 获取
 */
function getModelStats() {
  try {
    const { globalMetrics } = require('../services/metrics/MetricsCollector');
    const metrics = globalMetrics.getMetrics();
    return metrics.modelCalls || [];
  } catch {
    return [];
  }
}

/**
 * GET /api/admin/stats
 * 获取系统统计信息
 */
router.get('/', async (req, res) => {
  try {
    const registry = getRegistry(req);

    // 获取会话统计
    const sessionStats = getSessionStats();

    // 获取知识库统计
    const knowledgeBases = getKnowledgeBaseStats();

    // 获取工具调用统计
    const tools = registry.listTools();
    const toolCalls = tools.map(t => {
      const stats = registry.getToolStats(t.name);
      return {
        tool: t.name,
        count: stats?.totalCalls || 0
      };
    }).filter(t => t.count > 0).sort((a, b) => b.count - a.count);

    // 获取模型调用统计
    const modelCalls = getModelStats();

    // 获取 Metrics 统计
    let totalRequests = 0;
    let successRate = 0;
    let avgLatency = 0;

    try {
      const { globalMetrics } = require('../services/metrics/MetricsCollector');
      const metrics = globalMetrics.getMetrics();
      totalRequests = metrics.totalRequests || 0;
      successRate = metrics.errorRate !== undefined ? (1 - metrics.errorRate) : 1;
      avgLatency = metrics.latency?.avg || 0;
    } catch {
      // 如果无法获取 metrics，使用默认值
    }

    // 组装响应数据
    const stats = {
      totalRequests,
      successRate,
      avgLatency,
      activeSessions: sessionStats.activeSessions,
      modelCalls,
      toolCalls,
      knowledgeBases
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取统计信息失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
