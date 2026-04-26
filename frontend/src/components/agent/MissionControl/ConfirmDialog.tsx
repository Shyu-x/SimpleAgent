'use client';

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
  countdown?: number; // 倒计时秒数
}

const ConfirmDialog = memo(function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  variant = 'warning',
  onConfirm,
  onCancel,
  countdown,
}: ConfirmDialogProps) {
  const variantStyles = {
    danger: {
      bg: 'bg-red-500/20 border-red-500/50',
      icon: 'text-red-400',
      button: 'bg-red-500 hover:bg-red-600',
    },
    warning: {
      bg: 'bg-yellow-500/20 border-yellow-500/50',
      icon: 'text-yellow-400',
      button: 'bg-yellow-500 hover:bg-yellow-600',
    },
    info: {
      bg: 'bg-blue-500/20 border-blue-500/50',
      icon: 'text-blue-400',
      button: 'bg-blue-500 hover:bg-blue-600',
    },
  };

  const styles = variantStyles[variant];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onCancel}
          />
          {/* 对话框 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md"
          >
            <div className={`rounded-xl border ${styles.bg} backdrop-blur-md shadow-2xl overflow-hidden`}>
              {/* 头部 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} className={styles.icon} />
                  <span className="font-medium text-white">{title}</span>
                </div>
                <button
                  onClick={onCancel}
                  className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* 内容 */}
              <div className="px-4 py-4">
                <p className="text-slate-300 text-sm leading-relaxed">{message}</p>
                {countdown !== undefined && countdown > 0 && (
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-cyan-400"
                        initial={{ width: '100%' }}
                        animate={{ width: '0%' }}
                        transition={{ duration: countdown, ease: 'linear' }}
                      />
                    </div>
                    <span className="text-xs text-slate-400">{countdown}s</span>
                  </div>
                )}
              </div>

              {/* 按钮 */}
              <div className="flex items-center justify-end gap-2 px-4 py-3 bg-black/20 border-t border-white/10">
                <button
                  onClick={onCancel}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-white/10 transition-colors"
                >
                  {cancelLabel}
                </button>
                <button
                  onClick={onConfirm}
                  className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${styles.button} transition-colors shadow-lg`}
                >
                  {confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

export default ConfirmDialog;
