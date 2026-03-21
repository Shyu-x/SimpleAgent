@echo off
setlocal
set ROOT=C:\Users\Xu\Desktop\chat玩具
if not exist "%ROOT%\logs" mkdir "%ROOT%\logs"
cd /d "%ROOT%\frontend"
start "frontend-dev" /b cmd /c "call npm.cmd run dev > \"%ROOT%\logs\frontend-dev.out.log\" 2> \"%ROOT%\logs\frontend-dev.err.log\""
