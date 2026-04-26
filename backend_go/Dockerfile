# AI Chat 玩具 - Go 版本 Dockerfile

# 阶段1: 构建
FROM golang:1.21-alpine AS builder

# 设置工作目录
WORKDIR /app

# 安装构建依赖
RUN apk add --no-cache git ca-certificates

# 复制依赖文件
COPY go.mod go.sum ./

# 下载依赖
RUN go mod download

# 复制源代码
COPY . .

# 构建参数
ARG BUILD_VERSION=unknown
ARG BUILD_TIME=unknown

# 构建二进制文件
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags "-s -w -X main.Version=${BUILD_VERSION} -X main.BuildTime=${BUILD_TIME}" \
    -o /server ./cmd/server

# 阶段2: 运行
FROM alpine:3.19

# 设置工作目录
WORKDIR /app

# 安装运行时依赖
RUN apk add --no-cache ca-certificates tzdata wget

# 创建非root用户
RUN adduser -D -g '' appuser

# 复制构建产物
COPY --from=builder /server /app/server

# 复制配置文件
COPY config.yaml /app/config.yaml

# 创建数据目录
RUN mkdir -p /app/data && chown -R appuser:appuser /app

# 设置文件权限
RUN chown -R appuser:appuser /app

# 切换到非root用户
USER appuser

# 暴露端口
EXPOSE 30000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:30000/health || exit 1

# 启动命令
ENTRYPOINT ["/app/server"]
CMD ["--config", "/app/config.yaml"]
