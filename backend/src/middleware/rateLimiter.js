/**
 * 限流服务
 * 使用 express-rate-limit 实现请求限流
 */

const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');

// 全局限流器
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 每个IP最多100个请求
  message: {
    success: false,
    error: {
      type: 'rate_limit_exceeded',
      message: '请求过于频繁，请稍后再试'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        type: 'rate_limit_exceeded',
        message: '请求过于频繁，请稍后再试',
        retryAfter: 900 // 15分钟
      }
    });
  }
});

// 登录限流器
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 5, // 最多5次登录尝试
  message: {
    success: false,
    error: {
      type: 'rate_limit_exceeded',
      message: '登录尝试过多，请15分钟后再试'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

// API限流器
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分钟
  max: 60, // 每分钟60次
  message: {
    success: false,
    error: {
      type: 'rate_limit_exceeded',
      message: 'API请求过于频繁'
    }
  }
});

// 聊天限流器
const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分钟
  max: 10, // 每分钟10次聊天请求
  message: {
    success: false,
    error: {
      type: 'rate_limit_exceeded',
      message: '聊天请求过于频繁，请稍后再试'
    }
  }
});

// 慢速模式 (连续请求减速)
const slowDownMiddleware = slowDown({
  windowMs: 1 * 60 * 1000, // 1分钟窗口
  delayAfter: 10, // 10个请求后开始减速
  delayMs: 500, // 每次请求延迟增加500ms
  maxDelayMs: 5000 // 最大延迟5秒
});

module.exports = {
  globalLimiter,
  loginLimiter,
  apiLimiter,
  chatLimiter,
  slowDownMiddleware,
  rateLimit // 导出工厂函数供自定义配置
};
