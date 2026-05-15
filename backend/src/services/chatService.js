/**
 * Chat Service - 聊天业务逻辑层
 * 处理聊天请求的消息格式化和验证
 */
const { AgentLogger } = require('../infra/logger/AgentLogger');

const logger = new AgentLogger('chatService');

/**
 * 消息格式标准化
 * 将多种输入格式统一为标准消息数组
 *
 * @param {Array|string} messages - 消息数组或单个消息字符串
 * @param {string} message - 备用消息字符串
 * @returns {Array|null} 标准化后的消息数组，失败返回 null
 */
function normalizeMessages(messages, message) {
  if (Array.isArray(messages)) {
    return messages;
  }
  if (typeof message === 'string' && message.trim()) {
    return [{ role: 'user', content: message.trim() }];
  }
  return null;
}

/**
 * 验证消息数组
 *
 * @param {Array} normalizedMessages - 标准化后的消息数组
 * @returns {{ valid: boolean, error?: { message: string, type: string } }}
 */
function validateMessages(normalizedMessages) {
  if (!normalizedMessages) {
    return {
      valid: false,
      error: {
        message: 'messages is required and must be an array',
        type: 'invalid_request_error',
      },
    };
  }

  if (normalizedMessages.length > 100) {
    return {
      valid: false,
      error: {
        message: 'Too many messages (max 100)',
        type: 'invalid_request_error',
      },
    };
  }

  return { valid: true };
}

/**
 * 验证并标准化消息
 * 组合 normalizeMessages 和 validateMessages 的便捷方法
 *
 * @param {Array|string} messages - 消息数组或单个消息字符串
 * @param {string} message - 备用消息字符串
 * @returns {{ success: boolean, data?: Array, error?: { message: string, type: string } }}
 */
function normalizeAndValidate(messages, message) {
  const normalized = normalizeMessages(messages, message);
  const validation = validateMessages(normalized);

  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  return {
    success: true,
    data: normalized,
  };
}

/**
 * 发送错误响应
 *
 * @param {Response} res - Express Response 对象
 * @param {number} status - HTTP 状态码
 * @param {string} message - 错误消息
 * @param {string} type - 错误类型
 */
function sendError(res, status, message, type = 'server_error') {
  res.status(status).json({ error: { message, type } });
}

/**
 * 发送成功响应
 *
 * @param {Response} res - Express Response 对象
 * @param {number} status - HTTP 状态码 (默认 200)
 * @param {object} data - 响应数据
 */
function sendSuccess(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

module.exports = {
  normalizeMessages,
  validateMessages,
  normalizeAndValidate,
  sendError,
  sendSuccess,
};
