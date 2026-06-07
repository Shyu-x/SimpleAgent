# 旅程 11: Agent 协作流程

> **生成时间**: 2026-06-07
> **服务**: backend `:30000` ✅ / frontend `:3001` ✅
> **视口**: 1440 × 900
> **脚本**: `scripts/journey-agent.mjs`

## 用途
验证 Agent 推理 → 工具调用 → 结果回填的完整流程, 以及多 Agent 协作面板 + MissionControl 任务调度。

## 触发条件
- 用户输入自然语言任务 (如 "今天北京天气怎么样")
- 后端 `/api/chat` SSE 流式响应, 自动意图识别
- 命中工具调用 (天气/计算/搜索) → ToolExecutor 执行 → 结果回填 LLM → 最终回复
- 智能体 tab: 多 Agent 协作平台 / MissionControl 任务队列

## 真实 API 验证

### Agent US-011
| 端点 | 方法 | 状态 | 备注 |
|------|------|------|------|
| `/api/mission/tasks` | GET | ✅ 200 | 84 个测试任务 (pagination: total=84) |
| `/api/mission/agents` | GET | ✅ 200 | 当前空 (任务池未启动) |
| `/api/mission/stats` | GET | ✅ 200 | `totalTasks:84 pendingTasks:84 runningTasks:0` |
| `/api/multiagent/templates` | GET | ✅ 200 | 5 agent templates (researcher/writer/editor/coder/reviewer) |
| `/api/multiagent/crews` | GET | ✅ 200 | 当前空 |
| `/api/pool/status` | GET | ✅ 200 | 6 models healthy (MiniMax/GPT-4o/Claude 3.5/DeepSeek) |
| `/api/agents` | GET | ❌ 404 | 端点不存在 (真实路径 `/api/agents/*` 是 multiAgentEngine 路由, 需 query) |
| `/api/agents/status` | GET | ❌ 404 | 同上, 任务文档中的路径未实现 |

### A2A US-004
| 端点 | 方法 | 状态 | 备注 |
|------|------|------|------|
| `/api/a2a/agents` | GET | ✅ 200 | 注册表 (empty by default) |
| `/api/a2a/coordination/modes` | GET | ✅ 200 | 3 模式 (team_leader/collaborative/autonomous) |
| `/api/a2a/collaboration/stats` | GET | ✅ 200 | counters (active/total/completed/failed) |
| `/api/a2a/collaborate` | POST | ✅ 200 | 创建协作, 返回 summary/results/dependencyGraph |
| `/api/a2a/tasks/define` | POST | ✅ 200 | 创建任务定义 |
| `/api/a2a/agents/register` | POST | ✅ 200 | 注册 agent (id/name/type/capabilities) |
| `/api/a2a/agents/:id/heartbeat` | POST | ✅ 200 | 心跳 (60s 超时) |
| `/api/a2a/tasks` | GET | ✅ 200 | 任务列表 |

## 期望看到的状态
- 主页: 对话框 + 5 工具入口 (代码协作/信息整理/产品文案/方案评审/业务提升)
- Agent 入口: 顶部 Agent 按钮 → 跳转 /agent
- /agent 页面: MissionControl 暗色主题, Agent 池 (5+ 预置角色), 任务队列 (84)
- 工具调用: thinking 状态 → 工具结果 → 整合回复
- 多 Agent 协作平台弹窗: 3 模板 (调研写作/代码研发/多角度分析)

## 真实截图 (6+2 = 8 张)
- [x] `01-agent-mode-toggle.png` — 主对话页 + Agent 入口按钮
- [x] `02-tool-selector.png` — /agent 页 MissionControl 任务队列
- [x] `03-agent-thinking.png` — 发送"今天北京天气怎么样"后 ASSISTANT 思考状态
- [x] `04-tool-result.png` — 工具结果回填 (后端模型池 429 时显示降级提示)
- [x] `05-multi-agent-panel.png` — Multi Agent 协作平台弹窗 (3 模板)
- [x] `06-collaboration-status.png` — MissionControl 任务广播 tab
- [x] `07-agent-mode-active.png` — Agent 模式激活 (键盘提示)
- [x] `08-agent-response.png` — Agent 最终回复

## 跑通方式
```bash
node scripts/journey-agent.mjs
node scripts/journey-a2a.mjs --live
# 建议 prompt: "今天北京天气怎么样" / "调研 React 19 + 写测试 + 代码审查"
```

## 已知限制 (5d 边界)
- **单机无 multi-machine**: A2A 协作任务无真实 agent 进程执行, 后端会 60s 后 timeout 返回 `failed`
- **速率限制**: dev server 限流 100 req/min/IP, 连续脚本运行需间隔 60s
- **API Key**: 模型调用需 `MINIMAX_API_KEY`, 无 key 时显示"服务暂时不可用, 请稍后重试" (截图 04)
- **/api/agents**: 任务文档要求的端点不存在, 实际 agent 端点为 `/api/a2a/agents` (US-004) + `/api/mission/agents` (US-011) + `/api/multiagent/*` (multi-agent engine)

## 失败时常见错
- 模型调用 503 / 服务不可用 — 检查 `MINIMAX_API_KEY` 与 modelRouter 健康状态
- A2A 协作 failed — 单机环境, 无真实 agent 进程消费消息, 正常预期
- MissionControl "暂无事件" — 需要 `POST /api/mission/tasks` 投递任务
- Console 大量 429 — 减少连续请求频率或临时设 `DISABLE_RATE_LIMIT=1`
