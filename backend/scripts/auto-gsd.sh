#!/bin/bash
# GSD 自动执行脚本 - 每 30 分钟检查进度并推进
# 使用方法: ./backend/scripts/auto-gsd.sh

PROJECT_DIR="C:/Users/Xu/Desktop/chat玩具"
LOG_FILE="$PROJECT_DIR/.planning/auto-gsd.log"

echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting GSD auto-execution" >> "$LOG_FILE"

cd "$PROJECT_DIR"

# 执行 Claude Code GSD 进度检查
claude --print "/gsd-next" 2>&1 | tee -a "$LOG_FILE"

echo "$(date '+%Y-%m-%d %H:%M:%S') - GSD auto-execution completed" >> "$LOG_FILE"