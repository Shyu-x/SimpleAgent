'use client';

import { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef, useMemo, memo } from 'react';
import { Check, X, Info, AlertTriangle, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
}

interface ToastContextType {
  showToast: (
    message: string,
    type?: 'success' | 'error' | 'info' | 'warning',
    actionLabel?: string,
    action?: () => void,
    duration?: number
  ) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Toast 动画变体
const toastVariants = {
  hidden: {
    opacity: 0,
    y: 50,
    scale: 0.8,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 400,
      damping: 25,
    },
  },
  exit: {
    opacity: 0,
    y: -20,
    scale: 0.8,
    transition: {
      duration: 0.2,
    },
  },
};

// Toast 类型配置
const toastConfig = {
  success: {
    icon: Check,
    bgColor: 'bg-[hsl(var(--success-500))]',
    borderColor: 'border-[hsl(var(--success-600))]',
  },
  error: {
    icon: AlertTriangle,
    bgColor: 'bg-destructive',
    borderColor: 'border-destructive/80',
  },
  warning: {
    icon: Sparkles,
    bgColor: 'bg-[hsl(var(--warning-500))]',
    borderColor: 'border-[hsl(var(--warning-600))]',
  },
  info: {
    icon: Info,
    bgColor: 'bg-primary',
    borderColor: 'border-primary/80',
  },
};

// Toast 图标组件
const ToastIcon = memo(function ToastIcon({ type }: { type: Toast['type'] }) {
  const config = toastConfig[type];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 25, delay: 0.1 }}
      className={`p-1.5 rounded-full ${type === 'error' ? 'bg-white/20' : 'bg-white/20'}`}
    >
      <Icon size={16} className="text-white" />
    </motion.div>
  );
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // 从 sessionStorage 获取动画设置
  const animationsEnabled = useMemo(() => {
    if (typeof window === 'undefined') return true;
    try {
      const stored = sessionStorage.getItem('chat-settings');
      if (stored) {
        const settings = JSON.parse(stored);
        return settings.animationsEnabled !== false;
      }
    } catch {
      // Ignore parse errors
    }
    return true;
  }, []);

  const showToast = useCallback((
    message: string,
    type: Toast['type'] = 'success',
    actionLabel?: string,
    action?: () => void,
    duration?: number
  ) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setToasts((prev) => [...prev, {
      id,
      message,
      type,
      action: actionLabel && action ? { label: actionLabel, onClick: action } : undefined,
      duration,
    }]);

    // 计算自动消失时间
    const autoDuration = action ? 5000 : (duration || 3000);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, autoDuration);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Focus management for toasts
  useEffect(() => {
    if (toasts.length > 0) {
      const latestToast = toasts[toasts.length - 1];
      const buttonRef = toastRefs.current.get(latestToast.id);
      buttonRef?.focus();
    }
  }, [toasts.length]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map((toast, index) => {
            const config = toastConfig[toast.type];
            return (
              <motion.div
                key={toast.id}
                role="alert"
                aria-live="polite"
                layout
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: -20 }}
                transition={{
                  layout: { type: 'spring', stiffness: 500, damping: 30 },
                }}
                className={`
                  pointer-events-auto
                  flex items-center gap-3 rounded-lg px-4 py-3
                  ${config.bgColor} text-white shadow-xl
                  border ${config.borderColor}
                  min-w-[280px] max-w-[400px]
                `}
              >
                <ToastIcon type={toast.type} />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">{toast.message}</p>
                </div>

                {/* 操作按钮 */}
                {toast.action && (
                  <motion.button
                    ref={(el) => {
                      if (el) toastRefs.current.set(toast.id, el);
                    }}
                    onClick={() => {
                      toast.action?.onClick();
                      removeToast(toast.id);
                    }}
                    className="shrink-0 px-2 py-1 text-sm font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity rounded"
                    whileHover={animationsEnabled ? { scale: 1.05 } : undefined}
                    whileTap={animationsEnabled ? { scale: 0.95 } : undefined}
                  >
                    {toast.action.label}
                  </motion.button>
                )}

                {/* 关闭按钮 */}
                <motion.button
                  onClick={() => removeToast(toast.id)}
                  className="shrink-0 p-1 rounded hover:bg-white/20 transition-colors"
                  aria-label="关闭通知"
                  whileHover={animationsEnabled ? { scale: 1.1, rotate: 90 } : undefined}
                  whileTap={animationsEnabled ? { scale: 0.9 } : undefined}
                >
                  <X size={14} />
                </motion.button>

                {/* 进度条 */}
                <motion.div
                  className="absolute bottom-0 left-0 h-0.5 bg-white/50 rounded-b-lg"
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: (toast.action ? 5000 : 3000) / 1000, ease: 'linear' }}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

// 导入 memo
// (memo is now imported at the top)
