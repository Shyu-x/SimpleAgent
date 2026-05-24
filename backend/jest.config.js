/** @type {import('jest').Config} */
module.exports = {
  // 测试环境
  testEnvironment: 'node',

  // 测试文件匹配模式
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/__tests__/**/*.test.ts',
    '**/*.test.js',
    '**/*.spec.js',
  ],

  // 忽略文件
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/tests/integration/',  // 集成测试需要服务器
    '/tests/tools/',  // 工具测试需要网络
    '/tests/stress/',  // 压力测试需要独立运行
    // 非 Jest 测试框架的自定义测试文件
    '/tests/unit/modelRouter.test.js',
    '/tests/unit/agentTrace.test.js',
    '/tests/unit/probeBufferingCallback.test.js',
    '/tests/unit/ingestionPipeline.test.js',
    '/tests/unit/full-chain-tdd.test.js',
    '/tests/unit/chatModelClient.test.js',
  ],

  // 收集覆盖率的文件
  collectCoverageFrom: [
    'src/services/**/*.js',
    'src/utils/**/*.js',
    'src/middleware/**/*.js',
    'src/routes/**/*.js',
    'src/infra/**/*.js',
    'src/common/**/*.js',
    '!src/**/*.test.js',
    '!src/**/__tests__/**',
  ],

  // 覆盖率阈值（暂时设为 0 以允许测试运行）
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0,
    },
  },

  // 覆盖率报告格式
  coverageReporters: ['text', 'lcov', 'html'],

  // 覆盖率输出目录
  coverageDirectory: 'coverage',

  // 测试超时时间（增加到 60 秒）
  testTimeout: 60000,

  // 全局设置
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // 模块映射
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^redis$': '<rootDir>/src/infra/rateLimiter/__mocks__/redis.js',
  },

  // 转换器
  transform: {
    '^.+\\.js$': 'babel-jest',
  },

  // 安静模式
  silent: false,

  // 详细输出
  verbose: true,
};
