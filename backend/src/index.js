// 加载环境变量
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { TracingService, tracingMiddleware } = require('./services/tracing');
const { initializeDatabase, closeDatabase } = require('./services/database');
const { createDefaultToolRegistry } = require('./services/tools');
const { createLogger } = require('./infra/logger/AgentLogger');
const logger = createLogger('index');

// 创建全局工具注册表（包含30+工具）
const globalToolRegistry = createDefaultToolRegistry();

// 创建追踪服务实例
const tracingService = new TracingService({
  serviceName: 'ai-chat-backend',
  enableLogging: process.env.NODE_ENV !== 'production'
});

// Swagger 配置
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AI Chat 玩具 API',
      version: '2.2.0',
      description: '现代化AI对话平台 API 文档',
      contact: { name: 'API Support', email: 'support@ai-chat.example.com' }
    },
    servers: [{ url: 'http://localhost:30000', description: '后端服务地址' }],
    tags: [
      { name: 'chat', description: '聊天接口' },
      { name: 'admin', description: '管理后台接口' },
      { name: 'a2a', description: 'A2A Agent协作协议' },
      { name: 'hitl', description: 'HITL人机协作确认' },
      { name: 'rag', description: 'RAG知识库检索' },
      { name: 'search', description: '搜索服务' },
      { name: 'qdrant', description: 'Qdrant向量数据库' },
      { name: 'metrics', description: '性能指标' },
      { name: 'memory', description: '记忆系统接口' },
      { name: 'mission', description: '任务控制中心接口' }
    ]
  },
  apis: [
    './routes/chat.js',
    './routes/a2a.js',
    './routes/hitl.js',
    './routes/rag.js',
    './routes/search.js',
    './routes/admin/*.js',
    './routes/qdrant.js',
    './routes/metrics.js',
    './routes/memory.js',
    './routes/missionControl.js'
  ]
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 30000;

  // 设置全局工具注册表
  app.set('toolRegistry', globalToolRegistry);

  // 初始化数据库连接
  try {
    await initializeDatabase();
  } catch (error) {
    logger.warn(`数据库初始化失败，继续启动服务: ${error.message}`);
  }

  // 安全中间件：请求体大小限制
  app.use(express.json({ limit: '1mb' }));

  // 安全中间件：CORS配置
  const corsOptions = {
    origin: (origin, callback) => {
      // 允许没有origin的请求（如Postman/curl）
      if (!origin) {
        callback(null, true);
        return;
      }
      // 生产环境只允许特定域名
      if (process.env.NODE_ENV === 'production') {
        const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
        if (allowedOrigins.length > 0 && allowedOrigins[0] !== '') {
          if (allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
          return;
        }
      }
      // 开发环境允许localhost
      if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        callback(null, true);
        return;
      }
      callback(null, true);
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
      logger.debug(`${req.method} ${req.path}`);
    }
    next();
  });

  // 健康检查 - 使用监控模块的 HealthCheckManager
  const healthController = require('./infra/monitoring/health.controller');
  const { getPrometheusService, PrometheusService } = require('./infra/monitoring/prometheus.service');
  const { getMetricsCollector } = require('./infra/metrics');
  const gatewayService = require('./infra/monitoring/gateway.service').getGatewayService();

  // 初始化 Prometheus 服务（关联 MetricsCollector）
  const metricsCollector = getMetricsCollector();
  const prometheusService = getPrometheusService();
  if (metricsCollector) {
    prometheusService.initialize(metricsCollector);
  }

  // 请求指标收集中间件（需要 prometheusService 和 gatewayService）
  const { requestMetricsMiddleware, setPrometheusService, setGatewayService } = require('./middleware/metricsMiddleware');
  setPrometheusService(prometheusService);
  setGatewayService(gatewayService);
  app.use(requestMetricsMiddleware());

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
  const poolRoutes = require('./routes/pool');
  const conversationsRoutes = require('./routes/conversations');
  const memoriesRoutes = require('./routes/memories');
  const minimaxMcpRoutes = require('./routes/minimaxMcp');
  const a2aRoutes = require('./routes/a2a');
  const agentTraceRoutes = require('./routes/agentTrace');
  const agentTracePageRoutes = require('./routes/agentTracePage');
  const toolsRoutes = require('./routes/tools');
  const adminModelRoutes = require('./routes/admin/model');
  const adminPromptRoutes = require('./routes/admin/prompt');
  const adminTraceRoutes = require('./routes/admin/trace');
  const adminKnowledgeRoutes = require('./routes/admin/knowledge');
  const adminToolRoutes = require('./routes/admin/tool');
  const adminStatsRoutes = require('./routes/admin/stats');
  const qdrantRoutes = require('./routes/qdrant');
  const metricsRoutes = require('./routes/metrics');
  const memoryRoutes = require('./routes/memory');
  const adminIntentRoutes = require('./routes/admin/intent');
  const adminStreamRoutes = require('./routes/admin/stream');
  const adminCacheRoutes = require('./routes/admin/cache');
  const missionControlRoutes = require('./routes/missionControl');
  const executionRoutes = require('./routes/execution');
  const modularRoutes = require('./routes/modular');
  const alertsRoutes = require('./routes/alerts');
  const workflowRoutes = require('./routes/workflow');

  // 模块化架构初始化
  const moduleConfig = require('./config/module.config');
  const eventBus = require('./common/event-bus');
  const dataRouter = require('./config/data-isolation');

  // 验证模块依赖关系
  const validation = moduleConfig.validateDependencies();
  if (!validation.valid) {
    logger.warn('模块依赖验证存在警告:', validation.errors);
  }

  // Routes
  app.use('/api/chat', chatRoutes);
  app.use('/api/config', configRoutes);
  app.use('/api/modular', modularRoutes);
  app.use('/api/admin/models', adminModelRoutes);
  app.use('/api/admin/prompts', adminPromptRoutes);
  app.use('/api/admin/traces', adminTraceRoutes);
  app.use('/api/admin/knowledge', adminKnowledgeRoutes);
  app.use('/api/admin/tools', adminToolRoutes);
  app.use('/api/admin/intent', adminIntentRoutes);
  app.use('/api/admin/cache', adminCacheRoutes);
  app.use('/api/admin/stream', adminStreamRoutes);
  app.use('/api/admin/stats', adminStatsRoutes);
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
  app.use('/api/pool', poolRoutes);
  app.use('/api/minimax', minimaxMcpRoutes);
  app.use('/api/a2a', a2aRoutes);
  app.use('/api/workflow', workflowRoutes);
  app.use('/api/agent', a2aRoutes); // 别名，与前端期望的路由兼容
  app.use('/api/agent', agentTraceRoutes); // Agent 轨迹 API
  app.use('/agent', agentTracePageRoutes); // Agent 可视化页面
  app.use('/api/tools', toolsRoutes);
  app.use('/api/qdrant', qdrantRoutes); // Qdrant 向量数据库服务
  app.use('/api/metrics', metricsRoutes); // 性能指标 API
  app.use('/api/memory', memoryRoutes); // 记忆系统 API
  app.use('/api/mission', missionControlRoutes); // MissionControl API
  app.use('/api/execution', executionRoutes); // 执行历史 API
  app.use('/api/alerts', alertsRoutes); // Alerts API

  // Swagger UI
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'AI Chat 玩具 API 文档'
  }));

  // Swagger JSON API
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  // 健康检查 - 使用监控模块的 HealthCheckManager (已在前面初始化)
  // 挂载健康检查路由
  app.use('/health', healthController);

  // 挂载 Prometheus 指标路由
  app.use('/metrics', prometheusService.createRouter());

  // 保留简单健康检查（向后兼容）
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 网关降级状态查询
  app.get('/api/gateway/status', (_req, res) => {
    res.json(gatewayService.getStatus());
  });

  app.post('/api/gateway/degrade', (req, res) => {
    const { level, reason } = req.body;
    const { DegradationLevel, DegradationReason } = require('./infra/monitoring/gateway.service');
    const validLevels = Object.values(DegradationLevel);
    if (!validLevels.includes(level)) {
      return res.status(400).json({ error: '无效的降级级别', validLevels });
    }
    gatewayService.triggerDegradation(level, reason || DegradationReason.MANUAL_TRIGGER);
    res.json({ success: true, message: `已手动降级至 ${level}`, status: gatewayService.getStatus() });
  });

  app.post('/api/gateway/recover', (_req, res) => {
    gatewayService.recover();
    res.json({ success: true, message: '已手动恢复', status: gatewayService.getStatus() });
  });

  // 404 处理 - 统一响应格式
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'SYS-002',
        message: `路由 ${req.method} ${req.path} 不存在`
      },
      timestamp: new Date().toISOString()
    });
  });

  // 全局错误处理中间件 - 统一响应格式
  app.use((err, req, res, _next) => {
    logger.error('Unhandled error:', { error: err.message, stack: err.stack });

    // 避免泄露内部错误详情
    const message = process.env.NODE_ENV === 'production'
      ? '服务器内部错误'
      : err.message;

    const code = err.code || 'SYS-001';

    res.status(err.status || 500).json({
      success: false,
      error: {
        code,
        message
      },
      timestamp: new Date().toISOString()
    });
  });

  // 优雅关闭
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await closeDatabase();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    await closeDatabase();
    process.exit(0);
  });

  app.listen(PORT, () => {
    logger.info(`AI Chat Backend running on http://localhost:${PORT}`);
    logger.info(`Swagger docs available at http://localhost:${PORT}/api-docs`);
    logger.info(`Database: ${process.env.DATABASE_URL ? 'PostgreSQL' : 'Not configured'}`);
  });
}

// 启动服务器
startServer().catch(error => {
  logger.error('Failed to start server:', { error: error.message, stack: error.stack });
  process.exit(1);
});
