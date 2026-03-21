# ==========================================
# AI 对话平台 - Docker 构建文件
# ==========================================
# 支持前端(Next.js) + 后端(Node.js) 容器化部署
#
# 使用方式:
#   docker build -t ai-chat-platform .
#   docker run -p 3000:3000 -p 8080:8080 ai-chat-platform
#
# 或使用 docker-compose:
#   docker-compose up -d
# ==========================================

# -----------------------------
# 阶段1: 前端构建 (Next.js)
# -----------------------------
FROM node:20-alpine AS frontend-builder

# 设置工作目录
WORKDIR /app/frontend

# 复制前端代码
COPY frontend/package*.json ./
COPY frontend/.npmrc ./

# 安装依赖
RUN npm ci --prefer-offline

# 复制源代码
COPY frontend/ ./

# 构建生产版本
ENV NODE_ENV=production
RUN npm run build

# -----------------------------
# 阶段2: 后端构建
# -----------------------------
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

# 复制 package.json 和 package-lock.json
COPY backend/package*.json ./
COPY backend/.npmrc ./

# 安装依赖
RUN npm ci --prefer-offline --omit=dev

# 复制源代码
COPY backend/ ./

# 构建 TypeScript（如果需要）
# RUN npm run build

# -----------------------------
# 阶段3: 生产运行镜像
# -----------------------------
FROM node:20-alpine AS production

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# 复制前端构建产物
COPY --from=frontend-builder /app/frontend/.next ./.next
COPY --from=frontend-builder /app/frontend/public ./public
COPY --from=frontend-builder /app/frontend/package.json ./frontend/package.json
COPY --from=frontend-builder /app/frontend/next.config.js ./
COPY --from=frontend-builder /app/frontend/next-env.d.ts ./

# 复制后端
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY --from=backend-builder /app/backend/package.json ./backend/package.json
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/src ./backend/src

# 设置环境变量
ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_URL=http://localhost:8080

# 切换到非 root 用户
USER nodejs

# 暴露端口
EXPOSE 3000 8080

# 启动脚本
CMD ["sh", "-c", "echo 'Starting services...' && tail -f /dev/null"]
