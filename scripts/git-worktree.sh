#!/bin/bash
# =============================================================================
# git-worktree.sh - 强制规范的 worktree 管理工具
# 用法:
#   ./scripts/git-worktree.sh new <branch> [base]   创建新 worktree
#   ./scripts/git-worktree.sh list                   列出所有 worktree
#   ./scripts/git-worktree.sh cleanup                清理已合并的 worktree
#   ./scripts/git-worktree.sh switch <branch>        切换到指定 worktree 目录
#   ./scripts/git-worktree.sh help                   显示帮助
#
# 规范 (来自 docs/git-workflow.md):
#   - 一个 worktree = 一个分支 = 一个任务
#   - 不允许在同一目录跨分支工作
#   - worktree 路径: $REPO_ROOT/worktrees/<branch-with-slash-to-dash>
# =============================================================================

set -euo pipefail

# ---- 配置 ----
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
if [ -z "$REPO_ROOT" ]; then
  echo "❌ 错误: 当前目录不在 git 仓库中"
  exit 1
fi

WORKTREE_BASE="${REPO_ROOT}/worktrees"
mkdir -p "$WORKTREE_BASE"

# ---- 颜色 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ---- 工具函数 ----
err()   { echo -e "${RED}❌ $*${NC}" >&2; }
warn()  { echo -e "${YELLOW}⚠️  $*${NC}"; }
ok()    { echo -e "${GREEN}✅ $*${NC}"; }

branch_to_path() {
  # feature/oauth-login -> feature-oauth-login
  echo "${1//\//-}"
}

path_to_branch() {
  # feature-oauth-login -> feature/oauth-login
  echo "${1//-//}" | sed 's|//|/|g'
}

# ---- 命令 ----
cmd_new() {
  local branch="${1:-}"
  local base="${2:-master}"
  if [ -z "$branch" ]; then
    err "用法: $0 new <branch> [base]"
    echo "  例子: $0 new feature/oauth-login"
    echo "  例子: $0 new fix/memory-leak release/v2.6.0"
    exit 1
  fi

  # 校验分支名
  if ! [[ "$branch" =~ ^(feature|fix|hotfix|release)/[a-z0-9-]+$ ]]; then
    err "分支名格式错误: $branch"
    echo "  必须匹配: ^(feature|fix|hotfix|release)/[a-z0-9-]+$"
    echo "  合法例子: feature/oauth-login, fix/memory-leak, release/v2.6.0"
    exit 1
  fi

  local path="${WORKTREE_BASE}/$(branch_to_path "$branch")"

  # 检查是否已存在
  if [ -d "$path" ]; then
    err "Worktree 已存在: $path"
    echo "  切换用: cd $path"
    exit 1
  fi

  # 检查分支是否已存在
  if git show-ref --verify --quiet "refs/heads/$branch"; then
    warn "分支 $branch 已存在, 复用现有分支"
    git worktree add "$path" "$branch"
  else
    # 从 base 拉新分支
    if ! git show-ref --verify --quiet "refs/heads/$base"; then
      err "Base 分支不存在: $base"
      echo "  提示: $0 list 查看所有分支"
      exit 1
    fi
    git worktree add -b "$branch" "$path" "$base"
  fi

  ok "Worktree 已创建: $path"
  echo "  分支: $branch (base: $base)"
  echo "  进入: cd $path"
  echo "  装依赖: cd $path/frontend && pnpm install && cd ../backend && pnpm install"
}

cmd_list() {
  echo "=== Git Worktrees ==="
  git worktree list
  echo ""
  echo "=== 远端分支 (前 20) ==="
  git branch -r | head -20
}

cmd_cleanup() {
  echo "=== 当前 worktree 状态 ==="
  git worktree list --porcelain | while read -r line; do
    if [[ "$line" == "branch "* ]]; then
      local branch="${line#branch }"
      local branch_short="${branch#refs/heads/}"

      # 检查分支是否已合并到 master
      if git branch --merged master 2>/dev/null | grep -qE "^\s*${branch_short}\s*$"; then
        warn "已合并到 master: $branch_short"
        local path="$(git worktree list --porcelain | grep -B 1 "branch $branch" | head -1 | awk '{print $2}')"
        if [ -n "$path" ] && [ -d "$path" ]; then
          echo "  候选清理: $path"
        fi
      fi
    fi
  done

  echo ""
  read -p "确认清理以上已合并的 worktree? (y/N) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    git worktree list --porcelain | while read -r line; do
      if [[ "$line" == "branch "* ]]; then
        local branch="${line#branch }"
        local branch_short="${branch#refs/heads/}"
        if git branch --merged master 2>/dev/null | grep -qE "^\s*${branch_short}\s*$"; then
          local path="$(git worktree list --porcelain | grep -B 1 "branch $branch" | head -1 | awk '{print $2}')"
          if [ -n "$path" ] && [ -d "$path" ]; then
            echo "清理: $path ($branch_short)"
            git worktree remove --force "$path" 2>/dev/null || true
            git branch -d "$branch_short" 2>/dev/null || warn "  分支 $branch_short 保留 (未合并或失败)"
          fi
        fi
      fi
    done
    ok "清理完成"
  else
    echo "取消清理"
  fi
}

cmd_switch() {
  local branch="${1:-}"
  if [ -z "$branch" ]; then
    err "用法: $0 switch <branch>"
    exit 1
  fi
  local path="${WORKTREE_BASE}/$(branch_to_path "$branch")"
  if [ ! -d "$path" ]; then
    err "Worktree 不存在: $path"
    echo "  创建: $0 new $branch"
    exit 1
  fi
  echo "$path"
}

cmd_help() {
  cat <<'EOF'
git-worktree.sh - 强制规范的 worktree 管理工具

用法:
  new <branch> [base]    创建新 worktree
  list                   列出所有 worktree + 远端分支
  cleanup                清理已合并到 master 的 worktree
  switch <branch>        输出指定 worktree 的路径 (供 cd 用)
  help                   显示本帮助

强制规范:
  - 一个 worktree = 一个分支 = 一个任务
  - 不允许在同一目录跨分支工作
  - 分支名必须匹配 ^(feature|fix|hotfix|release)/[a-z0-9-]+$
  - worktree 路径: $REPO_ROOT/worktrees/<branch-with-slash-to-dash>

例子:
  ./scripts/git-worktree.sh new feature/oauth-login
  ./scripts/git-worktree.sh new fix/memory-leak release/v2.6.0
  ./scripts/git-worktree.sh list
  ./scripts/git-worktree.sh cleanup
  cd $(./scripts/git-worktree.sh switch feature/oauth-login)
EOF
}

# ---- 入口 ----
case "${1:-help}" in
  new)     shift; cmd_new "$@" ;;
  list)    shift; cmd_list "$@" ;;
  cleanup) shift; cmd_cleanup "$@" ;;
  switch)  shift; cmd_switch "$@" ;;
  help)    cmd_help ;;
  *)
    err "未知命令: $1"
    cmd_help
    exit 1
    ;;
esac
