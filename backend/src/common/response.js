/**
 * 统一 API 响应格式
 * 格式: {success: bool, data: any, error: {code, message}, timestamp}
 * @version 2.0.0 (2026-04-06)
 */

/**
 * 生成 ISO 时间戳
 * @returns {string}
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * 成功响应
 * @param {object} res - Express response object
 * @param {any} data - 响应数据
 * @param {number} [statusCode=200] - HTTP状态码
 */
function successResponse(res, data, statusCode = 200) {
  res.status(statusCode).json({
    success: true,
    data,
    error: null,
    timestamp: getTimestamp(),
  });
}

/**
 * 创建成功响应对象（不发送）
 * @param {any} data - 响应数据
 * @param {number} [statusCode=200] - HTTP状态码
 * @returns {object}
 */
function createSuccessResponse(data, statusCode = 200) {
  return {
    status: statusCode,
    body: {
      success: true,
      data,
      error: null,
      timestamp: getTimestamp(),
    },
  };
}

/**
 * 错误响应
 * @param {object} res - Express response object
 * @param {number} code - 错误码
 * @param {string} message - 错误消息
 * @param {number} [statusCode=500] - HTTP状态码
 */
function errorResponse(res, code, message, statusCode = 500) {
  res.status(statusCode).json({
    success: false,
    data: null,
    error: {
      code,
      message,
    },
    timestamp: getTimestamp(),
  });
}

/**
 * 创建错误响应对象（不发送）
 * @param {number} code - 错误码
 * @param {string} message - 错误消息
 * @param {number} [statusCode=500] - HTTP状态码
 * @returns {object}
 */
function createErrorResponse(code, message, statusCode = 500) {
  return {
    status: statusCode,
    body: {
      success: false,
      data: null,
      error: {
        code,
        message,
      },
      timestamp: getTimestamp(),
    },
  };
}

module.exports = {
  successResponse,
  createSuccessResponse,
  errorResponse,
  createErrorResponse,
  getTimestamp,
};
