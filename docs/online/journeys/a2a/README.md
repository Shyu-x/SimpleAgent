# 旅程 12: A2A 多 Agent 协作

> **生成时间**: 2026-06-07 (骨架)
> **服务**: backend `:30000` ✅ / frontend `:3001` (运行 `--live` 时需要)
> **视口**: 1440 × 900
> **脚本**: `scripts/journey-a2a.mjs`

## 用途
验证 A2A 协议下多 Agent 并行协作的完整流程: 任务分发 → 并行执行 → 标准化结果汇总 → 依赖图可视化。

## 触发条件
- 用户输入 "协作完成 X" 或选择 team_leader 模式
- 后端 `POST /api/a2a/collaborate` 创建协作
- `POST /api/a2a/tasks/define/batch` 注册子任务 (含 dependencies/timeout/effort)
- SSE `subscribe/:sessionId` 推送每个子任务状态变化

## 期望看到的状态
- 任务列表展示依赖关系 (DAG)
- 多个 Agent 卡片实时显示进度 (running/completed/failed)
- 最终结果含 `summary` (successRate/totalTasks) + `dependencyGraph` + `validation.criteria`

## 真实截图需求 (待主会话/真实用户补)
- [ ] `01-task-distribution.png` — 任务分发列表
- [ ] `02-parallel-running.png` — 3 Agent 并行执行
- [ ] `03-dependency-graph.png` — 依赖图
- [ ] `04-result-aggregated.png` — 标准化结果汇总

## 跑通方式
```bash
node scripts/journey-a2a.mjs --live
# 建议 prompt: "协作完成: 调研 React 19 + 写测试 + 代码审查"
```

## 失败时常见错
- 子任务全部串行执行 — 检查 dependencies 是否正确
- 标准化结果字段缺失 — 后端 v2.0 协议未启用
- 协作超时 — 调整 `timeout` 参数 (默认 60s 可能不够)
