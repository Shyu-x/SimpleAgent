#!/bin/sh
# 健康检查脚本

# 检查服务端口
if command -v curl > /dev/null 2>&1; then
    curl -f http://localhost:30000/health || exit 1
elif command -v wget > /dev/null 2>&1; then
    wget --no-verbose --tries=1 --spider http://localhost:30000/health || exit 1
else
    # 如果没有 curl 或 wget，使用 netcat
    nc -z localhost 30000 || exit 1
fi

exit 0
