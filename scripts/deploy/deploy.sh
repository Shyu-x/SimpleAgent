#!/bin/bash
set -e

# SimpleAgent 部署脚本
# 用法: ./deploy.sh [dev|staging|prod]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 参数
ENV=${1:-development}
shift || true

# 验证环境
if [[ ! "$ENV" =~ ^(dev|staging|prod|development|staging|production)$ ]]; then
  log_error "无效的环境: $ENV"
  echo "用法: $0 [dev|staging|prod]"
  exit 1
fi

log_info "开始部署 SimpleAgent ($ENV 环境)"

# 检查 Node 版本
required_node="20"
current_node=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [[ "$current_node" != "$required_node" ]]; then
  log_warn "Node 版本不正确，期望 v${required_node}.x，当前 v${current_node}.x"
  log_warn "请使用: nvm use"
fi

# 检查 pnpm
if ! command -v pnpm &> /dev/null; then
  log_error "pnpm 未安装，请先安装: npm install -g pnpm"
  exit 1
fi

ENV_NAME="$ENV"
[[ "$ENV" == "dev" ]] && ENV_NAME="development"
[[ "$ENV" == "prod" ]] && ENV_NAME="production"

# 加载环境配置
ENV_FILE="$PROJECT_ROOT/config/env/.env.$ENV_NAME"
if [[ -f "$ENV_FILE" ]]; then
  log_info "加载环境配置: $ENV_FILE"
  set -a
  source "$ENV_FILE"
  set +a
else
  log_warn "环境配置文件不存在: $ENV_FILE"
fi

# 备份当前数据
backup_dir="$PROJECT_ROOT/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$backup_dir"
log_info "备份数据到: $backup_dir"

# 安装依赖
log_info "安装后端依赖..."
cd "$PROJECT_ROOT/backend"
pnpm install --frozen-lockfile

log_info "安装前端依赖..."
cd "$PROJECT_ROOT/frontend"
pnpm install --frozen-lockfile

# 构建
log_info "构建前端..."
cd "$PROJECT_ROOT/frontend"
pnpm build

# 重启服务
log_info "重启 PM2 服务..."

if pm2 describe ai-chat-backend &>/dev/null; then
  log_info "重启后端..."
  cd "$PROJECT_ROOT"
  pm2 restart ai-chat-backend --update-env
else
  log_info "启动后端..."
  cd "$PROJECT_ROOT"
  pm2 start ecosystem.config.js --only ai-chat-backend --env "$ENV"
fi

if pm2 describe ai-chat-frontend &>/dev/null; then
  log_info "重启前端..."
  pm2 restart ai-chat-frontend --update-env
else
  log_info "启动前端..."
  cd "$PROJECT_ROOT"
  pm2 start ecosystem.config.js --only ai-chat-frontend --env "$ENV"
fi

# 保存 PM2 配置
log_info "保存 PM2 配置..."
pm2 save

# 验证
sleep 3
log_info "验证服务状态..."

if curl -sf http://localhost:30000/api/health > /dev/null; then
  log_info "后端服务正常"
else
  log_error "后端服务异常"
  exit 1
fi

if curl -sf http://localhost:3001 > /dev/null; then
  log_info "前端服务正常"
else
  log_error "前端服务异常"
  exit 1
fi

log_info "部署完成!"
log_info "后端: http://localhost:30000"
log_info "前端: http://localhost:3001"