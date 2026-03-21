'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Checkpoint {
  id: string;
  sessionId: string;
  timestamp: number;
  status: string;
}

interface CheckpointTimelineProps {
  checkpoints: Checkpoint[];
  currentCheckpointId?: string;
  onRestore: (checkpointId: string) => void;
  onDelete?: (checkpointId: string) => void;
}

export function CheckpointTimeline({
  checkpoints,
  currentCheckpointId,
  onRestore,
  onDelete
}: CheckpointTimelineProps) {
  if (checkpoints.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>暂无检查点</p>
        <p className="text-sm mt-1">执行任务时将自动创建检查点</p>
      </div>
    );
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-muted" />

      {/* Checkpoint items */}
      <div className="space-y-4">
        <AnimatePresence>
          {checkpoints.map((checkpoint, index) => {
            const isCurrent = checkpoint.id === currentCheckpointId;

            return (
              <motion.div
                key={checkpoint.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.05 }}
                className="relative flex items-start gap-4 pl-10"
              >
                {/* Timeline dot */}
                <div
                  className={`absolute left-2.5 w-3 h-3 rounded-full border-2 ${
                    isCurrent
                      ? 'bg-primary border-primary/30'
                      : 'bg-background border-border'
                  }`}
                />

                {/* Content card */}
                <div
                  className={`flex-1 rounded-lg border p-3 ${
                    isCurrent
                      ? 'border-primary/30 bg-primary/10'
                      : 'border-border bg-background'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        checkpoint.status === 'completed' ? 'bg-[hsl(var(--success-500))]' :
                        checkpoint.status === 'error' ? 'bg-destructive' :
                        checkpoint.status === 'paused' ? 'bg-[hsl(var(--warning-500))]' :
                        'bg-[hsl(var(--text-muted))/0.45]'
                      }`} />
                      <span className="text-sm font-medium text-foreground">
                        检查点 #{index + 1}
                      </span>
                      {isCurrent && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                          当前
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(checkpoint.timestamp)}
                    </span>
                  </div>

                  <div className="text-xs text-muted-foreground mb-2">
                    状态: {checkpoint.status}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => onRestore(checkpoint.id)}
                      disabled={isCurrent}
                      className={`px-3 py-1 text-xs rounded transition-colors ${
                        isCurrent
                          ? 'bg-muted text-muted-foreground cursor-not-allowed'
                          : 'bg-primary/10 text-primary hover:bg-primary/20'
                      }`}
                    >
                      恢复到此
                    </button>
                    {onDelete && !isCurrent && (
                      <button
                        onClick={() => onDelete(checkpoint.id)}
                        className="px-3 py-1 text-xs bg-destructive/10 text-destructive rounded hover:bg-destructive/20 transition-colors"
                      >
                        删除
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * 检查点状态指示器
 */
interface CheckpointIndicatorProps {
  hasCheckpoints: boolean;
  checkpointCount: number;
  onClick?: () => void;
}

export function CheckpointIndicator({
  hasCheckpoints,
  checkpointCount,
  onClick
}: CheckpointIndicatorProps) {
  if (!hasCheckpoints) {
    return null;
  }

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2 py-1 text-xs bg-muted text-muted-foreground rounded-full hover:bg-muted/80 transition-colors"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--success-500))]" />
      {checkpointCount} 个检查点
    </button>
  );
}

/**
 * 检查点详情面板
 */
interface CheckpointDetailProps {
  checkpoint: Checkpoint | null;
  onClose: () => void;
  onRestore?: () => void;
}

export function CheckpointDetail({
  checkpoint,
  onClose,
  onRestore
}: CheckpointDetailProps) {
  if (!checkpoint) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-background rounded-xl shadow-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border">
          <h3 className="text-lg font-medium text-foreground">
            检查点详情
          </h3>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">
              ID
            </label>
            <div className="font-mono text-sm text-foreground">
              {checkpoint.id}
            </div>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">
              创建时间
            </label>
            <div className="text-sm text-foreground">
              {new Date(checkpoint.timestamp).toLocaleString('zh-CN')}
            </div>
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">
              状态
            </label>
            <span className={`inline-flex items-center gap-1 px-2 py-1 text-sm rounded-full ${
              checkpoint.status === 'completed' ? 'bg-[hsl(var(--success-500))/0.14] text-[hsl(var(--success-500))]' :
              checkpoint.status === 'error' ? 'bg-destructive/10 text-destructive' :
              checkpoint.status === 'paused' ? 'bg-[hsl(var(--warning-500))/0.14] text-[hsl(var(--warning-500))]' :
              'bg-muted text-muted-foreground'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                checkpoint.status === 'completed' ? 'bg-[hsl(var(--success-500))]' :
                checkpoint.status === 'error' ? 'bg-destructive' :
                checkpoint.status === 'paused' ? 'bg-[hsl(var(--warning-500))]' :
                'bg-[hsl(var(--text-muted))/0.45]'
              }`} />
              {checkpoint.status}
            </span>
          </div>
        </div>

        <div className="p-4 border-t border-border flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-muted text-muted-foreground rounded-lg hover:bg-muted/80 transition-colors"
          >
            关闭
          </button>
          {onRestore && (
            <button
              onClick={onRestore}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              恢复到此检查点
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
