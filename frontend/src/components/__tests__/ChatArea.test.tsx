import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import ChatArea from '../ChatArea';
import { ToastProvider } from '../Toast';

// Use hoisted to create mock function that can be referenced in vi.mock
const mockChatStore = vi.hoisted(() => vi.fn());

// Mock all dependencies
vi.mock('@/lib/sse', () => ({
  sendSSEChatMessage: vi.fn(),
}));

vi.mock('@/hooks/useImageIntent', () => ({
  detectImageIntent: vi.fn(() => ({ isImageRequest: false, prompt: '' })),
  cleanImagePrompt: vi.fn((p: string) => p),
}));

vi.mock('@/hooks/useSearchEnhanced', () => ({
  useSearchEnhanced: vi.fn(() => ({
    search: vi.fn(),
    results: [],
    isLoading: false,
  })),
}));

vi.mock('@/utils/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/store/chatStore', () => ({
  useChatStore: mockChatStore,
}));

// Helper to create mock store state
const createMockState = (overrides = {}) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  isLoading: false,
  sendMessage: vi.fn(),
  clearMessages: vi.fn(),
  addMessage: vi.fn(),
  updateLastMessage: vi.fn(),
  updateLastMessageThinking: vi.fn(),
  finalizeMessage: vi.fn(),
  apiConfig: { apiKey: 'test', baseURL: 'http://test', model: 'MiniMax-M2.7' },
  enabledFeatures: {
    webSearch: false,
    deepThinking: false,
    imageGeneration: false,
  },
  setEnabledFeature: vi.fn(),
  settings: { animationsEnabled: false },
  customPrompts: [],
  configuredModels: [],  // Required by ChatInput
  activeConversationIds: [],
  windowConfigs: {},
  globalMemories: [],
  appMode: 'chat' as const,
  focusMode: false,
  sidePanelContent: 'none' as const,
  showWelcomeGuide: false,
  hasHydrated: true,
  createConversation: vi.fn(),
  deleteConversation: vi.fn(),
  restoreConversation: vi.fn(),
  setActiveConversation: vi.fn(),
  updateConversationTitle: vi.fn(),
  ...overrides,
});

describe('ChatArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChatStore.mockImplementation((selector?: (state: any) => any) => {
      const state = createMockState();
      return selector ? selector(state) : state;
    });
  });

  test('空状态显示欢迎消息和快速开始按钮', () => {
    render(
      <ToastProvider>
        <ChatArea />
      </ToastProvider>
    );
    expect(screen.getByText(/从一个问题开始/i)).toBeInTheDocument();
  });

  test('显示消息列表', () => {
    const mockMessages = [
      { id: '1', role: 'user' as const, content: '你好', createdAt: Date.now() },
      { id: '2', role: 'assistant' as const, content: '你好！', createdAt: Date.now(), isComplete: true },
    ];

    mockChatStore.mockImplementation((selector?: (state: any) => any) => {
      const state = createMockState({
        conversations: [
          {
            id: 'conv-1',
            title: 'Test',
            messages: mockMessages,
            notes: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
        activeConversationId: 'conv-1',
      });
      return selector ? selector(state) : state;
    });

    render(
      <ToastProvider>
        <ChatArea />
      </ToastProvider>
    );
    // User message and assistant message should both be visible
    expect(screen.getByText('你好')).toBeInTheDocument();
    // Use regex for partial match as the content might be wrapped
    expect(screen.getByText(/你好！/)).toBeInTheDocument();
  });

  test('功能切换按钮存在', () => {
    render(
      <ToastProvider>
        <ChatArea />
      </ToastProvider>
    );
    expect(screen.getByText(/联网搜索/i)).toBeInTheDocument();
    expect(screen.getByText(/深度思考/i)).toBeInTheDocument();
    expect(screen.getByText(/图片生成/i)).toBeInTheDocument();
  });
});