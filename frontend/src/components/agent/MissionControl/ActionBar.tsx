'use client';

import { memo, useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Trash2,
  Send,
  Layers,
} from 'lucide-react';
import type { ActionBarProps } from './types';
import { useMissionControlStore } from './store';
import ConfirmDialog from './ConfirmDialog';
import ActionHistory from './ActionHistory';
import BatchOperationMenu from './BatchOperationMenu';
import SoundToggle from './SoundToggle';
import KeyboardShortcutHint from './KeyboardShortcutHint';

// 确认对话框状态
interface ConfirmState {
  isOpen: boolean;
  type: 'stop' | 'reset' | 'clear' | 'batchDelete' | null;
  title: string;
  message: string;
  variant: 'danger' | 'warning' | 'info';
}

// 按钮组件
const ActionButton = memo(function ActionButton({
  onClick,
  icon: Icon,
  label,
  variant = 'default',
  disabled = false,
  active = false,
  dataAction,
  title,
}: {
  onClick?: () => void;
  icon: typeof Play;
  label: string;
  variant?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
  active?: boolean;
  dataAction?: string;
  title?: string;
}) {
  const variants = {
    default: 'bg-white/5 hover:bg-white/10 border-white/10 hover:border-white/20 text-slate-300',
    primary: 'bg-blue-500 hover:bg-blue-600 border-blue-500 hover:border-blue-600 text-white shadow-lg shadow-blue-500/25',
    danger: 'bg-red-500/20 hover:bg-red-500/30 border-red-500/50 text-red-400',
  };

  const activeStyles = active ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-900' : '';

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      disabled={disabled}
      data-action={dataAction}
      title={title}
      className={`
        flex items-center gap-2 px-3 py-2 rounded-lg
        border text-sm font-medium
        transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]}
        ${activeStyles}
      `}
    >
      <Icon size={16} />
      <span>{label}</span>
    </motion.button>
  );
});

// 操作栏组件
const ActionBar = memo(function ActionBar({
  onPublishAll,
  onPauseAll,
  onResumeAll,
  onStopAll,
  onClearCompleted,
  isPaused = false,
  activeCount = 0,
}: ActionBarProps) {
  const {
    soundEnabled,
    toggleSound,
    actionHistory,
    clearActionHistory,
    selectedTaskIds,
    batchComplete,
    batchFail,
    clearSelection,
    removeTask,
    tasks,
  } = useMissionControlStore();

  const [confirmState, setConfirmState] = useState<ConfirmState>({
    isOpen: false,
    type: null,
    title: '',
    message: '',
    variant: 'warning',
  });

  // 打开确认对话框
  const openConfirm = useCallback((
    type: ConfirmState['type'],
    title: string,
    message: string,
    variant: ConfirmState['variant'] = 'warning'
  ) => {
    setConfirmState({ isOpen: true, type, title, message, variant });
  }, []);

  // 关闭确认对话框
  const closeConfirm = useCallback(() => {
    setConfirmState((prev) => ({ ...prev, isOpen: false, type: null }));
  }, []);

  // 确认操作处理
  const handleConfirm = useCallback(() => {
    const { type } = confirmState;
    switch (type) {
      case 'stop':
        onStopAll?.();
        break;
      case 'reset':
        onResumeAll?.();
        break;
      case 'clear':
        onClearCompleted?.();
        clearActionHistory();
        break;
      case 'batchDelete':
        selectedTaskIds.forEach((id) => removeTask(id));
        clearSelection();
        break;
    }
    closeConfirm();
  }, [confirmState, onStopAll, onResumeAll, onClearCompleted, selectedTaskIds, removeTask, clearSelection, clearActionHistory, closeConfirm]);

  // 停止按钮点击
  const handleStop = useCallback(() => {
    if (activeCount > 0) {
      openConfirm(
        'stop',
        '确认停止',
        `确定要停止当前 ${activeCount} 个进行中的任务吗？`,
        'danger'
      );
    } else {
      onStopAll?.();
    }
  }, [activeCount, onStopAll, openConfirm]);

  // 重置按钮点击
  const handleReset = useCallback(() => {
    openConfirm(
      'reset',
      '确认重置',
      '确定要重置所有任务状态吗？',
      'warning'
    );
  }, [openConfirm]);

  // 清理按钮点击
  const handleClear = useCallback(() => {
    const completedCount = tasks.filter((t) => t.status === 'completed').length;
    if (completedCount > 0) {
      openConfirm(
        'clear',
        '清理确认',
        `确定要清理 ${completedCount} 个已完成的任务吗？`,
        'info'
      );
    } else {
      onClearCompleted?.();
    }
  }, [tasks, onClearCompleted, openConfirm]);

  // 批量删除
  const handleBatchDelete = useCallback(() => {
    if (selectedTaskIds.length > 0) {
      openConfirm(
        'batchDelete',
        '批量删除',
        `确定要删除选中的 ${selectedTaskIds.length} 个任务吗？`,
        'danger'
      );
    }
  }, [selectedTaskIds, openConfirm]);

  // 播放提示音
  useEffect(() => {
    const playSound = (type: 'success' | 'error' | 'warning') => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fn = (window as any).missionControlPlayTone as ((type: 'success' | 'error' | 'warning') => void) | undefined;
      fn?.(type);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).missionControlPlaySound = playSound;
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).missionControlPlaySound;
    };
  }, [soundEnabled]);

  return (
    <>
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/50 border-t border-white/10">
        {/* 左侧操作 */}
        <div className="flex items-center gap-2">
          <ActionButton
            onClick={onPublishAll}
            icon={Send}
            label="发布全部"
            variant="primary"
            dataAction="publish-all"
            title="Ctrl+Enter"
          />
          <ActionButton
            onClick={isPaused ? onResumeAll : onPauseAll}
            icon={isPaused ? Play : Pause}
            label={isPaused ? '恢复' : '暂停'}
            variant="default"
            active={isPaused}
          />
          <ActionButton
            onClick={handleStop}
            icon={Square}
            label="停止"
            variant="danger"
          />
        </div>

        {/* 中间状态 */}
        <div className="flex items-center gap-4">
          <div className="text-xs text-slate-400">
            <span className="text-white font-medium">{activeCount}</span> 个任务进行中
          </div>

          {/* 批量操作 */}
          <BatchOperationMenu
            selectedCount={selectedTaskIds.length}
            onBatchComplete={() => batchComplete()}
            onBatchFail={() => batchFail('批量标记失败')}
            onBatchDelete={handleBatchDelete}
            onClearSelection={clearSelection}
          />

          {/* 历史记录 */}
          <ActionHistory
            history={actionHistory}
            onClear={clearActionHistory}
          />

          {/* 声音开关 */}
          <SoundToggle enabled={soundEnabled} onToggle={toggleSound} />
        </div>

        {/* 右侧操作 */}
        <div className="flex items-center gap-2">
          <ActionButton
            onClick={handleClear}
            icon={Trash2}
            label="清理已完成"
            variant="default"
          />
          <ActionButton
            onClick={handleReset}
            icon={RotateCcw}
            label="重置"
            variant="default"
          />
        </div>
      </div>

      {/* 快捷键提示 */}
      <KeyboardShortcutHint />

      {/* 确认对话框 */}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel="确认"
        cancelLabel="取消"
        variant={confirmState.variant}
        onConfirm={handleConfirm}
        onCancel={closeConfirm}
        countdown={confirmState.type === 'stop' ? 60 : undefined}
      />
    </>
  );
});

export default ActionBar;
