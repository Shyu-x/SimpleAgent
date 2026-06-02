# SimpleAgent 运维 Runbook

> 故障时的标准操作手册。按错误现象分类，每类配一套处置脚本。

## 0. 黄金 30 秒

```bash
# 1. 看服务在不在
pm2 list 2>&1 || (ps -ef | grep -E "node|next" | grep -v grep | head -5)
# 2. 看 5xx 比例
curl -s http://localhost:30000/metrics | grep http_requests_total | grep 'status="5' | tail -5
# 3. 看最近 ERROR 日志
pm2 logs ai-chat-backend --lines 200 --nostream --raw 2>&1 | grep -i 'error\|exception' | tail -20
```

如果 5xx > 1% 或服务 down → **立即执行 R-1 回滚**。

## R-1: 服务挂 / 启动失败

**症状**：`curl :30000/api/health` 返回 000 或 5xx，PM2 状态 `errored`/`stopped`。

```bash
# 1. 看错误
pm2 logs ai-chat-backend --lines 100 --nostream --raw
# 2. 手工启动确认
cd /home/xu/Develop/longTermProject/SimpleAgent/backend && pnpm dev > /tmp/backend.log 2>&1 &
sleep 5
curl -s -o /dev/null -w 'http=%{http_code}\n' http://localhost:30000/api/health
# 3. 启动 OK 后用 PM2 接管
pm2 start ecosystem.config.js
# 4. 还是失败 → git checkout 到上一个 green commit
cd /home/xu/Develop/longTermProject/SimpleAgent
git log --oneline -5
git checkout <last-green-sha>
pm2 restart all
```

## R-2: MiniMax API 401/403/429

**症状**：`MiniMax API key invalid` 或 `rate limit exceeded` 在日志高频出现。

```bash
# 1. 验证 key 还在
grep MINIMAX_API_KEY backend/.env
# 2. 手动测试 key
curl -X POST "$MINIMAX_BASE_URL/v1/text/chatcompletion_v2" \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"MiniMax-M2.7","messages":[{"role":"user","content":"hi"}]}' | head -50
# 3. 触发熔断器自动切换
# CircuitBreaker 会自动切换到备份模型（如果配置了），无需手动
# 4. 限流时降级
curl -s -X POST :30000/api/admin/config \
  -H 'Content-Type: application/json' \
  -d '{"key":"model.fallback.enabled","value":true}'
```

## R-3: Qdrant 不可用

**症状**：RAG 检索返回 500 或 `connection refused`。

```bash
# 1. 看 Qdrant 状态
docker ps | grep qdrant
curl -s http://localhost:6333/health
# 2. 重启 Qdrant
docker restart qdrant
# 3. 重启后端触发重连
pm2 restart ai-chat-backend
# 4. 验证降级
curl -s :30000/api/rag/stats | jq .
# 期望：vectorStore.mode = "memory"（自动降级到内存）
```

## R-4: SSE 流式中断

**症状**：前端一直转圈，/metrics 显示 `sse_connections_active` 不下降也不上升。

```bash
# 1. 看 SSE 状态
curl -s :30000/metrics | grep sse
# 2. 看客户端断开原因
pm2 logs ai-chat-backend --raw --nostream --lines 200 | grep -i 'sse.*disconnect\|aborted'
# 3. 触发探针缓冲清理（如果是 buffering callback 卡住）
curl -X POST :30000/api/admin/sse/probe-reset
# 4. 紧急：强制踢出所有 SSE 连接
curl -X POST :30000/api/admin/sse/disconnect-all
```

## R-5: 数据库连接池耗尽

**症状**：`ConnectionPoolExhausted` / `timeout acquiring connection` 在 ERROR 日志高频出现。

```bash
# 1. 看连接数
pm2 logs ai-chat-backend --raw --nostream --lines 200 | grep -c 'acquiring connection'
# 2. 重启后端（最快止血）
pm2 restart ai-chat-backend
# 3. 如果是慢查询堆积，看 slow query log
psql -U postgres -d simpleagent -c "SELECT pid, query, state, query_start FROM pg_stat_activity WHERE state != 'idle' ORDER BY query_start LIMIT 20;"
# 4. 必要时手动 kill 长查询
psql -U postgres -d simpleagent -c "SELECT pg_terminate_backend(<pid>);"
```

## R-6: 前端 504 / 502

**症状**：访问 http://localhost:3001 返回 502/504。

```bash
# 1. 看 Next.js 进程
ps -ef | grep next | grep -v grep
# 2. 看 next dev 日志
pm2 logs ai-chat-frontend --raw --nostream --lines 100
# 3. 看端口占用
lsof -i:3001
# 4. 重启
pm2 restart ai-chat-frontend
# 5. 触发 build（如果 dev 模式编译卡死）
cd /home/xu/Develop/longTermProject/SimpleAgent/frontend
rm -rf .next
pnpm dev
```

## R-7: 内存持续上涨（疑似泄漏）

**症状**：`pm2 monit` 显示 RSS 持续增长 30 分钟以上无下降。

```bash
# 1. 看堆快照
pm2 restart ai-chat-backend
sleep 3600
pm2 logs ai-chat-backend --raw --nostream --lines 1 | head -1
# 2. 触发 heapdump
kill -USR2 <pid>  # 如果开启了 heapdump
# 3. 一键重启所有
pm2 restart all
# 4. 容量告警阈值
#    进程 RSS > 1GB → 重启
#    进程 RSS > 2GB → 立刻 page
```

## R-8: 磁盘满

**症状**：`ENOSPC: no space left on device` 在日志出现。

```bash
# 1. 看哪个目录占空间
du -sh /home/xu/Develop/longTermProject/SimpleAgent/data/* 2>/dev/null | sort -hr | head -10
du -sh /tmp/* 2>/dev/null | sort -hr | head -5
df -h
# 2. 清日志
pm2 flush
# 3. 清 metrics 历史
rm -rf data/metrics/*.json.bak
# 4. 清理 npm/pnpm 缓存
pnpm store prune
```

## 升级 / 发布

详见 `DEPLOY.md`。

## 联系 / 升级路径

| 级别 | 现象 | 响应时间 | 联系人 |
|------|------|---------|--------|
| P0 | 全站不可用 | 5 min | oncall |
| P1 | 核心功能降级 | 30 min | oncall |
| P2 | 非核心故障 | 4 h | next day |
| P3 | UI 小问题 | 1 周 | backlog |
