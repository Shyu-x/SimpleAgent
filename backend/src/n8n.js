/**
 * n8n 工作流集成模块
 * 提供与 n8n 工作流平台的集成
 * 参考: https://docs.n8n.io/
 */

const axios = require('axios');

// n8n 配置
const N8N_CONFIG = {
  // n8n 服务器地址（可配置）
  baseUrl: process.env.N8N_BASE_URL || 'http://localhost:5678',
  // API Key（可选）
  apiKey: process.env.N8N_API_KEY || '',
  // 默认超时时间
  timeout: 30000
};

/**
 * n8n 客户端类
 */
class N8NClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || N8N_CONFIG.baseUrl;
    this.apiKey = config.apiKey || N8N_CONFIG.apiKey;
    this.timeout = config.timeout || N8N_CONFIG.timeout;
  }

  /**
   * 获取请求头
   */
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (this.apiKey) {
      headers['X-N8N-API-KEY'] = this.apiKey;
    }
    return headers;
  }

  /**
   * 触发工作流（通过 Webhook）
   */
  async triggerWebhook(webhookUrl, data = {}) {
    try {
      const response = await axios.post(webhookUrl, data, {
        headers: this.getHeaders(),
        timeout: this.timeout
      });
      return {
        success: true,
        data: response.data,
        status: response.status
      };
    } catch (error) {
      console.error('[n8n] Webhook trigger error:', error.message);
      return {
        success: false,
        error: error.message,
        status: error.response?.status
      };
    }
  }

  /**
   * 获取工作流列表（需要 API Key）
   */
  async getWorkflows() {
    if (!this.apiKey) {
      return {
        success: false,
        error: 'API Key required to list workflows'
      };
    }

    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/workflows`, {
        headers: this.getHeaders(),
        timeout: this.timeout
      });
      return {
        success: true,
        workflows: response.data.data || []
      };
    } catch (error) {
      console.error('[n8n] Get workflows error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取工作流详情
   */
  async getWorkflow(workflowId) {
    if (!this.apiKey) {
      return {
        success: false,
        error: 'API Key required to get workflow'
      };
    }

    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/workflows/${workflowId}`, {
        headers: this.getHeaders(),
        timeout: this.timeout
      });
      return {
        success: true,
        workflow: response.data
      };
    } catch (error) {
      console.error('[n8n] Get workflow error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 执行工作流（通过 API）
   */
  async executeWorkflow(workflowId, data = {}) {
    if (!this.apiKey) {
      return {
        success: false,
        error: 'API Key required to execute workflow'
      };
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/api/v1/workflows/${workflowId}`,
        data,
        {
          headers: this.getHeaders(),
          timeout: this.timeout
        }
      );
      return {
        success: true,
        executionId: response.data.id,
        data: response.data.data
      };
    } catch (error) {
      console.error('[n8n] Execute workflow error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取执行历史
   */
  async getExecutions(limit = 10) {
    if (!this.apiKey) {
      return {
        success: false,
        error: 'API Key required'
      };
    }

    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/executions`, {
        headers: this.getHeaders(),
        params: { limit },
        timeout: this.timeout
      });
      return {
        success: true,
        executions: response.data.data || []
      };
    } catch (error) {
      console.error('[n8n] Get executions error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 测试连接
   */
  async testConnection() {
    try {
      const response = await axios.get(`${this.baseUrl}/healthz`, {
        timeout: 5000
      });
      return {
        success: response.status === 200,
        message: 'Connected to n8n'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }
}

// 导出单例
const n8nClient = new N8NClient();

module.exports = {
  n8nClient,
  N8NClient,
  N8N_CONFIG
};