/**
 * MissionControl Store 测试
 * 测试所有 store actions 和状态管理
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { useMissionControlStore, initializeAgents, startMission, stopMission } from '../store';
import type { MissionAgent, MissionTask } from '../types';

// ============ 辅助函数 ============

function createMockAgent(overrides: Partial<MissionAgent> = {}): Omit<MissionAgent, 'lastHeartbeat'> {
  return {
    id: `agent-${Math.random().toString(36).slice(2, 7)}`,
    name: '测试Agent',
    role: 'executor',
    status: 'idle',
    progress: 0,
    capabilities: ['测试能力'],
    ...overrides,
  };
}

function createMockTask(overrides: Partial<Omit<MissionTask, 'id' | 'createdAt' | 'updatedAt'>> = {}): Omit<MissionTask, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    title: '测试任务',
    description: '测试任务描述',
    priority: 'medium',
    status: 'pending',
    ...overrides,
  };
}

// ============ 任务操作测试 ============

describe('任务操作', () => {
  beforeEach(() => {
    useMissionControlStore.setState({
      isActive: false,
      missionId: undefined,
      missionName: undefined,
      createdAt: undefined,
      agents: [],
      tasks: [],
      events: [],
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      soundEnabled: true,
      actionHistory: [],
      selectedTaskIds: [],
    });
  });

  test('addTask 添加任务并更新 totalTasks', () => {
    const store = useMissionControlStore.getState();
    const taskId = store.addTask(createMockTask({ title: '任务1' }));

    expect(taskId).toBeDefined();
    expect(taskId.length).toBeGreaterThan(0);

    const state = useMissionControlStore.getState();
    expect(state.tasks.length).toBe(1);
    expect(state.tasks[0].title).toBe('任务1');
    expect(state.totalTasks).toBe(1);
    expect(state.tasks[0].status).toBe('pending');
  });

  test('addTask 添加多个任务', () => {
    const store = useMissionControlStore.getState();
    store.addTask(createMockTask({ title: '任务1' }));
    store.addTask(createMockTask({ title: '任务2' }));
    store.addTask(createMockTask({ title: '任务3' }));

    const state = useMissionControlStore.getState();
    expect(state.tasks.length).toBe(3);
    expect(state.totalTasks).toBe(3);
  });

  test('addTask 创建事件', () => {
    const store = useMissionControlStore.getState();
    store.addTask(createMockTask({ title: '任务1' }));

    const state = useMissionControlStore.getState();
    expect(state.events.length).toBeGreaterThan(0);
    expect(state.events[0].type).toBe('task_created');
  });

  test('updateTask 更新任务', () => {
    const store = useMissionControlStore.getState();
    const taskId = store.addTask(createMockTask({ title: '原始标题' }));

    store.updateTask(taskId, { title: '更新标题', progress: 50 });

    const state = useMissionControlStore.getState();
    const task = state.tasks.find(t => t.id === taskId);
    expect(task?.title).toBe('更新标题');
    expect(task?.progress).toBe(50);
  });

  test('assignTask 分配任务给 Agent', () => {
    const store = useMissionControlStore.getState();
    initializeAgents([createMockAgent({ id: 'agent-1', name: 'Agent1' })]);
    const taskId = store.addTask(createMockTask({ title: '任务1' }));

    store.assignTask(taskId, 'agent-1');

    const state = useMissionControlStore.getState();
    const task = state.tasks.find(t => t.id === taskId);
    expect(task?.status).toBe('assigned');
    expect(task?.assignedAgent).toBe('agent-1');
  });

  test('assignTask 创建分配事件', () => {
    const store = useMissionControlStore.getState();
    initializeAgents([createMockAgent({ id: 'agent-1', name: 'Agent1' })]);
    const taskId = store.addTask(createMockTask());

    store.assignTask(taskId, 'agent-1');

    const state = useMissionControlStore.getState();
    const assignEvent = state.events.find(e => e.type === 'task_assigned');
    expect(assignEvent).toBeDefined();
    expect(assignEvent?.agentId).toBe('agent-1');
    expect(assignEvent?.taskId).toBe(taskId);
  });

  test('completeTask 完成任务并更新计数', () => {
    const store = useMissionControlStore.getState();
    const taskId = store.addTask(createMockTask());

    store.completeTask(taskId, '任务完成结果');

    const state = useMissionControlStore.getState();
    const task = state.tasks.find(t => t.id === taskId);
    expect(task?.status).toBe('completed');
    expect(task?.result).toBe('任务完成结果');
    expect(state.completedTasks).toBe(1);
  });

  test('completeTask 创建完成事件', () => {
    const store = useMissionControlStore.getState();
    const taskId = store.addTask(createMockTask());

    store.completeTask(taskId);

    const state = useMissionControlStore.getState();
    const event = state.events.find(e => e.type === 'task_completed');
    expect(event).toBeDefined();
  });

  test('failTask 标记任务失败并更新计数', () => {
    const store = useMissionControlStore.getState();
    const taskId = store.addTask(createMockTask());

    store.failTask(taskId, '任务失败原因');

    const state = useMissionControlStore.getState();
    const task = state.tasks.find(t => t.id === taskId);
    expect(task?.status).toBe('failed');
    expect(task?.error).toBe('任务失败原因');
    expect(state.failedTasks).toBe(1);
  });

  test('failTask 创建失败事件', () => {
    const store = useMissionControlStore.getState();
    const taskId = store.addTask(createMockTask());

    store.failTask(taskId, '失败原因');

    const state = useMissionControlStore.getState();
    const event = state.events.find(e => e.type === 'task_failed');
    expect(event).toBeDefined();
    expect(event?.message).toContain('任务失败');
  });

  test('removeTask 删除任务', () => {
    const store = useMissionControlStore.getState();
    const taskId = store.addTask(createMockTask());
    store.completeTask(taskId);

    store.removeTask(taskId);

    const state = useMissionControlStore.getState();
    expect(state.tasks.find(t => t.id === taskId)).toBeUndefined();
    expect(state.totalTasks).toBe(0);
  });

  test('removeTask 保持 completedTasks 和 failedTasks 计数正确', () => {
    const store = useMissionControlStore.getState();
    const taskId1 = store.addTask(createMockTask());
    store.completeTask(taskId1);

    const taskId2 = store.addTask(createMockTask());
    store.failTask(taskId2, 'error');

    store.removeTask(taskId1);
    store.removeTask(taskId2);

    const state = useMissionControlStore.getState();
    expect(state.tasks.length).toBe(0);
    expect(state.completedTasks).toBe(0);
    expect(state.failedTasks).toBe(0);
  });
});

// ============ Agent 操作测试 ============

describe('Agent 操作', () => {
  beforeEach(() => {
    useMissionControlStore.setState({
      isActive: false,
      missionId: undefined,
      missionName: undefined,
      createdAt: undefined,
      agents: [],
      tasks: [],
      events: [],
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      soundEnabled: true,
      actionHistory: [],
      selectedTaskIds: [],
    });
  });

  test('initializeAgents 初始化 Agent 池', () => {
    initializeAgents([
      createMockAgent({ id: 'agent-1', name: 'Agent1' }),
      createMockAgent({ id: 'agent-2', name: 'Agent2' }),
    ]);

    const state = useMissionControlStore.getState();
    expect(state.agents.length).toBe(2);
    expect(state.agents[0].lastHeartbeat).toBeDefined();
  });

  test('updateAgentStatus 更新 Agent 状态', () => {
    initializeAgents([createMockAgent({ id: 'agent-1', name: 'Agent1' })]);

    const store = useMissionControlStore.getState();
    store.updateAgentStatus('agent-1', 'working', 'task-123');

    const state = useMissionControlStore.getState();
    const agent = state.agents.find(a => a.id === 'agent-1');
    expect(agent?.status).toBe('working');
    expect(agent?.currentTask).toBe('task-123');
    expect(agent?.lastHeartbeat).toBeDefined();
  });

  test('updateAgentStatus 创建状态变更事件', () => {
    initializeAgents([createMockAgent({ id: 'agent-1', name: 'Agent1' })]);

    const store = useMissionControlStore.getState();
    store.updateAgentStatus('agent-1', 'waiting');

    const state = useMissionControlStore.getState();
    const event = state.events.find(e => e.type === 'agent_status_change');
    expect(event).toBeDefined();
    expect(event?.message).toContain('waiting');
  });

  test('updateAgentProgress 更新进度', () => {
    initializeAgents([createMockAgent({ id: 'agent-1', name: 'Agent1' })]);

    const store = useMissionControlStore.getState();
    store.updateAgentProgress('agent-1', 75);

    const state = useMissionControlStore.getState();
    const agent = state.agents.find(a => a.id === 'agent-1');
    expect(agent?.progress).toBe(75);
  });
});

// ============ 事件操作测试 ============

describe('事件操作', () => {
  beforeEach(() => {
    useMissionControlStore.setState({
      isActive: false,
      missionId: undefined,
      missionName: undefined,
      createdAt: undefined,
      agents: [],
      tasks: [],
      events: [],
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      soundEnabled: true,
      actionHistory: [],
      selectedTaskIds: [],
    });
  });

  test('addEvent 添加事件', () => {
    const store = useMissionControlStore.getState();
    store.addEvent({ type: 'system', message: '测试事件' });

    const state = useMissionControlStore.getState();
    expect(state.events.length).toBe(1);
    expect(state.events[0].message).toBe('测试事件');
    expect(state.events[0].id).toBeDefined();
    expect(state.events[0].timestamp).toBeDefined();
  });

  test('addEvent 限制事件数量为 100', () => {
    const store = useMissionControlStore.getState();

    // 添加 150 个事件
    for (let i = 0; i < 150; i++) {
      store.addEvent({ type: 'system', message: `事件 ${i}` });
    }

    const state = useMissionControlStore.getState();
    expect(state.events.length).toBe(100);
  });

  test('clearEvents 清除所有事件', () => {
    const store = useMissionControlStore.getState();
    store.addEvent({ type: 'system', message: '事件1' });
    store.addEvent({ type: 'system', message: '事件2' });

    store.clearEvents();

    const state = useMissionControlStore.getState();
    expect(state.events.length).toBe(0);
  });
});

// ============ 广播操作测试 ============

describe('广播操作', () => {
  beforeEach(() => {
    useMissionControlStore.setState({
      isActive: false,
      missionId: undefined,
      missionName: undefined,
      createdAt: undefined,
      agents: [],
      tasks: [],
      events: [],
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      soundEnabled: true,
      actionHistory: [],
      selectedTaskIds: [],
    });
  });

  test('broadcastTask 广播任务', () => {
    const store = useMissionControlStore.getState();
    const taskId = store.addTask(createMockTask({ title: '待广播任务' }));

    store.broadcastTask(taskId);

    const state = useMissionControlStore.getState();
    const event = state.events.find(e => e.type === 'broadcast');
    expect(event).toBeDefined();
    expect(event?.data?.task).toBeDefined();
  });

  test('broadcastMessage 广播消息', () => {
    const store = useMissionControlStore.getState();
    store.broadcastMessage('测试广播消息', { key: 'value' });

    const state = useMissionControlStore.getState();
    const event = state.events.find(e => e.message === '测试广播消息');
    expect(event).toBeDefined();
    expect(event?.data?.key).toBe('value');
  });
});

// ============ 声音控制测试 ============

describe('声音控制', () => {
  beforeEach(() => {
    useMissionControlStore.setState({
      isActive: false,
      missionId: undefined,
      missionName: undefined,
      createdAt: undefined,
      agents: [],
      tasks: [],
      events: [],
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      soundEnabled: true,
      actionHistory: [],
      selectedTaskIds: [],
    });
  });

  test('toggleSound 切换声音状态', () => {
    const store = useMissionControlStore.getState();
    expect(store.soundEnabled).toBe(true);

    store.toggleSound();
    let state = useMissionControlStore.getState();
    expect(state.soundEnabled).toBe(false);

    store.toggleSound();
    state = useMissionControlStore.getState();
    expect(state.soundEnabled).toBe(true);
  });

  test('setSoundEnabled 设置声音状态', () => {
    const store = useMissionControlStore.getState();
    store.setSoundEnabled(false);

    const state = useMissionControlStore.getState();
    expect(state.soundEnabled).toBe(false);
  });
});

// ============ 操作历史测试 ============

describe('操作历史', () => {
  beforeEach(() => {
    useMissionControlStore.setState({
      isActive: false,
      missionId: undefined,
      missionName: undefined,
      createdAt: undefined,
      agents: [],
      tasks: [],
      events: [],
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      soundEnabled: true,
      actionHistory: [],
      selectedTaskIds: [],
    });
  });

  test('addActionHistory 添加操作历史', () => {
    const store = useMissionControlStore.getState();
    store.addActionHistory('testAction', '测试详情');

    const state = useMissionControlStore.getState();
    expect(state.actionHistory.length).toBe(1);
    expect(state.actionHistory[0].action).toBe('testAction');
    expect(state.actionHistory[0].details).toBe('测试详情');
  });

  test('addActionHistory 限制历史数量为 50', () => {
    const store = useMissionControlStore.getState();

    for (let i = 0; i < 60; i++) {
      store.addActionHistory(`action${i}`, `详情${i}`);
    }

    const state = useMissionControlStore.getState();
    expect(state.actionHistory.length).toBe(50);
  });

  test('clearActionHistory 清除历史', () => {
    const store = useMissionControlStore.getState();
    store.addActionHistory('test', 'details');
    store.clearActionHistory();

    const state = useMissionControlStore.getState();
    expect(state.actionHistory.length).toBe(0);
  });

  test('completeTask 添加到操作历史', () => {
    const store = useMissionControlStore.getState();
    const taskId = store.addTask(createMockTask());
    store.completeTask(taskId, '结果');

    const state = useMissionControlStore.getState();
    const historyItem = state.actionHistory.find(h => h.action === 'completeTask');
    expect(historyItem).toBeDefined();
  });
});

// ============ 批量选择测试 ============

describe('批量选择', () => {
  beforeEach(() => {
    useMissionControlStore.setState({
      isActive: false,
      missionId: undefined,
      missionName: undefined,
      createdAt: undefined,
      agents: [],
      tasks: [],
      events: [],
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      soundEnabled: true,
      actionHistory: [],
      selectedTaskIds: [],
    });
  });

  test('toggleTaskSelection 切换选择', () => {
    const store = useMissionControlStore.getState();

    store.toggleTaskSelection('task-1');
    let state = useMissionControlStore.getState();
    expect(state.selectedTaskIds).toContain('task-1');

    store.toggleTaskSelection('task-1');
    state = useMissionControlStore.getState();
    expect(state.selectedTaskIds).not.toContain('task-1');
  });

  test('selectAllTasks 选择所有任务', () => {
    const store = useMissionControlStore.getState();
    const taskId1 = store.addTask(createMockTask());
    const taskId2 = store.addTask(createMockTask());

    store.selectAllTasks();

    const state = useMissionControlStore.getState();
    expect(state.selectedTaskIds).toContain(taskId1);
    expect(state.selectedTaskIds).toContain(taskId2);
  });

  test('clearSelection 清除选择', () => {
    const store = useMissionControlStore.getState();
    store.toggleTaskSelection('task-1');
    store.clearSelection();

    const state = useMissionControlStore.getState();
    expect(state.selectedTaskIds.length).toBe(0);
  });

  test('batchComplete 批量完成', () => {
    const store = useMissionControlStore.getState();
    const taskId1 = store.addTask(createMockTask());
    const taskId2 = store.addTask(createMockTask());

    store.toggleTaskSelection(taskId1);
    store.toggleTaskSelection(taskId2);
    store.batchComplete('批量完成结果');

    const state = useMissionControlStore.getState();
    const task1 = state.tasks.find(t => t.id === taskId1);
    const task2 = state.tasks.find(t => t.id === taskId2);
    expect(task1?.status).toBe('completed');
    expect(task2?.status).toBe('completed');
    expect(state.completedTasks).toBe(2);
  });

  test('batchFail 批量失败', () => {
    const store = useMissionControlStore.getState();
    const taskId1 = store.addTask(createMockTask());
    const taskId2 = store.addTask(createMockTask());

    store.toggleTaskSelection(taskId1);
    store.toggleTaskSelection(taskId2);
    store.batchFail('批量失败原因');

    const state = useMissionControlStore.getState();
    const task1 = state.tasks.find(t => t.id === taskId1);
    const task2 = state.tasks.find(t => t.id === taskId2);
    expect(task1?.status).toBe('failed');
    expect(task2?.status).toBe('failed');
    expect(state.failedTasks).toBe(2);
  });
});

// ============ 重置测试 ============

describe('重置', () => {
  test('reset 重置所有状态', () => {
    const store = useMissionControlStore.getState();

    // 添加一些数据
    store.addTask(createMockTask());
    initializeAgents([createMockAgent()]);
    store.addActionHistory('test', 'details');

    // 重置
    store.reset();

    const state = useMissionControlStore.getState();
    expect(state.tasks.length).toBe(0);
    expect(state.agents.length).toBe(0);
    expect(state.events.length).toBe(0);
    expect(state.actionHistory.length).toBe(0);
    expect(state.isActive).toBe(false);
  });
});

// ============ 任务启动/停止测试 ============

describe('任务启动/停止', () => {
  beforeEach(() => {
    useMissionControlStore.setState({
      isActive: false,
      missionId: undefined,
      missionName: undefined,
      createdAt: undefined,
      agents: [],
      tasks: [],
      events: [],
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      soundEnabled: true,
      actionHistory: [],
      selectedTaskIds: [],
    });
  });

  test('startMission 启动任务', () => {
    const tasks = [
      createMockTask({ title: '任务1' }),
      createMockTask({ title: '任务2' }),
    ];

    startMission('测试任务', tasks);

    const state = useMissionControlStore.getState();
    expect(state.isActive).toBe(true);
    expect(state.missionName).toBe('测试任务');
    expect(state.missionId).toBeDefined();
    expect(state.totalTasks).toBe(2);
    expect(state.tasks.length).toBe(2);
    expect(state.events.length).toBeGreaterThan(0);
  });

  test('stopMission 停止任务', () => {
    startMission('测试任务', [createMockTask()]);
    stopMission();

    const state = useMissionControlStore.getState();
    expect(state.isActive).toBe(false);
  });
});

// ============ 后端同步测试 ============

describe('后端同步', () => {
  beforeEach(() => {
    useMissionControlStore.setState({
      isActive: false,
      missionId: undefined,
      missionName: undefined,
      createdAt: undefined,
      agents: [],
      tasks: [],
      events: [],
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      soundEnabled: true,
      actionHistory: [],
      selectedTaskIds: [],
    });
  });

  test('setTasks 设置任务列表', () => {
    const store = useMissionControlStore.getState();
    const tasks: MissionTask[] = [
      { id: 't1', title: '任务1', description: '', priority: 'high', status: 'pending', createdAt: Date.now(), updatedAt: Date.now() },
      { id: 't2', title: '任务2', description: '', priority: 'medium', status: 'pending', createdAt: Date.now(), updatedAt: Date.now() },
    ];

    store.setTasks(tasks);

    const state = useMissionControlStore.getState();
    expect(state.tasks.length).toBe(2);
    expect(state.tasks[0].title).toBe('任务1');
  });

  test('setAgents 设置 Agent 列表', () => {
    const store = useMissionControlStore.getState();
    const agents: MissionAgent[] = [
      { id: 'a1', name: 'Agent1', role: 'executor', status: 'idle', progress: 0, capabilities: [], lastHeartbeat: Date.now() },
    ];

    store.setAgents(agents);

    const state = useMissionControlStore.getState();
    expect(state.agents.length).toBe(1);
    expect(state.agents[0].name).toBe('Agent1');
  });
});

// ============ clearCompletedTasks 测试 ============

describe('clearCompletedTasks', () => {
  beforeEach(() => {
    useMissionControlStore.setState({
      isActive: false,
      missionId: undefined,
      missionName: undefined,
      createdAt: undefined,
      agents: [],
      tasks: [],
      events: [],
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      soundEnabled: true,
      actionHistory: [],
      selectedTaskIds: [],
    });
  });

  test('清除已完成任务', () => {
    const store = useMissionControlStore.getState();
    const taskId1 = store.addTask(createMockTask());
    store.completeTask(taskId1, '结果1');

    const taskId2 = store.addTask(createMockTask());
    store.completeTask(taskId2, '结果2');

    const taskId3 = store.addTask(createMockTask());
    // 不完成 taskId3

    store.clearCompletedTasks();

    const state = useMissionControlStore.getState();
    expect(state.tasks.length).toBe(1);
    expect(state.tasks[0].id).toBe(taskId3);
    expect(state.completedTasks).toBe(0);
  });

  test('清除已完成任务时清除选中', () => {
    const store = useMissionControlStore.getState();
    const taskId = store.addTask(createMockTask());
    store.completeTask(taskId);

    store.toggleTaskSelection(taskId);
    store.clearCompletedTasks();

    const state = useMissionControlStore.getState();
    expect(state.selectedTaskIds).not.toContain(taskId);
  });
});