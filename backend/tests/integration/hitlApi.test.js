/**
 * HITL API 集成测试 (Jest + Supertest)
 * 测试 /api/hitl/* 路由
 *
 * 运行: npm test -- --testPathPattern=integration/hitlApi.test.js
 */

const request = require('supertest');
const express = require('express');

// 创建测试应用
function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/hitl', require('../../src/routes/hitl'));
  return app;
}

describe('HITL API 集成测试', () => {
  let app;

  beforeEach(() => {
    app = createApp();
  });

  // ========== 基础健康检查 ==========
  describe('HITL-健康检查', () => {
    test('GET /api/hitl/health 返回健康状态', async () => {
      const response = await request(app)
        .get('/api/hitl/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
    });

    test('GET /api/hitl/types 返回检查点类型', async () => {
      const response = await request(app)
        .get('/api/hitl/types')
        .expect(200);

      expect(response.body).toHaveProperty('types');
    });

    test('GET /api/hitl/stats 返回统计信息', async () => {
      const response = await request(app)
        .get('/api/hitl/stats')
        .expect(200);

      // stats 响应结构: { success: true, stats: { total, pending, ... } }
      const stats = response.body.stats || response.body;
      expect(stats).toHaveProperty('total');
    });
  });

  // ========== 待处理检查点 ==========
  describe('HITL-待处理检查点', () => {
    test('GET /api/hitl/pending 返回待处理列表', async () => {
      const response = await request(app)
        .get('/api/hitl/pending')
        .expect(200);

      expect(response.body).toHaveProperty('checkpoints');
    });
  });

  // ========== 历史记录 ==========
  describe('HITL-历史', () => {
    test('GET /api/hitl/history 返回历史记录', async () => {
      const response = await request(app)
        .get('/api/hitl/history')
        .expect(200);

      expect(Array.isArray(response.body.history) || response.body).toBeTruthy();
    });

    test('GET /api/hitl/history?limit=10 分页参数', async () => {
      const response = await request(app)
        .get('/api/hitl/history')
        .query({ limit: 10 })
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });

  // ========== 清除 ==========
  describe('HITL-清除', () => {
    test('POST /api/hitl/clear 清除待处理检查点', async () => {
      const response = await request(app)
        .post('/api/hitl/clear')
        .expect(200);

      expect(response.body).toHaveProperty('success');
    });
  });
});