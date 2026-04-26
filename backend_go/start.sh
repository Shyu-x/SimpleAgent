#!/bin/bash
# Go 后端启动脚本
# 设置环境变量并启动服务器

# MiniMax API Key
export MINIMAX_API_KEY="sk-cp-Kj2HBxfc14_dY1X9rKQvUX2fScHpJqmxsaB4bT4pHLAiSraaqig01xHC4DJ1ZLh189-JHUWCH3-EycFoZ04iAqF33PpogIIpxz3SE53cO9LJHKogxBlfTpk"

cd "$(dirname "$0")"

echo "=== Go 后端启动脚本 ==="
echo "API Key: ${MINIMAX_API_KEY:0:20}..."
echo ""

# 关闭占用 30002 端口的进程
for pid in $(netstat -ano 2>/dev/null | grep ":30002.*LISTENING" | awk '{print $5}'); do
    echo "关闭 PID $pid"
    taskkill //F //PID $pid 2>/dev/null || true
done

sleep 2

# 启动服务器
echo "启动服务器..."
./bin/server.exe &
SERVER_PID=$!

sleep 5

# 检查服务器是否启动
if curl -s --max-time 5 http://localhost:30002/health > /dev/null; then
    echo "✅ 服务器启动成功 (PID: $SERVER_PID)"
    echo "   Health: http://localhost:30002/health"
    echo "   API: http://localhost:30002/api"
else
    echo "❌ 服务器启动失败"
fi
