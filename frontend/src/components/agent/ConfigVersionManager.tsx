'use client';

import { memo, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitBranch,
  Clock,
  Save,
  RotateCcw,
  Diff,
  Trash2,
  Tag,
  Info,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  Download,
} from 'lucide-react';

// 配置版本
export interface ConfigVersion {
  id: string;
  version: number;
  name: string;
  description?: string;
  config: Record<string, unknown>;
  createdAt: number;
  createdBy?: string;
  tags: string[];
  isSnapshot: boolean;
}

// 版本差异
export interface VersionDiff {
  added: string[];
  removed: string[];
  modified: {
    key: string;
    oldValue: unknown;
    newValue: unknown;
  }[];
}

// 动画变体
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: -10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2 },
  },
};

// 格式化时间
const formatTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// 计算差异
const computeDiff = (oldConfig: Record<string, unknown>, newConfig: Record<string, unknown>): VersionDiff => {
  const diff: VersionDiff = {
    added: [],
    removed: [],
    modified: [],
  };

  const oldKeys = new Set(Object.keys(oldConfig));
  const newKeys = new Set(Object.keys(newConfig));

  // Added keys
  newKeys.forEach(key => {
    if (!oldKeys.has(key)) {
      diff.added.push(key);
    }
  });

  // Removed keys
  oldKeys.forEach(key => {
    if (!newKeys.has(key)) {
      diff.removed.push(key);
    }
  });

  // Modified keys
  oldKeys.forEach(key => {
    if (newKeys.has(key)) {
      const oldValue = oldConfig[key];
      const newValue = newConfig[key];
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        diff.modified.push({ key, oldValue, newValue });
      }
    }
  });

  return diff;
};

// 版本项组件
interface VersionItemProps {
  version: ConfigVersion;
  isActive: boolean;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onViewDiff: (id: string) => void;
  onExport: (version: ConfigVersion) => void;
}

const VersionItem = memo(function VersionItem({
  version,
  isActive,
  onRestore,
  onDelete,
  onViewDiff,
  onExport,
}: VersionItemProps) {
  const [showConfig, setShowConfig] = useState(false);

  return (
    <motion.div
      className={`rounded-lg border ${isActive ? 'border-primary bg-primary/5' : 'bg-card'}`}
      variants={itemVariants}
      layout
    >
      {/* 主行 */}
      <div className="flex items-center gap-3 p-3">
        {/* 版本号 */}
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted font-mono text-sm font-medium">
          v{version.version}
        </div>

        {/* 版本信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{version.name}</span>
            {isActive && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
                <CheckCircle2 size={10} />
                当前
              </span>
            )}
            {version.isSnapshot && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[hsl(var(--accent-500))/0.16] text-[hsl(var(--accent-500))] text-xs">
                <Tag size={10} />
                快照
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {formatTime(version.createdAt)}
            </span>
            {version.description && (
              <span className="truncate max-w-[200px]">{version.description}</span>
            )}
          </div>
          {/* Tags */}
          {version.tags.length > 0 && (
            <div className="flex items-center gap-1 mt-1">
              {version.tags.map(tag => (
                <span key={tag} className="px-1.5 py-0.5 rounded bg-muted text-xs">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1">
          {!isActive && (
            <motion.button
              onClick={() => onRestore(version.id)}
              className="p-1.5 rounded hover:bg-muted text-primary"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="恢复此版本"
            >
              <RotateCcw size={14} />
            </motion.button>
          )}
          <motion.button
            onClick={() => onExport(version)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="导出"
          >
            <Download size={14} />
          </motion.button>
          <motion.button
            onClick={() => onDelete(version.id)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="删除"
          >
            <Trash2 size={14} />
          </motion.button>
          <motion.button
            onClick={() => setShowConfig(!showConfig)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
            animate={{ rotate: showConfig ? 180 : 0 }}
          >
            <ChevronDown size={14} />
          </motion.button>
        </div>
      </div>

      {/* 展开的配置详情 */}
      <AnimatePresence>
        {showConfig && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t"
          >
            <div className="p-3 bg-muted/20">
              <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(version.config, null, 2)}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

// 差异查看器
interface DiffViewerProps {
  diff: VersionDiff;
  oldVersion: string;
  newVersion: string;
}

const DiffViewer = memo(function DiffViewer({
  diff,
  oldVersion,
  newVersion,
}: DiffViewerProps) {
  return (
    <motion.div
      className="rounded-lg border bg-card overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Diff size={16} className="text-primary" />
          <span className="font-medium text-sm">版本对比</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>v{oldVersion} → v{newVersion}</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* 添加的内容 */}
        {diff.added.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-xs text-[hsl(var(--success-500))] mb-2">
              <CheckCircle2 size={12} />
              新增字段 ({diff.added.length})
            </div>
            <div className="space-y-1">
              {diff.added.map(key => (
                <div key={key} className="flex items-center gap-2 px-2 py-1 rounded bg-[hsl(var(--success-500))/0.14] text-xs">
                  <span className="font-mono">+{key}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 删除的内容 */}
        {diff.removed.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-xs text-destructive mb-2">
              <AlertCircle size={12} />
              删除字段 ({diff.removed.length})
            </div>
            <div className="space-y-1">
              {diff.removed.map(key => (
                <div key={key} className="flex items-center gap-2 px-2 py-1 rounded bg-destructive/10 text-xs">
                  <span className="font-mono line-through">-{key}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 修改的内容 */}
        {diff.modified.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-xs text-[hsl(var(--warning-500))] mb-2">
              <Info size={12} />
              修改字段 ({diff.modified.length})
            </div>
            <div className="space-y-2">
              {diff.modified.map(({ key, oldValue, newValue }) => (
                <div key={key} className="p-2 rounded bg-[hsl(var(--warning-500))/0.14] text-xs">
                  <div className="font-mono font-medium mb-1">{key}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-muted-foreground text-[10px] mb-0.5">旧值</div>
                      <pre className="bg-destructive/10 p-1 rounded overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(oldValue, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px] mb-0.5">新值</div>
                      <pre className="bg-[hsl(var(--success-500))/0.14] p-1 rounded overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(newValue, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 无变化 */}
        {diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0 && (
          <div className="text-center py-4 text-muted-foreground text-sm">
            两个版本配置相同
          </div>
        )}
      </div>
    </motion.div>
  );
});

// 主组件
interface ConfigVersionManagerProps {
  currentConfig: Record<string, unknown>;
  versions?: ConfigVersion[];
  onSaveVersion?: (name: string, description: string, tags: string[], isSnapshot: boolean) => void;
  onRestoreVersion?: (id: string) => void;
  onDeleteVersion?: (id: string) => void;
  className?: string;
}

export const ConfigVersionManager = memo(function ConfigVersionManager({
  currentConfig,
  versions: externalVersions,
  onSaveVersion,
  onRestoreVersion,
  onDeleteVersion,
  className='',
}: ConfigVersionManagerProps) {
  // 模拟版本数据
  const [versions, setVersions] = useState<ConfigVersion[]>(externalVersions || [
    {
      id: 'v1',
      version: 1,
      name: '初始配置',
      description: '默认 Agent 配置',
      config: { model: 'claude-sonnet-4-6', maxIterations: 10 },
      createdAt: Date.now() - 86400000 * 7,
      tags: ['initial'],
      isSnapshot: false,
    },
    {
      id: 'v2',
      version: 2,
      name: '增强配置',
      description: '添加记忆系统支持',
      config: { model: 'claude-sonnet-4-6', maxIterations: 15, memoryEnabled: true },
      createdAt: Date.now() - 86400000 * 3,
      tags: ['memory'],
      isSnapshot: true,
    },
    {
      id: 'v3',
      version: 3,
      name: '当前配置',
      description: '生产环境配置',
      config: currentConfig,
      createdAt: Date.now(),
      tags: ['production'],
      isSnapshot: true,
    },
  ]);

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newVersionName, setNewVersionName] = useState('');
  const [newVersionDesc, setNewVersionDesc] = useState('');
  const [newVersionTags, setNewVersionTags] = useState('');
  const [isSnapshot, setIsSnapshot] = useState(false);
  const [diffView, setDiffView] = useState<{ oldId: string; newId: string } | null>(null);

  // 当前活跃版本
  const activeVersion = useMemo(() => {
    return versions.find(v => JSON.stringify(v.config) === JSON.stringify(currentConfig)) || versions[versions.length - 1];
  }, [versions, currentConfig]);

  // 保存新版本
  const handleSaveVersion = useCallback(() => {
    if (!newVersionName.trim()) return;

    const newVersion: ConfigVersion = {
      id: `v${Date.now()}`,
      version: versions.length + 1,
      name: newVersionName,
      description: newVersionDesc,
      config: currentConfig,
      createdAt: Date.now(),
      tags: newVersionTags.split(',').map(t => t.trim()).filter(Boolean),
      isSnapshot,
    };

    setVersions(prev => [...prev, newVersion]);
    onSaveVersion?.(newVersionName, newVersionDesc, newVersionTags.split(',').map(t => t.trim()).filter(Boolean), isSnapshot);
    setShowSaveDialog(false);
    setNewVersionName('');
    setNewVersionDesc('');
    setNewVersionTags('');
    setIsSnapshot(false);
  }, [newVersionName, newVersionDesc, newVersionTags, isSnapshot, currentConfig, versions.length, onSaveVersion]);

  // 恢复版本
  const handleRestore = useCallback((id: string) => {
    onRestoreVersion?.(id);
    // 更新活跃状态
    setVersions(prev => prev.map(v => ({
      ...v,
      // 活跃版本逻辑由外部控制
    })));
  }, [onRestoreVersion]);

  // 删除版本
  const handleDelete = useCallback((id: string) => {
    setVersions(prev => prev.filter(v => v.id !== id));
    onDeleteVersion?.(id);
  }, [onDeleteVersion]);

  // 导出版本
  const handleExport = useCallback((version: ConfigVersion) => {
    const data = JSON.stringify(version, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `config_v${version.version}_${version.name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // 查看差异
  const handleViewDiff = useCallback((newId: string) => {
    if (!diffView) {
      setDiffView({ oldId: activeVersion.id, newId });
    } else {
      setDiffView({ oldId: diffView.oldId, newId });
    }
  }, [diffView, activeVersion.id]);

  // 当前差异
  const currentDiff = useMemo(() => {
    if (!diffView) return null;
    const oldVersion = versions.find(v => v.id === diffView.oldId);
    const newVersion = versions.find(v => v.id === diffView.newId);
    if (!oldVersion || !newVersion) return null;
    return {
      diff: computeDiff(oldVersion.config, newVersion.config),
      oldVersion: oldVersion.version.toString(),
      newVersion: newVersion.version.toString(),
    };
  }, [diffView, versions]);

  return (
    <motion.div
      className={`flex flex-col bg-background border rounded-xl overflow-hidden ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <GitBranch size={20} className="text-primary" />
          <span className="font-medium">配置版本管理</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {versions.length} 个版本
          </span>
          <motion.button
            onClick={() => setShowSaveDialog(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Save size={12} />
            保存版本
          </motion.button>
        </div>
      </div>

      {/* 差异视图 */}
      <AnimatePresence>
        {currentDiff && (
          <motion.div
            className="p-4 border-b"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <DiffViewer
              diff={currentDiff.diff}
              oldVersion={currentDiff.oldVersion}
              newVersion={currentDiff.newVersion}
            />
            <button
              onClick={() => setDiffView(null)}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground"
            >
              关闭对比
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 版本列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <motion.div
          className="space-y-3"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {[...versions].reverse().map((version) => (
            <VersionItem
              key={version.id}
              version={version}
              isActive={version.id === activeVersion?.id}
              onRestore={handleRestore}
              onDelete={handleDelete}
              onViewDiff={handleViewDiff}
              onExport={handleExport}
            />
          ))}
        </motion.div>
      </div>

      {/* 保存对话框 */}
      <AnimatePresence>
        {showSaveDialog && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSaveDialog(false)}
          >
            <motion.div
              className="bg-background rounded-xl p-6 shadow-xl max-w-md mx-4 w-full"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-semibold mb-4">保存配置版本</h3>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">版本名称</label>
                  <input
                    type="text"
                    value={newVersionName}
                    onChange={(e) => setNewVersionName(e.target.value)}
                    className="w-full h-10 px-3 border rounded-lg bg-background"
                    placeholder="例如：生产配置 v2"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">描述（可选）</label>
                  <textarea
                    value={newVersionDesc}
                    onChange={(e) => setNewVersionDesc(e.target.value)}
                    className="w-full h-20 px-3 py-2 border rounded-lg bg-background resize-none"
                    placeholder="描述此版本的变更..."
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">标签（逗号分隔）</label>
                  <input
                    type="text"
                    value={newVersionTags}
                    onChange={(e) => setNewVersionTags(e.target.value)}
                    className="w-full h-10 px-3 border rounded-lg bg-background"
                    placeholder="例如：production, stable"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="snapshot"
                    checked={isSnapshot}
                    onChange={(e) => setIsSnapshot(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="snapshot" className="text-sm">
                    标记为快照（不可自动删除）
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="px-4 py-2 rounded-lg hover:bg-muted"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveVersion}
                  disabled={!newVersionName.trim()}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  保存
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

export default ConfigVersionManager;
