'use client';

import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '@/store/chatStore';

interface KeyboardShortcutsProps {
  isOpen: boolean;
  onClose: () => void;
}

// 模态框动画变体
const modalVariants = {
  hidden: {
    opacity: 0,
    scale: 0.9,
    y: 20,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 300,
      damping: 25,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    y: 20,
    transition: {
      duration: 0.2,
    },
  },
} as const;

export default function KeyboardShortcuts({ isOpen, onClose }: KeyboardShortcutsProps) {
  const { settings } = useChatStore();
  const animationsEnabled = settings.animationsEnabled;

  const shortcuts = [
    { keys: ['Ctrl', 'Enter'], description: '发送消息' },
    { keys: ['Ctrl', 'N'], description: '新建对话' },
    { keys: ['Ctrl', 'K'], description: '打开知识库' },
    { keys: ['Ctrl', '/'], description: '显示快捷键帮助' },
    { keys: ['Escape'], description: '关闭弹窗/面板' },
    { keys: ['↑'], description: '切换上一条历史消息' },
    { keys: ['↓'], description: '切换下一条历史消息' },
    { keys: ['Tab'], description: '在元素间导航' },
  ];

  const itemVariants = {
    hidden: { opacity: 0, x: -10 },
    visible: (index: number) => ({
      opacity: 1,
      x: 0,
      transition: {
        delay: 0.1 + index * 0.05,
        duration: 0.2,
        ease: 'easeOut' as const,
      },
    }),
  } as const;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={onClose}
          initial={animationsEnabled ? { opacity: 0 } : undefined}
          animate={animationsEnabled ? { opacity: 1 } : undefined}
          exit={animationsEnabled ? { opacity: 0 } : undefined}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl glass"
            variants={animationsEnabled ? modalVariants : undefined}
            initial={animationsEnabled ? 'hidden' : undefined}
            animate={animationsEnabled ? 'visible' : undefined}
            exit={animationsEnabled ? 'exit' : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <motion.h2
                className="text-lg font-semibold"
                initial={animationsEnabled ? { opacity: 0, x: -10 } : undefined}
                animate={animationsEnabled ? { opacity: 1, x: 0 } : undefined}
                transition={{ delay: 0.1 }}
              >
                键盘快捷键
              </motion.h2>
              <motion.button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
                whileHover={animationsEnabled ? { scale: 1.1, rotate: 90 } : undefined}
                whileTap={animationsEnabled ? { scale: 0.9 } : undefined}
              >
                <X size={18} />
              </motion.button>
            </div>

            <div className="space-y-3">
              {shortcuts.map((shortcut, index) => (
                <motion.div
                  key={index}
                  variants={animationsEnabled ? itemVariants : undefined}
                  initial={animationsEnabled ? 'hidden' : undefined}
                  animate={animationsEnabled ? 'visible' : undefined}
                  custom={index}
                  className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                  whileHover={animationsEnabled ? { backgroundColor: 'hsl(var(--text-main) / 0.04)' } : undefined}
                >
                  <span className="text-sm text-muted-foreground">{shortcut.description}</span>
                  <div className="flex items-center gap-1">
                    {shortcut.keys.map((key, keyIndex) => (
                      <kbd
                        key={keyIndex}
                        className="px-2 py-1 text-xs font-mono bg-muted rounded border shadow-sm"
                      >
                        {key}
                      </kbd>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.p
              className="mt-4 text-xs text-muted-foreground text-center"
              initial={animationsEnabled ? { opacity: 0 } : undefined}
              animate={animationsEnabled ? { opacity: 1 } : undefined}
              transition={{ delay: 0.5 }}
            >
              按 Ctrl + / 可随时打开此帮助
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
