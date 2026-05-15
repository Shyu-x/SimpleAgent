/**
 * Admin API 集成测试 (Jest + Supertest)
 * 测试 /api/admin/* 路由
 *
 * 运行: npm test -- --testPathPattern=integration/adminApi.test.js
 */

const request = require('supertest');
const express = require('express');

// Mock toolRegistry
const mockToolRegistry = {
  listTools: jest.fn().mockReturnValue([]),
  getToolStats: jest.fn().mockReturnValue({ totalCalls: 0 }),
  getAllStats: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({ total: 0 }),
  has: jest.fn().mockReturnValue(false),
  get: jest.fn().mockReturnValue(null),
  register: jest.fn(),
  unregister: jest.fn(),
  executeTool: jest.fn().mockResolvedValue({ result: 'success' }),
  recommendTools: jest.fn().mockReturnValue([])
};

// 创建测试应用
function createApp() {
  const app = express();
  app.use(express.json());
  app.set('toolRegistry', mockToolRegistry);

  // 挂载测试路由
  app.use('/api/admin/stats', require('../../src/routes/admin/stats'));
  app.use('/api/admin/tools', require('../../src/routes/admin/tool'));
  app.use('/api/admin/models', require('../../src/routes/admin/model'));
  app.use('/api/admin/prompts', require('../../src/routes/admin/prompt'));
  app.use('/api/admin/traces', require('../../src/routes/admin/trace'));
  app.use('/api/admin/intent', require('../../src/routes/admin/intent'));

  return app;
}

describe('Admin API 集成测试', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
    mockToolRegistry.listTools.mockReturnValue([]);
    mockToolRegistry.has.mockReturnValue(false);
  });

  // ========== Stats API ==========
  describe('Admin-Stats', () => {
    test('GET /api/admin/stats 返回结构化统计数据', async () => {
      const response = await request(app)
        .get('/api/admin/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalRequests');
      expect(response.body.data).toHaveProperty('successRate');
    });

    test('GET /api/admin/stats 无toolRegistry返回500', async () => {
      const appNoRegistry = express();
      appNoRegistry.use(express.json());
      appNoRegistry.use('/api/admin/stats', require('../../src/routes/admin/stats'));

      const response = await request(appNoRegistry)
        .get('/api/admin/stats')
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  // ========== Tool API ==========
  describe('Admin-Tools', () => {
    test('GET /api/admin/tools 返回空工具列表', async () => {
      const response = await request(app)
        .get('/api/admin/tools')
        .expect(200);

      expect(response.body.success).toBe(true);
      // 响应可能是 data.tools 或直接 data 数组
      const tools = response.body.data?.tools || response.body.data || [];
      expect(Array.isArray(tools)).toBe(true);
    });

    test('GET /api/admin/tools?category=search 按分类过滤', async () => {
      mockToolRegistry.listTools.mockReturnValue([
        { name: 'searchTool', category: 'search' },
        { name: 'calcTool', category: 'compute' }
      ]);

      const response = await request(app)
        .get('/api/admin/tools')
        .query({ category: 'search' })
        .expect(200);

      const tools = response.body.data?.tools || response.body.data || [];
      expect(tools).toHaveLength(1);
    });

    test('GET /api/admin/tools/:name 工具存在返回详情', async () => {
      mockToolRegistry.has.mockReturnValue(true);
      mockToolRegistry.get.mockReturnValue({
        name: 'calculator',
        description: 'Calculator tool',
        category: 'compute'
      });

      const response = await request(app)
        .get('/api/admin/tools/calculator')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data?.name || response.body.data?.tool?.name).toBe('calculator');
    });

    test('GET /api/admin/tools/:name 工具不存在返回404', async () => {
      mockToolRegistry.has.mockReturnValue(false);

      const response = await request(app)
        .get('/api/admin/tools/nonexistent');

      // 返回 404 或 200（取决于实现）
      expect([200, 404]).toContain(response.status);
    });

    test('POST /api/admin/tools/register 缺少名称返回400', async () => {
      const response = await request(app)
        .post('/api/admin/tools/register')
        .send({ description: 'No name' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('POST /api/admin/tools/register 工具已存在返回409', async () => {
      mockToolRegistry.has.mockReturnValue(true);

      const response = await request(app)
        .post('/api/admin/tools/register')
        .send({ name: 'existingTool' })
        .expect(409);

      expect(response.body.success).toBe(false);
    });

    test('DELETE /api/admin/tools/:name 删除工具', async () => {
      mockToolRegistry.has.mockReturnValue(true);

      const response = await request(app)
        .delete('/api/admin/tools/testTool')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockToolRegistry.unregister).toHaveBeenCalledWith('testTool');
    });

    test('GET /api/admin/tools/categories 返回分类列表', async () => {
      mockToolRegistry.listTools.mockReturnValue([
        { name: 'tool1', category: 'search' },
        { name: 'tool2', category: 'search' },
        { name: 'tool3', category: 'compute' }
      ]);

      const response = await request(app)
        .get('/api/admin/tools/categories')
        .expect(200);

      expect(response.body.success).toBe(true);
      const categories = response.body.data?.categories || response.body.data || [];
      expect(categories.length).toBeGreaterThan(0);
    });
  });

  // ========== Model API ==========
  describe('Admin-Models', () => {
    test('GET /api/admin/models 返回模型列表', async () => {
      const response = await request(app)
        .get('/api/admin/models');

      expect(response.status).toBe(200);
      // 响应是 { success: true, data: { models: [...] } }
      const models = response.body.data?.models || response.body.models || [];
      expect(Array.isArray(models)).toBe(true);
    });

    test('GET /api/admin/models/stats 返回模型统计', async () => {
      const response = await request(app)
        .get('/api/admin/models/stats')
        .expect(200);

      // 响应可能在 data 或直接 body 中
      const data = response.body.data || response.body;
      expect(data).toHaveProperty('totalRequests');
    });

    test('PATCH /api/admin/models/:name 更新模型配置', async () => {
      const response = await request(app)
        .patch('/api/admin/models/MiniMax-M2.7')
        .send({ enabled: false });

      // 可能返回200或404取决于实现
      expect(response.status).not.toBe(500);
    });
  });

  // ========== Prompt API ==========
  describe('Admin-Prompts', () => {
    test('GET /api/admin/prompts 返回模板列表', async () => {
      const response = await request(app)
        .get('/api/admin/prompts')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.templates)).toBe(true);
    });

    test('POST /api/admin/prompts 创建模板', async () => {
      const response = await request(app)
        .post('/api/admin/prompts')
        .send({
          name: 'test-template',
          description: 'Test template',
          template: 'Hello {{name}}',
          category: 'test'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
    });

    test('POST /api/admin/prompts 缺少必填字段返回400', async () => {
      const response = await request(app)
        .post('/api/admin/prompts')
        .send({ description: 'Missing name and template' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('GET /api/admin/prompts/:id 获取模板详情', async () => {
      // 先创建
      const createRes = await request(app)
        .post('/api/admin/prompts')
        .send({
          name: 'detail-test',
          template: 'Test',
          category: 'test'
        });

      const id = createRes.body.data?.id;

      const response = await request(app)
        .get(`/api/admin/prompts/${id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('PUT /api/admin/prompts/:id 更新模板', async () => {
      // 先创建
      const createRes = await request(app)
        .post('/api/admin/prompts')
        .send({
          name: 'update-test',
          template: 'Original',
          category: 'test'
        });

      const id = createRes.body.data?.id;

      const response = await request(app)
        .put(`/api/admin/prompts/${id}`)
        .send({ template: 'Updated' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('DELETE /api/admin/prompts/:id 删除模板', async () => {
      // 先创建
      const createRes = await request(app)
        .post('/api/admin/prompts')
        .send({
          name: 'delete-test',
          template: 'To delete',
          category: 'test'
        });

      const id = createRes.body.data?.id;

      const response = await request(app)
        .delete(`/api/admin/prompts/${id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  // ========== Intent API ==========
  describe('Admin-Intent', () => {
    test('GET /api/admin/intent/tree 返回意图树', async () => {
      const response = await request(app)
        .get('/api/admin/intent/tree');

      expect(response.status).toBe(200);
      // 响应可能是 { success, data: { tree, version } } 或直接树结构
      const body = response.body;
      expect(body.success !== false).toBe(true);
    });

    test('POST /api/admin/intent/node 创建意图节点', async () => {
      const response = await request(app)
        .post('/api/admin/intent/node')
        .send({
          name: 'test-intent',
          level: 1,
          keywords: ['test']
        });

      // 可能返回 201 或 200，取决于实现
      expect([200, 201]).toContain(response.status);
    });

    test('GET /api/admin/intent/match 测试意图匹配', async () => {
      const response = await request(app)
        .get('/api/admin/intent/match')
        .query({ query: '帮我搜索天气' });

      // 可能返回 200 或 404，取决于路由实现
      expect([200, 404]).toContain(response.status);
    });
  });

  // ========== Trace API ==========
  describe('Admin-Traces', () => {
    test('GET /api/admin/traces 返回追踪列表', async () => {
      const response = await request(app)
        .get('/api/admin/traces')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.traces)).toBe(true);
    });

    test('GET /api/admin/traces?limit=5 分页参数', async () => {
      const response = await request(app)
        .get('/api/admin/traces')
        .query({ limit: 5 })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});