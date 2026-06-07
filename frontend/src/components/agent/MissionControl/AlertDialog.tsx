'use client';

import { memo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Info, AlertCircle, CheckCircle } from 'lucide-react';

interface AlertDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  variant?: 'info' | 'success' | 'error';
  onClose: () => void;
}

const AlertDialog = memo(function AlertDialog({
  isOpen,
  title,
  message,
  variant = 'info',
  onClose,
}: AlertDialogProps) {
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(onClose, 5000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  const variantStyles = {
    info: {
      bg: 'bg-blue-500/20 border-blue-500/50',
      icon: 'text-blue-400',
      iconComponent: Info,
    },
    success: {
      bg: 'bg-green-500/20 border-green-500/50',
      icon: 'text-green-400',
      iconComponent: CheckCircle,
    },
    error: {
      bg: 'bg-red-500/20 border-red-500/50',
      icon: 'text-red-400',
      iconComponent: AlertCircle,
    },
  };

  const styles = variantStyles[variant];
  const IconComponent = styles.iconComponent;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md"
          >
            <div className={`rounded-xl border ${styles.bg} backdrop-blur-md shadow-2xl overflow-hidden`}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <IconComponent size={18} className={styles.icon} />
                  <span className="font-medium text-white">{title}</span>
                </div>
                <button
                  onClick={onClose}
                  className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="px-4 py-4">
                <p className="text-slate-300 text-sm leading-relaxed">{message}</p>
              </div>
              <div className="flex items-center justify-end px-4 py-3 bg-black/20 border-t border-white/10">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-white/10 transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

export default AlertDialog;