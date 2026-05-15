/**
 * Metrics API 集成测试 (Jest + Supertest)
 * 测试 /api/metrics/* 路由
 *
 * 运行: npm test -- --testPathPattern=integration/metricsApi.test.js
 */

const request = require('supertest');
const express = require('express');

// 创建测试应用
function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/metrics', require('../../src/routes/metrics'));
  return app;
}

describe('Metrics API 集成测试', () => {
  let app;

  beforeEach(() => {
    app = createApp();
  });

  // ========== Prometheus 格式 ==========
  describe('Metrics-基础', () => {
    test('GET /api/metrics 返回 Prometheus 格式', async () => {
      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/text\/plain/);
    });

    test('GET /api/metrics/summary 返回 JSON 摘要', async () => {
      const response = await request(app)
        .get('/api/metrics/summary')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('system');
      expect(response.body).toHaveProperty('http');
    });
  });

  // ========== 实时指标 ==========
  describe('Metrics-实时', () => {
    test('GET /api/metrics/realtime 返回实时指标', async () => {
      const response = await request(app)
        .get('/api/metrics/realtime')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('performance');
      expect(response.body).toHaveProperty('throughput');
      expect(response.body).toHaveProperty('success');
    });

    test('GET /api/metrics/realtime 包含系统状态', async () => {
      const response = await request(app)
        .get('/api/metrics/realtime')
        .expect(200);

      expect(response.body).toHaveProperty('system');
      expect(response.body).toHaveProperty('agents');
      expect(response.body).toHaveProperty('alerts');
    });
  });

  // ========== 指标字段验证 ==========
  describe('Metrics-字段验证', () => {
    test('GET /api/metrics/summary 包含 latency 字段', async () => {
      const response = await request(app)
        .get('/api/metrics/summary')
        .expect(200);

      expect(response.body).toHaveProperty('latency');
      expect(response.body.latency).toHaveProperty('p50');
      expect(response.body.latency).toHaveProperty('p95');
      expect(response.body.latency).toHaveProperty('p99');
    });

    test('GET /api/metrics/summary 包含 model 字段', async () => {
      const response = await request(app)
        .get('/api/metrics/summary')
        .expect(200);

      expect(response.body).toHaveProperty('model');
      expect(response.body.model).toHaveProperty('totalTokens');
      expect(response.body.model).toHaveProperty('totalRequests');
    });

    test('GET /api/metrics/summary 包含 tool 字段', async () => {
      const response = await request(app)
        .get('/api/metrics/summary')
        .expect(200);

      expect(response.body).toHaveProperty('tool');
      expect(response.body.tool).toHaveProperty('totalCalls');
    });

    test('GET /api/metrics/summary 包含 queue 字段', async () => {
      const response = await request(app)
        .get('/api/metrics/summary')
        .expect(200);

      expect(response.body).toHaveProperty('queue');
      expect(response.body.queue).toHaveProperty('length');
      expect(response.body.queue).toHaveProperty('capacity');
    });
  });
});