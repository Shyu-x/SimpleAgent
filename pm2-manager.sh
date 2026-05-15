#!/bin/bash
# PM2 服务管理脚本

PROJECT_DIR="C:/Users/Xu/Desktop/chat玩具"
cd "$PROJECT_DIR"

# 确保 logs 目录存在
mkdir -p backend/logs frontend/logs

case "$1" in
  start)
    echo "🚀 启动服务..."
    pm2 start ecosystem.config.js
    pm2 save
    echo ""
    pm2 list
    ;;

  stop)
    echo "🛑 停止服务..."
    pm2 stop all
    pm2 delete all
    echo ""
    pm2 list
    ;;

  restart)
    echo "🔄 重启服务..."
    pm2 restart all
    echo ""
    pm2 list
    ;;

  status)
    echo "📊 服务状态:"
    pm2 list
    ;;

  logs)
    echo "📝 服务日志:"
    echo "--- Backend ---"
    pm2 logs ai-chat-backend --lines 50 --nostream
    echo ""
    echo "--- Frontend ---"
    pm2 logs ai-chat-frontend --lines 50 --nostream
    ;;

  backend:logs)
    pm2 logs ai-chat-backend --lines 100 --nostream
    ;;

  frontend:logs)
    pm2 logs ai-chat-frontend --lines 100 --nostream
    ;;

  monit)
    echo "📊 实时监控..."
    pm2 monit
    ;;

  reload)
    echo "🔄 热重载..."
    pm2 reload all
    ;;

  *)
    echo "用法: pm2-manager.sh {start|stop|restart|status|logs|monit|reload}"
    echo ""
    echo "命令:"
    echo "  start          - 启动所有服务"
    echo "  stop          - 停止所有服务"
    echo "  restart       - 重启所有服务"
    echo "  status        - 查看服务状态"
    echo "  logs          - 查看所有日志"
    echo "  backend:logs  - 查看后端日志"
    echo "  frontend:logs - 查看前端日志"
    echo "  monit         - 实时监控面板"
    echo "  reload        - 热重载 (0秒停机)"
    exit 1
    ;;
esac