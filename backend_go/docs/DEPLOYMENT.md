# GAgent Go 部署指南

## 一、环境要求

### 硬件要求
- CPU: 2 核以上
- 内存: 4GB 以上
- 磁盘: 10GB 以上

### 软件要求
- Go 1.21+
- Redis 7.0+ (可选，用于分布式限流)
- Qdrant (可选，用于向量存储)

## 二、快速部署

### 2.1 单机部署

```bash
# 1. 克隆项目
git clone <repository-url>
cd backend_go

# 2. 配置
cp config.yaml.example config.yaml
vim config.yaml

# 3. 构建
go build -o server ./cmd/server

# 4. 运行
./server
```

### 2.2 Docker 部署

```bash
# 构建镜像
docker build -t gagent-go:latest .

# 运行容器
docker run -p 30000:30000 \
  -e MINIMAX_API_KEY=your_api_key \
  gagent-go:latest
```

### 2.3 Docker Compose 部署 (推荐)

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

## 三、配置详解

### 3.1 config.yaml

```yaml
server:
  host: "0.0.0.0"
  port: 30000

model:
  name: "MiniMax-M2.7"
  api_key: "${MINIMAX_API_KEY}"
  base_url: "https://api.minimaxi.com/anthropic"

redis:
  host: "localhost"
  port: 6379
  password: ""
  db: 0
  enabled: false  # 设为 true 启用 Redis 限流

ratelimit:
  enabled: true
  rate: "1000/m"  # 每分钟1000请求
  concurrent: 100

circuitbreaker:
  enabled: true
  failure_threshold: 5
  success_threshold: 3
  recovery_timeout: 30

rag:
  enabled: true
  vector_store: "qdrant"  # qdrant / pgvector / simple
  top_k: 5
  rerank: true
```

### 3.2 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| MINIMAX_API_KEY | MiniMax API 密钥 | 是 |
| MINIMAX_BASE_URL | API 地址 | 否 |
| REDIS_HOST | Redis 地址 | 否 |
| REDIS_PASSWORD | Redis 密码 | 否 |

## 四、生产环境部署

### 4.1 Nginx 反向代理

```nginx
upstream gagent {
    server 127.0.0.1:30000;
    keepalive 64;
}

server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://gagent;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE 支持
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
    }
}
```

### 4.2 Systemd 服务

```ini
[Unit]
Description=GAgent Go Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/gagent
ExecStart=/opt/gagent/server
Restart=always
RestartSec=5
Environment=MINIMAX_API_KEY=your_key

[Install]
WantedBy=multi-user.target
```

### 4.3 进程管理

```bash
# 安装
sudo cp gagent.service /etc/systemd/system/

# 启动
sudo systemctl start gagent

# 开机自启
sudo systemctl enable gagent

# 查看状态
sudo systemctl status gagent

# 重启
sudo systemctl restart gagent
```

## 五、监控部署

### 5.1 Prometheus 配置

```yaml
scrape_configs:
  - job_name: 'gagent'
    static_configs:
      - targets: ['localhost:30000']
    metrics_path: '/metrics'
```

### 5.2 Grafana Dashboard

导入 Prometheus 指标，使用 Grafana 可视化：
- HTTP 请求 QPS
- 响应延迟 P50/P95/P99
- Agent 执行成功率
- 熔断器状态

## 六、容器编排

### 6.1 Kubernetes 部署

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gagent
spec:
  replicas: 3
  selector:
    matchLabels:
      app: gagent
  template:
    metadata:
      labels:
        app: gagent
    spec:
      containers:
      - name: gagent
        image: gagent-go:latest
        ports:
        - containerPort: 30000
        env:
        - name: MINIMAX_API_KEY
          valueFrom:
            secretKeyRef:
              name: gagent-secrets
              key: api-key
```

### 6.2 HPA 自动扩缩容

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: gagent-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: gagent
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

## 七、数据备份

### 7.1 Redis 数据

```bash
# 备份
redis-cli SAVE
cp /var/lib/redis/dump.rdb /backup/redis-$(date +%Y%m%d).rdb

# 恢复
redis-cli SHUTDOWN
cp /backup/redis-20240101.rdb /var/lib/redis/dump.rdb
redis-server
```

### 7.2 配置备份

```bash
# 备份配置
tar czf gagent-config-$(date +%Y%m%d).tar.gz config.yaml .env
```

## 八、安全加固

### 8.1 网络隔离
- 禁止数据库端口对外暴露
- 使用内网 Redis
- 配置防火墙规则

### 8.2 密钥管理
- 使用 Kubernetes Secret 或 Vault 管理密钥
- 定期轮换 API Key

### 8.3 限流保护
- 启用 RateLimiter
- 配置合理的 QPS 限制
- 开启熔断器

## 九、升级指南

### 9.1 版本升级

```bash
# 1. 备份数据
./scripts/backup.sh

# 2. 停止服务
sudo systemctl stop gagent

# 3. 更新代码
git pull origin main

# 4. 重新构建
go build -o server ./cmd/server

# 5. 启动服务
sudo systemctl start gagent

# 6. 验证
curl http://localhost:30000/health
```

### 9.2 回滚

```bash
# 停止当前版本
sudo systemctl stop gagent

# 恢复备份
cp /backup/gagent-v1.0.0 /opt/gagent/server

# 启动
sudo systemctl start gagent
```

## 十、性能优化

### 10.1 连接池
```yaml
model:
  max_connections: 100
  max_idle_connections: 10
  idle_timeout: 300s
```

### 10.2 缓存
```yaml
cache:
  enabled: true
  ttl: 3600  # 1小时
  max_size: 1000
```

### 10.3 并发
```yaml
server:
  max_concurrent_requests: 500
  read_timeout: 30s
  write_timeout: 60s
```
