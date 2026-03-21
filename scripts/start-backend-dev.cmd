@echo off
setlocal
set ROOT=C:\Users\Xu\Desktop\chat玩具
if not exist "%ROOT%\logs" mkdir "%ROOT%\logs"
cd /d "%ROOT%\backend"
start "backend-dev" /b cmd /c "call npm.cmd run dev > \"%ROOT%\logs\backend-dev.out.log\" 2> \"%ROOT%\logs\backend-dev.err.log\""
