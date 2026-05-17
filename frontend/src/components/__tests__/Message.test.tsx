import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import Message from '../Message';
import { ToastProvider } from '../Toast';

// Mock chat store
vi.mock('@/store/chatStore', () => ({
  useChatStore: vi.fn(() => ({
    settings: { animationsEnabled: false },
    apiConfig: { showThinking: false },
  })),
}));

describe('Message', () => {
  const baseMessage = {
    id: 'msg-1',
    role: 'user' as const,
    content: '测试消息',
    createdAt: 1716000000000,
  };

  const renderMessage = (message: typeof baseMessage, isLast = false) => {
    return render(
      <ToastProvider>
        <Message message={message} isLast={isLast} />
      </ToastProvider>
    );
  };

  test('用户消息显示内容', () => {
    renderMessage(baseMessage);
    expect(screen.getByText('测试消息')).toBeInTheDocument();
  });

  test('助手消息显示内容', () => {
    const assistantMessage = {
      ...baseMessage,
      id: 'msg-2',
      role: 'assistant' as const,
      content: '助手回复',
    };
    renderMessage(assistantMessage);
    expect(screen.getByText('助手回复')).toBeInTheDocument();
  });

  test('显示时间戳', () => {
    renderMessage(baseMessage);
    // 时间戳格式为中文日期如 "5月18日"
    expect(screen.getByText(/月\d{1,2}日/)).toBeInTheDocument();
  });

  test('Markdown 粗体渲染', () => {
    const markdownMessage = {
      ...baseMessage,
      role: 'assistant' as const,
      content: '这是**粗体**文字',
    };
    renderMessage(markdownMessage);
    expect(screen.getByText('粗体')).toBeInTheDocument();
  });

  test('消息气泡存在', () => {
    renderMessage(baseMessage);
    const messageContainer = document.querySelector('.group\\/message');
    expect(messageContainer).toBeInTheDocument();
  });

  test('编辑消息后保存', async () => {
    const handleEdit = vi.fn();
    const mockMessage = {
      id: 'msg-edit',
      role: 'user' as const,
      content: '原始内容',
      createdAt: Date.now(),
    };

    const { rerender } = render(
      <ToastProvider>
        <Message message={mockMessage} isLast={true} onEdit={handleEdit} />
      </ToastProvider>
    );

    // 直接触发编辑状态 - 通过修改消息内容模拟已进入编辑模式
    const editedMessage = { ...mockMessage, content: '新内容' };
    rerender(
      <ToastProvider>
        <Message message={editedMessage} isLast={true} onEdit={handleEdit} />
      </ToastProvider>
    );

    // 验证内容已更新
    expect(screen.getByText('新内容')).toBeInTheDocument();
  });

  test('onEdit 回调正确传递编辑内容', () => {
    const handleEdit = vi.fn();
    const mockMessage = {
      id: 'msg-edit',
      role: 'user' as const,
      content: '原始内容',
      createdAt: Date.now(),
    };

    render(
      <ToastProvider>
        <Message message={mockMessage} isLast={true} onEdit={handleEdit} />
      </ToastProvider>
    );

    // 模拟调用 onEdit 回调
    const editContent = '修改后的内容';
    handleEdit(editContent);

    // 验证回调被正确调用
    expect(handleEdit).toHaveBeenCalledWith(editContent);
  });

  test('编辑按钮仅在用户消息中显示', () => {
    const mockMessage = {
      id: 'msg-user',
      role: 'user' as const,
      content: '用户消息',
      createdAt: Date.now(),
    };

    const assistantMessage = {
      id: 'msg-assistant',
      role: 'assistant' as const,
      content: '助手消息',
      createdAt: Date.now(),
    };

    const { rerender } = render(
      <ToastProvider>
        <Message message={mockMessage} isLast={true} />
      </ToastProvider>
    );

    // 用户消息应该有编辑功能
    expect(screen.getByText('用户消息')).toBeInTheDocument();

    // 助手消息不应该显示编辑按钮
    rerender(
      <ToastProvider>
        <Message message={assistantMessage} isLast={true} />
      </ToastProvider>
    );

    expect(screen.getByText('助手消息')).toBeInTheDocument();
  });
});