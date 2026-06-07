import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import { useMissionControlStore, initializeAgents, startMission, stopMission } from '../store';
import type { MissionAgent, MissionTask } from '../types';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

describe('MissionControl Store', () => {
  beforeEach(() => {
    // 重置 store
    useMissionControlStore.getState().reset();
  });

  afterEach(() => {
    useMissionControlStore.getState().reset();
  });

  describe('任务操作', () => {
    test('addTask 添加新任务', () => {
      const { addTask, tasks, totalTasks } = useMissionControlStore.getState();

      const taskId = addTask({
        title: '测试任务',
        description: '测试描述',
        priority: 'high',
        status: 'pending',
      });

      expect(taskId).toBeDefined();
      expect(taskId.length).toBeGreaterThan(0);

      const state = useMissionControlStore.getState();
      expect(state.tasks.length).toBe(1);
      expect(state.tasks[0].title).toBe('测试任务');
      expect(state.totalTasks).toBe(1);
    });

    test('updateTask 更新任务', () => {
      const { addTask, updateTask } = useMissionControlStore.getState();

      const taskId = addTask({
        title: '原始任务',
        description: '原始描述',
        priority: 'medium',
        status: 'pending',
      });

      updateTask(taskId, {
        title: '更新任务',
        status: 'in_progress',
        progress: 50,
      });

      const state = useMissionControlStore.getState();
      const task = state.tasks.find((t) => t.id === taskId);
      expect(task?.title).toBe('更新任务');
      expect(task?.status).toBe('in_progress');
      expect(task?.progress).toBe(50);
    });

    test('assignTask 分配任务给 Agent', () => {
      const { addTask, assignTask, setAgents } = useMissionControlStore.getState();

      // 添加 Agent
      setAgents([{
        id: 'agent-1',
        name: '测试Agent',
        role: 'executor',
        status: 'idle',
        progress: 0,
        capabilities: ['coding'],
        lastHeartbeat: Date.now(),
      }]);

      const taskId = addTask({
        title: '待分配任务',
        description: '',
        priority: 'high',
        status: 'pending',
      });

      assignTask(taskId, 'agent-1');

      const state = useMissionControlStore.getState();
      const task = state.tasks.find((t) => t.id === taskId);
      expect(task?.assignedAgent).toBe('agent-1');
      expect(task?.status).toBe('assigned');
    });

    test('completeTask 完成任务', () => {
      const { addTask, completeTask } = useMissionControlStore.getState();

      const taskId = addTask({
        title: '待完成任务',
        description: '',
        priority: 'medium',
        status: 'in_progress',
      });

      completeTask(taskId, '任务结果');

      const state = useMissionControlStore.getState();
      const task = state.tasks.find((t) => t.id === taskId);
      expect(task?.status).toBe('completed');
      expect(task?.result).toBe('任务结果');
      expect(state.completedTasks).toBe(1);
    });

    test('failTask 标记任务失败', () => {
      const { addTask, failTask } = useMissionControlStore.getState();

      const taskId = addTask({
        title: '失败任务',
        description: '',
        priority: 'high',
        status: 'in_progress',
      });

      failTask(taskId, '错误原因');

      const state = useMissionControlStore.getState();
      const task = state.tasks.find((t) => t.id === taskId);
      expect(task?.status).toBe('failed');
      expect(task?.error).toBe('错误原因');
      expect(state.failedTasks).toBe(1);
    });

    test('removeTask 删除任务', () => {
      const { addTask, removeTask } = useMissionControlStore.getState();

      const taskId = addTask({
        title: '待删除任务',
        description: '',
        priority: 'low',
        status: 'pending',
      });

      removeTask(taskId);

      const state = useMissionControlStore.getState();
      expect(state.tasks.find((t) => t.id === taskId)).toBeUndefined();
      expect(state.totalTasks).toBe(0);
    });

    test('clearCompletedTasks 清理已完成任务', () => {
      const { addTask, completeTask, clearCompletedTasks } = useMissionControlStore.getState();

      const taskId1 = addTask({
        title: '任务1',
        description: '',
        priority: 'medium',
        status: 'pending',
      });
      const taskId2 = addTask({
        title: '任务2',
        description: '',
        priority: 'medium',
        status: 'pending',
      });

      completeTask(taskId1);
      addTask({
        title: '任务3',
        description: '',
        priority: 'medium',
        status: 'pending',
      });

      clearCompletedTasks();

      const state = useMissionControlStore.getState();
      expect(state.tasks.length).toBe(2); // 任务2和任务3
      expect(state.tasks.find((t) => t.id === taskId1)).toBeUndefined();
      expect(state.completedTasks).toBe(0);
    });
  });

  describe('Agent 操作', () => {
    test('updateAgentStatus 更新 Agent 状态', () => {
      const { setAgents, updateAgentStatus } = useMissionControlStore.getState();

      setAgents([{
        id: 'agent-1',
        name: 'Agent1',
        role: 'executor',
        status: 'idle',
        progress: 0,
        capabilities: [],
        lastHeartbeat: Date.now(),
      }]);

      updateAgentStatus('agent-1', 'working', '执行中任务');

      const state = useMissionControlStore.getState();
      const agent = state.agents.find((a) => a.id === 'agent-1');
      expect(agent?.status).toBe('working');
      expect(agent?.currentTask).toBe('执行中任务');
    });

    test('updateAgentProgress 更新 Agent 进度', () => {
      const { setAgents, updateAgentProgress } = useMissionControlStore.getState();

      setAgents([{
        id: 'agent-1',
        name: 'Agent1',
        role: 'executor',
        status: 'working',
        progress: 0,
        capabilities: [],
        lastHeartbeat: Date.now(),
      }]);

      updateAgentProgress('agent-1', 75);

      const state = useMissionControlStore.getState();
      const agent = state.agents.find((a) => a.id === 'agent-1');
      expect(agent?.progress).toBe(75);
    });
  });

  describe('事件操作', () => {
    test('addEvent 添加事件', () => {
      const { addEvent, events } = useMissionControlStore.getState();

      addEvent({
        type: 'task_created',
        message: '新任务创建',
      });

      const state = useMissionControlStore.getState();
      expect(state.events.length).toBe(1);
      expect(state.events[0].type).toBe('task_created');
      expect(state.events[0].message).toBe('新任务创建');
    });

    test('addEvent 限制事件数量为 100', () => {
      const { addEvent } = useMissionControlStore.getState();

      // 添加 105 个事件
      for (let i = 0; i < 105; i++) {
        addEvent({
          type: 'task_created',
          message: `任务 ${i}`,
        });
      }

      const state = useMissionControlStore.getState();
      expect(state.events.length).toBe(100);
    });

    test('clearEvents 清空事件', () => {
      const { addEvent, clearEvents } = useMissionControlStore.getState();

      addEvent({ type: 'task_created', message: '事件1' });
      addEvent({ type: 'task_completed', message: '事件2' });

      clearEvents();

      const state = useMissionControlStore.getState();
      expect(state.events.length).toBe(0);
    });
  });

  describe('广播操作', () => {
    test('broadcastTask 广播任务', () => {
      const { addTask, broadcastTask } = useMissionControlStore.getState();

      const taskId = addTask({
        title: '广播任务',
        description: '',
        priority: 'high',
        status: 'pending',
      });

      broadcastTask(taskId);

      const state = useMissionControlStore.getState();
      const broadcastEvent = state.events.find((e) => e.type === 'broadcast');
      expect(broadcastEvent).toBeDefined();
      expect(broadcastEvent?.data?.task).toBeDefined();
    });

    test('broadcastMessage 广播消息', () => {
      const { broadcastMessage } = useMissionControlStore.getState();

      broadcastMessage('自定义消息', { custom: 'data' });

      const state = useMissionControlStore.getState();
      const broadcastEvent = state.events.find((e) => e.type === 'broadcast');
      expect(broadcastEvent?.message).toBe('自定义消息');
      expect(broadcastEvent?.data?.custom).toBe('data');
    });
  });

  describe('声音控制', () => {
    test('toggleSound 切换声音', () => {
      const { soundEnabled, toggleSound } = useMissionControlStore.getState();
      expect(soundEnabled).toBe(true);

      toggleSound();
      expect(useMissionControlStore.getState().soundEnabled).toBe(false);

      toggleSound();
      expect(useMissionControlStore.getState().soundEnabled).toBe(true);
    });

    test('setSoundEnabled 设置声音状态', () => {
      const { setSoundEnabled } = useMissionControlStore.getState();

      setSoundEnabled(false);
      expect(useMissionControlStore.getState().soundEnabled).toBe(false);

      setSoundEnabled(true);
      expect(useMissionControlStore.getState().soundEnabled).toBe(true);
    });
  });

  describe('操作历史', () => {
    test('addActionHistory 添加历史记录', () => {
      const { addActionHistory, actionHistory } = useMissionControlStore.getState();

      addActionHistory('completeTask', 'taskId: abc');

      const state = useMissionControlStore.getState();
      expect(state.actionHistory.length).toBe(1);
      expect(state.actionHistory[0].action).toBe('completeTask');
      expect(state.actionHistory[0].details).toBe('taskId: abc');
    });

    test('clearActionHistory 清空历史', () => {
      const { addActionHistory, clearActionHistory } = useMissionControlStore.getState();

      addActionHistory('action1');
      addActionHistory('action2');

      clearActionHistory();

      const state = useMissionControlStore.getState();
      expect(state.actionHistory.length).toBe(0);
    });
  });

  describe('批量选择', () => {
    test('toggleTaskSelection 切换选择', () => {
      const { addTask, toggleTaskSelection } = useMissionControlStore.getState();

      const taskId = addTask({
        title: '任务',
        description: '',
        priority: 'medium',
        status: 'pending',
      });

      toggleTaskSelection(taskId);
      expect(useMissionControlStore.getState().selectedTaskIds).toContain(taskId);

      toggleTaskSelection(taskId);
      expect(useMissionControlStore.getState().selectedTaskIds).not.toContain(taskId);
    });

    test('selectAllTasks 选择所有任务', () => {
      const { addTask, selectAllTasks } = useMissionControlStore.getState();

      addTask({ title: '任务1', description: '', priority: 'medium', status: 'pending' });
      addTask({ title: '任务2', description: '', priority: 'medium', status: 'pending' });

      selectAllTasks();

      const state = useMissionControlStore.getState();
      expect(state.selectedTaskIds.length).toBe(2);
    });

    test('clearSelection 清除选择', () => {
      const { addTask, selectAllTasks, clearSelection } = useMissionControlStore.getState();

      addTask({ title: '任务1', description: '', priority: 'medium', status: 'pending' });
      addTask({ title: '任务2', description: '', priority: 'medium', status: 'pending' });

      selectAllTasks();
      clearSelection();

      const state = useMissionControlStore.getState();
      expect(state.selectedTaskIds.length).toBe(0);
    });

    test('batchComplete 批量完成', () => {
      const { addTask, selectAllTasks } = useMissionControlStore.getState();

      const taskId1 = addTask({ title: '任务1', description: '', priority: 'medium', status: 'pending' });
      const taskId2 = addTask({ title: '任务2', description: '', priority: 'medium', status: 'pending' });

      selectAllTasks();
      useMissionControlStore.getState().batchComplete('批量完成');

      const state = useMissionControlStore.getState();
      expect(state.tasks.find((t) => t.id === taskId1)?.status).toBe('completed');
      expect(state.tasks.find((t) => t.id === taskId2)?.status).toBe('completed');
      expect(state.selectedTaskIds.length).toBe(0);
    });

    test('batchFail 批量失败', () => {
      const { addTask, selectAllTasks } = useMissionControlStore.getState();

      const taskId1 = addTask({ title: '任务1', description: '', priority: 'medium', status: 'pending' });
      addTask({ title: '任务2', description: '', priority: 'medium', status: 'pending' });

      selectAllTasks();
      useMissionControlStore.getState().batchFail('批量失败');

      const state = useMissionControlStore.getState();
      expect(state.tasks.find((t) => t.id === taskId1)?.status).toBe('failed');
      expect(state.selectedTaskIds.length).toBe(0);
    });
  });

  describe('状态重置', () => {
    test('reset 重置所有状态', () => {
      const { addTask, setAgents, addEvent, addActionHistory, reset } = useMissionControlStore.getState();

      addTask({ title: '任务', description: '', priority: 'medium', status: 'pending' });
      setAgents([{ id: 'agent-1', name: 'Agent', role: 'executor', status: 'idle', progress: 0, capabilities: [], lastHeartbeat: Date.now() }]);
      addEvent({ type: 'task_created', message: '事件' });
      addActionHistory('action');

      reset();

      const state = useMissionControlStore.getState();
      expect(state.tasks.length).toBe(0);
      expect(state.agents.length).toBe(0);
      expect(state.events.length).toBe(0);
      expect(state.actionHistory.length).toBe(0);
      expect(state.isActive).toBe(false);
    });
  });

  describe('后端同步', () => {
    test('setTasks 设置任务列表', () => {
      const { setTasks } = useMissionControlStore.getState();

      const tasks: MissionTask[] = [
        { id: '1', title: '任务1', description: '', priority: 'high', status: 'in_progress', createdAt: Date.now(), updatedAt: Date.now() },
        { id: '2', title: '任务2', description: '', priority: 'medium', status: 'completed', createdAt: Date.now(), updatedAt: Date.now() },
      ];

      setTasks(tasks);

      const state = useMissionControlStore.getState();
      expect(state.tasks.length).toBe(2);
      expect(state.tasks[0].title).toBe('任务1');
    });

    test('setAgents 设置 Agent 列表', () => {
      const { setAgents } = useMissionControlStore.getState();

      const agents: MissionAgent[] = [
        { id: 'agent-1', name: 'Agent1', role: 'executor', status: 'idle', progress: 0, capabilities: [], lastHeartbeat: Date.now() },
      ];

      setAgents(agents);

      const state = useMissionControlStore.getState();
      expect(state.agents.length).toBe(1);
      expect(state.agents[0].name).toBe('Agent1');
    });
  });

  describe('辅助函数', () => {
    test('initializeAgents 初始化 Agent 池', () => {
      const agents: Omit<MissionAgent, 'lastHeartbeat'>[] = [
        { id: 'agent-1', name: 'Agent1', role: 'executor', status: 'idle', progress: 0, capabilities: [] },
      ];

      initializeAgents(agents);

      const state = useMissionControlStore.getState();
      expect(state.agents.length).toBe(1);
      expect(state.agents[0].lastHeartbeat).toBeDefined();
    });

    test('startMission 启动任务', () => {
      const tasks = [
        { title: '任务1', description: '', priority: 'high', status: 'pending' as const },
        { title: '任务2', description: '', priority: 'medium', status: 'pending' as const },
      ];

      startMission('测试任务', tasks);

      const state = useMissionControlStore.getState();
      expect(state.isActive).toBe(true);
      expect(state.missionName).toBe('测试任务');
      expect(state.tasks.length).toBe(2);
      expect(state.totalTasks).toBe(2);
      expect(state.events.length).toBeGreaterThan(0);
    });

    test('stopMission 停止任务', () => {
      startMission('测试', [{ title: '任务', description: '', priority: 'medium', status: 'pending' }]);
      stopMission();

      const state = useMissionControlStore.getState();
      expect(state.isActive).toBe(false);
    });
  });
});