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
  ],

  // 收集覆盖率的文件
  collectCoverageFrom: [
    'src/services/**/*.js',
    'src/utils/**/*.js',
    'src/middleware/**/*.js',
    'src/routes/**/*.js',
    '!src/**/*.test.js',
    '!src/**/__tests__/**',
  ],

  // 覆盖率阈值
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 30,
      lines: 30,
      statements: 30,
    },
  },

  // 覆盖率报告格式
  coverageReporters: ['text', 'lcov', 'html'],

  // 覆盖率输出目录
  coverageDirectory: 'coverage',

  // 测试超时时间
  testTimeout: 10000,

  // 全局设置
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // 模块映射
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
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
