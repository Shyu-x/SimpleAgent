# AgentVisualizer 数据驱动与响应式修复方案

**日期**: 2026-05-18
**状态**: 待审核
**优先级**: P1

## 1. 问题概述

### 问题 1: AgentVisualizer 无数据驱动
- **现状**: `AgentVisualizer` 组件只接受 `traceId` prop，但无实际数据来源
- **影响**: Agent 执行时无可视化展示，业务功能无法验证
- **根因**: 缺少 Agent 执行与 trace 数据的实时关联

### 问题 2: 弹窗超出视口
- **现状**: Modal/Dialog 在移动端或小屏幕下溢出
- **影响**: 用户无法看到完整内容，无法交互
- **根因**: 缺少响应式 CSS 约束

## 2. 技术方案

### 2.1 数据流架构

```
User Message
     ↓
AgentEngine (ReAct Loop)
     ↓
Span Creation (每步执行)
     ↓
TraceStore (内存) + SSE Broadcasting
     ↓
前端订阅 (AgentVisualizer / MissionControl)
```

### 2.2 修改范围

| 层级 | 文件 | 修改内容 |
|------|------|----------|
| Backend | `src/services/agentEngine.js` | Agent 执行时推送 trace 数据到 SSE |
| Backend | `src/routes/admin/trace.js` | 添加 SSE trace 广播端点 |
| Frontend | `components/agent/AgentVisualizer.tsx` | SSE 实时订阅 + 响应式 Modal 包装 |
| Frontend | `components/agent/MissionControl/index.tsx` | 嵌入 mini 可视化 |
| Frontend | `components/ui/ResponsiveModal.tsx` | 新建响应式弹窗包装器 |

## 3. 详细实现

### 3.1 后端修改

#### 3.1.1 AgentEngine Trace 推送

**文件**: `backend/src/services/agentEngine.js`

**修改内容**:
1. Agent 初始化时生成 `traceId`
2. 每个 ReAct 步骤执行后创建 `Span` 并存储
3. 通过 SSE 广播 trace 更新

```javascript
// 新增方法
class AgentEngine {
  // 初始化 trace
  initTrace() {
    this.traceId = generateTraceId();
    this.spans = [];
    this.startTime = Date.now();
  }

  // 记录 Span
  recordSpan(name, metadata = {}) {
    const span = {
      spanId: generateSpanId(),
      traceId: this.traceId,
      parentSpanId: this.currentParentSpanId,
      name,
      startTime: Date.now(),
      endTime: null,
      duration: null,
      status: 'running',
      tags: metadata,
      events: [],
      childCount: 0
    };
    this.spans.push(span);
    this.currentParentSpanId = span.spanId;

    // SSE 广播 (如果已连接)
    if (this.traceSSEClients.size > 0) {
      this.broadcastSpan(span);
    }
    return span;
  }

  // 完成 Span
  completeSpan(spanId, status = 'ok', extraTags = {}) {
    const span = this.spans.find(s => s.spanId === spanId);
    if (span) {
      span.endTime = Date.now();
      span.duration = span.endTime - span.startTime;
      span.status = status;
      Object.assign(span.tags, extraTags);

      // SSE 广播
      if (this.traceSSEClients.size > 0) {
        this.broadcastSpan(span);
      }
    }
  }

  // 完成 trace
  finalizeTrace() {
    const trace = {
      traceId: this.traceId,
      operationName: this.prompt?.substring(0, 100) || 'agent_execution',
      serviceName: 'agent-engine',
      startTime: this.startTime,
      endTime: Date.now(),
      duration: Date.now() - this.startTime,
      status: this.errorCount > 0 ? 'error' : 'ok',
      totalSpans: this.spans.length,
      spans: this.spans
    };

    // 存储到 traceStore (需要引用)
    // 广播最终 trace
    return trace;
  }
}
```

#### 3.1.2 Trace SSE 广播端点

**文件**: `backend/src/routes/admin/trace.js`

**新增端点**:
```
GET /api/admin/traces/subscribe/live
```
- 功能: 实时订阅所有 trace 更新
- 数据格式: `{ type: 'span_update' | 'trace_complete', data: {...}, timestamp }`

### 3.2 前端修改

#### 3.2.1 响应式 Modal 包装器

**文件**: `frontend/src/components/ui/ResponsiveModal.tsx` (新建)

```tsx
interface ResponsiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  position?: 'center' | 'bottom';
}

export function ResponsiveModal({ isOpen, onClose, title, children, size = 'lg', position = 'center' }: ResponsiveModalProps) {
  // 断点检测
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 移动端: 底部抽屉
  if (isMobile || position === 'bottom') {
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl max-h-[90vh] overflow-hidden"
          >
            <div className="p-4 border-b">
              <div className="flex justify-between items-center">
                {title && <h2 className="text-lg font-semibold">{title}</h2>}
                <button onClick={onClose}>×</button>
              </div>
            </div>
            <div className="overflow-y-auto max-h-[calc(90vh-60px)] p-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // Desktop: 居中弹窗
  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-4xl'
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className={`bg-white rounded-xl shadow-2xl w-full ${sizeClasses[size]} max-h-[90vh] overflow-hidden`}
            onClick={e => e.stopPropagation()}
          >
            {title && (
              <div className="p-4 border-b">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-semibold">{title}</h2>
                  <button onClick={onClose} className="text-gray-500 hover:text-gray-700">×</button>
                </div>
              </div>
            )}
            <div className="overflow-y-auto max-h-[calc(90vh-60px)] p-4">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

#### 3.2.2 AgentVisualizer 改造

**文件**: `frontend/src/components/agent/AgentVisualizer.tsx`

**修改内容**:
1. 添加 SSE 订阅获取实时 trace 数据
2. 使用 `ResponsiveModal` 包装
3. 支持直接接收 trace 数据而非仅 traceId

```tsx
// 新增: SSE 订阅 hook
function useTraceSubscription(traceId?: string) {
  const [trace, setTrace] = useState<TraceData | null>(null);
  const [steps, setSteps] = useState<TimelineItem[]>([]);

  useEffect(() => {
    if (!traceId) return;

    // SSE 订阅
    const eventSource = new EventSource(`/api/admin/traces/subscribe/live?traceId=${traceId}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'span_update') {
        setSteps(prev => [...prev, transformSpanToTimelineItem(data.data)]);
      } else if (data.type === 'trace_complete') {
        setTrace(data.data);
      }
    };

    return () => eventSource.close();
  }, [traceId]);

  return { trace, steps };
}
```

#### 3.2.3 MissionControl 嵌入

**文件**: `frontend/src/components/agent/MissionControl/index.tsx`

**修改内容**:
1. 添加 mini 可视化状态
2. 任务执行时显示 mini 可视化
3. 点击可展开完整视图

```tsx
// 在 MissionControl 中添加
const [showMiniViz, setShowMiniViz] = useState(false);
const [activeTraceId, setActiveTraceId] = useState<string | null>(null);

// 任务开始执行时
useEffect(() => {
  const executingTask = tasks.find(t => t.status === 'in_progress');
  if (executingTask?.traceId) {
    setActiveTraceId(executingTask.traceId);
    setShowMiniViz(true);
  }
}, [tasks]);

// 渲染 mini 可视化
{showMiniViz && activeTraceId && (
  <div className="fixed bottom-4 right-4 w-80 h-60 bg-white rounded-lg shadow-xl z-40">
    <AgentVisualizerMini
      traceId={activeTraceId}
      onExpand={() => setShowFullViz(true)}
      onClose={() => setShowMiniViz(false)}
    />
  </div>
)}
```

### 3.3 响应式 CSS 约束

**通用规则** (添加到 global CSS 或 Tailwind 配置):

```css
/* 响应式容器约束 */
.modal-container {
  width: 100%;
  max-width: 100%;
  max-height: 100vh;
  overflow: hidden;
}

@media (min-width: 640px) {
  .modal-container {
    max-width: 90vw;
    max-height: 90vh;
  }
}

@media (min-width: 1024px) {
  .modal-container {
    max-width: 800px;
    max-height: 85vh;
  }
}

/* 移动端全屏 */
@media (max-width: 639px) {
  .modal-container {
    position: fixed;
    inset: 0;
    max-height: 100vh;
    border-radius: 0;
  }
}

/* 内容区域滚动 */
.modal-content {
  overflow-y: auto;
  max-height: calc(var(--modal-height, 90vh) - var(--modal-header, 60px));
}
```

## 4. API 设计

### 4.1 SSE Trace 订阅

```
GET /api/admin/traces/subscribe/live
Query Params:
  - traceId (optional): 订阅特定 trace，否则订阅所有

Response (SSE):
  event: span_update
  data: {"type":"span_update","data":{"spanId":"...","name":"intent_classify","...},"timestamp":...}

  event: trace_complete
  data: {"type":"trace_complete","data":{"traceId":"...","...},"timestamp":...}
```

### 4.2 Trace 数据结构

```typescript
interface Span {
  spanId: string;
  traceId: string;
  parentSpanId: string | null;
  name: string;
  startTime: number;
  endTime: number | null;
  duration: number | null;
  status: 'running' | 'ok' | 'error';
  tags: Record<string, string>;
  events: Array<{ name: string; timestamp: number; data: Record<string, unknown> }>;
  childCount: number;
}

interface Trace {
  traceId: string;
  operationName: string;
  serviceName: string;
  startTime: number;
  endTime: number;
  duration: number;
  status: 'ok' | 'error' | 'running';
  totalSpans: number;
  spans: Span[];
}
```

## 5. 验收标准

### 5.1 AgentVisualizer 数据驱动
- [ ] Agent 执行时自动创建 traceId
- [ ] 每个 ReAct 步骤产生对应 Span
- [ ] 前端通过 SSE 实时接收 Span 更新
- [ ] 可视化组件实时显示执行流程
- [ ] 执行完成后显示完整统计

### 5.2 MissionControl 嵌入
- [ ] 任务执行时自动显示 mini 可视化
- [ ] Mini 可视化显示关键步骤
- [ ] 点击可展开完整视图

### 5.3 响应式适配
- [ ] Desktop (>=1024px): 居中 Modal, max-width 800px
- [ ] Tablet (640-1023px): 居中 Modal, max-width 90vw
- [ ] Mobile (<640px): 底部抽屉, 全屏

### 5.4 兼容性
- [ ] 无 traceId 时显示友好提示
- [ ] 网络错误时显示错误状态
- [ ] 加载中显示 loading 状态

## 6. 实现顺序

1. **Phase 1**: 响应式 Modal 包装器 (`ResponsiveModal.tsx`)
2. **Phase 2**: 后端 Trace 推送集成 (`agentEngine.js` + `trace.js`)
3. **Phase 3**: 前端 SSE 订阅 (`AgentVisualizer.tsx`)
4. **Phase 4**: MissionControl 嵌入 (`MissionControl/index.tsx`)
5. **Phase 5**: 测试与验证

## 7. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| SSE 连接不稳定 | 数据丢失 | 重连机制 + 本地缓存 |
| 大量 trace 数据 | 内存占用 | 限制存储数量 + 定期清理 |
| 移动端性能 | 卡顿 | 按需渲染 + 虚拟列表 |

## 8. 依赖项

- `framer-motion`: 动画 (已安装)
- `lucide-react`: 图标 (已安装)
- Tailwind CSS: 响应式 (已配置)