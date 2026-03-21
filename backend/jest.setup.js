/**
 * Jest 全局设置文件
 */

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://chat:chat123@localhost:5432/aichat_test';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

// 全局超时
jest.setTimeout(30000);

// 全局 beforeAll/afterAll
beforeAll(() => {
  // 测试前设置
});

afterAll(() => {
  // 测试后清理
});

// 控制台模拟
beforeEach(() => {
  jest.clearAllMocks();
});
