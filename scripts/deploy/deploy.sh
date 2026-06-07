#!/bin/bash
# ==========================================
# SimpleAgent 部署脚本
# 用法: ./deploy.sh [dev|staging|prod]
# ==========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ===== 颜色输出 =====
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

# ===== 参数解析 =====
ENV=${1:-development}
[[ "$ENV" == "dev" ]] && ENV="development"
[[ "$ENV" == "staging" ]] && ENV="staging"
[[ "$ENV" == "prod" ]] && ENV="production"

if [[ ! "$ENV" =~ ^(development|staging|production)$ ]]; then
  log_error "无效的环境: $ENV"
  echo "用法: $0 [dev|staging|prod]"
  exit 1
fi

echo "=========================================="
echo "  SimpleAgent 部署脚本"
echo "  环境: $ENV"
echo "=========================================="

# ===== 环境检查 =====
log_step "1/6 - 检查环境..."

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

# 检查 PM2
if ! command -v pm2 &> /dev/null; then
  log_error "PM2 未安装，请先安装: npm install -g pm2"
  exit 1
fi

# ===== 备份 =====
log_step "2/6 - 备份数据..."
backup_dir="$PROJECT_ROOT/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$backup_dir"

# 备份配置文件
if [[ -f "$PROJECT_ROOT/backend/.env" ]]; then
  cp "$PROJECT_ROOT/backend/.env" "$backup_dir/.env.backup"
  log_info "已备份 .env"
fi

# ===== 安装依赖 =====
log_step "3/6 - 安装依赖..."

log_info "安装后端依赖..."
cd "$PROJECT_ROOT/backend"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

log_info "安装前端依赖..."
cd "$PROJECT_ROOT/frontend"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# ===== 构建 =====
log_step "4/6 - 构建前端..."
cd "$PROJECT_ROOT/frontend"
pnpm build

# ===== 停止旧服务 =====
log_step "5/6 - 重启服务..."

log_info "停止旧进程..."
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true

# 启动后端
log_info "启动后端服务..."
cd "$PROJECT_ROOT"
pm2 start ecosystem.config.js --only ai-chat-backend --env "$ENV"

# 等待后端就绪
sleep 3

# 启动前端
log_info "启动前端服务..."
pm2 start ecosystem.config.js --only ai-chat-frontend --env "$ENV"

# 等待前端就绪
sleep 3

# 保存 PM2 配置
log_info "保存 PM2 配置..."
pm2 save

# ===== 验证 =====
log_step "6/6 - 验证服务..."

sleep 2

backend_ok=false
frontend_ok=false

if curl -sf http://localhost:30000/api/health > /dev/null 2>&1; then
  log_info "后端服务正常 (http://localhost:30000)"
  backend_ok=true
else
  log_error "后端服务异常"
  pm2 logs ai-chat-backend --lines 20 --nostream
fi

if curl -sf http://localhost:3001 > /dev/null 2>&1; then
  log_info "前端服务正常 (http://localhost:3001)"
  frontend_ok=true
else
  log_error "前端服务异常"
  pm2 logs ai-chat-frontend --lines 20 --nostream
fi

# ===== 完成 =====
echo "=========================================="
if $backend_ok && $frontend_ok; then
  log_info "部署完成!"
  echo "  后端: http://localhost:30000"
  echo "  前端: http://localhost:3001"
  echo "  监控: pm2 monit"
else
  log_error "部署失败，请检查日志"
  exit 1
fi
echo "=========================================="
