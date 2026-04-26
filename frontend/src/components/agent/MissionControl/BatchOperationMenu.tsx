'use client';

import { memo, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers,
  X,
  CheckCircle,
  XCircle,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

interface BatchOperationMenuProps {
  selectedCount: number;
  onBatchComplete: () => void;
  onBatchFail: () => void;
  onBatchDelete: () => void;
  onClearSelection: () => void;
}

const operations = [
  { id: 'complete', label: '批量完成', icon: CheckCircle, color: 'text-green-400', bg: 'hover:bg-green-500/20' },
  { id: 'fail', label: '批量失败', icon: XCircle, color: 'text-red-400', bg: 'hover:bg-red-500/20' },
  { id: 'delete', label: '批量删除', icon: Trash2, color: 'text-orange-400', bg: 'hover:bg-orange-500/20' },
];

const BatchOperationMenu = memo(function BatchOperationMenu({
  selectedCount,
  onBatchComplete,
  onBatchFail,
  onBatchDelete,
  onClearSelection,
}: BatchOperationMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // 键盘关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (selectedCount === 0) return null;

  return (
    <div className="relative" ref={menuRef}>
      {/* 触发按钮 */}
      <motion.button
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 text-sm font-medium hover:bg-cyan-500/30 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Layers size={14} />
        <span>已选 {selectedCount} 项</span>
        {isOpen ? <X size={12} /> : null}
      </motion.button>

      {/* 菜单 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="absolute left-0 top-full mt-2 w-48 bg-slate-900/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            {/* 操作项 */}
            <div className="py-1">
              {operations.map((op) => (
                <button
                  key={op.id}
                  onClick={() => {
                    if (op.id === 'complete') onBatchComplete();
                    else if (op.id === 'fail') onBatchFail();
                    else if (op.id === 'delete') onBatchDelete();
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 ${op.bg} transition-colors`}
                >
                  <op.icon size={14} className={op.color} />
                  <span>{op.label}</span>
                </button>
              ))}
            </div>

            {/* 分隔线 */}
            <div className="border-t border-white/10" />

            {/* 清除选择 */}
            <button
              onClick={() => {
                onClearSelection();
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
            >
              <X size={14} />
              <span>清除选择</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default BatchOperationMenu;
