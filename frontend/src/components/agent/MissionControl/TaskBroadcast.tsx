'use client';

import { memo, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, Send, X, AlertTriangle } from 'lucide-react';
import type { TaskBroadcastProps, MissionTask } from './types';

// 紧急任务卡片
const PriorityTaskCard = memo(function PriorityTaskCard({
  task,
  onBroadcast,
}: {
  task: MissionTask;
  onBroadcast?: (taskId: string) => void;
}) {
  const priorityColors = {
    critical: 'border-l-4 border-red-500 bg-red-500/10',
    high: 'border-l-4 border-orange-500 bg-orange-500/10',
    medium: 'border-l-4 border-yellow-500 bg-yellow-500/10',
    low: 'border-l-4 border-green-500 bg-green-500/10',
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`
        relative overflow-hidden rounded-lg p-3
        ${priorityColors[task.priority]}
        opacity-90 hover:opacity-100 transition-opacity
      `}
    >
      {/* 广播按钮 */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => onBroadcast?.(task.id)}
        className={`
          absolute top-2 right-2 p-1.5 rounded-full
          bg-purple-500/20 text-purple-400
          hover:bg-purple-500/30 hover:text-purple-300
          transition-colors
        `}
      >
        <Radio size={14} />
      </motion.button>

      {/* 内容 */}
      <div className="pr-8">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle size={12} className="text-yellow-400" />
          <span className="text-xs text-slate-400">
            {task.priority === 'critical' ? '紧急任务' : '优先任务'}
          </span>
        </div>
        <h4 className="font-medium text-white text-sm mb-1">{task.title}</h4>
        {task.description && (
          <p className="text-xs text-slate-400 line-clamp-2">{task.description}</p>
        )}
      </div>
    </motion.div>
  );
});

// 广播面板组件
const TaskBroadcast = memo(function TaskBroadcast({
  pendingTasks,
  onBroadcast,
}: TaskBroadcastProps) {
  const [customMessage, setCustomMessage] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  // 优先任务
  const priorityTasks = pendingTasks.filter(
    (t) => t.priority === 'critical' || t.priority === 'high'
  );

  const handleBroadcast = useCallback((taskId: string) => {
    setIsBroadcasting(true);
    onBroadcast?.(taskId);
    setTimeout(() => setIsBroadcasting(false), 500);
  }, [onBroadcast]);

  const handleCustomBroadcast = useCallback(() => {
    if (!customMessage.trim()) return;
    setIsBroadcasting(true);
    // 广播自定义消息
    setTimeout(() => {
      setIsBroadcasting(false);
      setCustomMessage('');
    }, 500);
  }, [customMessage]);

  return (
    <div className="h-full flex flex-col">
      {/* 头部 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
        <Radio size={16} className="text-purple-400" />
        <span className="font-medium text-white text-sm">任务广播</span>
        {isBroadcasting && (
          <motion.div
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="w-2 h-2 rounded-full bg-purple-400"
          />
        )}
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 mc-scrollbar">
        {/* 自定义广播 */}
        <div className="relative">
          <input
            type="text"
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            placeholder="输入广播消息..."
            className="
              w-full px-3 py-2 pr-10 rounded-lg
              bg-white/5 border border-white/10
              text-white text-sm placeholder:text-slate-500
              focus:outline-none focus:border-purple-500/50
            "
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCustomBroadcast();
            }}
          />
          <button
            onClick={handleCustomBroadcast}
            disabled={!customMessage.trim()}
            className="
              absolute right-2 top-1/2 -translate-y-1/2
              p-1 rounded
              text-purple-400 hover:text-purple-300
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            <Send size={14} />
          </button>
        </div>

        {/* 优先任务列表 */}
        {priorityTasks.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs text-slate-500 uppercase tracking-wider">
              优先任务 ({priorityTasks.length})
            </div>
            <AnimatePresence mode="popLayout">
              {priorityTasks.map((task) => (
                <PriorityTaskCard
                  key={task.id}
                  task={task}
                  onBroadcast={handleBroadcast}
                />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="text-center py-6 text-slate-500 text-sm">
            暂无优先任务
          </div>
        )}

        {/* 广播历史提示 */}
        <div className="text-xs text-slate-600 mt-4 text-center">
          广播将同时通知所有在线 Agent
        </div>
      </div>
    </div>
  );
});

export default TaskBroadcast;
