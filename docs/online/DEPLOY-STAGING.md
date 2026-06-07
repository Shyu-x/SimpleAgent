# Staging 部署手册（Docker 替代方案）

> 适用版本: SimpleAgent v2.5.x
> 最后更新: 2026-06-04

## 一、为什么不用 Docker

本机 Docker daemon 不可用（无 sudo 权限 / dockerd 未启动 / 资源受限），
因此 staging 环境采用 **本地进程 + nohup** 方式部署，模拟"独立 staging 实例"。

| 维度 | Docker 方案 | 当前方案 (nohup) |
|------|-------------|------------------|
| 隔离性 | 进程级 (namespace) | 仅端口隔离 |
| 资源限制 | cgroup | 无 |
| 启动速度 | 慢 (镜像拉取) | 快 (本地源码) |
| 适用场景 | 生产 / 多环境 | staging / 端到端验证 |
| 复杂度 | 高 | 低 |

> **生产环境仍推荐 Docker / K8s**。本方案仅用于 staging 验证。

## 二、端口分配

| 服务 | 端口 | 与生产/开发的关系 |
|------|------|------------------|
| dev backend | 30000 | 本地开发 (保留) |
| dev frontend | 3001 | 本地开发 (保留) |
| **staging backend** | **30080** | 本手册部署目标 |
| **staging frontend** | **30081** | 本手册部署目标 |
| production backend | 待定 (HTTPS + K8s) | 暂未部署 |

> 选择 30080/30081 而非 80/443：避免 sudo、避开 dev 端口、清晰标识"staging 段"。

## 三、启动 staging

### 前置条件
- Node.js v20.x (`.nvmrc` 锁定)
- pnpm >= 8
- PostgreSQL 可达 (默认配置)
- Redis 可选 (降级到本地)
- 已 `pnpm install` (backend + frontend)
- frontend 已 `pnpm build` (生成 `.next/BUILD_ID`)

### 一键启动
```bash
bash /home/xu/Develop/longTermProject/SimpleAgent/scripts/deploy-staging.sh start
```

输出示例:
```
=== staging 部署完成 ===
  backend  pid=710323  http://localhost:30080
  frontend pid=724210  http://localhost:30081
  logs     /tmp/staging/logs
  停止     bash scripts/deploy-staging.sh stop
```

### 手动启动 (如脚本失败)
```bash
# 1. 后端
cd /home/xu/Develop/longTermProject/SimpleAgent/backend
DISABLE_RATE_LIMIT=true PORT=30080 \
  nohup node --watch src/index.js > /tmp/staging/logs/backend.log 2>&1 &

# 2. 前端 (依赖 build 产物)
cd /home/xu/Develop/longTermProject/SimpleAgent/frontend
PORT=30081 NEXT_PUBLIC_BACKEND_URL=http://localhost:30080 \
  nohup pnpm exec next start -p 30081 > /tmp/staging/logs/frontend.log 2>&1 &
```

> **为什么用 `next start` 而不是 `next dev`**：dev 模式会在 `.next/dev/` 写锁文件，
> 与 3001 端口的 dev 前端互斥；start 模式只读 build 产物，可与 dev 并存。

## 四、验证 (端到端冒烟)

### 健康检查
```bash
curl -o /dev/null -w '%{http_code}\n' http://localhost:30080/api/health
curl -o /dev/null -w '%{http_code}\n' http://localhost:30081/
```

### 5 路径核心冒烟
```bash
# 后端 (30080)
for p in /api/health /api/tools /api/rag/kb /api/a2a/agents /api/admin/models; do
  echo "$p -> $(curl -s -o /dev/null -w '%{http_code}' http://localhost:30080$p)"
done

# 前端代理 (30081 -> 30080)
for p in / /api/health; do
  echo "$p -> $(curl -s -o /dev/null -w '%{http_code}' http://localhost:30081$p)"
done
```

期望: 全部返回 `200`

## 五、停止 staging

### 通过部署脚本
```bash
bash /home/xu/Develop/longTermProject/SimpleAgent/scripts/deploy-staging.sh stop
```

### 手动 kill
```bash
# 读 pidfile
cat /tmp/staging/backend.pid  | xargs kill
cat /tmp/staging/frontend.pid | xargs kill

# 或按端口杀
fuser -k 30080/tcp
fuser -k 30081/tcp
```

## 六、查看状态

```bash
bash scripts/deploy-staging.sh status
# 或
ss -tlnp | grep -E ':(30080|30081)'
```

## 七、与 production 的差异

| 项 | staging (当前) | production (目标) |
|----|----------------|------------------|
| 反向代理 | 无 (直连端口) | Nginx / Caddy |
| HTTPS | 无 | 强制 (Let's Encrypt) |
| 进程管理 | nohup + pidfile | systemd / PM2 / K8s |
| 日志 | 文本文件 | Loki / ELK |
| 监控 | 手动 curl | Prometheus + Grafana |
| 部署方式 | 手动 bash 脚本 | CI/CD (GitHub Actions) |
| 数据库 | 本地 PostgreSQL | 托管 (RDS / 云数据库) |
| Redis | 降级到内存 | 必须连接 |
| 限流 | DISABLE_RATE_LIMIT=true | 启用 (100 req/min) |
| 弹性伸缩 | 单实例 | HPA / 多副本 |

## 八、常见问题

### Q1: 端口被占用
```bash
ss -tlnp | grep -E ':(30080|30081)'
fuser -k 30080/tcp  # 强制释放
```

### Q2: frontend 启动报"Another next dev server is already running"
原因: 不应使用 `next dev`，改用 `next start`（build 产物模式）。
脚本已默认使用 `next start`。

### Q3: 前端 `/api/*` 502
原因: `NEXT_PUBLIC_BACKEND_URL` 未指向 staging backend (30080)。
解决: 重启 frontend 时显式传入 `NEXT_PUBLIC_BACKEND_URL=http://localhost:30080`。

### Q4: build 产物过期
```bash
cd /home/xu/Develop/longTermProject/SimpleAgent/frontend
pnpm build   # 重新生成 .next/BUILD_ID
bash ../scripts/deploy-staging.sh restart
```

## 九、相关文件

| 文件 | 说明 |
|------|------|
| `scripts/deploy-staging.sh` | 启停脚本 (start/stop/status/restart) |
| `/tmp/staging/logs/` | staging 日志 (backend.log / frontend.log) |
| `/tmp/staging/*.pid` | pid 文件 |
| `frontend/.env.staging` | 临时 env (NEXT_PUBLIC_BACKEND_URL) |
| `frontend/.next/BUILD_ID` | build 产物标识 |
