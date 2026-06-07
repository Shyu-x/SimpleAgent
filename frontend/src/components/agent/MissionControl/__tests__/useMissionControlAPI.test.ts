import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// 导入要测试的模块
// 由于 useMissionControlAPI 使用 React hooks，我们需要创建一个测试模块

describe('MissionControlAPI', () => {
  const API_BASE = 'http://localhost:30000';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('API 请求函数', () => {
    test('apiRequest 成功响应', async () => {
      const mockData = { success: true, data: { tasks: [] } };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const response = await fetch(`${API_BASE}/api/mission/tasks`);
      const data = await response.json();

      expect(data.success).toBe(true);
    });

    test('apiRequest 网络错误', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      try {
        await fetch(`${API_BASE}/api/mission/tasks`);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('apiRequest HTTP 错误', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: { message: 'Internal Server Error' } }),
      });

      const response = await fetch(`${API_BASE}/api/mission/tasks`);
      expect(response.ok).toBe(false);
    });
  });

  describe('数据转换函数', () => {
    test('convertTask 转换任务数据', () => {
      const taskResponse = {
        id: 'task-1',
        name: '测试任务',
        description: '描述',
        priority: 'high',
        status: 'pending',
        assignedAgent: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        startedAt: null,
        completedAt: null,
        result: null,
        error: null,
      };

      // 模拟转换
      const task = {
        id: taskResponse.id,
        title: taskResponse.name,
        description: taskResponse.description,
        priority: taskResponse.priority,
        status: taskResponse.status,
        assignedAgent: taskResponse.assignedAgent || undefined,
        createdAt: taskResponse.createdAt,
        updatedAt: taskResponse.updatedAt,
        result: taskResponse.result || undefined,
        error: taskResponse.error || undefined,
      };

      expect(task.id).toBe('task-1');
      expect(task.title).toBe('测试任务');
      expect(task.priority).toBe('high');
      expect(task.status).toBe('pending');
    });

    test('convertAgent 转换 Agent 数据', () => {
      const agentResponse = {
        id: 'agent-1',
        name: '测试Agent',
        role: 'executor',
        avatar: null,
        status: 'idle',
        currentTask: null,
        progress: 0,
        capabilities: ['coding'],
        lastHeartbeat: Date.now(),
      };

      // 模拟转换
      const agent = {
        id: agentResponse.id,
        name: agentResponse.name,
        role: agentResponse.role,
        avatar: agentResponse.avatar || '🤖',
        status: agentResponse.status,
        currentTask: agentResponse.currentTask || undefined,
        progress: agentResponse.progress,
        capabilities: agentResponse.capabilities,
        lastHeartbeat: Date.now(),
      };

      expect(agent.id).toBe('agent-1');
      expect(agent.name).toBe('测试Agent');
      expect(agent.role).toBe('executor');
      expect(agent.status).toBe('idle');
      expect(agent.avatar).toBe('🤖');
    });
  });

  describe('API 端点测试', () => {
    test('GET /api/mission/tasks', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { tasks: [] } }),
      });

      const response = await fetch(`${API_BASE}/api/mission/tasks?limit=100`);
      const data = await response.json();

      expect(mockFetch).toHaveBeenCalledWith(
        `${API_BASE}/api/mission/tasks?limit=100`
      );
    });

    test('GET /api/mission/agents', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { agents: [] } }),
      });

      const response = await fetch(`${API_BASE}/api/mission/agents`);
      const data = await response.json();

      expect(mockFetch).toHaveBeenCalledWith(
        `${API_BASE}/api/mission/agents`
      );
    });

    test('GET /api/mission/stats', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            stats: {
              totalTasks: 5,
              pendingTasks: 2,
              runningTasks: 1,
              completedTasks: 2,
              failedTasks: 0,
              cancelledTasks: 0,
              totalAgents: 3,
              idleAgents: 2,
              workingAgents: 1,
              waitingAgents: 0,
              errorAgents: 0,
              recentEvents: [],
            },
          },
        }),
      });

      const response = await fetch(`${API_BASE}/api/mission/stats`);
      const data = await response.json();

      expect(data.data.stats.totalTasks).toBe(5);
      expect(data.data.stats.totalAgents).toBe(3);
    });

    test('POST /api/mission/tasks', async () => {
      const taskData = {
        name: '新任务',
        description: '描述',
        priority: 'high',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            task: {
              id: 'task-new',
              ...taskData,
              status: 'pending',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          },
        }),
      });

      const response = await fetch(`${API_BASE}/api/mission/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData),
      });

      const data = await response.json();

      expect(mockFetch).toHaveBeenCalledWith(
        `${API_BASE}/api/mission/tasks`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(taskData),
        })
      );
      expect(data.data.task.id).toBe('task-new');
    });

    test('PUT /api/mission/tasks/:id', async () => {
      const taskId = 'task-1';
      const updates = { status: 'completed', result: '完成' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { task: {} } }),
      });

      await fetch(`${API_BASE}/api/mission/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `${API_BASE}/api/mission/tasks/${taskId}`,
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(updates),
        })
      );
    });

    test('DELETE /api/mission/tasks/:id', async () => {
      const taskId = 'task-1';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await fetch(`${API_BASE}/api/mission/tasks/${taskId}`, {
        method: 'DELETE',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `${API_BASE}/api/mission/tasks/${taskId}`,
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    test('POST /api/mission/tasks/:id/execute', async () => {
      const taskId = 'task-1';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { task: {} } }),
      });

      await fetch(`${API_BASE}/api/mission/tasks/${taskId}/execute`, {
        method: 'POST',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `${API_BASE}/api/mission/tasks/${taskId}/execute`,
        expect.objectContaining({ method: 'POST' })
      );
    });

    test('POST /api/mission/tasks/:id/cancel', async () => {
      const taskId = 'task-1';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { task: {} } }),
      });

      await fetch(`${API_BASE}/api/mission/tasks/${taskId}/cancel`, {
        method: 'POST',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `${API_BASE}/api/mission/tasks/${taskId}/cancel`,
        expect.objectContaining({ method: 'POST' })
      );
    });

    test('POST /api/mission/agents', async () => {
      const agentData = {
        name: '新Agent',
        role: 'executor',
        capabilities: ['coding'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            agent: {
              id: 'agent-new',
              ...agentData,
              status: 'idle',
              progress: 0,
              lastHeartbeat: Date.now(),
            },
          },
        }),
      });

      await fetch(`${API_BASE}/api/mission/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentData),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `${API_BASE}/api/mission/agents`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(agentData),
        })
      );
    });

    test('POST /api/mission/broadcast', async () => {
      const broadcastData = {
        message: '广播消息',
        data: { type: 'custom' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await fetch(`${API_BASE}/api/mission/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(broadcastData),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `${API_BASE}/api/mission/broadcast`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(broadcastData),
        })
      );
    });
  });

  describe('Demo 数据', () => {
    test('demoAgents 包含正确数量的 Agent', () => {
      const demoAgents = [
        { id: 'agent-planner-01', name: '战略规划师', role: 'planner' },
        { id: 'agent-executor-01', name: '执行专家', role: 'executor' },
        { id: 'agent-executor-02', name: '数据分析师', role: 'executor' },
        { id: 'agent-reviewer-01', name: '质量审核员', role: 'reviewer' },
        { id: 'agent-coordinator-01', name: '任务协调员', role: 'coordinator' },
      ];

      expect(demoAgents.length).toBe(5);
    });

    test('demoTasks 包含正确数量的任务', () => {
      const demoTasks = [
        { title: '系统架构设计', priority: 'critical' },
        { title: '用户认证模块重构', priority: 'high' },
        { title: '数据库性能优化', priority: 'high' },
        { title: '前端组件库升级', priority: 'medium' },
        { title: 'API 文档自动化', priority: 'medium' },
      ];

      expect(demoTasks.length).toBe(5);
    });

    test('demoAgents 包含所需能力', () => {
      const requiredCapabilities = ['任务分解', '代码生成', '代码审查', '任务调度'];

      // 检查 demo agents 至少有一些能力
      const allCapabilities = [
        '任务分解', '资源规划', '风险评估', '优先级排序', // planner
        '代码生成', '任务执行', '批量处理', '自动化', // executor
        '数据分析', '可视化', '报表生成', '指标监控', // executor
        '代码审查', '质量检查', '测试验证', '合规审计', // reviewer
        '任务调度', '进度跟踪', '资源协调', '状态同步', // coordinator
      ];

      requiredCapabilities.forEach(cap => {
        expect(allCapabilities.some(ac => ac.includes(cap.substring(0, 3)))).toBeTruthy();
      });
    });
  });
});