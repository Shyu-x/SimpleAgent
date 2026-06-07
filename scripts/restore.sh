#!/usr/bin/env bash
# =====================================================
#  SimpleAgent - 数据恢复脚本
#  用法: ./scripts/restore.sh <backup_dir>
#  从 BACKUP_DIR 恢复到 backend/data/
#  安全: 仅接受 /tmp/backup/ 下的路径
# =====================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TARGET_DIR="${PROJECT_ROOT}/backend/data"
BACKUP_BASE_ALLOWED="/tmp/backup"
PM2_NAME="${PM2_NAME:-ai-chat-backend}"

# ---------- 参数 ----------
if [[ $# -lt 1 ]]; then
  echo "用法: $0 <backup_dir_or_archive>" >&2
  echo "示例: $0 /tmp/backup/20260604_120000" >&2
  echo "      $0 /tmp/backup/20260604_120000.tar.gz" >&2
  exit 1
fi

INPUT="$1"

# ---------- 路径校验 (防注入) ----------
if [[ "${INPUT}" != "${BACKUP_BASE_ALLOWED}"/* ]]; then
  echo "[ERROR] 路径必须在 ${BACKUP_BASE_ALLOWED}/ 下" >&2
  echo "[ERROR] 拒绝执行: ${INPUT}" >&2
  exit 1
fi

# ---------- 准备 ----------
if [[ ! -e "${INPUT}" ]]; then
  echo "[ERROR] 备份不存在: ${INPUT}" >&2
  exit 1
fi

# 确认
echo "[WARN] 即将恢复: ${INPUT}"
echo "[WARN] 目标目录: ${TARGET_DIR}"
read -rp "确认恢复? 数据将被覆盖! (yes/no): " CONFIRM
if [[ "${CONFIRM}" != "yes" ]]; then
  echo "[ABORT] 用户取消"
  exit 0
fi

# ---------- 停止服务 ----------
echo "[INFO] 停止 ${PM2_NAME}..."
if command -v pm2 >/dev/null 2>&1; then
  pm2 stop "${PM2_NAME}" 2>/dev/null || true
else
  echo "[WARN] pm2 未安装, 假设服务已手动停止"
fi

# ---------- 恢复 ----------
mkdir -p "${TARGET_DIR}"
if [[ "${INPUT}" == *.tar.gz ]]; then
  echo "[INFO] 解压 ${INPUT} ..."
  TMP_DIR=$(mktemp -d)
  tar -xzf "${INPUT}" -C "${TMP_DIR}"
  INNER_DIR=$(find "${TMP_DIR}" -mindepth 1 -maxdepth 1 -type d | head -1)
  rsync -a --delete "${INNER_DIR}/" "${TARGET_DIR}/"
  rm -rf "${TMP_DIR}"
else
  echo "[INFO] 复制 ${INPUT} -> ${TARGET_DIR}"
  rsync -a --delete "${INPUT}/" "${TARGET_DIR}/"
fi

# ---------- 重启 ----------
echo "[INFO] 重启 ${PM2_NAME}..."
if command -v pm2 >/dev/null 2>&1; then
  pm2 start "${PM2_NAME}" 2>/dev/null || pm2 restart "${PM2_NAME}" 2>/dev/null || true
fi

# ---------- 验证 ----------
FILE_COUNT=$(find "${TARGET_DIR}" -type f | wc -l)
SIZE=$(du -sh "${TARGET_DIR}" | awk '{print $1}')
echo "=========================================="
echo " 恢复完成: ${FILE_COUNT} 文件, ${SIZE}"
echo " 服务:    ${PM2_NAME} 已重启"
echo "=========================================="
