# SimpleAgent 运维手册

**文档版本**: v1.0
**更新日期**: 2026-05-22
**维护者**: 运维团队

---

## 目录

1. [服务架构概览](#1-服务架构概览)
2. [监控端点](#2-监控端点)
3. [日志系统](#3-日志系统)
4. [告警规则](#4-告警规则)
5. [故障排除](#5-故障排除)
6. [日常运维任务](#6-日常运维任务)
7. [性能调优](#7-性能调优)

---

## 1. 服务架构概览

### 1.1 服务组件

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (Next.js)                       │
│                     端口: 3001                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      后端 (Node.js/Express)                  │
│                     端口: 30000                              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │   Agent     │ │   RAG       │ │   MetricsCollector     │ │
│  │   Engine    │ │   Service   │ │   AlertManager         │ │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
   │  MiniMax    │    │  Qdrant     │    │   Redis     │
   │  API        │    │  Vector DB  │    │   Cache     │
   └─────────────┘    └─────────────┘    └─────────────┘
```

### 1.2 进程管理

| 服务 | 进程管理器 | 实例数 | 内存限制 | 日志路径 |
|------|----------|--------|--------|---------|
| 后端 | PM2 (cluster) | max (CPU) | 4GB | logs/backend.log |
| 前端 | PM2 (fork) | 1 | 2GB | logs/frontend.log |

### 1.3 端口配置

| 服务 | 端口 | 说明 |
|-----|------|------|
| 前端 | 3001 | Next.js 应用入口 |
| 后端 | 30000 | Express API 服务 |
| Qdrant | 6333/6334 | 向量数据库 (如有) |

---

## 2. 监控端点

### 2.1 可用端点列表

| 端点 | 方法 | 说明 | 状态检查 |
|-----|------|------|---------|
| `/api/health` | GET | 服务健康检查 | ✅ |
| `/metrics` | GET | Prometheus 指标 | ✅ |
| `/api/admin/stats` | GET | 管理后台统计 | ✅ |

### 2.2 健康检查 API

**端点**: `GET /api/health`

**响应示例**:
```json
{
  "status": "healthy",
  "loadLevel": "normal",
  "queueLength": 0,
  "processing": 0,
  "timestamp": "2026-05-22T15:35:12.176Z"
}
```

**负载等级**: `low` / `normal` / `high` / `critical`

### 2.3 Prometheus 指标

**端点**: `GET /metrics`

**关键指标**:

| 指标名 | 类型 | 说明 |
|-------|------|------|
| `http_requests_total` | Counter | HTTP 请求总数 (按 endpoint/status) |
| `http_request_duration_seconds` | Histogram | 请求延迟分布 |
| `process_cpu_seconds_total` | Gauge | CPU 使用时间 |
| `process_memory_bytes` | Gauge | 进程内存使用 |
| `nodejs_active_handles` | Gauge | Node.js 活跃句柄数 |
| `nodejs_active_requests` | Gauge | 活跃请求数 |
| `model_requests_total` | Counter | 模型调用总数 |
| `model_errors_total` | Counter | 模型错误总数 |
| `tool_calls_total` | Counter | 工具调用总数 |
| `queue_length` | Gauge | 队列长度 |

### 2.4 管理统计 API

**端点**: `GET /api/admin/stats`

**响应示例**:
```json
{
  "success": true,
  "data": {
    "totalRequests": 89,
    "successRate": 1,
    "avgLatency": 0,
    "activeSessions": 0,
    "knowledgeBases": [...]
  }
}
```

---

## 3. 日志系统

### 3.1 日志目录结构

```
backend/logs/
├── agent/              # Agent 执行日志 (JSON Lines)
│   ├── run_xxx.json
│   └── run_xxx.json
├── admin-stats.log     # 管理统计日志
├── admin-stream.log    # 流式响应日志
├── admin-trace.log     # 链路追踪日志
├── backend.log        # 主应用日志
├── error.log          # 错误日志
├── sse.log            # SSE 事件日志
├── EventBus.log       # 事件总线日志
├── MissionService.log # 任务服务日志
├── ModuleConfig.log   # 模块配置日志
├── traces/            # 链路追踪文件
└── out.log           # 标准输出日志
```

### 3.2 日志格式

**结构化日志 (JSON Lines)**:
```json
{
  "timestamp": "2026-05-22T15:34:27.876Z",
  "level": "INFO",
  "service": "admin-trace",
  "traceId": "N/A",
  "message": "追踪存储已初始化",
  "pid": 633432
}
```

**Agent 日志示例**:
```json
{"type":"run_start","runId":"run_1779025926424_8loogy","timestamp":"2026-05-22T13:52:06.424Z","pid":12345}
{"type":"llm_request","runId":"run_1779025926424_8loogy","timestamp":"2026-05-22T13:52:06.425Z","messages":[{"role":"user","contentLength":50}],"toolCount":3}
{"type":"llm_response","runId":"run_1779025926424_8loogy","timestamp":"2026-05-22T13:52:06.895Z","hasThinking":true}
```

### 3.3 日志级别

| 级别 | 说明 | 使用场景 |
|-----|------|---------|
| `debug` | 调试信息 | 开发环境详细排查 |
| `info` | 一般信息 | 正常运行日志 |
| `warn` | 警告信息 | 性能下降、可恢复错误 |
| `error` | 错误信息 | 需要关注的异常 |
| `critical` | 严重错误 | 服务不可用 |

### 3.4 日志查看命令

```bash
# 查看后端主日志
tail -f backend/logs/backend.log

# 查看错误日志
tail -f backend/logs/error.log

# 查看最近 100 行
tail -100 backend/logs/backend.log

# 搜索错误关键词
grep -i "error\|exception" backend/logs/error.log | tail -50

# 查看 Agent 执行日志
ls -la backend/logs/agent/

# 查看特定服务的日志
tail -f backend/logs/MissionService.log
```

---

## 4. 告警规则

### 4.1 告警级别定义

| 级别 | 说明 | 响应时间 | 示例 |
|-----|------|--------|------|
| `critical` | 严重告警，需要立即处理 | 5 分钟内 | 服务宕机、API 不可用 |
| `warning` | 警告告警，需要关注 | 30 分钟内 | 性能下降、错误率升高 |
| `info` | 信息告警，仅供参考 | 无要求 | 配置变更、版本更新 |

### 4.2 默认告警规则

#### 4.2.1 严重告警 (Critical)

| 规则 ID | 指标 | 条件 | 说明 |
|---------|------|------|------|
| `health_down` | `/api/health` | status != healthy | 服务不可用 |
| `error_rate_high` | error_rate | > 5% | 错误率过高 |
| `cpu_critical` | cpu_usage | > 90% | CPU 使用率过高 |
| `memory_critical` | memory_usage | > 90% | 内存使用率过高 |

#### 4.2.2 警告告警 (Warning)

| 规则 ID | 指标 | 条件 | 说明 |
|---------|------|------|------|
| `load_high` | loadLevel | == high | 负载偏高 |
| `latency_high` | http_request_duration_seconds | p99 > 5s | 延迟过高 |
| `queue_backlog` | queue_length | > 100 | 队列积压 |
| `error_rate_elevated` | error_rate | > 1% | 错误率上升 |

#### 4.2.3 信息告警 (Info)

| 规则 ID | 指标 | 条件 | 说明 |
|---------|------|------|------|
| `config_changed` | config_version | changed | 配置变更 |
| `version_updated` | app_version | changed | 版本更新 |

### 4.3 告警通知配置

AlertManager 支持 webhook 通知:

```javascript
const alertManager = new AlertManager({
  webhooks: {
    critical: 'https://hooks.example.com/critical-alerts',
    warning: 'https://hooks.example.com/warning-alerts',
    info: 'https://hooks.example.com/info-alerts',
  },
  onAlert: (alert) => {
    console.log('[Alert]', alert.level, alert.message);
  },
});
```

### 4.4 告警查看

```bash
# 查看活跃告警
curl -s http://localhost:30000/api/alerts/active

# 查看告警历史
curl -s http://localhost:30000/api/alerts/history
```

---

## 5. 故障排除

### 5.1 常见问题快速排查

#### 问题 1: 服务无响应

**症状**: 前端无法访问，API 请求超时

**排查步骤**:
```bash
# 1. 检查进程状态
pm2 list

# 2. 查看进程日志
pm2 logs ai-chat-backend --nostream --lines 50

# 3. 检查端口占用
netstat -tlnp | grep 30000

# 4. 检查健康状态
curl -s http://localhost:30000/api/health

# 5. 检查系统资源
top -bn1 | head -20
```

**常见原因**:
- 端口被占用 (EADDRINUSE)
- 内存不足导致 OOM
- 依赖服务未启动

---

#### 问题 2: 错误率飙升

**症状**: 大量 5xx 错误，API 响应失败

**排查步骤**:
```bash
# 1. 查看错误日志
tail -200 backend/logs/error.log | grep -E "^\d{4}-\d{2}-\d{2}" | tail -50

# 2. 检查 Prometheus 指标
curl -s http://localhost:30000/metrics | grep error

# 3. 检查模型 API 状态
curl -s http://localhost:30000/api/admin/models

# 4. 检查熔断器状态
curl -s http://localhost:30000/api/circuit-breaker/status
```

**常见原因**:
- MiniMax API 服务不可用
- 模型调用超时/限流
- 数据库连接池耗尽

---

#### 问题 3: 内存泄漏

**症状**: 内存使用持续增长，进程频繁重启

**排查步骤**:
```bash
# 1. 检查内存使用趋势
tail -500 backend/logs/backend.log | grep -E "memory|Memory" | tail -20

# 2. 查看堆快照
pm2 plus  # PM2 Plus 控制台

# 3. 检查 Node.js 内存
curl -s http://localhost:30000/metrics | grep nodejs_active
```

**常见原因**:
- 会话数据未清理
- 事件监听器泄漏
- 大对象缓存未释放

---

#### 问题 4: SSE 流式响应异常

**症状**: 前端无法接收流式数据，连接中断

**排查步骤**:
```bash
# 1. 检查 SSE 日志
tail -f backend/logs/sse.log

# 2. 检查连接数
curl -s http://localhost:30000/metrics | grep http_requests_active

# 3. 测试 SSE 端点
curl -N -H "Accept: text/event-stream" http://localhost:30000/api/chat/stream
```

**常见原因**:
- 客户端网络中断
- 服务器负载过高
- 代理配置问题 (nginx)

---

### 5.2 进程管理命令

```bash
# 重启后端
pm2 restart ai-chat-backend

# 重启前端
pm2 restart ai-chat-frontend

# 重启所有服务
pm2 restart all

# 查看实时日志
pm2 logs --nostream

# 查看特定进程
pm2 logs ai-chat-backend --nostream --lines 100

# 清理日志
pm2 flush

# 保存进程列表
pm2 save

# 查看进程详情
pm2 describe ai-chat-backend

# 查看资源使用
pm2 monit
```

---

### 5.3 日志分析命令

```bash
# 按时间范围查询
grep "2026-05-22 1[4-5]:" backend/logs/backend.log

# 统计错误类型
grep "ERROR" backend/logs/error.log | \
  awk '{print $4}' | sort | uniq -c | sort -rn

# 计算 QPS
tail -1000 backend/logs/backend.log | \
  grep "request completed" | \
  awk '{print $1}' | uniq -c

# 查看慢请求 (>5s)
grep -E "duration=[5-9]\." backend/logs/backend.log | tail -20

# 错误率统计
tail -10000 backend/logs/backend.log | \
  awk '/ERROR/ {e++} /request/ {r++} END {print "Error rate:", e/r*100"%"}'
```

---

### 5.4 链路追踪

查看 SSE trace 数据:
```bash
tail -f backend/logs/admin-trace.log
```

关键 trace 字段:
- `traceId`: 请求唯一标识
- `service`: 服务名称
- `spanId`: 调用链路 ID
- `duration`: 执行耗时 (ms)

---

## 6. 日常运维任务

### 6.1 每日检查清单

| 检查项 | 命令/方法 | 阈值 |
|-------|----------|------|
| 服务健康 | `curl -s http://localhost:30000/api/health` | status=healthy |
| CPU 使用率 | `top -bn1 \| head -5` | < 80% |
| 内存使用率 | `free -h` | < 85% |
| 磁盘使用率 | `df -h` | < 90% |
| 错误率 | `grep ERROR backend/logs/backend.log \| wc -l` | < 10/hour |
| 活跃请求 | `curl -s http://localhost:30000/metrics \| grep http_requests_active` | < 100 |
| 队列积压 | 查看 loadLevel | < high |
| PM2 进程状态 | `pm2 list` | all online |

---

### 6.2 周常维护任务

#### 6.2.1 日志清理

```bash
# 清理 7 天前的日志文件
find backend/logs -type f -mtime +7 -name "*.log" -exec rm -f {} \;

# 清理 Agent 日志文件
find backend/logs/agent -type f -mtime +7 -name "*.json" -exec rm -f {} \;

# 清理 PM2 日志
pm2 flush
```

#### 6.2.2 指标数据清理

```bash
# 清理 30 天前的指标数据
find backend/data/metrics -type f -mtime +30 -name "*.json" -exec rm -f {} \;
```

#### 6.2.3 数据库维护 (如有)

```bash
# 清理过期数据
psql -U postgres -d simpleagent -c "DELETE FROM sessions WHERE updated_at < NOW() - INTERVAL '30 days';"
```

---

### 6.3 定期性能测试

```bash
# 运行综合测试
node tests/comprehensive-test.js

# 检查 API 响应时间
for i in {1..10}; do
  time curl -s -o /dev/null http://localhost:30000/api/health
done

# 压测端点
wrk -t4 -c100 -d30s http://localhost:30000/api/health
```

---

### 6.4 备份配置

```bash
# 备份环境变量
cp backend/.env backend/.env.backup-$(date +%Y%m%d)

# 备份 PM2 配置
pm2 save

# 备份路由配置
tar czf configs-backup-$(date +%Y%m%d).tar.gz backend/src/routes/
```

---

## 7. 性能调优

### 7.1 关键配置参数

| 参数 | 默认值 | 调优建议 | 配置文件 |
|-----|--------|--------|---------|
| `NODE_OPTIONS` | 3.8GB | 根据内存调整 | ecosystem.config.js |
| `instances` | max | 生产环境 2-4 | ecosystem.config.js |
| `max_memory_restart` | 4G | 避免 OOM | ecosystem.config.js |
| `max_restarts` | 10 | 根据需求调整 | ecosystem.config.js |
| `restart_delay` | 1000ms | 避免频繁重启 | ecosystem.config.js |

### 7.2 限流配置

| 级别 | 限制 | 说明 |
|-----|------|------|
| 匿名用户 | 100 req/min | IP 限流 |
| 注册用户 | 500 req/min | 用户级别 |
| 高级用户 | 2000 req/min | 无限制 |

查看限流状态:
```bash
curl -s http://localhost:30000/metrics | grep rate_limit
```

### 7.3 熔断器配置

熔断器状态通过 Prometheus 指标暴露:

```bash
# 查看熔断器状态
curl -s http://localhost:30000/metrics | grep circuit_breaker

# 状态码: 0=closed, 1=open, 2=half_open
```

熔断器相关指标:
- `circuit_breaker_state`: 当前状态 (0/1/2)
- `circuit_breaker_calls_total`: 调用总数
- `circuit_breaker_errors_total`: 错误总数
- `circuit_breaker_fallbacks_total`: 回退总数

### 7.4 熔断器状态说明

| 状态 | 值 | 说明 |
|-----|-----|------|
| `closed` | 0 | 正常运行，请求正常通过 |
| `open` | 1 | 熔断开启，所有请求直接回退 |
| `half_open` | 2 | 半开状态，尝试放行部分请求 |

**熔断触发条件** (默认):
- 失败率 > 50%
- 请求延迟 > 3s
- 持续时间 > 10s

### 7.4 性能监控面板

推荐使用以下工具:
- **PM2 Plus**: `pm2 plus` (需注册)
- **Grafana**: 配置 Prometheus 数据源
- **Prometheus**: 抓取 `/metrics` 端点

---

## 附录 A: 快速命令参考

```bash
# 服务状态检查
curl -s http://localhost:30000/api/health | jq .

# Prometheus 指标查看
curl -s http://localhost:30000/metrics | head -50

# 管理统计查看
curl -s http://localhost:30000/api/admin/stats | jq .

# PM2 进程管理
pm2 list
pm2 monit
pm2 logs --nostream

# 日志查看
tail -f backend/logs/backend.log
tail -f backend/logs/error.log

# 服务重启
pm2 restart ai-chat-backend
pm2 restart ai-chat-frontend

# Docker 环境查看
docker ps
docker logs simpleagent-backend
docker logs simpleagent-frontend
```

---

## 附录 B: 联系和支持

| 场景 | 联系渠道 |
|-----|---------|
| 紧急故障 | 运维热线 / Slack #ops-emergency |
| 技术问题 | Slack #dev-support |
| 监控告警 | Email ops-alerts@example.com |

---

**文档结束**