# Git 工作流规范 (2026-06-07)

> **强制规则**: 所有代码变更必须遵循 feature → release → master 多级流程。
> 禁止 feature 分支直接合并到 master。

## 一、分支模型 (3 级)

```
master (生产)
   ↑ 仅允许通过 release/* PR 合并
release/vX.Y.Z (预发布)
   ↑ 仅允许通过 feature/* 或 fix/* PR 合并
feature/<name> | fix/<name> (开发)
   ↑ 个人 worktree 自由开发
```

### 1.1 分支角色

| 分支 | 命名 | 角色 | 谁可以 push | 合并方式 |
|------|------|------|------------|----------|
| `master` | 固定 | 生产环境代码 | 禁止 (只能通过 PR) | 仅 Squash merge from `release/*` |
| `release/vX.Y.Z` | 固定格式 | 预发布 / 集成测试 | 维护者 (无审查) | 仅 Squash merge from `feature/*` |
| `feature/<name>` | kebab-case | 单个功能开发 | 任何人 | Squash merge → `release/*` |
| `fix/<name>` | kebab-case | 单个 bug 修复 | 任何人 | Squash merge → `release/*` |
| `hotfix/<name>` | kebab-case | 紧急生产修复 | 维护者 | 直接 merge → `master` (绕过 release) |

### 1.2 命名规范

```bash
# ✅ 正确
feature/user-auth-oauth
feature/rag-reranker-v2
fix/memory-leak-on-shutdown
fix/typing-mismatch-in-agents
hotfix/critical-sse-disconnect

# ❌ 错误
Feature/UserAuth      # 大写 / PascalCase
feature_user_auth     # 下划线
feature/              # 空名
my-feature            # 没有 feature/ 前缀
```

## 二、完整流程

### 2.1 标准开发 (feature → release → master)

```bash
# 1. 从 master 拉新 release 分支 (每个 sprint 一个)
git checkout master
git pull
git checkout -b release/v2.6.0

# 2. 为每个任务创建 feature 分支 (从 release)
git checkout -b feature/oauth-login

# 3. 开发 + commit (每 1-2 小时一个小 commit)
git add -p
git commit -m "feat(auth): 加 Google OAuth 登录"

# 4. 推到远程 + 开 PR
git push -u origin feature/oauth-login
gh pr create --base release/v2.6.0 \
  --title "feat(auth): 加 Google OAuth 登录" \
  --body "..."

# 5. 等待 CI + 1+ 审查者批准 → Squash merge → release/v2.6.0

# 6. 在 release 上测试 (staging 部署, 跑 GATE)
# 7. 一切 OK 后: 从 release/v2.6.0 开 PR → master
gh pr create --base master --head release/v2.6.0 \
  --title "release: v2.6.0 (含 12 features + 5 fixes)"

# 8. 维护者审 master PR → Squash merge
```

### 2.2 紧急修复 (hotfix)

```bash
# 1. 从 master 拉 hotfix
git checkout master
git checkout -b hotfix/critical-sse-disconnect

# 2. 修 + 测 + commit
git commit -m "fix(sse): 立即释放连接, 避免 fd 耗尽"

# 3. 直接 PR 到 master (跳过 release)
gh pr create --base master --head hotfix/critical-sse-disconnect \
  --title "hotfix(sse): 立即释放连接" \
  --body "⚠️ 紧急: 生产 SSE fd 泄漏, 立即合并"

# 4. 合并后 cherry-pick 回 release 分支 (如果有未发布的)
git checkout release/v2.6.0
git cherry-pick <hotfix-commit-sha>
```

### 2.3 撤销回滚

```bash
# 紧急回滚 master 到上一个 release
git checkout master
git revert -m 1 <merge-commit-sha>  # 推荐, 保留历史
git push

# 或: 强制回退 (不推荐, 会丢历史)
git reset --hard <last-good-sha>
git push --force-with-lease  # 注意: --force-with-lease 比 --force 安全
```

## 三、Worktree 规范 (强制)

> **核心规则**: 一个 worktree = 一个分支 = 一个任务。
> 禁止在同一目录跨分支工作 (会污染 context, 容易丢改动)。

### 3.1 推荐目录结构

```
~/Develop/SimpleAgent/
├── .bare/                  # bare repo (worktree 基础)
└── worktrees/
    ├── master/             # master 分支 worktree
    ├── release-v2.6.0/     # release 分支 worktree
    ├── feature-oauth/      # feature 分支 worktree
    └── fix-memory-leak/    # fix 分支 worktree
```

### 3.2 一键 worktree 工具 (使用 `scripts/git-worktree.sh`)

```bash
# 创建新 feature worktree (自动从 master 拉新分支)
./scripts/git-worktree.sh new feature/oauth-login

# 列出所有 worktree
./scripts/git-worktree.sh list

# 清理已合并的 worktree
./scripts/git-worktree.sh cleanup
```

### 3.3 worktree 强制约束

- ✅ 同一时间一个 worktree 只能 checkout 一个分支
- ✅ 不同 worktree 共享 .git 目录, 切换快 (< 1s)
- ✅ 跨 worktree 可以同时打开 IDE (每个 worktree 一个窗口)
- ❌ 禁止在 master worktree 直接 `git checkout feature/x` 切换
- ❌ 禁止在 worktree 中执行 `git pull` 而不切到对应分支的 worktree
- ❌ 禁止手动删除 worktree 目录 (用 `git worktree remove`)

### 3.4 并行 agent 强制

- 每个 subagent / 协作 agent 必须在自己的 worktree 中工作
- worktree 路径必须显式传递给 agent
- agent 不能修改 `.bare/` 之外的共享目录

## 四、提交规范

### 4.1 Conventional Commits

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

| Type | 用途 | 例子 |
|------|------|------|
| `feat` | 新功能 | `feat(rag): 加 cross-encoder 重排序` |
| `fix` | bug 修复 | `fix(sse): 连接断开后释放 fd` |
| `refactor` | 重构 (无功能变化) | `refactor(agent): 拆 ReAct 循环为多个 step` |
| `docs` | 仅文档 | `docs(workflow): 写 git-workflow 规范` |
| `test` | 仅测试 | `test(journey): 加 login 真实截图` |
| `chore` | 杂项 (deps, config) | `chore(deps): 装 next-intl 4.0` |
| `perf` | 性能优化 | `perf(docker): 多阶段构建 -92%` |
| `ci` | CI/CD | `ci(github): 加 GATE workflow` |
| `revert` | 回滚 | `revert: feat(rag): 不稳定的 cross-encoder` |

### 4.2 Commit 粒度

- ✅ **小 commit (推荐)**: 每个 commit 1 个独立变更, 200 行以内
- ✅ **逻辑独立**: 拆 refactor + feat 到不同 commit
- ❌ **巨型 commit**: 1000+ 行, 难以 review / revert
- ❌ **混合 commit**: 同一 commit 含 feat + fix + docs

### 4.3 Commit 前自检

- [ ] `git diff --stat` 检查改动范围 (期望 < 200 行 / commit)
- [ ] `git diff` 检查无调试代码 (console.log, debugger, .only)
- [ ] `pnpm test` 在 feature worktree 通过
- [ ] `bash scripts/online-gate.sh` 在 release worktree 通过
- [ ] 提交信息描述"为什么"而不是"做了什么"

## 五、PR 审查规范

### 5.1 PR 大小

- **小型 PR (推荐)**: < 200 行 diff, 1 个 reviewer, < 30 min review
- **中型 PR**: 200-500 行, 2 个 reviewer, 1-2 hour review
- **大型 PR (> 500 行)**: 必须拆 PR, 或写 RFC 文档先

### 5.2 PR 模板

```markdown
## 变更类型
- [ ] feat (新功能)
- [ ] fix (bug 修复)
- [ ] refactor (重构)

## 目标分支
- [ ] release/vX.Y.Z (标准)
- [ ] master (hotfix only)

## 变更摘要
<!-- 1-3 句话说明这个 PR 解决了什么问题 -->

## 测试
- [ ] `pnpm test` 通过
- [ ] `bash scripts/online-gate.sh` 通过
- [ ] 手动测试场景 1, 2, 3

## 截图 (UI 变更)
<!-- 粘贴 1-3 张关键截图 -->

## 关联 Issue
<!-- Closes #123 -->
```

### 5.3 合并权限

- `release/*` PR: 任何贡献者可开, **1 个 reviewer + CI 通过** 即合并
- `master` PR: 仅维护者可开, **2 个 reviewer + 全部 CI 通过 + staging 验证** 才合并
- `hotfix` PR: 仅维护者可开, **1 个 reviewer + 紧急标记** 即可合并, 合并后必须 cherry-pick 回 release

## 六、CI/CD 强制门禁

每个 PR 必须通过:

1. **后端单测** (`pnpm test` in `backend/`)
2. **前端单测** (`pnpm test` in `frontend/`)
3. **类型检查** (`tsc --noEmit` 在两个包)
4. **综合测试** (`node tests/comprehensive-test.js`)
5. **GATE 验收** (`bash scripts/online-gate.sh`)
6. **A11y 审计** (新页面/组件: `node scripts/a11y-audit.mjs`)
7. **Docker 镜像** (改 Dockerfile: 总和 < 800MB)
8. **安全扫描** (无硬编码密钥)

## 七、当前状态 (2026-06-07)

| 分支 | 状态 | 保护 | 备注 |
|------|------|------|------|
| `master` | 锁定, 仅 release 可合并 | 立即配置 | 生产 |
| `release/v2.5.1` | 锁定, 需 release/v2.6.0 替换 | 待配置 | 即将废弃 |
| `release/v2.6.0` | 应创建 (含 Sprint #6-8) | 计划 | 待开 |
| `fix/urgent-bugs` | 当前, Wave 8 已 commit 14 个 | 不需保护 | 合并后清理 |
| `feature/*` (4 个) | 历史 | 不需保护 | 合并后清理 |

## 八、迁移路径 (本周)

1. **Day 1**: 写本文档 + scripts/git-worktree.sh 工具 + GitHub API 应用 master 保护
2. **Day 2**: 创建 `release/v2.6.0` 分支, 包含 Sprint #6-8 累计 50+ commit
3. **Day 3**: 在 release/v2.6.0 上跑 GATE + 5 服务部署验证
4. **Day 4**: PR `release/v2.6.0` → `master`, 合并后清理 fix/urgent-bugs
5. **Day 5**: 团队培训 + PR 模板发布

## 九、违反处理

| 违反 | 检测方式 | 处理 |
|------|----------|------|
| 直推 master | GitHub webhook 拒绝 push | PR 模板强提示 |
| 跳过 release 直接 PR master | PR 模板 base 分支检查 | 拒绝合并, 要求 rebase 到 release |
| 巨型 commit | 提交前 size check (hook) | 要求拆 commit |
| 缺测试 | CI 必跑测试, 0 覆盖率不允许 | 强制补测试 |
| 缺 GATE | CI 必跑 GATE | 强制重跑 |

## 十、附录: 工具脚本

- `scripts/git-worktree.sh` - worktree 创建/清理 (强制规范)
- `scripts/online-gate.sh` - GATE 15/15 验收
- `scripts/a11y-audit.mjs` - a11y 审计
- `.github/workflows/` - CI 工作流 (待加)
- `.github/CODEOWNERS` - 强制审查者 (待加)
