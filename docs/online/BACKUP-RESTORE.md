# 备份与恢复手册 (BACKUP-RESTORE)

## 1. 何时备份

| 场景 | 建议频率 |
|------|---------|
| 生产环境 | 每天凌晨 03:00 (cron) |
| 重大变更前 (升级/迁移) | 手动执行 |
| 知识库更新后 | 手动执行 |
| Agent 状态 / 任务数据 | 每次全量 |

## 2. 保留策略

- 默认保留 **7 天** (可由 `RETENTION_DAYS` 调整)
- 备份位置: `/tmp/backup/YYYYMMDD_HHMMSS/`
- 大数据量推荐: `./scripts/backup.sh --compress` 生成 `.tar.gz`

## 3. 执行备份

```bash
# 普通备份
./scripts/backup.sh

# 压缩备份 (推荐生产)
./scripts/backup.sh --compress
```

输出: `文件数 + 大小 + 保留摘要`。

## 4. 执行恢复

```bash
# 列出可用备份
ls -lh /tmp/backup/

# 恢复 (会停止 backend -> 覆盖数据 -> 重启)
./scripts/restore.sh /tmp/backup/20260604_120000

# 恢复压缩包
./scripts/restore.sh /tmp/backup/20260604_120000.tar.gz
```

**安全校验**: `restore.sh` 仅接受 `/tmp/backup/` 开头的路径，防止误操作或注入。

## 5. 灾备演练清单 (季度)

- [ ] 在测试环境执行一次 `backup.sh --compress`
- [ ] 校验备份文件可解压 (file/untar)
- [ ] 在隔离环境执行 `restore.sh`，验证 backend 启动正常
- [ ] 抽样检查 `backend/data/rag/`、`metrics_latest.json`、`mission-store.json` 完整性
- [ ] 记录 RTO (恢复时间) / RPO (数据丢失量)
- [ ] 清理 `/tmp/backup/` 中超过 30 天的陈旧备份
