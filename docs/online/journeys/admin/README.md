# 旅程 11: 管理后台 6 模块

> **生成时间**: 2026-06-07 (骨架)
> **服务**: backend `:30000` ✅ / frontend `:3001` (运行 `--live` 时需要)
> **视口**: 1440 × 900
> **脚本**: `scripts/journey-admin.mjs`

## 用途
验收 `/admin` 路由下 6 个模块的集成情况 (前后端打通 + 数据非空)。

## 6 个模块 + 状态
| # | 模块 | 前端路径 | 后端 API | 状态 |
|---|------|----------|----------|------|
| 01 | AdminDashboard | `/admin` | `/api/admin/stats` | ✅ |
| 02 | KnowledgeBase | `/admin/knowledge` | `/api/admin/knowledge/docs` | ✅ |
| 03 | ToolRegistry | `/admin/tools` | `/api/admin/tools/...` | ✅ |
| 04 | ModelConfig | `/admin/models` | `/api/admin/models` | ✅ |
| 05 | PromptTemplate | `/admin/prompts` | `/api/admin/prompts` | ✅ |
| 06 | TraceViewer | `/admin/traces` | `/api/admin/trace` | ✅ |

## 期望看到的状态
- 每个模块 200 OK, 数据非空
- 列表能分页 / 搜索 / 新建
- 详情能编辑并保存

## 真实截图需求 (待主会话/真实用户补)
- [ ] `01-dashboard.png` — 总览 (KPI 卡片)
- [ ] `02-knowledge.png` — 知识库文档列表
- [ ] `03-tools.png` — 工具注册表
- [ ] `04-models.png` — 模型配置 (含健康状态)
- [ ] `05-prompts.png` — Prompt 模板
- [ ] `06-traces.png` — 链路追踪

## 跑通方式
```bash
node scripts/journey-admin.mjs --live
# 依次访问 /admin/* 路由, 截图各模块
```

## 失败时常见错
- 401 Unauthorized — 后端可能要求 admin token, 检查 middleware
- 数据为 placeholder 数组 — 真实数据未初始化, 跑一遍 seed
