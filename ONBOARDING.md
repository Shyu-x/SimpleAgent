# SimpleAgent 团队入职指南

> 基于 30 天实际使用数据生成的入职文档

## 基本信息

| 项目 | 值 |
|------|-----|
| 团队名称 | SimpleAgent |
| 技术栈 | React 19 + Next.js 16 + Zustand 5 + Express |
| 端口 | 前端 3001，后端 30000 |
| 主要 API | MiniMax Token Plan (v2.5.1+) |

## 工作类型分布

```
Debug Fix  ████████████████████████████████████████ 100.00%
```

**调试修复**主导所有工作——这意味着：
- 遇到问题先查看 `backend/src/services/agentEngine.js` 的取消机制
- 查看 `docs/持续优化日志.md` 了解已知问题
- 常见问题在 CLAUDE.md 的 Bug 修复记录章节

## 常用技能使用频率

```
/compact   ███████████████████████████████           8x   (压缩上下文)
/ultragoal █████████████████████████████            7x   (长期目标追踪)
/loop      ██████████                                3x   (定时任务)
/goal      ███████                                   2x   (阻塞直到完成)
/simplify  ███████                                   2x   (代码审查清理)
```

## MCP 服务器使用

| MCP | 用途 | 调用次数 |
|-----|------|----------|
| MiniMax | 图片理解和视觉分析 | 4x |
| fetch | 网页内容获取 | 2x |

## 环境设置清单

### 1. 代码库准备

```bash
# 克隆仓库
git clone <repo-url>
cd SimpleAgent

# Node 环境 (使用 nvm)
nvm use  # 读取 .nvmrc
node --version  # 确认 v20.x.x

# 安装依赖
pnpm install

# 后端启动
cd backend && pnpm dev

# 前端启动 (另一个终端)
cd frontend && pnpm dev
```

### 2. MCP 服务器配置

```bash
# .mcp.json 已配置 (MiniMax 和 fetch)
# 确保 MINIMAX_API_KEY 在 backend/.env 中设置
```

### 3. 验证服务

```bash
# 后端健康检查
curl http://localhost:30000/api/health

# 前端
curl http://localhost:3001
```

## 新人入门任务

**第一个任务：运行测试套件**

```bash
# 后端测试
cd backend && pnpm test

# 前端测试
cd frontend && pnpm test
```

这是一个安全的起点，可以：
1. 熟悉代码结构
2. 了解测试框架 (Vitest)
3. 验证环境配置正确

## 团队约定

### 1. 代码审查
- 每次修改后运行 `pnpm test` 确保通过
- 提交前检查 `frontend/src/lib/sse.ts` 和 `frontend/src/components/WelcomeGuide.tsx` —— 这两个文件最近有 bug 修复

### 2. 文档位置
- 核心文档：`CLAUDE.md`
- Bug 追踪：`docs/持续优化日志.md`
- 架构详情：`docs/六层架构技术栈详解.md`
- 前端验证：`frontend/docs/前端功能验证报告.md`

### 3. 快速恢复
- 测试失败？查看 `backend/tests/unit/` 目录，791 个测试在运行
- 流式响应问题？检查 `frontend/src/lib/sse.ts` 的事件处理逻辑
- UI 居中问题？检查 Tailwind `flex items-center justify-center` 类

### 4. 常见陷阱
- **不要**在 `sse.ts` 中对 `thinking_delta` 事件使用 `return` —— 这会阻止后续的 `choices` 处理
- **不要**忘记给 `WelcomeGuide.tsx` 的全屏遮罩添加 flex 居中类
- 使用 `npx vitest` 而不是 `pnpm exec vitest`（后端测试）

## 联系方式

- 项目负责人：Shyu-x
- 主要沟通渠道：Claude Code `/loop` 定期同步

---

*文档生成时间：2026-05-24*
*数据来源：30 天使用分析*