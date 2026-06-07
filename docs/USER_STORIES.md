# SimpleAgent 用户故事主目录 (User Stories Master Catalog)

> **目的**: 集中管理所有用户故事, 定义验收标准, 跟踪验证状态。
> **更新日期**: 2026-06-07
> **总故事数**: 15 (12 类别)

## 一、用户故事列表

| # | 故事 ID | 类别 | 脚本 | README | 状态 | 优先级 |
|---|--------|------|------|--------|------|--------|
| 1 | US-001 | 登录/ApiKey 入口 | `journey-login.mjs` | `login/README.md` | ✅ 验证 | P0 |
| 2 | US-002 | HITL 人机协作 | `journey-hitl.mjs` | `hitl/README.md` | ✅ 验证 | P0 |
| 3 | US-003 | 管理后台 | `journey-admin.mjs` | `admin/README.md` | ✅ 验证 | P0 |
| 4 | US-004 | A2A 多 Agent 协作 | `journey-a2a.mjs` | `a2a/README.md` | ✅ 验证 | P1 |
| 5 | US-005 | i18n 中英切换 | `journey-i18n.mjs` | `i18n/README.md` | ✅ 验证 | P1 |
| 6 | US-006 | MCP 工具市场 | `journey-mcp.mjs` | `mcp/README.md` | ✅ 验证 | P1 |
| 7 | US-007 | 告警链路 | `journey-alert.mjs` | `alert/README.md` | ✅ 验证 | P1 |
| 8 | US-008 | 故障注入 | `journey-incident.mjs` | `incident/README.md` | ✅ 验证 | P1 |
| 9 | US-009 | 完整对话流程 | `journey-conversation.mjs` | `conversation/README.md` | ✅ 验证 | P0 |
| 10 | US-010 | 响应式 + 错误路径 | `journey-resilience.mjs` | (无 README) | ⚠️ 验证 | P1 |
| 11 | US-011 | Agent 协作流程 | `journey-agent.mjs` | `agent/` (无 README) | ✅ 验证 | P0 |
| 12 | US-012 | RAG + 知识库 | `journey-rag.mjs` | `rag/README.md` | ✅ 验证 | P0 |
| 13 | US-013 | 前端生产构建 | `journey-prod-build.mjs` | (无 README) | ⚠️ 验证 | P2 |
| 14 | US-014 | 工具执行 E2E | `journey-tools.mjs` | `tools/README.md` | ✅ 验证 | P1 |
| 15 | US-015 | 多端 + 暗色模式 | `journey-mobile-theme.mjs` | `mobile-theme/README.md` | ✅ 验证 | P1 |

## 二、每个用户故事的标准模板

每个用户故事必须有:

### 2.1 故事描述
- **作为 (As a)**: 谁要使用这个功能
- **我想要 (I want to)**: 完成什么目标
- **以便 (So that)**: 带来什么价值

### 2.2 验收标准 (Acceptance Criteria)
- [ ] 主流程路径: 输入 → 步骤 → 期望输出
- [ ] 边界条件: 空输入 / 错误输入 / 极限值
- [ ] 错误处理: API 失败 / 网络断开 / 超时
- [ ] UI 验收: 控件可点击 / 文字可读 / 错误提示明确

### 2.3 自动化测试
- `scripts/journey-<name>.mjs` 脚本 (Playwright + curl)
- 截图证据: `docs/online/journeys/<name>/*.png` (≥ 1 张)
- README 描述: `docs/online/journeys/<name>/README.md`

### 2.4 验证方法
- **API 验证**: `curl` + 期望 HTTP 状态 + 响应字段
- **UI 验证**: Playwright 截图 + 视觉对比
- **E2E 验证**: 完整流程跑通, 数据落库 / 显示

## 三、详细故事定义

### US-001 登录/API Key 入口
- **作为** 新用户
- **我想要** 在设置面板输入 API Key 并保存
- **以便** 能调用 LLM 完成对话
- **路径**: `/` → 右上角设置图标 → 设置面板 → API Key 输入框 → 保存 → 弹"保存成功"
- **API 验证**: 
  - `POST /api/settings/api-key` 200 (mock key)
  - 加密存储到 localStorage / sessionStorage
- **UI 验收**: 设置按钮可点击, 输入框有 placeholder, 错误提示红色

### US-002 HITL 人机协作
- **作为** 用户在执行高风险操作
- **我想要** 系统弹确认对话框
- **以便** 我能确认或取消危险操作
- **路径**: 触发 HITL 条件 → 弹对话框 → 显示风险等级 → Y/N 键盘响应 → 倒计时
- **API 验证**: 
  - `POST /api/hitl/request` 创建
  - `POST /api/hitl/respond` 响应
  - `GET /api/hitl/status/:id` 状态查询
- **UI 验收**: 对话框居中, 倒计时进度条, 风险颜色编码

### US-003 管理后台 (6 模块)
- **作为** 管理员
- **我想要** 在一个后台看所有配置
- **以便** 调整知识库/工具/模型/Prompt/追踪/统计
- **路径**: `/admin` → 6 个子页: dashboard / knowledge-base / tools / models / prompts / traces
- **API 验证**: 6 个 GET 端点全 200
- **UI 验收**: 侧边栏导航可点击, 表格有分页/排序/搜索

### US-004 A2A 多 Agent 协作
- **作为** 用户
- **我想要** 多 Agent 协同完成复杂任务
- **以便** 任务分工, 并行加速
- **路径**: 创建协作 → 注册 Agent → 任务分发 → 结果汇总
- **API 验证**:
  - `GET /api/a2a/agents` 200
  - `POST /api/a2a/collaborate` 任务创建
  - `GET /api/a2a/collaboration/:id` 状态查询
- **UI 验收**: Agent 列表, 协作状态可视化

### US-005 i18n 中英切换
- **作为** 国际化用户
- **我想要** 在中文/英文之间切换界面
- **以便** 使用熟悉的语言
- **路径**: 设置 → 语言选择 → 切换 → UI 文字更新
- **API 验证**: locales 文件加载, 翻译键一致
- **UI 验收**: zh-CN 默认, en 翻译完整 (238+ keys)

### US-006 MCP 工具市场
- **作为** 用户
- **我想要** 浏览 / 启用 / 禁用 MCP 工具
- **以便** 扩展 Agent 能力
- **路径**: `/admin/tools` → 工具列表 → 启用/禁用 toggle → 配置 API key
- **API 验证** (实际路径): 
  - `GET /api/tools` 200 (工具列表)
  - `GET /api/admin/tools/categories` 200 (分类)
  - `GET /api/mcp/status` 200 (MCP 状态)
- **UI 验收**: 工具分类, 状态徽章, 启用/禁用响应快

### US-007 告警链路
- **作为** 运维
- **我想要** 系统异常时收到告警
- **以便** 快速响应
- **路径**: 注入异常 → 触发告警规则 → 告警中心显示 → Webhook 通知
- **API 验证**: Prometheus 告警规则命中
- **UI 验收**: 告警中心, 严重等级, 静音/确认按钮

### US-008 故障注入
- **作为** 测试人员
- **我想要** 模拟各种故障
- **以便** 验证系统降级行为
- **路径**: 注入网络延迟/服务宕机/Redis 断开 → 观察 UI 降级
- **API 验证**: 熔断器打开, 限流触发
- **UI 验收**: 友好错误提示, 降级状态可视化

### US-009 完整对话流程
- **作为** 用户
- **我想要** 流畅的多轮对话
- **以便** 完成任务
- **路径**: 输入 → 打字机响应 → 多轮 → 思考链可见 → 引用来源
- **API 验证**: SSE 流式, thinking_delta + choices
- **UI 验收**: 滚动流畅, 代码高亮, 数学公式

### US-010 响应式 + 错误路径
- **作为** 移动端/平板用户
- **我想要** 适配不同设备
- **以便** 任何设备都能用
- **路径**: 375px 移动端 / 768px 平板 / 1024px+ 桌面
- **API 验证**: 429 限流, 5xx 降级
- **UI 验收**: 布局自适应, 错误提示

### US-011 Agent 协作流程
- **作为** 用户
- **我想要** Agent 自动选择工具完成任务
- **以便** 自动化
- **路径**: 输入任务 → Agent 推理 → 工具调用 → 结果整合 → 最终响应
- **API 验证** (实际路径): 
  - `GET /api/mission/tasks` 200
  - `GET /api/mission/agents` 200
  - `GET /api/multiagent/templates` 200
  - `GET /api/pool/status` 200
  - `GET /api/a2a/agents` 200 (与 US-004 共用)
- **UI 验收**: 思考链可视化, 工具调用状态

### US-012 RAG + 知识库
- **作为** 用户
- **我想要** 上传文档并基于它问答
- **以便** 知识库问答
- **路径**: 上传文档 → 解析分块 → 向量化 → 检索 → 引用回答
- **API 验证**: `POST /api/rag/ingest`, `POST /api/rag/search`
- **UI 验收**: 上传进度, 检索结果, 引用角标

### US-013 前端生产构建
- **作为** 运维
- **我想要** 验证生产构建可工作
- **以便** 部署稳定
- **路径**: `pnpm build` → standalone 输出 → 启动 → 服务
- **API 验证**: SSR 渲染正确, hydration 无错
- **UI 验收**: 首屏快, 无 console 错误

### US-014 工具执行 E2E
- **作为** 用户
- **我想要** Agent 调用各种工具
- **以便** 完成复杂任务
- **路径**: 计算器/搜索/日期/RAG 工具调用 → 结果展示
- **API 验证**: 工具调用成功率, 超时控制
- **UI 验收**: 工具结果可视化

### US-015 多端 + 暗色模式
- **作为** 用户
- **我想要** 移动端/平板/桌面 + 暗色模式
- **以便** 任何场景都能用
- **路径**: 主题切换, 断点适配
- **API 验证**: 主题持久化 (cookie/localStorage)
- **UI 验收**: 主题切换无闪烁, 响应式断点

## 四、验证责任分配 (5 agent 并行)

| Agent | 负责故事 | 验证方法 | 预算 |
|-------|---------|----------|------|
| agent_us_verify_1 | US-001/009/013 | Playwright + curl | 25min |
| agent_us_verify_2 | US-002/007/008 | Playwright + curl | 25min |
| agent_us_verify_3 | US-003/006/014 | Playwright + curl | 25min |
| agent_us_verify_4 | US-004/011 | Playwright + SSE | 25min |
| agent_us_verify_5 | US-005/010/012/015 | Playwright + locales | 25min |

## 五、验证模板

每个 agent 输出:
```markdown
# US-XXX 验证报告

## 故事: <标题>
## 状态: ✅ PASS / ⚠️ PARTIAL / ❌ FAIL
## 主流程: <实际跑通的步骤>
## API 验证: <curl 输出>
## UI 验证: <截图路径 + 视觉对比>
## 问题: <列出任何不通过项>
## 推荐: <修复建议>
```

## 六、汇总到 GATE

完成 15 个故事验证后, 生成汇总报告:
- `docs/online/journeys/VERIFICATION-REPORT.md`
- 通过率: 15/15 (或 N/15)
- 阻塞问题清单
- PR-ready 状态
