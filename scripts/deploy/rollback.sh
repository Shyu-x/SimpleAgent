#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=== SimpleAgent 回滚脚本 ==="

# 获取备份列表
backup_dir="$PROJECT_ROOT/backups"
if [[ ! -d "$backup_dir" ]]; then
  echo "没有找到备份目录"
  exit 1
fi

echo "可用备份:"
ls -1 "$backup_dir" | nl

read -p "选择备份序号: " choice
backup=$(ls -1 "$backup_dir" | sed -n "${choice}p")

if [[ -z "$backup" ]]; then
  echo "无效选择"
  exit 1
fi

echo "回滚到: $backup"

# 执行回滚
pm2 stop all 2>/dev/null || true

# TODO: 实现具体回滚逻辑

pm2 restart all

echo "回滚完成"