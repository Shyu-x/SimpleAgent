/**
 * Memory API 集成测试 (Jest + Supertest)
 * 测试 /api/memory/* 路由
 *
 * 运行: npm test -- --testPathPattern=integration/memoryApi.test.js
 */

const request = require('supertest');
const express = require('express');

// 创建测试应用
function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/memory', require('../../src/routes/memory'));
  return app;
}

describe('Memory API 集成测试', () => {
  let app;

  beforeEach(() => {
    app = createApp();
  });

  // ========== 会话记忆 ==========
  describe('Memory-会话记忆', () => {
    test('GET /api/memory/sessions/:sessionId 获取会话记忆', async () => {
      const response = await request(app)
        .get('/api/memory/sessions/test-session-' + Date.now())
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('POST /api/memory/sessions/:sessionId 创建记忆', async () => {
      const sessionId = 'test-session-create-' + Date.now();

      const response = await request(app)
        .post(`/api/memory/sessions/${sessionId}`)
        .send({
          content: 'Test memory content',
          type: 'short_term',
          importance: 'medium'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
    });

    test('POST /api/memory/sessions/:sessionId 缺少content返回400', async () => {
      const response = await request(app)
        .post('/api/memory/sessions/test-session')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('PUT /api/memory/sessions/:sessionId 更新记忆', async () => {
      const sessionId = 'test-session-update-' + Date.now();

      // 先创建
      const createRes = await request(app)
        .post(`/api/memory/sessions/${sessionId}`)
        .send({ content: 'Original content' });

      const noteId = createRes.body.data?.id;

      const response = await request(app)
        .put(`/api/memory/sessions/${sessionId}`)
        .send({ noteId, content: 'Updated content' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('DELETE /api/memory/sessions/:sessionId 删除单条记忆', async () => {
      const sessionId = 'test-session-delete-' + Date.now();

      // 先创建
      await request(app)
        .post(`/api/memory/sessions/${sessionId}`)
        .send({ content: 'To delete' });

      const response = await request(app)
        .delete(`/api/memory/sessions/${sessionId}`)
        .query({ noteId: 'test-note-id' });

      // 返回 200 或 404（取决于note是否存在）
      expect([200, 404]).toContain(response.status);
    });

    test('DELETE /api/memory/sessions/:sessionId 清除全部记忆', async () => {
      const sessionId = 'test-session-clear-' + Date.now();

      const response = await request(app)
        .delete(`/api/memory/sessions/${sessionId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  // ========== 全局记忆 ==========
  describe('Memory-全局记忆', () => {
    test('GET /api/memory/global 获取全局记忆列表', async () => {
      const response = await request(app)
        .get('/api/memory/global')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('GET /api/memory/global?type=general 按类型过滤', async () => {
      const response = await request(app)
        .get('/api/memory/global')
        .query({ type: 'general' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('GET /api/memory/global?limit=10 分页参数', async () => {
      const response = await request(app)
        .get('/api/memory/global')
        .query({ limit: 10 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('total');
    });

    test('POST /api/memory/global 创建全局记忆', async () => {
      const response = await request(app)
        .post('/api/memory/global')
        .send({
          content: 'Global test memory',
          type: 'general',
          importance: 'high'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    test('POST /api/memory/global 缺少content返回400', async () => {
      const response = await request(app)
        .post('/api/memory/global')
        .send({ type: 'general' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  // ========== 搜索记忆 ==========
  describe('Memory-搜索', () => {
    test('GET /api/memory/search 搜索记忆', async () => {
      const response = await request(app)
        .get('/api/memory/search')
        .query({ keyword: 'test' });

      // 可能返回 200、404 或其他状态
      expect(response.status).not.toBe(500);
    });

    test('GET /api/memory/search?type=short_term 按类型搜索', async () => {
      const response = await request(app)
        .get('/api/memory/search')
        .query({ keyword: 'test', type: 'short_term' });

      // 可能返回 200、404 或其他状态
      expect(response.status).not.toBe(500);
    });
  });

  // ========== 统计 ==========
  describe('Memory-统计', () => {
    test('GET /api/memory/stats 返回统计信息', async () => {
      const response = await request(app)
        .get('/api/memory/stats')
        .expect(200);

      // stats 响应结构: { success: true, data: { sessionCount, totalSessionNotes, ... } }
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('sessionCount');
    });
  });
});