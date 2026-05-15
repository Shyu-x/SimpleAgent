/**
 * 性能压测配置
 *
 * 定义压测场景、指标阈值、测试数据
 */

module.exports = {
  // API 配置
  api: {
    baseUrl: process.env.BACKEND_URL || 'http://localhost:30000',
    timeout: 30000,
    keepAlive: true,
  },

  // 压测场景配置
  scenarios: {
    // 正常负载
    normal: {
      name: '正常负载测试',
      concurrentUsers: 10,
      requestsPerUser: 20,
      thinkTime: 1000, // 用户思考时间 (ms)
      rampUp: 2000,    // 预热时间 (ms)
    },
    // 峰值负载
    peak: {
      name: '峰值负载测试',
      concurrentUsers: 50,
      requestsPerUser: 50,
      thinkTime: 500,
      rampUp: 5000,
    },
    // 极限负载
    stress: {
      name: '极限负载测试',
      concurrentUsers: 100,
      requestsPerUser: 100,
      thinkTime: 200,
      rampUp: 10000,
    },
  },

  // 性能指标阈值
  thresholds: {
    // 延迟阈值 (ms)
    latency: {
      p50: 500,
      p90: 1500,
      p95: 2000,
      p99: 3000,
      max: 10000,
    },
    // QPS 阈值
    qps: {
      min: 50,
      target: 100,
      max: 200,
    },
    // 错误率阈值
    errorRate: {
      success: 0.001,   // < 0.1% 成功
      warning: 0.01,     // < 1% 警告
      critical: 0.05,    // < 5% 严重
    },
    // 吞吐量阈值
    throughput: {
      min: 30,          // 最小 30 req/s
      target: 80,       // 目标 80 req/s
      max: 150,         // 最大 150 req/s
    },
  },

  // 测试数据
  testData: {
    // 聊天测试消息
    chatMessages: [
      '你好，请介绍一下 JavaScript 的闭包',
      '什么是 React Hook？请举例说明',
      '如何优化前端性能？',
      '解释一下 Event Loop 的工作原理',
      'TypeScript 和 JavaScript 有什么区别？',
      '请帮我写一个快速排序算法',
      '什么是微服务架构？',
      'Docker 和虚拟机有什么区别？',
      '如何实现 WebSocket 心跳检测？',
      '解释 RESTful API 设计原则',
      '什么是数据库索引？有哪些类型？',
      'Git 如何撤销 commit？',
      '前端安全有哪些常见的攻击方式？',
      '如何减少 React 组件的重渲染？',
      '什么是 CDN？它如何提升性能？',
    ],

    // Agent 模式消息
    agentMessages: [
      '搜索最近的 AI 技术发展趋势',
      '帮我查询北京的天气',
      '计算 12345 * 67890',
      '把 "Hello World" 翻译成日语',
      '帮我写一个获取当前时间的工具',
    ],

    // RAG 查询
    ragQueries: [
      'JavaScript 闭包的使用场景',
      'React 性能优化技巧',
      'Node.js 异步编程模式',
    ],
  },

  // 管理后台 API 端点
  adminEndpoints: {
    // 知识库管理
    knowledge: [
      { method: 'GET', path: '/api/admin/knowledge/docs', weight: 3 },
      { method: 'POST', path: '/api/admin/knowledge/docs', weight: 2 },
      { method: 'DELETE', path: '/api/admin/knowledge/docs/test-id', weight: 1 },
    ],
    // 工具管理
    tools: [
      { method: 'GET', path: '/api/admin/tools', weight: 3 },
      { method: 'POST', path: '/api/admin/tools/register', weight: 1 },
      { method: 'GET', path: '/api/admin/tools/categories/list', weight: 2 },
    ],
    // 模型管理
    model: [
      { method: 'GET', path: '/api/admin/models', weight: 3 },
      { method: 'GET', path: '/api/admin/models/stats', weight: 2 },
      { method: 'POST', path: '/api/admin/models/MiniMax-M2.7/circuit-breaker', weight: 1 },
    ],
    // Prompt 模板
    prompt: [
      { method: 'GET', path: '/api/admin/prompts', weight: 3 },
      { method: 'POST', path: '/api/admin/prompts', weight: 1 },
      { method: 'PATCH', path: '/api/admin/prompts/test-template-id', weight: 2 },
    ],
    // 链路追踪
    trace: [
      { method: 'GET', path: '/api/admin/trace/stats', weight: 2 },
      { method: 'GET', path: '/api/admin/trace/list?limit=20', weight: 3 },
      { method: 'GET', path: '/api/admin/trace/search?query=test', weight: 1 },
    ],
    // 统计
    stats: [
      { method: 'GET', path: '/api/admin/stats', weight: 2 },
    ],
  },

  // 并发用户模拟配置
  userSimulation: {
    // 用户会话配置
    session: {
      duration: 300000,      // 会话持续 5 分钟
      thinkTime: {
        min: 500,
        max: 5000,
      },
      messageDelay: {
        min: 1000,
        max: 10000,
      },
    },

    // 用户类型分布
    userTypes: {
      // 轻度用户 (浏览/简单查询)
      light: {
        weight: 30,
        thinkTime: 3000,
        avgMessageLength: 20,
        requestInterval: 10000,
      },
      // 中度用户 (常规对话)
      medium: {
        weight: 50,
        thinkTime: 2000,
        avgMessageLength: 50,
        requestInterval: 5000,
      },
      // 重度用户 (复杂任务)
      heavy: {
        weight: 20,
        thinkTime: 1000,
        avgMessageLength: 100,
        requestInterval: 2000,
      },
    },

    // 用户行为模式
    behaviors: [
      { name: 'simple_chat', weight: 40 },
      { name: 'agent_task', weight: 30 },
      { name: 'rag_query', weight: 20 },
      { name: 'admin_operation', weight: 10 },
    ],
  },

  // 输出配置
  output: {
    reportDir: '../../docs/test-results/pressure-tests',
    jsonReport: true,
    htmlReport: true,
    consoleProgress: true,
  },

  // 环境验证
  validation: {
    checkBackend: true,
    checkQdrant: false,  // Qdrant 可选
    healthCheckEndpoint: '/health',
    maxRetries: 3,
    retryDelay: 2000,
  },
};