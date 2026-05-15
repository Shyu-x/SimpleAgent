# 架构整改 - routes 层收敛方案

**项目**: AI Chat 玩具
**日期**: 2026-05-15
**状态**: 调研完成，待执行

---

## 一、问题定位

### 1.1 问题文件清单

| 文件 | 行数 | 严重程度 | 主要问题 |
|------|------|----------|----------|
| `routes/chat.js` | 160行 | 🔴 严重 | 熔断器/指标/业务逻辑耦合 |
| `routes/execution.js` | 176行 | 🔴 严重 | 数据聚合/映射逻辑泄漏 |
| `routes/sessions.js` | 96行 | 🔴 紧急 | **内存状态泄漏** |
| `routes/multiagent.js` | - | 🟡 中等 | helper 逻辑未抽取 |

### 1.2 具体问题行号

#### routes/chat.js - 最严重耦合

| 行号 | 问题代码 | 不应在 routes 的原因 |
|------|----------|----------------------|
| **12-13** | `getBreakerWithPreset('minimax-api')` | 熔断器生命周期管理 |
| **16** | `getMetricsCollector` | 基础设施调用 |
| **28** | `chatRateLimiter` | 横切关注点 |
| **35-40** | `collector.startRequest/endRequest()` | 请求追踪 |
| **56-73** | `minimaxBreaker.execute()` + fallback | 熔断+降级逻辑 |
| **61-62** | `collector.incrementCounter/recordHistogram()` | 指标采集 |

#### routes/execution.js - 严重耦合

| 行号 | 问题代码 | 不应在 routes 的原因 |
|------|----------|----------------------|
| **27-48** | `result.tasks.map()` | 领域模型映射 |
| **50-63** | 日期范围过滤 `dateRange` | 业务规则 |
| **65-73** | 统计计算 `stats` | 数据聚合 |
| **165-174** | `mapTaskStatus()` | 状态转换 |

#### routes/sessions.js - 架构违规（最紧急）

| 行号 | 问题代码 | 违规类型 |
|------|----------|----------|
| **3** | `let sessions = []` | **内存状态泄漏** |
| **5** | `generateId()` | 领域逻辑 |
| **7-20** | `validate{}` 对象 | 参数校验逻辑 |
| **74-78** | 消息添加+自动生成标题 | 业务规则 |

---

## 二、目标架构

```
Client
  │
  ▼
Routes Layer (只做：参数校验、权限、响应组装)
  │
  ▼
Services Layer
  ├─ ChatService (扩展：熔断器+指标封装)
  ├─ SSEProxyService (新建：SSE 流式处理)
  ├─ SessionService (新建：替换内存 sessions)
  ├─ ExecutionService (新建：从 execution 迁移)
  └─ MetricsService (新建：收敛指标采集)
  │
  ▼
Infrastructure Layer
  ├─ CircuitBreaker
  ├─ MetricsCollector
  ├─ RateLimiter
  └─ Logger
```

### 2.1 架构原则

| 原则 | 说明 |
|------|------|
| **Routes 只做** | 参数校验、权限检查、响应组装 |
| **Services 承担** | 业务逻辑、数据聚合、外部调用 |
| **Middleware 处理** | 横切关注点 (熔断、限流、追踪、日志) |

---

## 三、迁移方案（按优先级）

### Phase P0: sessions.js - 紧急修复

**问题**: `let sessions = []` 内存状态，服务重启丢失

**步骤**:
1. 创建 `services/SessionService.js`
   - 替换内存数组为持久化存储
   - 封装 CRUD 操作
2. 修改 `routes/sessions.js`
   - 移除 `let sessions = []`
   - 委托 `SessionService` 处理
3. 验证前端功能不受影响

**风险**: 🔴 高 - 前端依赖内存行为

**缓解**: A/B 切换 + 前端适配

```javascript
// services/SessionService.js
class SessionService {
  constructor() {
    this.sessions = new Map(); // 替代 let sessions = []
  }

  create(data) {
    const session = { id: this.generateId(), ...data };
    this.sessions.set(session.id, session);
    return session;
  }

  getById(id) {
    return this.sessions.get(id);
  }

  // ...
}
```

---

### Phase P1: chat.js - 高优先级

**问题**: 熔断器、指标、SSE 处理耦合

**步骤**:
1. 扩展 `services/ChatService.js`
   - 封装熔断器调用
   - 封装指标采集
2. 创建 `services/SSEProxyService.js`
   - 专门处理 SSE 流式响应
   - 封装 fallback 逻辑
3. 修改 `routes/chat.js`
   - 简化为参数校验 + 调用 ChatService
   - 移除熔断器/指标代码

**风险**: 🟡 中 - SSE/熔断复杂

**缓解**: 完整测试 + 灰度发布

```javascript
// services/SSEProxyService.js
class SSEProxyService {
  constructor(breaker, metrics) {
    this.breaker = breaker;
    this.metrics = metrics;
  }

  async streamWithCircuitBreaker(params) {
    return this.breaker.execute(
      () => this.callMiniMaxAPI(params),
      { fallback: () => this.fallbackResponse() }
    );
  }
}
```

---

### Phase P2: execution.js - 中优先级

**问题**: 数据聚合/映射逻辑泄漏

**步骤**:
1. 创建 `services/ExecutionService.js`
   - 迁移 `mapTaskStatus()` 逻辑
   - 迁移日期范围过滤
   - 迁移统计计算
2. 修改 `routes/execution.js`
   - 简化为参数校验 + 调用 service

**风险**: 🟡 中 - dashboard 统计变化

**缓解**: API 兼容 + feature flag

---

### Phase P3: multiagent.js - 低优先级

**问题**: helper 逻辑未抽取

**步骤**:
1. 提取 helper 函数到 `middleware/multiagent.js`
2. 修改 `routes/multiagent.js` 使用 middleware

---

## 四、验收标准

routes/ 中**不应出现**：
- ❌ `getMetricsCollector()` / `getBreakerWithPreset()`
- ❌ `collector.incrementCounter/recordHistogram()`
- ❌ `minimaxBreaker.execute()`
- ❌ `let X = []` 内存状态
- ❌ 业务逻辑计算（`.map/.filter/.reduce`）
- ❌ `generateId()` 领域逻辑

routes/ 中**应该出现**：
- ✅ 参数校验 (`joi`/`zod`/手动)
- ✅ 权限检查
- ✅ 响应组装 (`res.json()`)
- ✅ 错误处理 (`try/catch` → `handle()`)
- ✅ 调用 Services

---

## 五、工作量估算

| Phase | 文件 | 预估工时 | 说明 |
|-------|------|----------|------|
| P0 | sessions.js | 2小时 | SessionService 创建 |
| P1 | chat.js | 4小时 | ChatService 扩展 + SSEProxyService |
| P2 | execution.js | 3小时 | ExecutionService 创建 |
| P3 | multiagent.js | 1小时 | middleware 提取 |
| **总计** | - | **10小时** | 约 1.5 人日 |

---

## 六、测试验证

### 6.1 单元测试

```bash
# ChatService 测试
node backend/tests/unit/chatService.test.js

# SessionService 测试
node backend/tests/unit/sessionService.test.js

# ExecutionService 测试
node backend/tests/unit/executionService.test.js
```

### 6.2 集成测试

```bash
# 综合 API 测试
node tests/comprehensive-test.js

# SSE 流式测试
curl -X POST http://localhost:30000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}' \
  -w "\n" | head -5
```

### 6.3 前端功能测试

- [ ] 创建会话 → 刷新页面 → 会话存在
- [ ] 发送消息 → 收到 SSE 响应
- [ ] 熔断触发 → 降级响应正常
- [ ] 指标采集 → Prometheus 端点有数据

---

**文档版本**: v1.0.0
**下次评审**: 迁移完成后
**维护者**: Backend Architect