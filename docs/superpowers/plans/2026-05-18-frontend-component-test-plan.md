# 前端组件 TDD 测试实施计划 - Core + Agent

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 12 个核心前端组件编写 TDD 测试，覆盖消息渲染、Agent 执行、协作等功能

**Architecture:** 使用 Vitest + @testing-library/react，每个组件独立测试文件，Mock 外部依赖

**Tech Stack:** Vitest, @testing-library/react, jest-dom, Mock Stores

---

## Phase 1: Core 组件测试

### Task 1: ChatArea 组件测试

**Files:**
- Create: `frontend/src/components/__tests__/ChatArea.test.tsx`
- Modify: `frontend/src/components/ChatArea.tsx` (如有需要)

- [ ] **Step 1: 创建 ChatArea 测试文件**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import ChatArea from '../ChatArea';

// Mock useChatStore
vi.mock('@/stores/chatStore', () => ({
  useChatStore: () => ({
    messages: [],
    isLoading: false,
    sendMessage: vi.fn(),
    clearMessages: vi.fn()
  })
}));

describe('ChatArea', () => {
  test('空状态显示欢迎消息', () => {
    render(<ChatArea />);
    expect(screen.getByText(/欢迎/i)).toBeInTheDocument();
  });

  test('显示消息列表', () => {
    const mockMessages = [
      { id: '1', role: 'user', content: '你好', timestamp: Date.now() },
      { id: '2', role: 'assistant', content: '你好！', timestamp: Date.now() }
    ];
    
    // Mock messages
    vi.mocked(useChatStore).mockReturnValue({
      messages: mockMessages,
      isLoading: false,
      sendMessage: vi.fn(),
      clearMessages: vi.fn()
    });
    
    render(<ChatArea />);
    expect(screen.getByText('你好')).toBeInTheDocument();
    expect(screen.getByText('你好！')).toBeInTheDocument();
  });

  test('加载状态显示 spinner', () => {
    vi.mocked(useChatStore).mockReturnValue({
      messages: [],
      isLoading: true,
      sendMessage: vi.fn(),
      clearMessages: vi.fn()
    });
    
    render(<ChatArea />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  test('滚动到底部按钮功能', async () => {
    // 测试滚动功能
    const scrollToBottom = vi.fn();
    render(<ChatArea onScrollToBottom={scrollToBottom} />);
    
    const scrollBtn = screen.getByRole('button', { name: /向下滚动/i });
    fireEvent.click(scrollBtn);
    expect(scrollToBottom).toHaveBeenCalled();
  });

  test('消息发送后输入框清空', () => {
    // 测试逻辑
    const sendMessage = vi.fn();
    render(<ChatArea onSend={sendMessage} />);
    
    // 模拟发送
    fireEvent.click(screen.getByRole('button', { name: /发送/i }));
    expect(sendMessage).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试验证**

Run: `cd frontend && npm test -- --testPathPattern="ChatArea.test.tsx" --watchAll=false 2>&1 | head -40`

- [ ] **Step 3: 报告并继续**

---

### Task 2: Message 组件测试

**Files:**
- Create: `frontend/src/components/__tests__/Message.test.tsx`

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import Message from '../Message';

describe('Message', () => {
  test('用户消息显示在右侧', () => {
    render(<Message role="user" content="测试消息" />);
    const msg = screen.getByText('测试消息').closest('[class*="justify-end"]');
    expect(msg).toBeInTheDocument();
  });

  test('助手消息显示在左侧', () => {
    render(<Message role="assistant" content="助手回复" />);
    const msg = screen.getByText('助手回复').closest('[class*="justify-start"]');
    expect(msg).toBeInTheDocument();
  });

  test('显示时间戳', () => {
    const timestamp = 1716000000000;
    render(<Message role="user" content="消息" timestamp={timestamp} />);
    expect(screen.getByText(/\d{2}:\d{2}/)).toBeInTheDocument();
  });

  test('复制按钮功能', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
    
    render(<Message role="user" content="复制这条" />);
    const copyBtn = screen.getByRole('button', { name: /复制/i });
    fireEvent.click(copyBtn);
    
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('复制这条');
  });

  test('Markdown 内容渲染', () => {
    render(<Message role="assistant" content="**粗体** 和 `代码`" />);
    expect(screen.getByText('粗体')).toBeInTheDocument();
    expect(screen.getByText('代码')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试验证**

Run: `cd frontend && npm test -- --testPathPattern="Message.test.tsx" --watchAll=false 2>&1 | head -40`

---

### Task 3: ChatInput 组件测试

**Files:**
- Create: `frontend/src/components/__tests__/ChatInput.test.tsx`

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import ChatInput from '../ChatInput';

describe('ChatInput', () => {
  test('输入框可输入文本', () => {
    render(<ChatInput onSend={vi.fn()} />);
    const input = screen.getByPlaceholderText(/输入消息/i);
    fireEvent.change(input, { target: { value: '测试输入' } });
    expect(input).toHaveValue('测试输入');
  });

  test('回车发送消息', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    
    const input = screen.getByPlaceholderText(/输入消息/i);
    fireEvent.change(input, { target: { value: '发送这条' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    
    expect(onSend).toHaveBeenCalledWith('发送这条');
  });

  test('发送按钮点击发送', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    
    const input = screen.getByPlaceholderText(/输入消息/i);
    fireEvent.change(input, { target: { value: '点击发送' } });
    fireEvent.click(screen.getByRole('button', { name: /发送/i }));
    
    expect(onSend).toHaveBeenCalledWith('点击发送');
  });

  test('空内容禁用发送按钮', () => {
    render(<ChatInput onSend={vi.fn()} />);
    const sendBtn = screen.getByRole('button', { name: /发送/i });
    expect(sendBtn).toBeDisabled();
  });

  test('Shift+Enter 换行', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    
    const input = screen.getByPlaceholderText(/输入消息/i);
    fireEvent.change(input, { target: { value: '第一行\n第二行' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    
    expect(onSend).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试验证**

Run: `cd frontend && npm test -- --testPathPattern="ChatInput.test.tsx" --watchAll=false 2>&1 | head -40`

---

### Task 4: MarkdownRenderer 组件测试

**Files:**
- Create: `frontend/src/components/__tests__/MarkdownRenderer.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import MarkdownRenderer from '../MarkdownRenderer';

describe('MarkdownRenderer', () => {
  test('渲染粗体', () => {
    render(<MarkdownRenderer content="**粗体文本**" />);
    expect(screen.getByText('粗体文本')).toBeInTheDocument();
  });

  test('渲染代码块', () => {
    render(<MarkdownRenderer content="```javascript\nconst x = 1;\n```" />);
    expect(screen.getByText('const x = 1;')).toBeInTheDocument();
  });

  test('渲染链接', () => {
    render(<MarkdownRenderer content="[百度](https://baidu.com)" />);
    const link = screen.getByText('百度');
    expect(link).toHaveAttribute('href', 'https://baidu.com');
  });

  test('渲染列表', () => {
    render(<MarkdownRenderer content="- 项目1\n- 项目2" />);
    expect(screen.getByText('项目1')).toBeInTheDocument();
    expect(screen.getByText('项目2')).toBeInTheDocument();
  });

  test('XSS 防护 - 脚本标签被过滤', () => {
    render(<MarkdownRenderer content='<script>alert("xss")</script>' />);
    expect(document.querySelector('script')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试验证**

Run: `cd frontend && npm test -- --testPathPattern="MarkdownRenderer.test.tsx" --watchAll=false 2>&1 | head -40`

---

## Phase 2: Agent 组件测试

### Task 5: AgentExecutionPanel 测试

**Files:**
- Create: `frontend/src/components/agent/__tests__/AgentExecutionPanel.test.tsx`

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import AgentExecutionPanel from '../AgentExecutionPanel';

describe('AgentExecutionPanel', () => {
  test('空闲状态显示开始按钮', () => {
    render(<AgentExecutionPanel status="idle" onStart={vi.fn()} />);
    expect(screen.getByRole('button', { name: /开始执行/i })).toBeInTheDocument();
  });

  test('执行中显示停止按钮', () => {
    render(<AgentExecutionPanel status="running" onStop={vi.fn()} />);
    expect(screen.getByRole('button', { name: /停止/i })).toBeInTheDocument();
  });

  test('显示执行日志', () => {
    const logs = [
      { timestamp: Date.now(), level: 'info', message: '开始执行...' },
      { timestamp: Date.now(), level: 'debug', message: '加载工具...' }
    ];
    
    render(<AgentExecutionPanel logs={logs} />);
    expect(screen.getByText('开始执行...')).toBeInTheDocument();
  });

  test('完成状态显示结果', () => {
    render(<AgentExecutionPanel status="completed" result="执行完成" />);
    expect(screen.getByText('执行完成')).toBeInTheDocument();
  });

  test('错误状态显示错误信息', () => {
    render(<AgentExecutionPanel status="error" error="执行失败" />);
    expect(screen.getByText('执行失败')).toBeInTheDocument();
  });

  test('进度条显示', () => {
    render(<AgentExecutionPanel progress={50} />);
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试验证**

Run: `cd frontend && npm test -- --testPathPattern="AgentExecutionPanel.test.tsx" --watchAll=false 2>&1 | head -40`

---

### Task 6: HumanConfirmationDialog 测试

**Files:**
- Create: `frontend/src/components/agent/__tests__/HumanConfirmationDialog.test.tsx`

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import HumanConfirmationDialog from '../HumanConfirmationDialog';

describe('HumanConfirmationDialog', () => {
  test('显示确认标题', () => {
    render(<HumanConfirmationDialog title="确认删除" onConfirm={vi.fn()} />);
    expect(screen.getByText('确认删除')).toBeInTheDocument();
  });

  test('高风险显示红色警告', () => {
    render(<HumanConfirmationDialog riskLevel="high" onConfirm={vi.fn()} />);
    expect(screen.getByText(/危险操作/i)).toBeInTheDocument();
  });

  test('倒计时显示', () => {
    vi.useFakeTimers();
    render(<HumanConfirmationDialog timeout={60} onConfirm={vi.fn()} />);
    
    expect(screen.getByText('60')).toBeInTheDocument();
    
    vi.advanceTimersByTime(1000);
    expect(screen.getByText('59')).toBeInTheDocument();
    
    vi.useRealTimers();
  });

  test('确认按钮调用 onConfirm', () => {
    const onConfirm = vi.fn();
    render(<HumanConfirmationDialog onConfirm={onConfirm} />);
    
    fireEvent.click(screen.getByRole('button', { name: /确认/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  test('取消按钮调用 onCancel', () => {
    const onCancel = vi.fn();
    render(<HumanConfirmationDialog onCancel={onCancel} />);
    
    fireEvent.click(screen.getByRole('button', { name: /取消/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  test('快捷键 Y 确认', () => {
    const onConfirm = vi.fn();
    render(<HumanConfirmationDialog onConfirm={onConfirm} />);
    
    fireEvent.keyDown(document, { key: 'y', shiftKey: false });
    expect(onConfirm).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试验证**

Run: `cd frontend && npm test -- --testPathPattern="HumanConfirmationDialog.test.tsx" --watchAll=false 2>&1 | head -40`

---

### Task 7: ToolMarketplace 测试

**Files:**
- Create: `frontend/src/components/agent/__tests__/ToolMarketplace.test.tsx`

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import ToolMarketplace from '../ToolMarketplace';

describe('ToolMarketplace', () => {
  test('显示工具列表', () => {
    const tools = [
      { id: '1', name: '搜索工具', enabled: true },
      { id: '2', name: '计算器', enabled: false }
    ];
    
    render(<ToolMarketplace tools={tools} />);
    expect(screen.getByText('搜索工具')).toBeInTheDocument();
    expect(screen.getByText('计算器')).toBeInTheDocument();
  });

  test('搜索过滤工具', () => {
    const tools = [
      { id: '1', name: 'Web搜索' },
      { id: '2', name: '图片搜索' }
    ];
    
    render(<ToolMarketplace tools={tools} />);
    const searchInput = screen.getByPlaceholderText(/搜索工具/i);
    fireEvent.change(searchInput, { target: { value: 'Web' } });
    
    expect(screen.getByText('Web搜索')).toBeInTheDocument();
    expect(screen.queryByText('图片搜索')).not.toBeInTheDocument();
  });

  test('启用/禁用切换', () => {
    const onToggle = vi.fn();
    render(<ToolMarketplace tools={[{ id: '1', name: '工具', enabled: true }]} onToggle={onToggle} />);
    
    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);
    
    expect(onToggle).toHaveBeenCalledWith('1');
  });

  test('分类筛选', () => {
    render(<ToolMarketplace categories={['搜索', '工具']} selectedCategory="搜索" />);
    expect(screen.getByText('搜索')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试验证**

Run: `cd frontend && npm test -- --testPathPattern="ToolMarketplace.test.tsx" --watchAll=false 2>&1 | head -40`

---

### Task 8: PerformanceMonitor 测试

**Files:**
- Create: `frontend/src/components/agent/__tests__/PerformanceMonitor.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import PerformanceMonitor from '../PerformanceMonitor';

describe('PerformanceMonitor', () => {
  test('显示响应时间', () => {
    render(<PerformancePanel metrics={{ responseTime: 150 }} />);
    expect(screen.getByText('150ms')).toBeInTheDocument();
  });

  test('显示错误率', () => {
    render(<PerformanceMonitor metrics={{ errorRate: 5 }} />);
    expect(screen.getByText('5%')).toBeInTheDocument();
  });

  test('显示吞吐量', () => {
    render(<PerformanceMonitor metrics={{ throughput: 100 }} />);
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  test('告警阈值显示警告', () => {
    render(<PerformanceMonitor metrics={{ responseTime: 5000 }} alertThreshold={3000} />);
    expect(screen.getByText(/警告/i)).toBeInTheDocument();
  });

  test('图表数据渲染', () => {
    const chartData = [
      { time: '10:00', value: 100 },
      { time: '11:00', value: 150 }
    ];
    
    render(<PerformanceMonitor chartData={chartData} />);
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.getByText('11:00')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试验证**

Run: `cd frontend && npm test -- --testPathPattern="PerformanceMonitor.test.tsx" --watchAll=false 2>&1 | head -40`

---

### Task 9-12: AgentTeamOrchestrator, AgentDebugger, AgentCollaborationPanel, ThinkingChain

**并行派发 subagent 执行剩余测试**

---

## 验收标准

- [ ] 所有 12 个组件测试文件创建
- [ ] 每个组件至少 5 个测试用例
- [ ] 所有测试通过
- [ ] 代码覆盖率 > 70%

## 风险缓解

| 风险 | 缓解 |
|------|------|
| 组件依赖复杂 Store | 使用 vi.mock 隔离 |
| 异步 SSE 事件 | 使用 fake timers |
| 大型组件测试困难 | 分解为多个测试用例 |