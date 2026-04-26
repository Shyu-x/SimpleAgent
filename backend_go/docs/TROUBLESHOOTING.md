# GAgent Go 故障排查指南

## 一、启动问题

### 1.1 服务无法启动

**症状**: 执行 `./server` 后立即退出

**排查步骤**:
```bash
# 1. 检查端口占用
lsof -i :30000
netstat -tlnp | grep 30000

# 2. 检查配置文件
cat config.yaml
vim config.yaml  # 确认格式正确

# 3. 检查日志
./server 2>&1
tail -f server.log

# 4. 检查环境变量
echo $MINIMAX_API_KEY
```

**常见原因**:
- 端口被占用 → 更换端口或停止占用进程
- 配置文件格式错误 → 检查 YAML 语法
- 缺少必需环境变量 → 设置 MINIMAX_API_KEY

### 1.2 依赖下载失败

**症状**: `go mod tidy` 或 `go build` 失败

**解决方案**:
```bash
# 设置代理
go env -w GOPROXY=https://goproxy.cn,direct

# 清理缓存
go clean -mod
go mod tidy
```

## 二、API 问题

### 2.1 请求返回 500 错误

**排查步骤**:
```bash
# 1. 查看详细错误
curl -v http://localhost:30000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test"}]}'

# 2. 检查服务器日志
tail -100 server.log | grep ERROR

# 3. 检查 Prometheus 指标
curl http://localhost:30000/metrics | grep http_requests_total
```

**常见原因**:
- MiniMax API Key 无效 → 检查并更新 API Key
- API 调用超时 → 检查网络连接
- 熔断器开启 → 等待恢复或检查熔断器状态

### 2.2 流式响应中断

**排查步骤**:
```bash
# 1. 检查 Nginx 配置
# 确保支持 SSE
proxy_set_header Connection '';
proxy_buffering off;

# 2. 检查超时设置
proxy_read_timeout 300s;
proxy_send_timeout 300s;
```

### 2.3 熔断器频繁开启

**症状**: 部分请求返回熔断器错误

**排查步骤**:
```bash
# 检查熔断器指标
curl http://localhost:30000/metrics | grep circuitbreaker

# 查看熔断器状态
curl http://localhost:30000/api/admin/circuitbreaker
```

**解决方案**:
```yaml
# 调整熔断器配置
circuitbreaker:
  failure_threshold: 10  # 提高失败阈值
  recovery_timeout: 60   # 延长恢复时间
```

## 三、性能问题

### 3.1 响应延迟高

**排查步骤**:
```bash
# 1. 检查响应时间分布
curl http://localhost:30000/metrics | grep http_request_duration

# 2. 检查 Agent 执行时间
curl http://localhost:30000/metrics | grep agent_execution_duration

# 3. 检查 RAG 检索时间
curl http://localhost:30000/metrics | grep rag_retrieval_duration
```

**常见原因**:
- 模型响应慢 → 检查 MiniMax 服务状态
- RAG 检索慢 → 检查向量数据库连接
- 网络延迟 → 检查网络配置

**解决方案**:
```yaml
# 启用缓存
cache:
  enabled: true
  ttl: 3600

# 调整 RAG 参数
rag:
  top_k: 10  # 减少检索数量
```

### 3.2 内存占用高

**排查步骤**:
```bash
# 1. 检查内存使用
ps aux | grep server
top -p $(pgrep -f server)

# 2. 检查堆内存
curl http://localhost:30000/metrics | grep go_memstats
```

**解决方案**:
```yaml
# 限制并发
server:
  max_concurrent_requests: 100

# 限制记忆窗口
agent:
  memory_window_size: 20
```

### 3.3 CPU 使用率高

**排查步骤**:
```bash
# 1. 检查 CPU 使用
top -p $(pgrep -f server)

# 2. 检查 goroutine 数量
curl http://localhost:30000/metrics | grep go_goroutines
```

## 四、限流问题

### 4.1 正常请求被限流

**排查步骤**:
```bash
# 检查限流器配置
curl http://localhost:30000/api/admin/ratelimit

# 检查 Redis 连接
redis-cli ping
```

**解决方案**:
```yaml
# 调整限流参数
ratelimit:
  rate: "2000/m"  # 提高限制
  concurrent: 200
```

### 4.2 Redis 限流失效

**排查步骤**:
```bash
# 1. 检查 Redis 连接
redis-cli -h $REDIS_HOST ping

# 2. 检查 Redis 配置
grep -A5 redis config.yaml

# 3. 检查 Redis 日志
tail /var/log/redis/redis.log
```

## 五、RAG 问题

### 5.1 检索返回空结果

**排查步骤**:
```bash
# 1. 检查向量数据库连接
curl http://localhost:30000/api/admin/rag/status

# 2. 检查索引状态
curl http://localhost:30000/api/admin/rag/stats
```

**常见原因**:
- 向量数据库未启动 → 启动 Qdrant
- 索引不存在 → 创建索引并导入数据
- embedding 模型问题 → 检查模型配置

### 5.2 检索结果不准确

**解决方案**:
```yaml
# 调整 RAG 配置
rag:
  top_k: 10
  rerank: true
  rerank_top_k: 5

# 使用混合检索
search:
  channels:
    - vector
    - keyword
  weights:
    vector: 0.7
    keyword: 0.3
```

## 六、日志分析

### 6.1 日志级别

```bash
# 设置日志级别
export LOG_LEVEL=debug

# 查看实时日志
tail -f server.log

# 过滤错误日志
grep ERROR server.log

# 过滤特定模块
grep "circuitbreaker" server.log
```

### 6.2 请求追踪

每个请求带有 trace_id:
```
grep "trace_id=abc123" server.log
```

## 七、网络问题

### 7.1 无法连接 MiniMax API

**排查步骤**:
```bash
# 1. 测试网络连接
curl -v https://api.minimaxi.com/anthropic/v1/models

# 2. 检查代理设置
echo $HTTP_PROXY
echo $HTTPS_PROXY

# 3. 检查防火墙
iptables -L
```

### 7.2 SSE 连接断开

**解决方案**:
```nginx
# Nginx 配置
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 300s;
keepalive_timeout 300s;
```

## 八、健康检查

### 8.1 健康检查端点

```bash
# 基础健康检查
curl http://localhost:30000/health

# 详细健康检查
curl http://localhost:30000/health/detailed
```

### 8.2 依赖服务检查

```bash
# 检查 Redis
curl http://localhost:30000/health/redis

# 检查向量数据库
curl http://localhost:30000/health/vectorstore

# 检查 MiniMax API
curl http://localhost:30000/health/model
```

## 九、常见错误码

| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| 1001 | 内部错误 | 查看日志 |
| 1002 | 网络错误 | 检查网络连接 |
| 1003 | 超时错误 | 增加超时时间 |
| 2001 | 参数错误 | 检查请求参数 |
| 2002 | 模型错误 | 检查模型配置 |
| 2003 | 工具错误 | 检查工具定义 |
| 1007 | 限流错误 | 降低请求频率 |
| 1008 | 熔断开启 | 等待恢复 |

## 十、调试技巧

### 10.1 启用调试模式

```yaml
# config.yaml
server:
  debug: true
  log_level: debug
```

### 10.2 请求调试

```bash
# 详细输出
curl -v -X POST http://localhost:30000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test"}]}'
```

### 10.3 性能分析

```bash
# 启用 pprof
go build -o server -tags pprof ./cmd/server

# 查看 CPU profile
curl http://localhost:30000/debug/pprof/profile?seconds=30 > cpu.prof

# 查看内存 profile
curl http://localhost:30000/debug/pprof/heap > mem.prof
```

## 十一、联系支持

如问题无法解决，请提供:
1. 服务日志
2. 配置文件（脱敏后）
3. 请求复现步骤
4. 环境信息 (`go version`, OS 等)
