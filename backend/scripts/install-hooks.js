/**
 * 本地 Git Hooks 安装脚本
 *
 * 用于初始化 husky 和配置 commit hooks
 * 在 npm install 后自动运行
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 开始配置 Git Hooks...\n');

// 1. 确保在 git 仓库中
try {
  execSync('git rev-parse --git-dir', { stdio: 'pipe' });
  console.log('✓ 检测到 Git 仓库');
} catch {
  console.error('✖ 当前目录不是 Git 仓库');
  process.exit(1);
}

// 2. 安装 husky（如果未安装）
try {
  const huskyPath = path.join(__dirname, 'node_modules/husky');
  if (!fs.existsSync(huskyPath)) {
    console.log('📦 安装 husky...');
    execSync('npm install husky --save-dev', { stdio: 'inherit' });
  }
  console.log('✓ husky 已安装');
} catch (err) {
  console.error('✖ husky 安装失败:', err.message);
  process.exit(1);
}

// 3. 初始化 husky
try {
  console.log('\n🔧 初始化 husky...');
  execSync('npx husky install', { stdio: 'inherit' });
  console.log('✓ husky 初始化完成');
} catch (err) {
  console.error('✖ husky 初始化失败:', err.message);
  process.exit(1);
}

// 4. 创建 commit-msg hook
console.log('\n📝 创建 commit-msg hook...');
const hooksDir = '.husky';
const commitMsgPath = path.join(hooksDir, 'commit-msg');

// 创建 hook 文件
const commitMsgContent = `#!/bin/sh
#
# Commit Msg Hook - 验证提交信息格式
#

# 检查是否为空
commit_msg=$(cat "$1")
if [ -z "$commit_msg" ]; then
  echo "✖ 提交信息不能为空"
  exit 1
fi

# 跳过 merge 提交
if echo "$commit_msg" | grep -qE "^Merge"; then
  exit 0
fi

# 运行 commitlint
echo "$commit_msg" | npx --yes commitlint --edit "$1" 2>/dev/null || exit 1
echo "✓ 提交信息格式验证通过"
`;

fs.writeFileSync(commitMsgPath, commitMsgContent, { mode: 0o755 });
console.log('✓ commit-msg hook 已创建');

// 5. 创建 pre-commit hook
console.log('\n🔧 创建 pre-commit hook...');
const preCommitPath = path.join(hooksDir, 'pre-commit');

const preCommitContent = `#!/bin/sh
#
# Pre-Commit Hook - 提交前检查
#

echo "🔍 开始 pre-commit 检查...\n"

# 检查暂存的文件
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)
if [ -z "$STAGED_FILES" ]; then
  echo "⚠️  没有暂存的文件"
  exit 0
fi

# 敏感信息检测
echo "🔒 检查敏感信息..."
SENSITIVE_PATTERNS="api[_-]?key|secret|password|AKIA|PRIVATE KEY"
for file in $STAGED_FILES; do
  if [ -f "$file" ] && grep -lE "$SENSITIVE_PATTERNS" "$file" 2>/dev/null; then
    echo "✖ 发现敏感信息: $file"
    exit 1
  fi
done
echo "✓ 无敏感信息"

# ESLint 检查
if echo "$STAGED_FILES" | grep -qE "\\.(js|jsx|ts|tsx)$"; then
  echo "🔧 运行 ESLint..."
  ESLINT_FILES=$(echo "$STAGED_FILES" | grep -E "\\.(js|jsx|ts|tsx)$" | tr '\n' ' ')
  [ -n "$ESLINT_FILES" ] && npx eslint $ESLINT_FILES --max-warnings=0 2>/dev/null || true
fi

echo "\n✓ Pre-commit 检查完成"
`;

fs.writeFileSync(preCommitPath, preCommitContent, { mode: 0o755 });
console.log('✓ pre-commit hook 已创建');

// 6. 配置 git hooks 路径
try {
  console.log('\n📁 配置 git hooks 路径...');
  execSync('git config core.hooksPath .husky', { stdio: 'pipe' });
  console.log('✓ git hooks 路径已配置');
} catch {
  // 可能已经配置过，忽略错误
}

// 7. 输出说明
console.log(`
==========================================
✓ Git Hooks 配置完成！
==========================================

已配置的 hooks：
  - commit-msg: 验证提交信息格式
  - pre-commit: 提交前检查

提交格式要求：
  feat(module): description
  fix(auth): resolve issue
  docs: update README

可用命令：
  - git commit: 正常提交（触发 hooks）
  - git commit --no-verify: 跳过 hooks（不推荐）
  - npm run commit: 使用交互式提交

更多信息请查看：
  - docs/git规范/commitlint.config.js
  - docs/git规范/分支模型说明.md
==========================================
`);