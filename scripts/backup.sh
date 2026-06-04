#!/usr/bin/env bash
# =====================================================
#  SimpleAgent - 数据备份脚本
#  用法: ./scripts/backup.sh [--compress]
#  备份 backend/data/ 到 BACKUP_DIR
# =====================================================
set -euo pipefail

# ---------- 配置 ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE_DIR="${PROJECT_ROOT}/backend/data"
BACKUP_BASE="${BACKUP_DIR:-/tmp/backup}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_NAME="${TIMESTAMP}"
BACKUP_PATH="${BACKUP_BASE}/${BACKUP_NAME}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
COMPRESS=false

# ---------- 参数 ----------
for arg in "$@"; do
  case "${arg}" in
    --compress|-z) COMPRESS=true ;;
    --help|-h)
      echo "用法: $0 [--compress] [--help]"
      echo "  --compress  用 tar.gz 压缩备份"
      echo "  环境变量:"
      echo "    BACKUP_DIR       备份根目录 (默认 /tmp/backup)"
      echo "    RETENTION_DAYS   保留天数 (默认 7)"
      exit 0
      ;;
    *) echo "[ERROR] 未知参数: ${arg}" >&2; exit 1 ;;
  esac
done

# ---------- 校验 ----------
if [[ ! -d "${SOURCE_DIR}" ]]; then
  echo "[ERROR] 源目录不存在: ${SOURCE_DIR}" >&2
  exit 1
fi

mkdir -p "${BACKUP_PATH}"

# ---------- 备份 ----------
echo "[INFO] 备份源: ${SOURCE_DIR}"
echo "[INFO] 备份目标: ${BACKUP_PATH}"

# 排除规则: macOS 系统文件 / 日志 / Python 缓存
rsync -a --exclude='.DS_Store' \
          --exclude='*.log' \
          --exclude='__pycache__' \
          --exclude='.cache' \
          --exclude='node_modules' \
          "${SOURCE_DIR}/" "${BACKUP_PATH}/" 2>/dev/null \
  || cp -R "${SOURCE_DIR}/." "${BACKUP_PATH}/" 2>/dev/null

# ---------- 统计 ----------
FILE_COUNT=$(find "${BACKUP_PATH}" -type f | wc -l)
DIR_SIZE=$(du -sh "${BACKUP_PATH}" | awk '{print $1}')

echo "[INFO] 备份完成: ${FILE_COUNT} 个文件, 大小 ${DIR_SIZE}"

# ---------- 压缩 ----------
if [[ "${COMPRESS}" == "true" ]]; then
  ARCHIVE="${BACKUP_BASE}/${BACKUP_NAME}.tar.gz"
  echo "[INFO] 压缩到: ${ARCHIVE}"
  tar -czf "${ARCHIVE}" -C "${BACKUP_BASE}" "${BACKUP_NAME}"
  rm -rf "${BACKUP_PATH}"
  ARCHIVE_SIZE=$(du -sh "${ARCHIVE}" | awk '{print $1}')
  echo "[INFO] 压缩后大小: ${ARCHIVE_SIZE}"
  echo "[DONE] ${ARCHIVE}"
else
  echo "[DONE] ${BACKUP_PATH}"
fi

# ---------- 清理过期 ----------
echo "[INFO] 清理 ${RETENTION_DAYS} 天前的旧备份..."
DELETED=$(find "${BACKUP_BASE}" -maxdepth 1 -mindepth 1 \
  \( -type d -o -name '*.tar.gz' \) \
  -mtime +"${RETENTION_DAYS}" -print -exec rm -rf {} \; 2>/dev/null | wc -l)
echo "[INFO] 已清理 ${DELETED} 个过期备份"

# ---------- 摘要 ----------
REMAINING=$(find "${BACKUP_BASE}" -maxdepth 1 -mindepth 1 \( -type d -o -name '*.tar.gz' \) | wc -l)
TOTAL_SIZE=$(du -sh "${BACKUP_BASE}" 2>/dev/null | awk '{print $1}')
echo "=========================================="
echo " 备份成功: ${BACKUP_NAME}"
echo "  文件数:   ${FILE_COUNT}"
echo " 大小:     ${DIR_SIZE}"
echo " 当前保留: ${REMAINING} 个, 总计 ${TOTAL_SIZE}"
echo "=========================================="
