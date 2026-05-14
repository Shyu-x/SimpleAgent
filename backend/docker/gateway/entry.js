/**
 * Gateway Entry Point
 * API 网关入口文件
 */

const express = require('express');
const { router, requestLogger, corsMiddleware, dynamicProxy } = require('./gateway.controller');

const app = express();
const PORT = process.env.PORT || 30000;

// ================================================
// 中间件配置
// ================================================

// 请求日志
app.use(requestLogger);

// CORS
app.use(corsMiddleware);

// 请求体解析
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 动态代理中间件
app.use(dynamicProxy);

// ================================================
// 路由挂载
// ================================================
app.use('/', router);

// ================================================
// 启动服务
// ================================================
app.listen(PORT, () => {
  console.log(JSON.stringify({
    level: 'info',
    msg: 'API Gateway started',
    port: PORT,
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  }));
});

// ================================================
// 优雅关闭
// ================================================
process.on('SIGTERM', () => {
  console.log(JSON.stringify({
    level: 'info',
    msg: 'SIGTERM received, shutting down gracefully',
    timestamp: new Date().toISOString(),
  }));
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(JSON.stringify({
    level: 'info',
    msg: 'SIGINT received, shutting down gracefully',
    timestamp: new Date().toISOString(),
  }));
  process.exit(0);
});

module.exports = app;
