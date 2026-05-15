# GSD 工作流迭代 Prompt

## 项目
AI Chat 玩具 (v2.5.0) | React 19 + Next.js 16 + Express | 架构健康 8.25/10

## 当前状态
- 测试: 196用例 100%通过 (前端44 + E2E71 + API69 + 监控12)
- 安全: ShellTool/CSRF/签名/XSS/错误类全部修复
- 架构: 统一错误/数据库索引/Redis缓存/依赖注入/日志规范化/missionService异步化
- 待办: backend/.gsd/todo.md

## 启动指令
1. 读取 `backend/.gsd/todo.md` 获取 Sprint #6 任务
2. 读取 `backend/.gsd/iteration-state.json` 获取迭代状态
3. 派发 10+ 个 `gsd-executor` agent 执行任务
4. 验证测试 100% 通过
5. 更新 `backend/.gsd/iteration-state.json`
6. 循环迭代直到架构健康 8.5/10

## 任务派发格式
```
## 任务：[名称]
### 上下文：[状态]
### 目标：[目标]
### 关键文件：[文件路径]
### 验证：[标准]
### 输出：[报告]
```

## 成功标准
- 测试 100% 通过
- 架构健康 8.5/10
- 文档同步更新
- 无限迭代继续

## 健康检查
```bash
cd backend && node .gsd/health-check.js
```

## 文档索引
- CLAUDE.md - 项目指令
- docs/GSD-WORKFLOW-PROMPT.md - 完整启动文档
- backend/.gsd/README.md - 恢复指南