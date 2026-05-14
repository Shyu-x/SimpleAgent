/**
 * Qdrant 压测配置
 *
 * @module tests/stress-test/config
 */

module.exports = {
  // Qdrant 连接配置
  qdrant: {
    host: process.env.QDRANT_HOST || 'localhost',
    port: process.env.QDRANT_PORT || '6333',
    collection: process.env.QDRANT_COLLECTION || 'chat_documents',
    dimension: parseInt(process.env.QDRANT_DIMENSION) || 1024,
    apiKey: process.env.QDRANT_API_KEY || null,
  },

  // 并发级别配置
  concurrency: {
    levels: [10, 50, 100, 200],
    warmupRequests: 5,
    cooldownMs: 1000,
  },

  // 测试数据集
  testData: {
    // 测试查询文本
    queries: [
      'JavaScript 闭包的使用方法',
      'React Hook 的工作原理',
      'Node.js 异步编程',
      'TypeScript 类型系统',
      '前端性能优化技巧',
      'WebSocket 实时通信',
      'GraphQL API 设计',
      'Docker 容器化部署',
      '微服务架构设计',
      '数据库索引优化',
      'Git 分支管理策略',
      'RESTful API 最佳实践',
      'Webpack 构建优化',
      '浏览器渲染原理',
      '前端安全防护措施',
    ],

    // 测试文档内容
    documents: [
      {
        title: 'JavaScript 基础教程',
        content: 'JavaScript 是一种动态编程语言，广泛用于网页开发。它支持闭包、原型继承、异步编程等高级特性。闭包是 JavaScript 的核心概念之一，允许函数访问其外部作用域的变量。',
      },
      {
        title: 'React 框架指南',
        content: 'React 是一个用于构建用户界面的 JavaScript 库。它使用虚拟 DOM 和组件化架构来提高渲染性能。React Hook 是 React 16.8 引入的新特性，允许在函数组件中使用状态和其他 React 特性。',
      },
      {
        title: 'Node.js 权威指南',
        content: 'Node.js 是一个基于 Chrome V8 引擎的 JavaScript 运行时。它使用事件驱动、非阻塞 I/O 模型，适合构建高性能网络应用。Node.js 广泛用于后端开发、API 服务和实时应用。',
      },
      {
        title: 'TypeScript 入门到精通',
        content: 'TypeScript 是 JavaScript 的超集，添加了静态类型检查。TypeScript 编译到纯 JavaScript，可在任何浏览器和操作系统上运行。它提供了接口、泛型、枚举等类型系统特性。',
      },
      {
        title: '前端性能优化',
        content: '前端性能优化包括代码分割、懒加载、缓存策略、资源压缩等手段。通过减少 HTTP 请求、优化图片、使用 CDN 等方法可以显著提升页面加载速度。',
      },
    ],
  },

  // 批量测试配置
  batch: {
    sizes: [10, 50, 100],
    defaultSize: 10,
  },

  // 性能基线（验收标准）
  baselines: {
    // 延迟要求 (ms)
    latency: {
      p50: 50,      // P50 应小于 50ms
      p90: 100,     // P90 应小于 100ms
      p99: 200,     // P99 应小于 200ms
    },

    // 吞吐量要求 (请求/秒)
    throughput: {
      minQps: 100,  // 最小 QPS
      targetQps: 500, // 目标 QPS
    },

    // 错误率要求
    errorRate: {
      max: 0.01,    // 最大 1% 错误率
      critical: 0.05, // 严重阈值 5%
    },

    // 降级机制要求
    fallback: {
      maxLatency: 500,  // 降级后最大延迟
      maxErrorRate: 0.1, // 降级后最大错误率 10%
    },
  },

  // 压测持续时间配置
  duration: {
    steadyStateMs: 30000,    // 稳态测试持续 30 秒
    spikeTestMs: 10000,      // 峰值测试持续 10 秒
    soakTestMs: 60000,        // 浸泡测试持续 60 秒
  },

  // 超时配置
  timeouts: {
    connect: 5000,    // 连接超时 5s
    request: 10000,   // 请求超时 10s
    healthCheck: 3000, // 健康检查超时 3s
  },

  // 熔断器配置
  circuitBreaker: {
    failureThreshold: 5,   // 5 次失败触发熔断
    resetTimeout: 10000,    // 10 秒后尝试恢复
    successThreshold: 2,    // 2 次成功关闭熔断
  },
};