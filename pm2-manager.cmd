@echo off
REM PM2 服务管理脚本 (Windows)

cd /d "C:\Users\Xu\Desktop\chat玩具"

if "%1"=="" goto usage
if "%1"=="start" goto start
if "%1"=="stop" goto stop
if "%1"=="restart" goto restart
if "%1"=="status" goto status
if "%1"=="logs" goto logs
if "%1"=="backend:logs" goto backend_logs
if "%1"=="frontend:logs" goto frontend_logs
if "%1"=="monit" goto monit
if "%1"=="reload" goto reload

:usage
echo 用法: pm2-manager.cmd {start^|stop^|restart^|status^|logs^|monit^|reload}
echo.
echo 命令:
echo   start          - 启动所有服务
echo   stop          - 停止所有服务
echo   restart       - 重启所有服务
echo   status        - 查看服务状态
echo   logs          - 查看所有日志
echo   backend:logs  - 查看后端日志
echo   frontend:logs - 查看前端日志
echo   monit         - 实时监控面板
echo   reload        - 热重载
exit /b 1

:start
echo 启动服务...
call mkdir backend\logs 2>nul
call mkdir frontend\logs 2>nul
pm2 start ecosystem.config.js
pm2 save
echo.
pm2 list
exit /b 0

:stop
echo 停止服务...
pm2 stop all
pm2 delete all
echo.
pm2 list
exit /b 0

:restart
echo 重启服务...
pm2 restart all
echo.
pm2 list
exit /b 0

:status
echo 服务状态:
pm2 list
exit /b 0

:logs
echo 服务日志:
echo --- Backend ---
pm2 logs ai-chat-backend --lines 50 --nostream
echo.
echo --- Frontend ---
pm2 logs ai-chat-frontend --lines 50 --nostream
exit /b 0

:backend_logs
pm2 logs ai-chat-backend --lines 100 --nostream
exit /b 0

:frontend_logs
pm2 logs ai-chat-frontend --lines 100 --nostream
exit /b 0

:monit
echo 实时监控...
pm2 monit
exit /b 0

:reload
echo 热重载...
pm2 reload all
exit /b 0