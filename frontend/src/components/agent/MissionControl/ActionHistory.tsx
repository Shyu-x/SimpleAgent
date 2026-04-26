'use client';

import { memo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, X, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import type { ActionHistoryItem } from './types';

interface ActionHistoryProps {
  history: ActionHistoryItem[];
  onClear?: () => void;
  maxDisplay?: number;
}

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatRelativeTime = (timestamp: number) => {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${Math.floor(diff / 86400000)}天前`;
};

const ActionIcon = ({ action }: { action: string }) => {
  const iconMap: Record<string, string> = {
    completeTask: '✓',
    failTask: '✗',
    clearCompleted: '🗑',
    broadcastTask: '📢',
    batchComplete: '✅',
    batchFail: '❌',
  };
  return (
    <span className="w-5 h-5 flex items-center justify-center text-xs rounded bg-white/10">
      {iconMap[action] || '•'}
    </span>
  );
};

const ActionHistory = memo(function ActionHistory({
  history,
  onClear,
  maxDisplay = 5,
}: ActionHistoryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // 气泡动画
  useEffect(() => {
    if (history.length > 0) {
      setIsVisible(true);
      const timer = setTimeout(() => setIsVisible(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [history.length]);

  const displayedHistory = isExpanded ? history : history.slice(0, maxDisplay);

  if (history.length === 0) return null;

  return (
    <div className="relative">
      {/* 历史记录按钮 */}
      <button
        onClick={() => setIsVisible(!isVisible)}
        className={`relative p-1.5 rounded hover:bg-white/10 transition-colors ${
          isVisible ? 'text-cyan-400' : 'text-slate-400'
        }`}
        title="操作历史"
      >
        <History size={16} />
        {history.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center text-[10px] font-medium bg-cyan-500 rounded-full text-white">
            {history.length > 99 ? '99+' : history.length}
          </span>
        )}
      </button>

      {/* 历史记录面板 */}
      <AnimatePresence>
        {isVisible && (
          <>
            {/* 遮罩 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setIsVisible(false)}
            />
            {/* 面板 */}
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 w-72 bg-slate-900/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
            >
              {/* 头部 */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                <span className="text-sm font-medium text-white">操作历史</span>
                <div className="flex items-center gap-1">
                  {onClear && (
                    <button
                      onClick={onClear}
                      className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-red-400 transition-colors"
                      title="清空历史"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => setIsVisible(false)}
                    className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* 历史列表 */}
              <div className="max-h-64 overflow-y-auto">
                {displayedHistory.map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="flex items-start gap-2 px-3 py-2 hover:bg-white/5 border-b border-white/5 last:border-0"
                  >
                    <ActionIcon action={item.action} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-300 font-medium">
                          {item.action}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {formatRelativeTime(item.timestamp)}
                        </span>
                      </div>
                      {item.details && (
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {item.details}
                        </p>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* 展开/收起 */}
              {history.length > maxDisplay && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="w-full flex items-center justify-center gap-1 py-2 text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-colors border-t border-white/10"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp size={12} />
                      收起
                    </>
                  ) : (
                    <>
                      <ChevronDown size={12} />
                      查看全部 {history.length} 条
                    </>
                  )}
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
});

export default ActionHistory;
