/**
 * HITL SSE Service - SSE 连接管理和事件广播
 */
const { AgentLogger } = require('../infra/logger/AgentLogger');

const logger = new AgentLogger('hitlSSE');

class HITLSSEClientManager {
  constructor() {
    this.sseClients = new Map();
  }

  /**
   * 添加 SSE 客户端
   */
  addClient(clientId, res) {
    this.sseClients.set(clientId, res);
    logger.info(`Client connected`, { clientId, totalClients: this.sseClients.size });
  }

  /**
   * 移除 SSE 客户端
   */
  removeClient(clientId) {
    this.sseClients.delete(clientId);
    logger.info(`Client disconnected`, { clientId, remainingClients: this.sseClients.size });
  }

  /**
   * 获取客户端数量
   */
  getClientCount() {
    return this.sseClients.size;
  }

  /**
   * 广播消息到所有客户端
   */
  broadcast(data) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    for (const [clientId, res] of this.sseClients) {
      try {
        res.write(message);
      } catch (error) {
        logger.error(`Failed to send to client ${clientId}`, { error: error.message });
        this.removeClient(clientId);
      }
    }
  }

  /**
   * 发送心跳
   */
  sendHeartbeat(res) {
    res.write(': heartbeat\n\n');
  }
}

const sseClientManager = new HITLSSEClientManager();

module.exports = { sseClientManager };