# SimpleAgent 上线验收修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 E2E 测试失败问题、解决 WelcomeGuide 遮挡、完善 AgentVisualizer 数据驱动、运行 TDD 测试达成上线验收标准

**Architecture:** 基于调研结果，针对性修复：1) WelcomeGuide 改为可跳过模式 2) AgentVisualizer 添加真实 SSE 订阅 3) E2E 测试使用更精确选择器 4) 执行完整 TDD 测试

**Tech Stack:** Playwright, Vitest, SSE, Zustand, Next.js 16

---

## Task 1: 修复 WelcomeGuide 遮挡问题

**Files:**
- Modify: `frontend/src/components/WelcomeGuide.tsx:150-200`
- Test: `frontend/tests/e2e/user-stories/chat-flow.spec.ts`

### 场景分析
根据调研，WelcomeGuide 在首次加载时显示全屏模态框 (`fixed inset-0 z-[100]`)，导致底部的设置按钮无法点击。这是 E2E 测试失败的主因。

- [ ] **Step 1: 添加跳过按钮到 WelcomeGuide**

在 `WelcomeGuide.tsx` 的 welcome 步骤中添加"跳过引导"按钮：

```tsx
// 在 welcome 步骤的底部添加跳过按钮 (约 line 200)
<button
  onClick={() => setStep('complete')}
  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
>
  跳过引导
</button>
```

- [ ] **Step 2: 验证组件可正常跳过**

Run: `grep -n "skip\|跳过" frontend/src/components/WelcomeGuide.tsx`
Expected: 找到跳过相关代码

- [ ] **Step 3: 更新 E2E 测试关闭 WelcomeGuide**

修改 `frontend/tests/e2e/user-stories/chat-flow.spec.ts`：

```typescript
// 在每个测试的 beforeEach 中添加
await page.goto('http://localhost:3001');
// 关闭 WelcomeGuide 模态框
const skipButton = page.locator('button:has-text("跳过引导"), button:has-text("跳过"), [aria-label="关闭"]');
await skipButton.click().catch(() => {});
// 等待模态框关闭
await page.waitForTimeout(500);
```

- [ ] **Step 4: 运行 E2E 测试验证**

Run: `cd frontend && npx playwright test tests/e2e/user-stories/chat-flow.spec.ts --reporter=line 2>&1 | tail -20`
Expected: 设置面板测试通过

---

## Task 2: 修复 ChatInput 模型搜索功能

**Files:**
- Modify: `frontend/src/components/ChatInput.tsx:280-320`
- Test: `frontend/src/components/__tests__/ChatInput.test.tsx`

### 场景分析
根据调研，`ChatInput` 组件有模型搜索框 (`id="model-search"`) 但没有实现 `onChange` 过滤逻辑。

- [ ] **Step 1: 添加模型搜索过滤功能**

在 `ChatInput.tsx` 中添加搜索状态和处理函数：

```typescript
// 在组件内添加状态 (约 line 50)
const [modelSearch, setModelSearch] = useState('');

// 在 JSX 的模型选择器部分添加 onChange
<input
  id="model-search"
  type="text"
  placeholder="搜索模型..."
  value={modelSearch}
  onChange={(e) => setModelSearch(e.target.value)}
  className="px-3 py-1.5 text-sm border rounded-lg w-full"
/>

// 修改模型列表渲染，添加过滤
配置好的模型.filter((m) =>
  m.name.toLowerCase().includes(modelSearch.toLowerCase())
).map((model) => ...)
```

- [ ] **Step 2: 添加测试用例**

在 `frontend/src/components/__tests__/ChatInput.test.tsx` 添加：

```typescript
test('模型搜索过滤功能', async () => {
  render(<ChatInput onSend={vi.fn()} />);

  // 打开模型选择器
  await fireEvent.click(screen.getByRole('button', { name: /模型/i }));

  // 输入搜索
  const searchInput = screen.getByPlaceholderText(/搜索模型/i);
  fireEvent.change(searchInput, { target: { value: 'MiniMax' } });

  // 验证过滤结果 (根据实际模型数量调整)
  const modelButtons = screen.getAllByRole('button', { name: /MiniMax/i });
  expect(modelButtons.length).toBeGreaterThan(0);
});
```

- [ ] **Step 3: 运行测试**

Run: `cd frontend && npm test -- --testPathPattern="ChatInput.test.tsx" --watchAll=false 2>&1 | tail -30`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/ChatInput.tsx
git commit -m "fix(ChatInput): 添加模型搜索过滤功能"
```

---

## Task 3: 修复 Message 编辑保存功能

**Files:**
- Modify: `frontend/src/components/Message.tsx:200-250`
- Test: `frontend/src/components/__tests__/Message.test.tsx`

### 场景分析
根据调研，Message 组件的 `isEditing` 状态设置了，但保存按钮没有实际保存逻辑。

- [ ] **Step 1: 修复编辑保存功能**

在 `Message.tsx` 的编辑模式中添加保存回调：

```typescript
// 找到保存按钮，添加 onClick 处理
<Button
  onClick={() => {
    if (onEdit) {
      onEdit(editContent);
      setIsEditing(false);
    }
  }}
  disabled={!editContent.trim()}
>
  保存
</Button>
```

需要确保 `MessageProps` 包含 `onEdit` 回调：

```typescript
interface MessageProps {
  // ... existing props
  onEdit?: (content: string) => void;
}
```

- [ ] **Step 2: 更新测试**

```typescript
test('编辑消息后保存', async () => {
  const handleEdit = vi.fn();
  render(<Message message={mockMessage} isLast={true} onEdit={handleEdit} />);

  // 点击编辑按钮
  await fireEvent.click(screen.getByRole('button', { name: /编辑/i }));

  // 修改内容
  const textarea = screen.getByRole('textbox');
  fireEvent.change(textarea, { target: { value: '新内容' } });

  // 点击保存
  await fireEvent.click(screen.getByRole('button', { name: /保存/i }));

  expect(handleEdit).toHaveBeenCalledWith('新内容');
});
```

- [ ] **Step 3: 运行测试**

Run: `cd frontend && npm test -- --testPathPattern="Message.test.tsx" --watchAll=false 2>&1 | tail -30`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/Message.tsx frontend/src/components/__tests__/Message.test.tsx
git commit -m "fix(Message): 完善编辑保存功能"
```

---

## Task 4: AgentVisualizer SSE 数据订阅修复

**Files:**
- Modify: `frontend/src/components/agent/AgentVisualizer.tsx:200-300`
- Modify: `frontend/src/hooks/useAgentSSE.ts`
- Test: `frontend/src/components/agent/__tests__/AgentVisualizer.test.tsx`

### 场景分析
根据调研，AgentVisualizer 已有 `spanToTimelineItem` 转换函数和 `ResponsiveModal` 集成，但 SSE 订阅需要完善以获取真实 trace 数据。

- [ ] **Step 1: 添加 SSE 订阅 hook**

创建/更新 `frontend/src/hooks/useAgentSSE.ts`：

```typescript
import { useState, useEffect, useCallback } from 'react';

interface TraceEvent {
  type: 'span_update' | 'trace_complete' | 'trace_start';
  data: ApiSpan | ApiTrace;
  timestamp: number;
}

export function useTraceSubscription(traceId?: string) {
  const [spans, setSpans] = useState<ApiSpan[]>([]);
  const [trace, setTrace] = useState<ApiTrace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!traceId) return;

    const eventSource = new EventSource(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/traces/subscribe/live?traceId=${traceId}`
    );

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as TraceEvent;
        if (data.type === 'span_update') {
          setSpans(prev => [...prev, data.data as ApiSpan]);
        } else if (data.type === 'trace_complete') {
          setTrace(data.data as ApiTrace);
        }
      } catch (e) {
        setError('Failed to parse SSE data');
      }
    };

    eventSource.onerror = () => {
      setError('SSE connection error');
    };

    return () => eventSource.close();
  }, [traceId]);

  return { spans, trace, error };
}
```

- [ ] **Step 2: 更新 AgentVisualizer 集成 SSE**

在 `AgentVisualizer.tsx` 中添加 SSE 数据源：

```typescript
// 添加 SSE hook
const { spans, trace, error } = useTraceSubscription(traceId);

// 修改数据源：优先使用 SSE 数据，否则使用 props
const timelineItems = useMemo(() => {
  if (spans.length > 0) {
    return spans.map(span => spanToTimelineItem(span, spans, 0));
  }
  return props.timeline || [];
}, [spans, props.timeline]);
```

- [ ] **Step 3: 添加测试用例**

创建 `frontend/src/components/agent/__tests__/AgentVisualizer.test.tsx`：

```typescript
describe('AgentVisualizer SSE Integration', () => {
  test('从 SSE 接收 span 更新', async () => {
    // Mock SSE
    const mockSpans = [
      { spanId: '1', name: 'intent_classify', status: 'ok', ... },
    ];

    render(<AgentVisualizer traceId="test-trace" />);

    // 验证初始状态
    expect(screen.getByText(/等待执行/i)).toBeInTheDocument();
  });

  test('错误状态显示', () => {
    render(<AgentVisualizer error="SSE 连接失败" />);
    expect(screen.getByText(/SSE 连接失败/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: 运行测试**

Run: `cd frontend && npm test -- --testPathPattern="AgentVisualizer.test.tsx" --watchAll=false 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/hooks/useAgentSSE.ts frontend/src/components/agent/AgentVisualizer.tsx
git commit -m "feat(AgentVisualizer): 集成 SSE trace 数据订阅"
```

---

## Task 5: 修复 HitlConfirmationDialog 倒计时功能

**Files:**
- Modify: `frontend/src/components/agent/HumanConfirmationDialog.tsx:80-120`
- Test: `frontend/src/components/agent/__tests__/HumanConfirmationDialog.test.tsx`

### 场景分析
根据 E2E 测试结果，HITL 倒计时功能测试失败。需要检查倒计时逻辑是否正确实现。

- [ ] **Step 1: 检查并修复倒计时实现**

```typescript
// 在 HumanConfirmationDialog 中确保倒计时逻辑
useEffect(() => {
  if (!isOpen || timeout <= 0) return;

  const interval = setInterval(() => {
    setCountdown(prev => {
      if (prev <= 1) {
        onCancel?.();
        return 0;
      }
      return prev - 1;
    });
  }, 1000);

  return () => clearInterval(interval);
}, [isOpen, timeout, onCancel]);
```

- [ ] **Step 2: 更新测试**

```typescript
test('倒计时正确递减', async () => {
  vi.useFakeTimers();
  render(<HumanConfirmationDialog isOpen={true} timeout={10} onConfirm={vi.fn()} onCancel={vi.fn()} />);

  expect(screen.getByText('10')).toBeInTheDocument();

  // 快进 3 秒
  await vi.advanceTimersByTimeAsync(3000);
  expect(screen.getByText('7')).toBeInTheDocument();

  vi.useRealTimers();
});

test('倒计时结束自动取消', async () => {
  vi.useFakeTimers();
  const onCancel = vi.fn();
  render(<HumanConfirmationDialog isOpen={true} timeout={5} onCancel={onCancel} />);

  // 快进 5 秒
  await vi.advanceTimersByTimeAsync(5000);
  expect(onCancel).toHaveBeenCalled();

  vi.useRealTimers();
});
```

- [ ] **Step 3: 运行测试**

Run: `cd frontend && npm test -- --testPathPattern="HumanConfirmationDialog.test.tsx" --watchAll=false 2>&1 | tail -30`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/agent/HumanConfirmationDialog.tsx
git commit -m "fix(HITL): 修复倒计时自动取消功能"
```

---

## Task 6: 完整 TDD 测试验证

**Files:**
- Test: `frontend/src/components/__tests__/*.test.tsx`
- Test: `frontend/src/components/agent/__tests__/*.test.tsx`

- [ ] **Step 1: 运行所有前端测试**

Run: `cd frontend && npm test -- --run --reporter=dot 2>&1 | tail -50`
Expected: 所有测试通过

- [ ] **Step 2: 检查测试覆盖率**

Run: `cd frontend && npm test -- --run --coverage 2>&1 | grep -E "coverage|%"`
Expected: 行覆盖率 >70%

- [ ] **Step 3: 提交测试结果**

```bash
git add -A
git commit -m "test: 完整 TDD 测试覆盖验证"
```

---

## Task 7: 完整 E2E 测试验证

**Files:**
- Test: `frontend/tests/e2e/user-stories/*.spec.ts`

- [ ] **Step 1: 更新所有 E2E 测试关闭 WelcomeGuide**

在 `frontend/tests/e2e/user-stories/comprehensive.spec.ts` 的 `beforeEach` 中添加：

```typescript
beforeEach(async ({ page }) => {
  await page.goto('http://localhost:3001');
  // 关闭 WelcomeGuide
  const closeBtn = page.locator('button:has-text("跳过引导"), button:has-text("跳过")');
  await closeBtn.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
});
```

- [ ] **Step 2: 运行完整 E2E 测试**

Run: `cd frontend && npx playwright test tests/e2e/user-stories/ --reporter=line 2>&1 | tail -40`
Expected: 通过率 >80%

- [ ] **Step 3: 验证核心用户故事**

确保以下场景通过：
- [ ] US-001: 发送消息并收到回复
- [ ] US-010: Agent 模式切换
- [ ] US-020: HITL 确认对话框
- [ ] US-030: Trace 查看

---

## Task 8: 最终验收

- [ ] **Step 1: PM2 服务健康检查**

Run: `pm2 list && curl -s http://localhost:30000/api/health && curl -s -o /dev/null -w "%{http_code}" http://localhost:3001`
Expected: 所有服务 online

- [ ] **Step 2: 更新验收清单**

```bash
# 更新 .omc/ultragoal/2026-05-18-ux-acceptance-checklist.md
# 将通过的模块标记为完成
```

- [ ] **Step 3: 最终提交**

```bash
git add -A
git commit -m "feat: SimpleAgent v2.5.1 上线验收完成"
```

---

## 验收标准

| 任务 | 验收条件 | 实际结果 |
|------|----------|----------|
| Task 1 | WelcomeGuide 可跳过，E2E 测试通过 | ⬜ |
| Task 2 | 模型搜索功能正常 | ⬜ |
| Task 3 | 消息编辑保存功能正常 | ⬜ |
| Task 4 | AgentVisualizer SSE 数据订阅正常 | ⬜ |
| Task 5 | HITL 倒计时功能正常 | ⬜ |
| Task 6 | TDD 测试 100% 通过 | ⬜ |
| Task 7 | E2E 测试通过率 >80% | ⬜ |
| Task 8 | 所有服务健康，项目可上线 | ⬜ |

## 风险缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| WelcomeGuide 遮挡 | E2E 测试失败 | 添加跳过按钮，更新测试 |
| SSE 连接不稳定 | 可视化无数据 | 添加错误状态显示，本地缓存 |
| 后端 503 错误 | E2E 测试超时 | 增加等待时间，使用 networkidle 替代 |