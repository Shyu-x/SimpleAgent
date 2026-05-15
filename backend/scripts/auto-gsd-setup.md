# GSD 自动执行配置

## Windows 任务计划程序

### 方法 1: 使用 schtasks
```powershell
schtasks /create /sc minute /mo 30 /tn "GSD Auto Progress" /tr "bash.exe -c 'C:/Users/Xu/Desktop/chat玩具/backend/scripts/auto-gsd.sh'"
```

### 方法 2: 使用 cron-like 工具 (如 cronw)
安装 cronw 或使用 WSL 中的 cron

### 方法 3: 手动触发
```bash
./backend/scripts/auto-gsd.sh
```

## 日志位置
日志文件: `.planning/auto-gsd.log`