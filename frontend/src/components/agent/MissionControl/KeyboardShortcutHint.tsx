'use client';

import { memo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { isClient } from '@/lib/ssrStorage';
import { Keyboard, X } from 'lucide-react';

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface KeyboardShortcutHintProps {
  shortcuts?: ShortcutItem[];
}

const defaultShortcuts: ShortcutItem[] = [
  { keys: ['Ctrl', 'Enter'], description: '发布全部' },
  { keys: ['Esc'], description: '关闭面板' },
];

const KeyboardShortcutHint = memo(function KeyboardShortcutHint({
  shortcuts = defaultShortcuts,
}: KeyboardShortcutHintProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  // 检测 Ctrl+Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        // 触发发布全部
        const publishBtn = document.querySelector('[data-action="publish-all"]') as HTMLButtonElement;
        if (publishBtn && !publishBtn.disabled) {
          publishBtn.click();
        }
      }
      // 按 ? 键显示快捷键提示
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          setIsExpanded((prev) => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 新手引导：首次显示
  useEffect(() => {
    if (!isClient()) return;
    const hasSeen = localStorage.getItem('mc_shortcut_hint_shown');
    if (!hasSeen) {
      setShowBanner(true);
      setTimeout(() => {
        setShowBanner(false);
        localStorage.setItem('mc_shortcut_hint_shown', 'true');
      }, 5000);
    }
  }, []);

  return (
    <>
      {/* 底部提示条 */}
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40"
      >
        <AnimatePresence>
          {showBanner && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="flex items-center gap-3 px-4 py-2.5 bg-slate-800/90 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl"
            >
              <Keyboard size={16} className="text-cyan-400" />
              <span className="text-sm text-slate-300">
                按 <kbd className="px-1.5 py-0.5 mx-0.5 bg-slate-700 rounded text-xs text-white">?</kbd> 查看快捷键
              </span>
              <button
                onClick={() => setShowBanner(false)}
                className="p-0.5 rounded hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* 快捷键面板 */}
      <AnimatePresence>
        {isExpanded && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setIsExpanded(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-72 bg-slate-900/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl overflow-hidden"
            >
              {/* 头部 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Keyboard size={14} className="text-cyan-400" />
                  <span className="text-sm font-medium text-white">快捷键</span>
                </div>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                >
                  <X size={14} />
                </button>
              </div>

              {/* 快捷键列表 */}
              <div className="p-2">
                {shortcuts.map((shortcut, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-white/5"
                  >
                    <span className="text-sm text-slate-400">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <kbd
                          key={keyIndex}
                          className="px-2 py-1 text-xs font-medium bg-slate-800 border border-slate-700 rounded text-slate-300"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* 底部提示 */}
              <div className="px-4 py-2 border-t border-white/10 bg-black/20">
                <p className="text-[10px] text-slate-500">按 ? 键或点击切换显示</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
});

export default KeyboardShortcutHint;
