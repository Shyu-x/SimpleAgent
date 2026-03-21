// 加载环境变量
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { TracingService, tracingMiddleware } = require('./services/tracing');
const { initializeDatabase, closeDatabase } = require('./services/database');

// 创建追踪服务实例
const tracingService = new TracingService({
  serviceName: 'ai-chat-backend',
  enableLogging: process.env.NODE_ENV !== 'production'
});

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 8081;

  // 初始化数据库连接
  try {
    await initializeDatabase();
  } catch (error) {
    console.warn('数据库初始化失败，继续启动服务:', error.message);
  }

  // 安全中间件：请求体大小限制
  app.use(express.json({ limit: '1mb' }));

  // 安全中间件：CORS配置 - 生产环境应限制来源
  const corsOptions = {
    origin: (origin, callback) => {
      // 允许没有origin的请求（如Postman/curl）
      // 以及localhost origins
      if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        callback(null, true);
      } else {
        callback(null, true); // 允许所有，生产环境应该限制
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Trace-Id', 'X-Span-Id'],
    credentials: false, // 关闭credentials以避免wildcard问题
    maxAge: 86400
  };
  app.use(cors(corsOptions));

  // 全链路追踪中间件
  app.use(tracingMiddleware(tracingService));

  // 安全中间件：基本请求验证
  app.use((req, _res, next) => {
    // 记录请求 - 仅在非生产环境
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    }
    next();
  });

  // 加载路由
  const chatRoutes = require('./routes/chat');
  const configRoutes = require('./routes/config');
  const sessionsRoutes = require('./routes/sessions');
  const proxyRoutes = require('./routes/proxy');
  const mcpRoutes = require('./routes/mcp');
  const searchRoutes = require('./routes/search');
  const searchEnhancedRoutes = require('./routes/searchEnhanced');
  const n8nRoutes = require('./routes/n8n');
  const browserRoutes = require('./routes/browser');
  const multiagentRoutes = require('./routes/multiagent');
  const hitlRoutes = require('./routes/hitl');
  const hitlSseRoutes = require('./routes/hitlSSE');
  const enhancedAgentRoutes = require('./routes/enhancedAgent');
  const enhancedMemoryRoutes = require('./routes/enhancedMemory');
  const routerRoutes = require('./routes/router');
  const ragRoutes = require('./routes/rag');
  const taskQueueRoutes = require('./routes/taskQueue');
  const pluginRoutes = require('./routes/plugins');
  const skillRoutes = require('./routes/skills');
  const mcpAgentRoutes = require('./routes/mcpAgent');
  const multiAgentEngineRoutes = require('./routes/multiAgentEngine');
  const conversationsRoutes = require('./routes/conversations');
  const memoriesRoutes = require('./routes/memories');
  const minimaxMcpRoutes = require('./routes/minimaxMcp');
  const a2aRoutes = require('./routes/a2a');
  const agentTraceRoutes = require('./routes/agentTrace');
  const agentTracePageRoutes = require('./routes/agentTracePage');

  // Routes
  app.use('/api/chat', chatRoutes);
  app.use('/api/config', configRoutes);
  app.use('/api/sessions', sessionsRoutes);
  app.use('/api/v1', proxyRoutes);
  app.use('/api/mcp', mcpRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/search', searchEnhancedRoutes);
  app.use('/api/n8n', n8nRoutes);
  app.use('/api/browser', browserRoutes);
  app.use('/api/multiagent', multiagentRoutes);
  app.use('/api/hitl', hitlRoutes);
  app.use('/api/hitl', hitlSseRoutes);
  app.use('/api/enhanced-agent', enhancedAgentRoutes);
  app.use('/api/memory', enhancedMemoryRoutes);
  app.use('/api/router', routerRoutes);
  app.use('/api/rag', ragRoutes);
  app.use('/api/tasks', taskQueueRoutes);
  app.use('/api/plugins', pluginRoutes);
  app.use('/api/skills', skillRoutes);
  app.use('/api/agents', multiAgentEngineRoutes);
  app.use('/api/minimax-agent', mcpAgentRoutes);
  app.use('/api/conversations', conversationsRoutes);
  app.use('/api/memories', memoriesRoutes);
  app.use('/api/minimax', minimaxMcpRoutes);
  app.use('/api/a2a', a2aRoutes);
  app.use('/api/agent', a2aRoutes); // 别名，与前端期望的路由兼容
  app.use('/api/agent', agentTraceRoutes); // Agent 轨迹 API
  app.use('/agent', agentTracePageRoutes); // Agent 可视化页面

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 404 处理
  app.use((req, res) => {
    res.status(404).json({
      error: {
        message: 'Not Found',
        type: 'not_found_error',
        path: req.path
      }
    });
  });

  // 全局错误处理中间件
  app.use((err, req, res, _next) => {
    console.error('Unhandled error:', err.message);

    // 避免泄露内部错误详情
    const message = process.env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : err.message;

    res.status(err.status || 500).json({
      error: {
        message,
        type: 'server_error',
        requestId: req.headers['x-request-id'] || undefined
      }
    });
  });

  // 优雅关闭
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    await closeDatabase();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully');
    await closeDatabase();
    process.exit(0);
  });

  app.listen(PORT, () => {
    console.log(`AI Chat Backend running on http://localhost:${PORT}`);
    console.log(`Database: ${process.env.DATABASE_URL ? 'PostgreSQL' : 'Not configured'}`);
  });
}

// 启动服务器
startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
