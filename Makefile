# ==========================================
# AI Chat 玩具 - Makefile
# ==========================================

.PHONY: help install dev backend frontend test test-e2e test-unit test-report clean

# 帮助信息
help:
	@echo "AI Chat 玩具 - Makefile"
	@echo ""
	@echo "用法:"
	@echo "  make install      # 安装依赖"
	@echo "  make dev          # 启动开发模式 (前后端)"
	@echo "  make backend      # 仅启动后端"
	@echo "  make frontend     # 仅启动前端"
	@echo "  make test         # 运行所有测试"
	@echo "  make test-e2e     # 运行 E2E 测试"
	@echo "  make test-report  # 查看测试报告"
	@echo "  make clean        # 清理缓存和报告"
	@echo ""

# 安装依赖
install:
	@echo "📦 安装前端依赖..."
	cd frontend && npm install
	@echo "📦 安装后端依赖..."
	cd backend && npm install
	@echo "📦 安装 Playwright 浏览器..."
	cd frontend && npx playwright install chromium

# 开发模式
dev: backend frontend

# 后端
backend:
	@echo "🚀 启动后端服务..."
	cd backend && npm run dev

# 前端
frontend:
	@echo "🚀 启动前端服务..."
	cd frontend && npm run dev

# 测试
test: test-unit test-e2e

# 单元测试
test-unit:
	@echo "🧪 运行单元测试..."
	cd backend && npm test

# E2E 测试
test-e2e:
	@echo "🌐 运行 E2E 测试..."
	@if [ !d "frontend/node_modules" ]; then \
		echo "⚠️ 前端依赖未安装，运行 make install"; \
	fi
	cd frontend && npm run test:e2e

# E2E 测试 - Playwright
test-playwright:
	@echo "🌐 运行 Playwright 测试..."
	cd frontend && npm run test:e2e:playwright

# E2E 测试 - 有头模式
test-headed:
	@echo "🌐 运行 Playwright 测试 (有头模式)..."
	cd frontend && npm run test:e2e:headed

# E2E 测试 - UI 模式
test-ui:
	@echo "🌐 运行 Playwright 测试 (UI 模式)..."
	cd frontend && npm run test:e2e:ui

# E2E 测试 - 移动端
test-mobile:
	@echo "📱 运行移动端 E2E 测试..."
	cd frontend && npm run test:e2e:mobile

# 测试报告
test-report:
	@echo "📊 生成测试报告..."
	cd frontend && npm run test:e2e:report
	@echo "📄 报告位置: frontend/test-results/html/index.html"

# Docker 测试
docker-test:
	@echo "🐳 运行 Docker 测试..."
	docker-compose -f docker-compose.test.yml up --abort-on-container-exit

# 清理
clean:
	@echo "🧹 清理缓存和报告..."
	rm -rf frontend/.next
	rm -rf frontend/test-results
	rm -rf backend/node_modules/.cache
	find . -name "*.log" -delete
	find . -name "*.tmp" -delete
	@echo "✅ 清理完成!"

# Docker 清理
docker-clean:
	@echo "🐳 停止 Docker 容器..."
	docker-compose down -v
	docker-compose -f docker-compose.test.yml down -v
	@echo "✅ Docker 清理完成!"

# 构建 Docker 镜像
docker-build:
	@echo "🐳 构建 Docker 镜像..."
	docker-compose build

# 启动 Docker 服务
docker-up:
	@echo "🐳 启动 Docker 服务..."
	docker-compose up -d
	@echo "🌐 服务已启动:"
	@echo "   前端: http://localhost:3000"
	@echo "   后端: http://localhost:30000"
	@echo "   Nginx: http://localhost:8088"

# 停止 Docker 服务
docker-down:
	@echo "🐳 停止 Docker 服务..."
	docker-compose down

# 查看日志
logs:
	docker-compose logs -f

# 后端日志
logs-backend:
	docker-compose logs -f backend

# 前端日志
logs-frontend:
	docker-compose logs -f frontend

# 数据库迁移
db-migrate:
	@echo "📊 运行数据库迁移..."
	cd backend && npx prisma migrate deploy

# 数据库重置
db-reset:
	@echo "⚠️ 重置数据库..."
	cd backend && npx prisma migrate reset --force

# 代码检查
lint:
	@echo "🔍 运行代码检查..."
	cd frontend && npm run lint

# 代码格式化
format:
	@echo "🎨 格式化代码..."
	cd frontend && npx prettier --write "src/**/*.{ts,tsx}"
	cd backend && npx prettier --write "src/**/*.js"

# 生产构建
build:
	@echo "🏗️ 生产构建..."
	docker-compose build

# 生产部署
deploy: docker-build docker-up

# 健康检查
health:
	@echo "🏥 健康检查..."
	@echo -n "前端: "; curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 || echo "❌"
	@echo -n "后端: "; curl -s -o /dev/null -w "%{http_code}" http://localhost:30000/api/health || echo "❌"
	@echo -n "Nginx: "; curl -s -o /dev/null -w "%{http_code}" http://localhost:8088/health || echo "❌"
