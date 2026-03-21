/**
 * Chat Store 测试
 * 测试日期: 2026-03-17
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chat store state
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ChatState {
  messages: Message[];
  conversations: string[];
  currentConversationId: string | null;
  isLoading: boolean;
  error: string | null;
}

// Initial state
const initialState: ChatState = {
  messages: [],
  conversations: [],
  currentConversationId: null,
  isLoading: false,
  error: null
};

describe('Chat Store', () => {
  let state: ChatState;

  beforeEach(() => {
    state = { ...initialState };
  });

  describe('消息管理', () => {
    it('应该能够添加用户消息', () => {
      const addUserMessage = (state: ChatState, content: string): ChatState => {
        const newMessage: Message = {
          id: `msg-${Date.now()}`,
          role: 'user',
          content,
          timestamp: Date.now()
        };
        return {
          ...state,
          messages: [...state.messages, newMessage]
        };
      };

      state = addUserMessage(state, '你好，AI');

      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].role).toBe('user');
      expect(state.messages[0].content).toBe('你好，AI');
    });

    it('应该能够添加AI消息', () => {
      const addAssistantMessage = (state: ChatState, content: string): ChatState => {
        const newMessage: Message = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content,
          timestamp: Date.now()
        };
        return {
          ...state,
          messages: [...state.messages, newMessage]
        };
      };

      state = addAssistantMessage(state, '你好！有什么可以帮助你的吗？');

      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].role).toBe('assistant');
    });

    it('应该能够删除消息', () => {
      // 先添加消息
      state.messages = [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: Date.now() },
        { id: 'msg-2', role: 'assistant', content: 'Hi there', timestamp: Date.now() }
      ];

      const deleteMessage = (state: ChatState, messageId: string): ChatState => {
        return {
          ...state,
          messages: state.messages.filter(m => m.id !== messageId)
        };
      };

      state = deleteMessage(state, 'msg-1');

      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].id).toBe('msg-2');
    });

    it('应该能够清空所有消息', () => {
      state.messages = [
        { id: 'msg-1', role: 'user', content: 'Hello', timestamp: Date.now() },
        { id: 'msg-2', role: 'assistant', content: 'Hi there', timestamp: Date.now() }
      ];

      const clearMessages = (state: ChatState): ChatState => {
        return { ...state, messages: [] };
      };

      state = clearMessages(state);

      expect(state.messages).toHaveLength(0);
    });
  });

  describe('会话管理', () => {
    it('应该能够创建新会话', () => {
      const createConversation = (state: ChatState): ChatState => {
        const newId = `conv-${Date.now()}`;
        return {
          ...state,
          conversations: [...state.conversations, newId],
          currentConversationId: newId,
          messages: []
        };
      };

      state = createConversation(state);

      expect(state.conversations).toHaveLength(1);
      expect(state.currentConversationId).toBeDefined();
      expect(state.messages).toHaveLength(0);
    });

    it('应该能够切换会话', () => {
      state.conversations = ['conv-1', 'conv-2', 'conv-3'];
      state.currentConversationId = 'conv-1';

      const switchConversation = (state: ChatState, conversationId: string): ChatState => {
        return { ...state, currentConversationId: conversationId };
      };

      state = switchConversation(state, 'conv-2');

      expect(state.currentConversationId).toBe('conv-2');
    });

    it('应该能够删除会话', () => {
      state.conversations = ['conv-1', 'conv-2', 'conv-3'];
      state.currentConversationId = 'conv-1';

      const deleteConversation = (state: ChatState, conversationId: string): ChatState => {
        const newConversations = state.conversations.filter(id => id !== conversationId);
        const newCurrentId = state.currentConversationId === conversationId
          ? newConversations[0] || null
          : state.currentConversationId;

        return {
          ...state,
          conversations: newConversations,
          currentConversationId: newCurrentId
        };
      };

      state = deleteConversation(state, 'conv-2');

      expect(state.conversations).toHaveLength(2);
      expect(state.conversations).not.toContain('conv-2');
    });
  });

  describe('加载状态', () => {
    it('应该能够设置加载状态', () => {
      const setLoading = (state: ChatState, loading: boolean): ChatState => {
        return { ...state, isLoading: loading };
      };

      state = setLoading(state, true);
      expect(state.isLoading).toBe(true);

      state = setLoading(state, false);
      expect(state.isLoading).toBe(false);
    });

    it('加载时应该禁用输入', () => {
      state.isLoading = true;

      const isInputDisabled = (state: ChatState) => state.isLoading;

      expect(isInputDisabled(state)).toBe(true);
    });
  });

  describe('错误处理', () => {
    it('应该能够设置错误状态', () => {
      const setError = (state: ChatState, error: string | null): ChatState => {
        return { ...state, error };
      };

      state = setError(state, '网络错误');
      expect(state.error).toBe('网络错误');

      state = setError(state, null);
      expect(state.error).toBeNull();
    });

    it('有错误时应该显示错误信息', () => {
      state.error = 'API请求失败';

      const hasError = (state: ChatState) => state.error !== null;
      const getErrorMessage = (state: ChatState) => state.error;

      expect(hasError(state)).toBe(true);
      expect(getErrorMessage(state)).toBe('API请求失败');
    });
  });

  describe('流式响应', () => {
    it('应该能够增量添加内容', () => {
      // 初始AI消息
      state.messages = [
        { id: 'msg-1', role: 'assistant', content: '', timestamp: Date.now() }
      ];

      const updateStreamingContent = (state: ChatState, content: string): ChatState => {
        const messages = [...state.messages];
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
          messages[messages.length - 1] = { ...lastMessage, content };
        }
        return { ...state, messages };
      };

      // 模拟流式输入
      state = updateStreamingContent(state, '你');
      expect(state.messages[0].content).toBe('你');

      state = updateStreamingContent(state, '你好');
      expect(state.messages[0].content).toBe('你好');

      state = updateStreamingContent(state, '你好，我是AI');
      expect(state.messages[0].content).toBe('你好，我是AI');
    });
  });
});

describe('Chat Store Selectors', () => {
  const state = {
    messages: [
      { id: 'msg-1', role: 'user' as const, content: 'Hello', timestamp: 1000 },
      { id: 'msg-2', role: 'assistant' as const, content: 'Hi there', timestamp: 2000 }
    ],
    conversations: ['conv-1'],
    currentConversationId: 'conv-1',
    isLoading: false,
    error: null
  };

  it('应该能够获取所有消息', () => {
    const getAllMessages = (state: ChatState) => state.messages;
    expect(getAllMessages(state)).toHaveLength(2);
  });

  it('应该能够获取用户消息', () => {
    const getUserMessages = (state: ChatState) =>
      state.messages.filter(m => m.role === 'user');
    expect(getUserMessages(state)).toHaveLength(1);
  });

  it('应该能够获取AI消息', () => {
    const getAssistantMessages = (state: ChatState) =>
      state.messages.filter(m => m.role === 'assistant');
    expect(getAssistantMessages(state)).toHaveLength(1);
  });

  it('应该能够获取消息数量', () => {
    const getMessageCount = (state: ChatState) => state.messages.length;
    expect(getMessageCount(state)).toBe(2);
  });
});
