# AI Chat 玩具 - Go 版本 Makefile
#
# 使用 GVM (Go Version Manager) 管理 Go 版本
# 详见: https://github.com/moovweb/gvm

.PHONY: build run run-dev run-prod test test-cover clean docker-build docker-run docker-up docker-down \
        lint fmt vet deps tidy generate build-all help

# ==================== GVM 配置 ====================

# GVM 设置
GVM_HOME := $(HOME)/.gvm
GVM_BIN := $(GVM_HOME)/bins
GVM_SCRIPTS := $(GVM_HOME)/scripts/gvm

# Go 版本配置
GVM_VERSION := go1.21
GVM_GEMSET := ai-chat-go

# GVM 文件（用于自动版本切换）
GVMFILE := .gvmfile

# ==================== 项目配置 ====================

# 项目名称
PROJECT_NAME := ai-chat-backend-go
BINARY_NAME := server
MAIN_PATH := ./cmd/server

# Go 相关（通过 GVM 调用）
GO := $(GVM_SCRIPTS)/gvm go
GOFLAGS := -v
LDFLAGS := -ldflags "-s -w"

# 构建目录
BUILD_DIR := ./build

# Docker 相关
DOCKER_IMAGE := $(PROJECT_NAME)
DOCKER_TAG := latest
DOCKER_REGISTRY :=

# ==================== GVM 目标 ====================

# GVM 环境检查
gvm-check:
	@if [ ! -d "$(GVM_HOME)" ]; then \
		echo "GVM 未安装，请运行: make gvm-setup"; \
		exit 1; \
	fi
	@if [ ! -f "$(GVM_SCRIPTS)" ]; then \
		echo "GVM 脚本未找到，请运行: make gvm-setup"; \
		exit 1; \
	fi
	@echo "GVM 环境检查通过"

# GVM 安装
gvm-setup:
	@echo "安装 GVM..."
	@bash < <(curl -s -S -L https://raw.githubusercontent.com/moovweb/gvm/master/binscripts/gvm-installer)
	@echo ""
	@echo "请将以下内容添加到 ~/.bashrc 或 ~/.zshrc:"
	@echo "  export GVM_ROOT=$$HOME/.gvm"
	@echo "  [[ -s $$GVM_ROOT/scripts/gvm ]] && source $$GVM_ROOT/scripts/gvm"
	@echo ""
	@echo "然后运行: source ~/.bashrc 或 source ~/.zshrc"

# 安装并设置 Go 版本
gvm-install:
	@if [ ! -d "$(GVM_HOME)" ]; then \
		echo "GVM 未安装，请先运行: make gvm-setup"; \
		exit 1; \
	fi
	@source $(GVM_SCRIPTS) 2>/dev/null || true; \
	echo "安装 Go $(GVM_VERSION)..."; \
	gvm install $(GVM_VERSION) -s || true; \
	echo "创建 gemset $(GVM_GEMSET)..."; \
	gvm gemset create $(GVM_GEMSET) || true; \
	echo "GVM 安装完成!"

# 使用项目指定的 Go 版本
gvm-use:
	@source $(GVM_SCRIPTS) 2>/dev/null || true; \
	gvm use $(GVM_VERSION)@$(GVM_GEMSET) || \
		(echo "版本不存在，正在安装..." && make gvm-install && gvm use $(GVM_VERSION)@$(GVM_GEMSET)); \
	@echo "当前 Go 版本: $$(gvm which go)"
	@echo "当前 GOPATH: $$(echo $$GOPATH)"

# 设置为默认版本
gvm-default:
	@source $(GVM_SCRIPTS) 2>/dev/null || true; \
	gvm use $(GVM_VERSION)@$(GVM_GEMSET) --default || \
		(echo "版本不存在，正在安装..." && make gvm-install && gvm use $(GVM_VERSION)@$(GVM_GEMSET) --default)
	@echo "已设置默认 Go 版本为 $(GVM_VERSION)@$(GVM_GEMSET)"

# ==================== 构建目标 ====================

# 默认目标：GVM 设置 + 依赖 + 构建
all: gvm-use deps build

# 下载依赖
deps:
	$(GO) mod download
	$(GO) mod verify

# 代码整理
tidy:
	$(GO) mod tidy

# 构建
build: tidy
	@mkdir -p $(BUILD_DIR)
	CGO_ENABLED=0 $(GO) build $(GOFLAGS) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) $(MAIN_PATH)

# ==================== 运行目标 ====================

# 开发环境运行
run-dev: build
	@echo "启动开发环境..."
	APP_ENV=development $(BUILD_DIR)/$(BINARY_NAME)

# 生产环境运行
run-prod: build
	@echo "启动生产环境..."
	APP_ENV=production $(BUILD_DIR)/$(BINARY_NAME)

# 运行（默认）
run: build
	./$(BUILD_DIR)/$(BINARY_NAME)

# ==================== 测试目标 ====================

# 测试
test:
	$(GO) test -v -race -cover ./...

# 测试覆盖率
test-cover:
	$(GO) test -v -race -coverprofile=coverage.out ./...
	$(GO) tool cover -html=coverage.out -o coverage.html

# ==================== 清理目标 ====================

# 清理
clean:
	rm -rf $(BUILD_DIR)
	rm -f coverage.out coverage.html

# ==================== Docker 目标 ====================

# Docker 构建
docker-build:
	docker build -t $(DOCKER_REGISTRY)$(DOCKER_IMAGE):$(DOCKER_TAG) .

# Docker 运行
docker-run:
	docker run -p 30000:30000 --env-file .env $(DOCKER_REGISTRY)$(DOCKER_IMAGE):$(DOCKER_TAG)

# Docker Compose 运行
docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

# ==================== 代码质量目标 ====================

# 代码格式化
fmt:
	$(GO) fmt ./...

# 代码检查
lint:
	golangci-lint run ./...

# 静态分析
vet:
	$(GO) vet ./...

# 生成代码
generate:
	$(GO) generate ./...

# ==================== 跨平台构建 ====================

# 构建所有平台
build-all:
	@mkdir -p $(BUILD_DIR)
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 $(GO) build $(GOFLAGS) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-linux-amd64 $(MAIN_PATH)
	GOOS=windows GOARCH=amd64 CGO_ENABLED=0 $(GO) build $(GOFLAGS) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-windows-amd64.exe $(MAIN_PATH)
	GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 $(GO) build $(GOFLAGS) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-amd64 $(MAIN_PATH)

# ==================== 帮助目标 ====================

# 帮助
help:
	@echo "AI Chat 玩具 - Go 版本 Makefile"
	@echo ""
	@echo "GVM 环境设置:"
	@echo "  make gvm-setup      - 安装 GVM (Go Version Manager)"
	@echo "  make gvm-install    - 安装 Go $(GVM_VERSION) 和 gemset"
	@echo "  make gvm-use        - 使用项目指定的 Go 版本"
	@echo "  make gvm-default    - 设置为默认 Go 版本"
	@echo ""
	@echo "构建命令:"
	@echo "  make all            - GVM设置 + 依赖 + 构建"
	@echo "  make deps          - 下载依赖"
	@echo "  make tidy          - 整理依赖"
	@echo "  make build         - 构建二进制"
	@echo "  make build-all     - 构建所有平台"
	@echo ""
	@echo "运行命令:"
	@echo "  make run            - 构建并运行（默认）"
	@echo "  make run-dev        - 开发环境运行"
	@echo "  make run-prod       - 生产环境运行"
	@echo ""
	@echo "测试命令:"
	@echo "  make test           - 运行测试"
	@echo "  make test-cover     - 运行测试并生成覆盖率报告"
	@echo ""
	@echo "Docker 命令:"
	@echo "  make docker-build   - 构建 Docker 镜像"
	@echo "  make docker-run     - 运行 Docker 容器"
	@echo "  make docker-up      - 启动 Docker Compose"
	@echo "  make docker-down    - 停止 Docker Compose"
	@echo ""
	@echo "代码质量:"
	@echo "  make fmt            - 格式化代码"
	@echo "  make lint           - 运行代码检查"
	@echo "  make vet            - 运行静态分析"
	@echo ""
	@echo "清理:"
	@echo "  make clean          - 清理构建文件"
