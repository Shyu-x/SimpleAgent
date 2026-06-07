# AgentVisualizer 数据驱动与响应式修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 AgentVisualizer 组件添加数据驱动支持（通过 SSE 实时订阅），并修复弹窗超出视口的响应式问题

**Architecture:**
1. 创建响应式 Modal 包装器，支持 Desktop 居中弹窗和移动端底部抽屉
2. 后端 AgentEngine 集成 trace 推送，在每个 ReAct 步骤创建 Span 并通过 SSE 广播
3. 前端 AgentVisualizer 组件通过 SSE 订阅实时数据，使用响应式 Modal 包装
4. MissionControl 嵌入 mini 可视化，任务执行时自动显示

**Tech Stack:** React 19, TypeScript, Tailwind CSS, framer-motion, SSE

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `frontend/src/components/ui/ResponsiveModal.tsx` | 新建：响应式弹窗包装器 |
| `backend/src/services/agentEngine.js` | 修改：集成 trace 推送 |
| `backend/src/routes/admin/trace.js` | 修改：添加 SSE trace 广播端点 |
| `frontend/src/components/agent/AgentVisualizer.tsx` | 修改：SSE 订阅 + 响应式 Modal |
| `frontend/src/components/agent/MissionControl/index.tsx` | 修改：嵌入 mini 可视化 |

---

## Task 1: 创建响应式 Modal 包装器

**Files:**
- Create: `frontend/src/components/ui/ResponsiveModal.tsx`

- [ ] **Step 1: 创建 ResponsiveModal.tsx 文件**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface ResponsiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  position?: 'center' | 'bottom';
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-4xl'
};

export function ResponsiveModal({
  isOpen,
  onClose,
  title,
  children,
  size = 'lg',
  position = 'center'
}: ResponsiveModalProps) {
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
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40"
              onClick={onClose}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl max-h-[90vh] overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  {title && <h2 className="text-lg font-semibold text-gray-900">{title}</h2>}
                  <button
                    onClick={onClose}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    aria-label="关闭"
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto max-h-[calc(90vh-80px)] p-4">
                {children}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  // Desktop: 居中弹窗
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
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`bg-white rounded-xl shadow-2xl w-full ${sizeClasses[size]} max-h-[90vh] overflow-hidden`}
            onClick={e => e.stopPropagation()}
          >
            {title && (
              <div className="p-4 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                  <button
                    onClick={onClose}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    aria-label="关闭"
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
              </div>
            )}
            <div className="overflow-y-auto max-h-[calc(90vh-80px)] p-4">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ResponsiveModal;
```

- [ ] **Step 2: 验证文件创建成功**

Run: `ls -la frontend/src/components/ui/ResponsiveModal.tsx`
Expected: 文件存在

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/ui/ResponsiveModal.tsx
git commit -m "feat(ui): add ResponsiveModal component with mobile bottom-sheet support"
```

---

## Task 2: 后端 AgentEngine trace 推送集成

**Files:**
- Modify: `backend/src/services/agentEngine.js` (约 line 30-80, 添加 trace 初始化和 span 记录)

- [ ] **Step 1: 读取当前 agentEngine.js 关键部分**

Run: `head -100 backend/src/services/agentEngine.js`
Expected: 看到 AgentEngine 类定义

- [ ] **Step 2: 添加 trace 相关属性到 AgentEngine 构造函数**

在 AgentEngine 类构造函数中添加:
```javascript
// Trace 功能
this.traceId = null;
this.spans = [];
this.startTime = null;
this.currentParentSpanId = null;
```

- [ ] **Step 3: 添加 trace 初始化方法**

在 `init()` 方法后添加:
```javascript
/**
 * 初始化 trace
 */
initTrace() {
  this.traceId = this._generateTraceId();
  this.spans = [];
  this.startTime = Date.now();
  this.currentParentSpanId = null;
  this.logger?.info('Trace initialized', { traceId: this.traceId });
}

/**
 * 生成 trace ID
 */
_generateTraceId() {
  return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 生成 span ID
 */
_generateSpanId() {
  return `span_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 记录 span
 */
recordSpan(name, metadata = {}) {
  if (!this.traceId) {
    this.initTrace();
  }

  const span = {
    spanId: this._generateSpanId(),
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
  this.logger?.debug('Span recorded', { spanId: span.spanId, name });

  // 广播到 SSE (通过 global event emitter)
  if (global.traceEventEmitter) {
    global.traceEventEmitter.emit('span_update', span);
  }

  return span;
}

/**
 * 完成 span
 */
completeSpan(spanId, status = 'ok', extraTags = {}) {
  const span = this.spans.find(s => s.spanId === spanId);
  if (span) {
    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status;
    Object.assign(span.tags, extraTags);

    if (global.traceEventEmitter) {
      global.traceEventEmitter.emit('span_update', span);
    }
  }
}

/**
 * 完成 trace
 */
finalizeTrace() {
  if (!this.traceId) return null;

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

  // 存储到 trace store (通过 API)
  if (global.traceEventEmitter) {
    global.traceEventEmitter.emit('trace_complete', trace);
  }

  this.logger?.info('Trace finalized', {
    traceId: trace.traceId,
    totalSpans: trace.totalSpans,
    duration: trace.duration
  });

  return trace;
}
```

- [ ] **Step 4: 在 execute() 方法的关键步骤调用 recordSpan**

找到 execute() 方法中的 ReAct 循环，在以下位置添加 span 记录:
1. 在 `thinking` 步骤开始时: `this.recordSpan('agent_thinking', { step: loopCount })`
2. 在 `intent_classify` 调用前: `this.recordSpan('intent_classify')`
3. 在每个工具调用前: `this.recordSpan('tool_execution', { tool: toolName })`
4. 在模型调用前: `this.recordSpan('model_call', { model: modelName })`
5. 在结果聚合时: `this.recordSpan('result_aggregation')`

具体修改 (在 execute() 方法的 while 循环内):

```javascript
// 在 thinking 开始时
this.recordSpan('agent_thinking', { step: loopCount });

// 在 intent 分类前
const intentSpan = this.recordSpan('intent_classification', { query: userMessage.substring(0, 50) });
// ... intent 逻辑 ...
this.completeSpan(intentSpan.spanId, 'ok', { intent: intentResult });

// 在工具选择前
const toolSpan = this.recordSpan('tool_selection');
// ... 工具选择逻辑 ...
this.completeSpan(toolSpan.spanId, 'ok', { selectedTools: tools.join(',') });

// 在工具执行前
const execSpan = this.recordSpan('tool_execution', { tool: toolName, args: JSON.stringify(args).substring(0, 100) });
// ... 工具执行逻辑 ...
this.completeSpan(execSpan.spanId, result.error ? 'error' : 'ok', { success: !result.error });

// 在模型调用前
const modelSpan = this.recordSpan('model_call', { model: this.model });
// ... 模型调用逻辑 ...
this.completeSpan(modelSpan.spanId, 'ok');

// 在结果聚合时
const resultSpan = this.recordSpan('result_aggregation');
// ... 结果聚合逻辑 ...
this.completeSpan(resultSpan.spanId, 'ok');
```

- [ ] **Step 5: 在 execute() 方法开始处初始化 trace**

在 execute() 方法的第一行添加: `this.initTrace();`

- [ ] **Step 6: 在 execute() 方法结束处 finalize trace**

在 return 语句前添加:
```javascript
// 确保 trace 完成
const trace = this.finalizeTrace();
```

- [ ] **Step 7: 创建 EventEmitter 并导出**

在 `backend/src/common/` 下创建 `EventEmitter.js`:
```javascript
const { EventEmitter } = require('events');

class TraceEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }
}

global.traceEventEmitter = new TraceEventEmitter();

module.exports = { TraceEventEmitter };
```

- [ ] **Step 8: 在 agentEngine.js 顶部引入 EventEmitter**

```javascript
// 在文件顶部添加
require('../common/EventEmitter');
```

- [ ] **Step 9: 验证语法**

Run: `cd backend && node -c src/services/agentEngine.js`
Expected: Syntax OK

- [ ] **Step 10: 提交**

```bash
git add backend/src/services/agentEngine.js backend/src/common/EventEmitter.js
git commit -m "feat(agent): integrate trace span recording in AgentEngine"
```

---

## Task 3: 后端 Trace SSE 广播端点

**Files:**
- Modify: `backend/src/routes/admin/trace.js` (添加 SSE live 订阅端点)

- [ ] **Step 1: 在 trace.js 顶部添加 EventEmitter 引用**

在 `module.exports = router;` 之前添加:
```javascript
// SSE 广播客户端管理
const traceSSEClients = new Set();

// 确保 EventEmitter 已初始化
if (!global.traceEventEmitter) {
  require('../../common/EventEmitter');
}

const traceEmitter = global.traceEventEmitter;

// 广播 span 更新到所有客户端
traceEmitter.on('span_update', (span) => {
  const message = JSON.stringify({ type: 'span_update', data: span, timestamp: Date.now() });
  traceSSEClients.forEach(client => {
    try {
      client.write(`data: ${message}\n\n`);
    } catch (e) {
      traceSSEClients.delete(client);
    }
  });
});

// 广播 trace 完成到所有客户端
traceEmitter.on('trace_complete', (trace) => {
  const message = JSON.stringify({ type: 'trace_complete', data: trace, timestamp: Date.now() });
  traceSSEClients.forEach(client => {
    try {
      client.write(`data: ${message}\n\n`);
    } catch (e) {
      traceSSEClients.delete(client);
    }
  });
});
```

- [ ] **Step 2: 在 router.get('/') 之前添加 SSE live 端点**

```javascript
/**
 * GET /api/admin/traces/subscribe/live
 * 实时订阅 trace 更新 (SSE)
 */
router.get('/subscribe/live', (req, res) => {
  const { traceId: filterTraceId } = req.query;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // 添加到客户端集合
  traceSSEClients.add(res);

  // 发送连接成功消息
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    traceId: filterTraceId || null,
    timestamp: Date.now()
  })}\n\n`);

  // 清理函数
  const cleanup = () => {
    traceSSEClients.delete(res);
  };

  req.on('close', cleanup);
  req.on('error', cleanup);

  // 心跳保活
  const heartbeatId = setInterval(() => {
    try {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
    } catch (e) {
      clearInterval(heartbeatId);
      cleanup();
    }
  }, 30000);
});
```

- [ ] **Step 3: 在主文件入口加载 EventEmitter**

检查 `backend/src/index.js` 或 `backend/src/app.js`, 确保在路由加载前初始化 EventEmitter:
```javascript
// 在路由注册之前
require('./common/EventEmitter');
```

- [ ] **Step 4: 验证语法**

Run: `cd backend && node -c src/routes/admin/trace.js`
Expected: Syntax OK

- [ ] **Step 5: 提交**

```bash
git add backend/src/routes/admin/trace.js backend/src/index.js
git commit -m "feat(trace): add SSE live subscription endpoint for trace updates"
```

---

## Task 4: 前端 AgentVisualizer SSE 订阅与响应式改造

**Files:**
- Modify: `frontend/src/components/agent/AgentVisualizer.tsx`

- [ ] **Step 1: 添加 SSE 订阅 hook**

在组件内部添加:

```tsx
// SSE 订阅 hook
function useTraceSubscription(traceId?: string) {
  const [steps, setSteps] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!traceId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // 创建 SSE 连接
    const eventSource = new EventSource(`/api/admin/traces/subscribe/live?traceId=${traceId}`);

    eventSource.onopen = () => {
      setLoading(false);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'span_update') {
          const span = data.data;
          const timelineItem: TimelineItem = {
            id: span.spanId,
            type: span.name,
            name: span.name,
            status: span.status === 'ok' ? 'success' : span.status === 'error' ? 'error' : 'running',
            duration: span.duration || 0,
            depth: 0,
            startTime: span.startTime,
            endTime: span.endTime || Date.now(),
            metadata: span.tags
          };
          setSteps(prev => [...prev, timelineItem]);
        }
      } catch (e) {
        // 忽略解析错误
      }
    };

    eventSource.onerror = () => {
      setError('SSE 连接失败');
      setLoading(false);
    };

    return () => {
      eventSource.close();
    };
  }, [traceId]);

  return { steps, loading, error };
}
```

- [ ] **Step 2: 修改组件使用 ResponsiveModal**

导入:
```tsx
import ResponsiveModal from '@/components/ui/ResponsiveModal';
```

修改组件 props:
```tsx
interface AgentVisualizerProps {
  traceId?: string;
  isOpen?: boolean;
  onClose?: () => void;
  autoRefresh?: boolean;
  refreshInterval?: number;
}
```

修改组件使用 ResponsiveModal:
```tsx
const AgentVisualizer: React.FC<AgentVisualizerProps> = ({
  traceId,
  isOpen = false,
  onClose,
  autoRefresh = true,
  refreshInterval = 500
}) => {
  // ... 现有状态 ...

  // SSE 订阅
  const { steps, loading, error } = useTraceSubscription(traceId);

  // 使用 ResponsiveModal 包装
  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose || (() => {})}
      title="Agent 执行轨迹"
      size="xl"
    >
      {/* 现有内容 - 将 trace.steps 替换为 steps */}
      <div className="agent-visualizer">
        {/* ... 现有内容，替换 trace?.steps 为 steps ... */}
      </div>
    </ResponsiveModal>
  );
};
```

- [ ] **Step 3: 更新状态处理逻辑**

修改组件内部逻辑，使用 SSE 获取的 steps:
```tsx
// 移除或保留 fetchTrace，取决于是否需要 REST fallback
const fetchTrace = useCallback(async () => {
  if (!traceId) return;
  try {
    const response = await fetch(`/api/admin/traces/${traceId}`);
    if (!response.ok) throw new Error('获取轨迹失败');
    const json = await response.json();
    const data = json.data;
    if (data) {
      const transformed = transformTraceData(data);
      setSteps(transformed.steps);
    }
  } catch (err) {
    // SSE 接管，不再显示错误
  }
}, [traceId]);

// 如果同时需要 REST 和 SSE，可以合并
```

- [ ] **Step 4: 验证编译**

Run: `cd frontend && npx tsc --noEmit src/components/agent/AgentVisualizer.tsx 2>&1 | head -30`
Expected: 无错误或仅有无关警告

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/agent/AgentVisualizer.tsx
git commit -m "feat(agent): add SSE subscription and ResponsiveModal to AgentVisualizer"
```

---

## Task 5: MissionControl 嵌入 Mini 可视化

**Files:**
- Modify: `frontend/src/components/agent/MissionControl/index.tsx`

- [ ] **Step 1: 添加状态和导入**

在 MissionControl 组件中添加:
```tsx
// 添加状态
const [showMiniViz, setShowMiniViz] = useState(false);
const [activeTraceId, setActiveTraceId] = useState<string | null>(null);
const [showFullViz, setShowFullViz] = useState(false);

// 导入 AgentVisualizer
import AgentVisualizer from '../AgentVisualizer';
```

- [ ] **Step 2: 监听任务执行以显示 mini 可视化**

添加 useEffect:
```tsx
useEffect(() => {
  const executingTask = tasks.find(t => t.status === 'in_progress' || t.status === 'assigned');
  if (executingTask?.traceId && !showMiniViz) {
    setActiveTraceId(executingTask.traceId);
    setShowMiniViz(true);
  }
}, [tasks, showMiniViz]);
```

- [ ] **Step 3: 任务完成时隐藏 mini 可视化**

```tsx
useEffect(() => {
  const completedCount = tasks.filter(t => t.status === 'completed' || t.status === 'failed').length;
  if (completedCount > 0 && showMiniViz) {
    // 延迟隐藏，让用户看到完成状态
    const timer = setTimeout(() => setShowMiniViz(false), 2000);
    return () => clearTimeout(timer);
  }
}, [tasks, showMiniViz]);
```

- [ ] **Step 4: 渲染 mini 可视化组件**

在组件 return 的 JSX 中添加 (在最后的 </div> 之前):
```tsx
{/* Mini 可视化 */}
{showMiniViz && activeTraceId && (
  <motion.div
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    exit={{ scale: 0, opacity: 0 }}
    className="fixed bottom-4 right-4 w-96 h-72 bg-white rounded-xl shadow-2xl z-40 overflow-hidden border border-gray-200"
  >
    {/* Mini header */}
    <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4" />
        <span className="text-sm font-medium">执行中...</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowFullViz(true)}
          className="p-1 hover:bg-white/20 rounded transition-colors"
          title="展开"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowMiniViz(false)}
          className="p-1 hover:bg-white/20 rounded transition-colors"
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
    {/* Mini content - 简化的可视化 */}
    <div className="p-2 h-[calc(100%-44px)] overflow-y-auto">
      <div className="text-xs text-gray-500 mb-2">Trace: {activeTraceId?.substring(0, 12)}...</div>
      <div className="space-y-1">
        {tasks.filter(t => t.status === 'in_progress').map(task => (
          <div key={task.id} className="bg-indigo-50 rounded px-2 py-1 text-xs">
            执行: {task.name}
          </div>
        ))}
        {tasks.filter(t => t.status === 'completed').slice(-3).map(task => (
          <div key={task.id} className="bg-green-50 rounded px-2 py-1 text-xs flex items-center gap-1">
            <Check className="w-3 h-3 text-green-500" />
            {task.name}
          </div>
        ))}
      </div>
    </div>
  </motion.div>
)}

/* 完整可视化 Modal */
<AgentVisualizer
  isOpen={showFullViz}
  onClose={() => setShowFullViz(false)}
  traceId={activeTraceId || undefined}
/>
```

- [ ] **Step 5: 添加缺失的导入**

```tsx
import { Activity, Maximize2, X, Check } from 'lucide-react';
```

- [ ] **Step 6: 验证编译**

Run: `cd frontend && npx tsc --noEmit src/components/agent/MissionControl/index.tsx 2>&1 | head -30`
Expected: 无错误

- [ ] **Step 7: 提交**

```bash
git add frontend/src/components/agent/MissionControl/index.tsx
git commit -m "feat(mission): embed mini visualizer in MissionControl"
```

---

## Task 6: 端到端测试与验证

- [ ] **Step 1: 启动后端服务**

Run: `cd backend && pnpm dev` (后台运行)

- [ ] **Step 2: 启动前端服务**

Run: `cd frontend && pnpm dev` (后台运行)

- [ ] **Step 3: 测试 Agent 执行数据流**

1. 打开浏览器访问 http://localhost:3001
2. 进入 Agent 模式发送一条消息
3. 观察 AgentVisualizer 是否显示实时执行步骤
4. 验证响应式: 调整浏览器宽度检查 Modal 行为

- [ ] **Step 4: 验证验收标准**

检查清单:
- [ ] Agent 执行时自动创建 traceId
- [ ] 每个 ReAct 步骤产生对应 Span
- [ ] 前端通过 SSE 实时接收 Span 更新
- [ ] 可视化组件实时显示执行流程
- [ ] 执行完成后显示完整统计
- [ ] MissionControl 任务执行时自动显示 mini 可视化
- [ ] Desktop: 居中 Modal, max-width 800px
- [ ] Mobile: 底部抽屉, 全屏

- [ ] **Step 5: 提交最终代码**

```bash
git add -A
git commit -m "feat: complete AgentVisualizer data-driven and responsive fixes"
```

---

## 依赖检查清单

| 依赖 | 状态 | 如果缺失 |
|------|------|----------|
| framer-motion | 应已安装 | `cd frontend && pnpm add framer-motion` |
| lucide-react | 应已安装 | `cd frontend && pnpm add lucide-react` |
| express (backend) | 应已安装 | `cd backend && pnpm add express` |
| EventEmitter (node built-in) | 内置 | 无需安装 |

---

## 风险缓解

1. **SSE 连接失败**: AgentVisualizer 保留 REST fallback 获取完整 trace
2. **移动端性能**: mini 可视化使用简化的 UI，避免复杂渲染
3. **Trace 数据丢失**: 本地保留最新的 trace 数据用于回退