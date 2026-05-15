/**
 * Chat API 集成测试 (Jest + Supertest)
 * 测试 /api/chat 路由
 *
 * 运行: npm test -- --testPathPattern=integration/chatApi.test.js
 */

const request = require('supertest');
const express = require('express');

// 创建测试应用
function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/chat', require('../../src/routes/chat'));
  app.use('/api/health', (req, res) => res.json({ status: 'ok' }));
  return app;
}

describe('Chat API 集成测试', () => {
  let app;

  beforeEach(() => {
    app = createApp();
  });

  // ========== 参数验证 ==========
  describe('Chat-参数验证', () => {
    test('POST /api/chat 缺少messages返回400', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({})
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('messages');
    });

    test('POST /api/chat 消息数量超过100返回400', async () => {
      const messages = Array.from({ length: 101 }, (_, i) => ({
        role: 'user',
        content: `Message ${i}`
      }));

      const response = await request(app)
        .post('/api/chat')
        .send({ messages })
        .expect(400);

      expect(response.body.error.message).toContain('Too many');
    });
  });

  // ========== 健康检查 ==========
  describe('Chat-健康检查', () => {
    test('GET /api/health 返回健康状态', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
    });
  });

  // ========== 错误处理 ==========
  describe('Chat-错误处理', () => {
    test('POST /api/chat 异常请求返回错误结构', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({ messages: null });

      // 可能返回 400 或 500
      expect([400, 500]).toContain(response.status);
      expect(response.body.error).toBeDefined();
    });

    test('POST /api/chat XSS输入安全处理', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({
          messages: [{ role: 'user', content: '<script>alert("xss")</script>' }]
        });

      // 不应返回500崩溃
      expect(response.status).not.toBe(500);
    });
  });

  // ========== 停止生成 ==========
  describe('Chat-停止生成', () => {
    test('POST /api/chat/stop 停止生成接口存在', async () => {
      const response = await request(app)
        .post('/api/chat/stop')
        .send({});

      // 可能返回 200 或 500
      expect([200, 500]).toContain(response.status);
    });
  });
});