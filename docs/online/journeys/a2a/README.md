# 旅程 4: A2A 多 Agent 协作

> **生成时间**: 2026-06-07 (刷新)
> **服务**: backend `:30000` ✅ / frontend `:3001` (运行 `--live` 时需要)
> **视口**: 1440 × 900
> **脚本**: `scripts/journey-a2a.mjs`

## 用途
验证 A2A 协议下多 Agent 并行协作的完整流程: Agent 注册 → 协调模式选择 → 任务分发 → 并行执行 → 标准化结果汇总 → 依赖图可视化。

## 触发条件
- 用户输入 "协作完成 X" 或选择 team_leader 模式
- 后端 `POST /api/a2a/agents/register` 注册 agent (id/name/type/capabilities)
- 后端 `POST /api/a2a/collaborate` 创建协作
- `POST /api/a2a/tasks/define/batch` 注册子任务 (含 dependencies/timeout/effort)
- SSE `subscribe/:agentId` 推送每个子任务状态变化

## 真实 API 验证 (5+ 端点)

| # | 端点 | 方法 | 状态 | 实测输出 |
|---|------|------|------|----------|
| 1 | `/api/a2a/agents` | GET | ✅ 200 | `{success,agents:[],count:0}` → 注册后 `{count:3}` |
| 2 | `/api/a2a/coordination/modes` | GET | ✅ 200 | 3 模式: `TEAM_LEADER`/`COLLABORATIVE`/`AUTONOMOUS` |
| 3 | `/api/a2a/collaboration/stats` | GET | ✅ 200 | `active:0 total:6 completed:0 failed:6` |
| 4 | `/api/a2a/collaborate` | POST | ✅ 200 | 返回 `summary`+`results`+`dependencyGraph`+`validation` |
| 5 | `/api/a2a/tasks/define` | POST | ✅ 200 | 创建 task 定义 (id/agentName/prompt/effort) |
| 6 | `/api/a2a/agents/register` | POST | ✅ 200 | 注册 agent (online 状态) |
| 7 | `/api/a2a/agents/:id/heartbeat` | POST | ✅ 200 | 60s 心跳超时 |
| 8 | `/api/a2a/tasks` | GET | ✅ 200 | 任务列表 (含 type/from/to/input) |

## 期望看到的状态
- 任务列表展示依赖关系 (DAG)
- 多个 Agent 卡片实时显示进度 (running/completed/failed)
- 最终结果含 `summary` (successRate/totalTasks) + `dependencyGraph` + `validation.criteria`

## 真实截图 (3 张)
- [x] `01-agents-list.png` — A2A 多 Agent 协作平台 (3 agents online: Code Reviewer/Research Analyst/Test Engineer)
- [x] `02-collaboration-stats.png` — 协作统计表 (6 total/0 active/6 failed) + 3 协调模式
- [x] `03-task-list.png` — 任务列表 (team_leader 协作) — `pending` 状态 + input 详情

## 跑通方式
```bash
# Dry-run (默认, 不启动浏览器)
node scripts/journey-a2a.mjs

# Live (注册 agents + 截图)
node scripts/journey-a2a.mjs --live
# 建议 prompt: "协作完成: 调研 React 19 + 写测试 + 代码审查"
```

## 已知限制 (5d 边界)
- **单机无 multi-machine**: A2A 协作任务无真实 agent 进程消费消息, 后端会 60s 后 timeout 返回 `failed` 状态
- **心跳超时**: agent 注册后 60s 无心跳自动 offline, 需 `POST /agents/:id/heartbeat` 保持
- **速率限制**: dev server 100 req/min/IP, 脚本内已用 Node 预取 + 注入数据避免浏览器内额外 fetch

## 失败时常见错
- 子任务全部串行执行 — 检查 dependencies 是否正确
- 标准化结果字段缺失 — 后端 v2.0 协议未启用
- 协作超时 — 调整 `timeout` 参数 (默认 60s 可能不够)
- `listAgents` 返回空 — 60s 心跳超时, 重新 register 或调用 heartbeat

