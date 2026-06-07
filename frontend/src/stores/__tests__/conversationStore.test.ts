/**
 * ConversationStore 测试
 * 测试日期: 2026-05-22
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useConversationStore } from '../conversationStore';
import type { Conversation } from '@/types';

function makeConversation(id: string, title = '测试对话'): Conversation {
  return {
    id,
    title,
    messages: [],
    notes: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('ConversationStore', () => {
  beforeEach(() => {
    // 重置 store
    useConversationStore.setState({
      conversations: [],
      activeConversationId: null,
      activeConversationIds: [],
      windowConfigs: {},
      hasHydrated: true,
    });
  });

  describe('createConversation', () => {
    it('应该创建新对话并设置为活跃', () => {
      const id = useConversationStore.getState().createConversation();

      expect(id).toMatch(/^conv_\d+$/);
      const state = useConversationStore.getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.conversations[0].id).toBe(id);
      expect(state.activeConversationId).toBe(id);
    });

    it('新对话应为空且标题默认', () => {
      const id = useConversationStore.getState().createConversation();
      const conv = useConversationStore.getState().conversations.find((c) => c.id === id);

      expect(conv?.messages).toHaveLength(0);
      expect(conv?.title).toBe('新对话');
    });

    it('应将新对话置于列表首位', () => {
      useConversationStore.setState({
        conversations: [makeConversation('old_1'), makeConversation('old_2')],
      });

      const newId = useConversationStore.getState().createConversation();
      const conversations = useConversationStore.getState().conversations;

      expect(conversations[0].id).toBe(newId);
      expect(conversations).toHaveLength(3);
    });
  });

  describe('deleteConversation', () => {
    it('应正确删除指定对话', () => {
      useConversationStore.setState({
        conversations: [makeConversation('c1'), makeConversation('c2'), makeConversation('c3')],
        activeConversationId: 'c1',
      });

      useConversationStore.getState().deleteConversation('c2');
      const ids = useConversationStore.getState().conversations.map((c) => c.id);

      expect(ids).not.toContain('c2');
      expect(ids).toContain('c1');
      expect(ids).toContain('c3');
    });

    it('删除活跃对话时应自动切换', () => {
      useConversationStore.setState({
        conversations: [makeConversation('c1'), makeConversation('c2')],
        activeConversationId: 'c1',
      });

      useConversationStore.getState().deleteConversation('c1');

      expect(useConversationStore.getState().activeConversationId).toBe('c2');
    });

    it('删除唯一对话后应无活跃对话', () => {
      useConversationStore.setState({
        conversations: [makeConversation('c1')],
        activeConversationId: 'c1',
      });

      useConversationStore.getState().deleteConversation('c1');

      expect(useConversationStore.getState().activeConversationId).toBeNull();
    });

    it('删除非活跃对话不应改变活跃状态', () => {
      useConversationStore.setState({
        conversations: [makeConversation('c1'), makeConversation('c2')],
        activeConversationId: 'c1',
      });

      useConversationStore.getState().deleteConversation('c2');

      expect(useConversationStore.getState().activeConversationId).toBe('c1');
    });
  });

  describe('restoreConversation', () => {
    it('应恢复对话到列表首位', () => {
      useConversationStore.setState({
        conversations: [makeConversation('c1'), makeConversation('c2')],
      });

      const restored = makeConversation('restored_id', '恢复的对话');
      useConversationStore.getState().restoreConversation(restored);

      expect(useConversationStore.getState().conversations[0].id).toBe('restored_id');
      expect(useConversationStore.getState().activeConversationId).toBe('restored_id');
    });

    it('应支持指定插入位置', () => {
      useConversationStore.setState({
        conversations: [makeConversation('c1'), makeConversation('c2'), makeConversation('c3')],
      });

      const restored = makeConversation('restored');
      useConversationStore.getState().restoreConversation(restored, 1);

      expect(useConversationStore.getState().conversations[1].id).toBe('restored');
    });

    it('越界索引应调整为0（插入列表首位）', () => {
      useConversationStore.setState({
        conversations: [makeConversation('c1'), makeConversation('c2')],
      });

      const restored = makeConversation('restored');
      useConversationStore.getState().restoreConversation(restored, 99);

      // 代码逻辑: index=99 超出 0~2 范围，调整为 insertIndex=0
      // restored 插入到列表首位，原内容顺移
      expect(useConversationStore.getState().conversations[0].id).toBe('restored');
      expect(useConversationStore.getState().conversations[1].id).toBe('c1');
      expect(useConversationStore.getState().conversations[2].id).toBe('c2');
    });
  });

  describe('setActiveConversation', () => {
    it('应正确设置活跃对话', () => {
      useConversationStore.setState({
        conversations: [makeConversation('c1'), makeConversation('c2')],
        activeConversationId: 'c1',
      });

      useConversationStore.getState().setActiveConversation('c2');

      expect(useConversationStore.getState().activeConversationId).toBe('c2');
    });
  });

  describe('多窗口管理', () => {
    it('addActiveWindow 应添加窗口', () => {
      useConversationStore.setState({ activeConversationIds: [] });

      useConversationStore.getState().addActiveWindow('win_1');
      expect(useConversationStore.getState().activeConversationIds).toContain('win_1');
    });

    it('addActiveWindow 不应添加重复窗口', () => {
      useConversationStore.setState({ activeConversationIds: ['win_1'] });

      useConversationStore.getState().addActiveWindow('win_1');
      expect(useConversationStore.getState().activeConversationIds).toHaveLength(1);
    });

    it('addActiveWindow 应限制最多4个窗口', () => {
      useConversationStore.setState({
        activeConversationIds: ['win_1', 'win_2', 'win_3', 'win_4'],
      });

      useConversationStore.getState().addActiveWindow('win_5');

      // 实现: [...ids, win_5].slice(-4)，超出时移除最早的
      // 结果: [win_2, win_3, win_4, win_5]
      expect(useConversationStore.getState().activeConversationIds).toHaveLength(4);
      expect(useConversationStore.getState().activeConversationIds).toContain('win_5');
      expect(useConversationStore.getState().activeConversationIds).toContain('win_2');
      expect(useConversationStore.getState().activeConversationIds).not.toContain('win_1');
    });

    it('removeActiveWindow 应移除窗口', () => {
      useConversationStore.setState({
        activeConversationIds: ['win_1', 'win_2', 'win_3'],
      });

      useConversationStore.getState().removeActiveWindow('win_2');

      expect(useConversationStore.getState().activeConversationIds).not.toContain('win_2');
      expect(useConversationStore.getState().activeConversationIds).toHaveLength(2);
    });

    it('assignConversationToWindow 应分配对话到窗口', () => {
      useConversationStore.setState({
        activeConversationIds: ['win_1'],
        windowConfigs: {},
      });

      useConversationStore.getState().assignConversationToWindow('conv_1', 'win_1');

      expect(useConversationStore.getState().windowConfigs['win_1']?.conversationId).toBe('conv_1');
    });

    it('assignConversationToWindow 应保留现有 gridArea', () => {
      useConversationStore.setState({
        activeConversationIds: ['win_1'],
        windowConfigs: { win_1: { conversationId: null, gridArea: { col: 1, row: 1 } } },
      });

      useConversationStore.getState().assignConversationToWindow('conv_1', 'win_1');

      expect(useConversationStore.getState().windowConfigs['win_1']?.gridArea?.col).toBe(1);
    });

    it('removeConversationFromWindow 应清空窗口对话', () => {
      useConversationStore.setState({
        windowConfigs: { win_1: { conversationId: 'conv_1', gridArea: { col: 1, row: 1 } } },
      });

      useConversationStore.getState().removeConversationFromWindow('win_1');

      expect(useConversationStore.getState().windowConfigs['win_1']?.conversationId).toBeNull();
    });
  });

  describe('updateConversationTitle', () => {
    it('应正确更新对话标题', () => {
      useConversationStore.setState({
        conversations: [makeConversation('c1', '旧标题')],
      });

      useConversationStore.getState().updateConversationTitle('c1', '新标题');

      expect(useConversationStore.getState().conversations[0].title).toBe('新标题');
    });

    it('应只更新目标对话', () => {
      useConversationStore.setState({
        conversations: [makeConversation('c1', '标题1'), makeConversation('c2', '标题2')],
      });

      useConversationStore.getState().updateConversationTitle('c1', '新标题1');

      expect(useConversationStore.getState().conversations[1].title).toBe('标题2');
    });
  });

  describe('openConversation', () => {
    it('单窗口模式应直接切换对话', () => {
      useConversationStore.setState({
        activeConversationIds: ['win_1'],
        conversations: [makeConversation('c1'), makeConversation('c2')],
      });

      useConversationStore.getState().openConversation('c2');

      const state = useConversationStore.getState();
      expect(state.activeConversationId).toBe('c2');
      expect(state.activeConversationIds).toContain('c2');
    });

    it('应支持切换回已有对话', () => {
      useConversationStore.setState({
        activeConversationIds: ['c1'],
        conversations: [makeConversation('c1'), makeConversation('c2')],
        activeConversationId: 'c1',
      });

      useConversationStore.getState().openConversation('c2');

      expect(useConversationStore.getState().activeConversationId).toBe('c2');
    });
  });

  describe('水合状态', () => {
    it('setHasHydrated 应正确设置状态', () => {
      useConversationStore.setState({ hasHydrated: false });

      useConversationStore.getState().setHasHydrated(true);

      expect(useConversationStore.getState().hasHydrated).toBe(true);
    });
  });

  describe('不可变性验证', () => {
    it('createConversation 应返回新数组', () => {
      useConversationStore.setState({
        conversations: [makeConversation('c1')],
      });

      const original = useConversationStore.getState().conversations;
      useConversationStore.getState().createConversation();
      const updated = useConversationStore.getState().conversations;

      expect(updated).not.toBe(original);
    });

    it('deleteConversation 应返回新数组', () => {
      useConversationStore.setState({
        conversations: [makeConversation('c1'), makeConversation('c2')],
      });

      const original = useConversationStore.getState().conversations;
      useConversationStore.getState().deleteConversation('c1');
      const updated = useConversationStore.getState().conversations;

      expect(updated).not.toBe(original);
    });
  });
});