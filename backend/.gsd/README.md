# GSD 工作流迭代恢复指南

> **文档版本**: 1.0.0 | **创建日期**: 2026-05-15

## 快速开始

### 1. 检查服务状态

```bash
# 使用健康检查脚本
node .gsd/health-check.js

# 或使用启动脚本
bash .gsd/start-iteration.sh

# 手动启动
cd backend && npm run dev
cd frontend && npm run dev
```

### 2. 读取迭代状态

```bash
# 查看当前迭代状态
cat .gsd/iteration-state.json

# 查看待办事项
cat .gsd/todo.md

# 查看项目整体进度
cat .planning/STATE.md
cat .planning/ROADMAP.md
```

### 3. 启动新迭代

```bash
# 使用 gsd-executor 执行计划
node $HOME/.claude/get-shit-done/bin/gsd-tools.cjs execute-phase <phase>

# 或使用 planner agent 创建新计划
```

## 迭代状态文件说明

### iteration-state.json

当前 Sprint #5 的状态记录：

```json
{
  "lastUpdated": "2026-05-15T13:16:00Z",
  "sprintNumber": 5,
  "completedTasks": [
    "backend/services/AgentLogger替换console.*",
    "backend/routes/admin/console.*替换",
    "backend/routes/console.*清理",
    "frontend AgentLogger集成"
  ],
  "pendingTasks": [
    "Domain层依赖Services层问题解决",
    "console.*收尾检查"
  ],
  "testResults": {
    "frontendComponents": "44/44 100%",
    "e2e": "71/71 100%",
    "apiIntegration": "69/69 100%"
  }
}
```

### todo.md

当前 Sprint #6 待办事项：

```markdown
# Sprint #6 待办

## 高优先级
- [ ] Domain层依赖Services层问题解决
- [ ] console.* 收尾 (~100处)

## 中优先级
- [ ] Redis缓存实际集成验证
- [ ] 测试覆盖率提升

## 低优先级
- [ ] path-to-regexp/lodash 漏洞监控
```

## 迭代状态说明

| 状态 | 含义 | 操作 |
|------|------|------|
| `sprint-ongoing` | Sprint 进行中 | 继续执行任务 |
| `sprint-complete` | Sprint 完成 | 归档并开始新 Sprint |
| `iteration-paused` | 迭代暂停 | 检查阻塞器后恢复 |
| `phase-complete` | Phase 完成 | 验证并开始下一 Phase |

## 当前项目进度

### Phase 进度 (截至 2026-05-15)

| Phase | 名称 | Plans | 状态 |
|-------|------|-------|------|
| 1 | 完成架构收尾 | 4/4 | ✅ Complete |
| 2 | MCP工具市场完善 | 3/3 | ✅ Complete |
| 3 | 管理后台集成 | 3/3 | ✅ Complete |
| 4 | 生产级能力 | 2/2 | ✅ Complete |
| 5 | 安全强化 | - | ✅ Complete |

**总进度**: 12/12 plans completed (100%)

### 当前 Sprint (#6) 状态

从 `Sprint #5` 完成状态可知：

| 类别 | 完成情况 |
|------|----------|
| Frontend组件测试 | 44/44 (100%) |
| E2E测试 | 71/71 (100%) |
| API集成测试 | 69/69 (100%) |
| 日志规范化 | ~130处完成 |

### 待处理事项

| 类别 | 项目 | 状态 | 优先级 |
|------|------|------|--------|
| Domain层依赖 | Services层循环依赖 | Pending | P1 |
| 日志规范化 | console.* 收尾 (~100处) | Pending | P1 |
| 缓存集成 | Redis实际集成验证 | Pending | P2 |
| 测试覆盖 | 单元测试覆盖率提升 | Pending | P2 |

## 任务继续指南

### 1. 从检查点恢复

查看 `.gsd/iteration-state.json` 了解当前 Sprint 进度：

```bash
# 查看当前迭代状态
cat .gsd/iteration-state.json

# 查看待办事项
cat .gsd/todo.md
```

关键信息包括：
- `sprintNumber`: 当前 Sprint 编号
- `completedTasks`: 已完成任务列表
- `pendingTasks`: 待处理任务列表
- `testResults`: 测试结果统计

### 2. 恢复进行中的工作

根据 `pendingTasks` 继续处理：

```
pendingTasks:
  - "Domain层依赖Services层问题解决"
  - "console.*收尾检查"
```

### 3. 使用 Git 历史恢复

```bash
# 查看最近的提交
git log --oneline -20

# 查找特定计划相关的提交
git log --oneline --all | grep "01-03"

# 查看 Sprint #5 的提交
git log --oneline --since="2026-05-14" --until="2026-05-15"

# 恢复特定提交的状态
git checkout <commit-hash>
```

### 4. 架构问题处理

当前已知问题：**Domain层依赖Services层**

这是分层架构中需要解决的循环依赖问题：
- `domain/` 层不应该依赖 `services/`
- 应该通过依赖注入或接口解耦

建议的解决方案：
1. 识别 Domain 层中直接依赖 Services 的代码
2. 使用依赖注入传递 Services 实例
3. 或通过接口抽象解耦

## 测试验证

### 1. 运行前端测试

```bash
# 前端组件测试 (44/44)
cd frontend && npm test

# E2E测试 (71/71)
cd frontend && npm run test:e2e
```

### 2. 运行后端测试

```bash
# 后端单元测试
cd backend && npm test

# 特定模块测试
node tests/unit/circuitBreaker.test.js
```

### 3. 运行集成测试

```bash
# 综合API测试 (69/69)
node tests/comprehensive-test.js

# Agent评价体系
node tests/agent-evaluation-system.js

# 对话场景测试
node tests/dialogue-scenario-test.js
```

### 4. 验证核心功能

```bash
# 健康检查
curl http://localhost:30000/api/health

# SSE流式响应测试
curl -X POST http://localhost:30000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello"}' \
  -N

# RAG检索测试
curl -X POST http://localhost:30000/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query":"test query"}'
```

## 文档索引

### 项目文档

| 文档 | 路径 | 说明 |
|------|------|------|
| 项目指令 | `CLAUDE.md` | 项目配置和指令 |
| 更新日志 | `CHANGELOG.md` | 版本历史和变更 |
| 项目状态 | `.planning/STATE.md` | 当前进度和决策 |
| 路线图 | `.planning/ROADMAP.md` | Phase 规划和进度 |
| 需求清单 | `.planning/REQUIREMENTS.md` | 所有需求追踪 |
| 项目定义 | `.planning/PROJECT.md` | 项目愿景和目标 |

### 学习文档

| 文档 | 路径 | 说明 |
|------|------|------|
| 技术全景图 | `docs/LEARNING/B1-技术全景图.md` | 技术栈关系 |
| 设计模式应用 | `docs/LEARNING/B2-设计模式应用.md` | 策略/工厂/装饰器 |
| Agent并行部署 | `docs/LEARNING/B3-Agent并行部署.md` | 多Agent协作、A2A |
| RAG核心面试题 | `docs/LEARNING/RAG核心面试题详解.md` | 向量/切片/幻觉 |
| Agent深度面试 | `docs/LEARNING/Agent深度面试模拟.md` | 面试官vs面试者 |

### 后端文档

| 文档 | 路径 | 说明 |
|------|------|------|
| 5分钟跑通 | `backend/docs/A1-5分钟跑通.md` | Express启动 |
| 分层架构 | `backend/docs/B1-分层架构设计.md` | 六层架构 |
| 中间件设计 | `backend/docs/B2-中间件设计.md` | 熔断器、限流器 |
| ReAct循环 | `backend/docs/B3-ReAct执行循环.md` | Agent大脑 |
| RAG系统 | `backend/docs/B4-RAG系统设计.md` | 多路检索 |

### 前端文档

| 文档 | 路径 | 说明 |
|------|------|------|
| 5分钟跑通 | `frontend/docs/A1-5分钟跑通.md` | 环境配置 |
| React设计 | `frontend/docs/B1-React设计思想.md` | 组件化、虚拟DOM |
| Zustand状态 | `frontend/docs/B2-Zustand状态管理.md` | Store设计 |

## 架构健康目标

### 当前状态 (2026-05-15)

| 指标 | 当前值 | 目标值 | 状态 |
|------|--------|--------|------|
| 日志规范化 | 130/525 (21.5%) | 100% | 🔄 进行中 |
| 业务逻辑迁移 | 0% | 100% | ⏳ 待处理 |
| Mock数据清理 | 0% | 100% | ⏳ 待处理 |
| 路由代码精简 | ~50% done | 100% | 🔄 进行中 |

### 架构健康评分

- **当前**: 8.25/10
- **目标**: 8.5/10

## 常见恢复场景

### 场景 1: `/clear` 后恢复对话

```
1. 读取 .planning/STATE.md 了解当前进度
2. 查看最近的 SUMMARY.md 了解完成的工作
3. 从 check point 继续或重新规划
```

### 场景 2: 服务启动失败

```bash
# 检查端口占用
lsof -i :30000
lsof -i :8080

# 检查日志
tail -f backend/logs/app.log
tail -f frontend/.next/server/logs

# 重启服务
pkill -f "node.*backend"
pkill -f "next"

cd backend && npm run dev &
cd frontend && npm run dev &
```

### 场景 3: 状态文件损坏

```bash
# 从 Git 恢复
git checkout -- .planning/STATE.md

# 手动重建（参考最近提交）
git log --oneline -10
```

## GSD 命令参考

```bash
# 初始化执行环境
node $HOME/.claude/get-shit-done/bin/gsd-tools.cjs init execute-phase <phase>

# 更新状态
node $HOME/.claude/get-shit-done/bin/gsd-tools.cjs state update-progress

# 记录决策
node $HOME/.claude/get-shit-done/bin/gsd-tools.cjs state add-decision --phase <phase> --summary "<decision>"

# 添加阻塞器
node $HOME/.claude/get-shit-done/bin/gsd-tools.cjs state add-blocker "<blocker description>"

# 更新路线图进度
node $HOME/.claude/get-shit-done/bin/gsd-tools.cjs roadmap update-plan-progress <phase-number>

# 标记需求完成
node $HOME/.claude/get-shit-done/bin/gsd-tools.cjs requirements mark-complete <req-id>
```

## 版本信息

- **文档版本**: 1.0.0
- **创建日期**: 2026-05-15
- **最后更新**: 2026-05-15