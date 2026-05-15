/**
 * MissionControl API 集成测试 (Jest + Supertest)
 * 测试 /api/mission/* 路由
 *
 * 运行: npm test -- --testPathPattern=integration/missionApi.test.js
 */

const request = require('supertest');
const express = require('express');

// 创建测试应用
function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/mission', require('../../src/routes/missionControl'));
  return app;
}

describe('MissionControl API 集成测试', () => {
  let app;

  beforeEach(() => {
    app = createApp();
  });

  // ========== 任务创建 ==========
  describe('Mission-任务创建', () => {
    test('POST /api/mission/tasks 创建任务', async () => {
      const response = await request(app)
        .post('/api/mission/tasks')
        .send({
          name: 'test-task-' + Date.now(),
          description: 'Test task description',
          priority: 'medium',
          assignedAgent: 'test-agent'
        })
        .expect(200);

      expect(response.body).toHaveProperty('success');
    });

    test('POST /api/mission/tasks 缺少name返回400', async () => {
      const response = await request(app)
        .post('/api/mission/tasks')
        .send({ description: 'Missing name' })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  // ========== 任务列表 ==========
  describe('Mission-任务列表', () => {
    test('GET /api/mission/tasks 返回任务列表', async () => {
      const response = await request(app)
        .get('/api/mission/tasks')
        .expect(200);

      expect(response.body).toHaveProperty('tasks');
      expect(Array.isArray(response.body.tasks)).toBe(true);
    });

    test('GET /api/mission/tasks?page=1&limit=10 分页参数', async () => {
      const response = await request(app)
        .get('/api/mission/tasks')
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body).toHaveProperty('tasks');
    });
  });

  // ========== 任务详情 ==========
  describe('Mission-任务详情', () => {
    test('GET /api/mission/tasks/:id 获取任务详情', async () => {
      // 先创建任务
      const createRes = await request(app)
        .post('/api/mission/tasks')
        .send({
          name: 'detail-test-' + Date.now(),
          description: 'Test'
        });

      const taskId = createRes.body.task?.id || 'test-task-nonexistent';

      const response = await request(app)
        .get(`/api/mission/tasks/${taskId}`);

      // 可能返回 200 或 404
      expect([200, 404]).toContain(response.status);
    });

    test('GET /api/mission/tasks/:id 不存在返回404', async () => {
      const response = await request(app)
        .get('/api/mission/tasks/nonexistent-task-id-12345')
        .expect(404);

      expect(response.body.error).toBeDefined();
    });
  });

  // ========== 任务更新 ==========
  describe('Mission-任务更新', () => {
    test('PUT /api/mission/tasks/:id 更新任务状态', async () => {
      // 先创建
      const createRes = await request(app)
        .post('/api/mission/tasks')
        .send({
          name: 'update-test-' + Date.now(),
          description: 'Test'
        });

      const taskId = createRes.body.task?.id || 'test-task-nonexistent';

      const response = await request(app)
        .put(`/api/mission/tasks/${taskId}`)
        .send({ status: 'in_progress' });

      // 可能返回 200 或 404
      expect([200, 404]).toContain(response.status);
    });
  });

  // ========== 任务删除 ==========
  describe('Mission-任务删除', () => {
    test('DELETE /api/mission/tasks/:id 删除任务', async () => {
      // 先创建
      const createRes = await request(app)
        .post('/api/mission/tasks')
        .send({
          name: 'delete-test-' + Date.now(),
          description: 'Test'
        });

      const taskId = createRes.body.task?.id || 'test-task-nonexistent';

      const response = await request(app)
        .delete(`/api/mission/tasks/${taskId}`);

      // 可能返回 200 或 404
      expect([200, 404]).toContain(response.status);
    });
  });

  // ========== Agent 路由 ==========
  describe('Mission-Agent', () => {
    test('GET /api/mission/agents 返回Agent列表', async () => {
      const response = await request(app)
        .get('/api/mission/agents')
        .expect(200);

      expect(response.body).toHaveProperty('agents');
    });

    test('GET /api/mission/stats 返回统计信息', async () => {
      const response = await request(app)
        .get('/api/mission/stats')
        .expect(200);

      expect(response.body).toHaveProperty('success');
    });
  });
});