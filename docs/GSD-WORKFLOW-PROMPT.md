# AI Chat 玩具 - GSD 工作流 Agent Team 启动 Prompt

## 项目上下文

### 基本信息
- **项目名称**: AI Chat 玩具 - 现代化AI对话平台
- **技术栈**: React 19 + Next.js 16 + Zustand 5 + Express
- **端口**: 前端 3001，后端 30000
- **当前版本**: v2.5.0
- **架构健康度**: 8.25/10 (目标 8.5/10)

### 项目目录
```
C:\Users\Xu\Desktop\chat玩具\
├── frontend/          # Next.js 前端
├── backend/          # Express 后端
│   └── .gsd/          # GSD 工作流配置
├── docs/              # 文档
└── memory/            # MEMORY.md
```

---

## GSD 工作流配置

### 工作流触发
使用 `/use superpowers` 或直接派发 `gsd-executor` agent 执行任务。

### 核心配置 (`backend/.gsd/`)
| 文件 | 说明 |
|------|------|
| `workflow.json` | 工作流配置（5步流程、Sprint参数） |
| `iteration-state.json` | 迭代状态（Sprint #5 完成情况） |
| `todo.md` | Sprint #6 待办任务 |
| `start-iteration.sh` | 快速启动脚本 |
| `health-check.js` | 健康检查脚本 |

### 迭代模式
- **Sprint 间隔**: 30分钟
- **Team Size**: 10+ agent
- **测试阈值**: 100% 通过率
- **架构健康目标**: 8.5/10

---

## 当前项目状态

### 测试结果 (100% 通过)
| 测试类型 | 数量 | 状态 |
|---------|------|------|
| 前端组件测试 | 44用例 | 100% |
| E2E测试 | 71用例 | 100% |
| API集成测试 | 69用例 | 100% |
| 监控告警验证 | 12用例 | 100% |

### 安全状态
- ✅ ShellTool: 56种危险模式检测
- ✅ WorkflowEngine: AST解析替代 eval
- ✅ CSRF防护: 双重Cookie验证
- ✅ 请求签名: HMAC-SHA256
- ✅ postcss XSS: overrides修复
- ✅ 错误类合并: AgentError → AppError

### 架构优化完成
- ✅ 统一错误处理: 0处 throw new Error
- ✅ 数据库索引: queryOptimizer.js
- ✅ 缓存策略: Redis双层缓存
- ✅ 依赖注入: DIContainer.js
- ✅ 日志规范化: AgentLogger
- ✅ missionService: 同步改异步
- ✅ 数据库连接池: 10 → 50

### 架构健康评分
| 维度 | 评分 |
|------|------|
| 分层架构 | 8.0/10 |
| 代码质量 | 7.5/10 |
| 性能考虑 | 8.5/10 |
| 安全 | 9.0/10 |
| **综合** | **8.25/10** |

---

## Sprint #6 待办任务

### 高优先级
- [ ] Domain层依赖Services层问题解决
- [ ] console.* 收尾 (~100处，主要在 scripts/ 和 infra/)

### 中优先级
- [ ] Redis缓存实际集成验证
- [ ] 测试覆盖率提升

### 低优先级
- [ ] path-to-regexp/lodash 漏洞监控（来自 Prisma 依赖）
- [ ] enhancedAgentEngine vs agentEngine 冗余合并

---

## 启动 Agent Team 指令

### 任务派发格式
```
## 任务：[任务名称]

### 上下文
[简要说明当前状态和背景]

### 任务目标
1. [具体目标1]
2. [具体目标2]

### 关键文件
- [文件路径] - [说明]
- [文件路径] - [说明]

### 验证标准
1. [验证项1]
2. [验证项2]

### 输出要求
[报告格式要求]
```

### Agent 团队配置
- **最小团队规模**: 10 个 gsd-executor agent
- **任务分配**: 根据技能匹配分配
- **沟通机制**: 通过任务状态同步
- **质量门控**: 所有测试 100% 通过

---

## 关键文档索引

| 文档 | 位置 | 说明 |
|------|------|------|
| CLAUDE.md | 项目根目录 | 项目指令 |
| CHANGELOG.md | 项目根目录 | 版本历史 |
| MEMORY.md | ~/.claude/projects/.../memory/ | 持久化记忆 |
| workflow.json | backend/.gsd/ | 工作流配置 |
| iteration-state.json | backend/.gsd/ | 迭代状态 |
| todo.md | backend/.gsd/ | 待办任务 |
| SPRINT-ITERATION-SUMMARY-20260515.md | docs/ | 最新迭代总结 |
| ARCHITECTURE-REVIEW.md | docs/ | 架构评审 |

---

## GSD 工作流执行步骤

### 1. 调研阶段
- 读取 `backend/.gsd/todo.md` 了解待办任务
- 读取 `backend/.gsd/iteration-state.json` 了解当前状态
- 分析任务优先级和依赖关系

### 2. 任务分配阶段
- 将任务分配给 10+ 个 gsd-executor agent
- 确保任务之间无冲突
- 设置明确的验收标准

### 3. 执行阶段
- Agent 执行任务
- 定期检查进度
- 解决阻塞问题

### 4. 验证阶段
- 运行测试确保 100% 通过
- 验证代码质量和安全
- 确认架构健康度提升

### 5. 迭代阶段
- 收集完成的任务结果
- 更新 `iteration-state.json`
- 准备下一轮 Sprint

---

## 成功标准

1. **测试通过率**: 100% (所有级别测试)
2. **架构健康**: 达到 8.5/10 或以上
3. **业务逻辑**: 严肃检查，所有功能正常
4. **文档同步**: 所有变更已记录
5. **迭代持续**: 无限迭代不停止

---

## 注意事项

1. **只使用 gsd-executor agent**: 所有任务必须通过 gsd-executor 执行
2. **测试优先**: 在提交任何代码前确保测试通过
3. **文档同步**: 每次重要变更后更新相关文档
4. **架构保护**: 保持架构健康度不下降
5. **安全优先**: 任何安全问题必须立即修复

---

## 健康检查命令

```bash
# 后端健康检查
curl http://localhost:30000/api/health

# 前端健康检查
curl http://localhost:3001

# GSD 启动脚本
cd backend && bash .gsd/start-iteration.sh

# 健康检查脚本
cd backend && node .gsd/health-check.js
```

---

## 开始迭代

启动 GSD 工作流，使用 gsd-executor agent 执行 Sprint #6 任务：

1. 读取 `backend/.gsd/todo.md`
2. 分析待办任务
3. 派发 10+ 个 gsd-executor agent
4. 验证测试通过
5. 更新迭代状态
6. 循环迭代

**目标**: 架构健康度达到 8.5/10，测试 100% 通过