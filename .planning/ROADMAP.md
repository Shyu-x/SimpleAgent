# Roadmap: AI Chat 玩具

## Overview

AI Chat 玩具是一个现代化的AI对话平台，Phase 1-3已完成基础功能，当前需要完成架构收尾、技术债清理、MCP工具市场完整化，最终达到生产级可用状态。

Journey: Phase 1-3 (功能实现) → Phase 4 (架构收尾) → Phase 5 (MCP完结) → Phase 6 (技术债) → Phase 7 (Admin集成) → Phase 8 (生产级)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3...): Sequential milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1**: 完成架构收尾 - 业务逻辑迁移、Mock清理、日志规范化
- [ ] **Phase 2**: MCP工具市场完善 - 40% → 100%
- [ ] **Phase 3**: 管理后台集成 - 真实API联调、数据验证
- [ ] **Phase 4**: 生产级能力 - 数据库优化、权限控制、向量存储配置

## Phase Details

### Phase 1: 完成架构收尾
**Goal**: 彻底完成Phase 1分层架构改造，清理所有技术债
**Depends on**: Nothing
**Requirements**: [INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, CORE-01, CORE-02, CORE-03, TOOL-03, TOOL-04]
**Success Criteria** (what must be TRUE):
  1. 所有routes/文件 ≤150行，业务逻辑下沉到services/
  2. `grep -r "mock" backend/src/` 无结果（生产代码）
  3. `grep -r "console\." backend/src/` ≤10处（仅必要的错误日志）
  4. 结构化日志服务覆盖所有模块
  5. 熔断器和限流器单元测试覆盖率≥60%
**Plans**: 4 plans

Plans:
- [ ] 01-01: 业务逻辑迁移 - 将routes/中的业务逻辑抽取到services/
- [ ] 01-02: Mock数据清理 - 移除所有模拟数据，使用真实API
- [ ] 01-03: 日志规范化 - 替换console.log为AgentLogger，ESLint规则
- [ ] 01-04: 基础设施测试 - 熔断器、限流器、配置中心的单元测试

### Phase 2: MCP工具市场完善
**Goal**: MCP工具市场从40%完整度提升到100%
**Depends on**: Phase 1
**Requirements**: [TOOL-01, TOOL-02, AGENT-01, AGENT-02, AGENT-03, AGENT-04]
**Success Criteria** (what must be TRUE):
  1. 工具注册API完成CRUD操作
  2. 工具发现和执行使用真实MCP协议
  3. MissionControl面板后端API完整对接
  4. A2A协议完整实现（注册/心跳/消息/任务协作）
  5. 多Agent任务协作支持依赖图和生命周期钩子
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md: MCP协议集成 - 工具发现、执行、结果返回
- [x] 02-02-PLAN.md: MissionControl完整化 - 任务队列、状态同步、分配功能
- [x] 02-03-PLAN.md: A2A多Agent协作 - 协调模式、任务委托、SSE订阅

### Phase 3: 管理后台集成
**Goal**: 管理后台所有组件与后端API完成联调，使用真实数据
**Depends on**: Phase 2
**Requirements**: [ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04, ADMIN-05, ADMIN-06]
**Success Criteria** (what must be TRUE):
  1. AdminDashboard Stats API真实数据显示
  2. KnowledgeBase管理界面完整CRUD
  3. ToolRegistry工具注册测试功能可用
  4. ModelConfig熔断状态实时显示
  5. PromptTemplate模板版本历史可用
  6. TraceViewer链路追踪数据真实
**Plans**: 3 plans

Plans:
- [ ] 03-01-PLAN.md: 管理仪表盘集成 - Stats API联调
- [ ] 03-02-PLAN.md: 知识库与工具管理集成 - CRUD真实API
- [ ] 03-03-PLAN.md: 模型配置与链路追踪集成 - 熔断状态、Trace数据

### Phase 4: 生产级能力
**Goal**: 补充生产环境所需的工程化能力
**Depends on**: Phase 3
**Requirements**: [RAG-01, RAG-02, RAG-03, RAG-04, RAG-05, CORE-04, CORE-05]
**Success Criteria** (what must be TRUE):
  1. Qdrant向量数据库生产参数配置完成（HNSW/量化/备份）
  2. 数据库连接池优化完成
  3. 访问权限控制初步实现
  4. RAG查询改写和拆分的真实集成
  5. 图片上传和思维链展示与后端联调完成
**Plans**: 2 plans

Plans:
- [ ] 04-01: 生产配置完善 - Qdrant优化、数据库连接池、权限控制
- [ ] 04-02: RAG与多模态集成 - 查询改写、多路检索、图片理解、思维链

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. 完成架构收尾 | 0/4 | Not started | - |
| 2. MCP工具市场完善 | 3/3 | Complete    | 2026-04-26 |
| 3. 管理后台集成 | 0/3 | Not started | - |
| 4. 生产级能力 | 0/2 | Not started | - |

---

## Phase Mapping (All v1 Requirements)

| REQ-ID | Description | Phase |
|--------|-------------|-------|
| CORE-01 | SSE流式响应 | Phase 1 (INFRA-01) |
| CORE-02 | 取消生成 | Phase 1 (INFRA-02) |
| CORE-03 | 意图识别路由 | Phase 1 |
| CORE-04 | 图片上传视觉理解 | Phase 4 |
| CORE-05 | 思维链推理展示 | Phase 4 |
| RAG-01 | 创建管理知识库 | Phase 3 (ADMIN-02) |
| RAG-02 | 添加文档到知识库 | Phase 3 (ADMIN-02) |
| RAG-03 | 自动检索知识库 | Phase 4 |
| RAG-04 | 来源引用展示 | Phase 4 |
| RAG-05 | 查询改写 | Phase 4 |
| TOOL-01 | 30+内置工具 | Phase 2 |
| TOOL-02 | 自动工具选择 | Phase 2 |
| TOOL-03 | 工具超时保护 | Phase 1 |
| TOOL-04 | 工具参数验证 | Phase 1 |
| AGENT-01 | A2A多Agent协议 | Phase 2 |
| AGENT-02 | Agent消息传递 | Phase 2 |
| AGENT-03 | 任务取消超时 | Phase 2 |
| AGENT-04 | MissionControl面板 | Phase 2 |
| HITL-01 | 确认对话框 | Phase 1 (已完成) |
| HITL-02 | 风险等级显示 | Phase 1 (已完成) |
| HITL-03 | 倒计时自动取消 | Phase 1 (已完成) |
| HITL-04 | 键盘快捷键 | Phase 1 (已完成) |
| ADMIN-01 | 管理仪表盘 | Phase 3 |
| ADMIN-02 | 知识库管理 | Phase 3 |
| ADMIN-03 | 工具注册管理 | Phase 3 |
| ADMIN-04 | 模型配置熔断 | Phase 3 |
| ADMIN-05 | Prompt模板管理 | Phase 3 |
| ADMIN-06 | 链路追踪查看 | Phase 3 |
| INFRA-01 | 结构化JSON日志 | Phase 1 |
| INFRA-02 | 熔断器保护 | Phase 1 |
| INFRA-03 | 队列限流保护 | Phase 1 |
| INFRA-04 | Prometheus指标 | Phase 1 |
| INFRA-05 | 配置中心热更新 | Phase 1 |
| INFRA-06 | 健康检查端点 | Phase 1 |

**Coverage: 37/37 v1 requirements mapped (100%)**