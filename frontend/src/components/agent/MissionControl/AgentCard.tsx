'use client';

import { memo, useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Brain, Zap, CheckCircle2, AlertCircle, Clock, User, Radio, Info } from 'lucide-react';
import type { AgentCardProps, MissionAgent, AgentStatus } from './types';

// 状态配置
const statusConfig: Record<AgentStatus, { color: string; bg: string; icon: typeof Bot; label: string }> = {
  idle: { color: 'text-slate-400', bg: 'bg-slate-400/20', icon: Clock, label: '空闲' },
  thinking: { color: 'text-cyan-400', bg: 'bg-cyan-400/20', icon: Brain, label: '思考中' },
  working: { color: 'text-blue-400', bg: 'bg-blue-400/20', icon: Zap, label: '工作中' },
  waiting: { color: 'text-amber-400', bg: 'bg-amber-400/20', icon: Clock, label: '等待中' },
  completed: { color: 'text-emerald-400', bg: 'bg-emerald-400/20', icon: CheckCircle2, label: '已完成' },
  error: { color: 'text-red-400', bg: 'bg-red-400/20', icon: AlertCircle, label: '错误' },
};

// 角色配置
const roleConfig: Record<MissionAgent['role'], { color: string; bg: string; label: string }> = {
  planner: { color: 'text-violet-400', bg: 'bg-violet-400/20', label: '规划' },
  executor: { color: 'text-blue-400', bg: 'bg-blue-400/20', label: '执行' },
  reviewer: { color: 'text-amber-400', bg: 'bg-amber-400/20', label: '评审' },
  coordinator: { color: 'text-emerald-400', bg: 'bg-emerald-400/20', label: '协调' },
};

// Agent 卡片组件
const AgentCard = memo(function AgentCard({
  agent,
  isSelected = false,
  onClick,
  onSelect,
  onTaskClick,
  onBroadcast,
}: AgentCardProps) {
  const status = statusConfig[agent.status];
  const role = roleConfig[agent.role];
  const StatusIcon = status.icon;
  const [hoveredCapability, setHoveredCapability] = useState<string | null>(null);

  const handleClick = useCallback(() => {
    onClick?.(agent);
  }, [agent, onClick]);

  const handleSelect = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelected = !isSelected;
    onSelect?.(agent, newSelected);
  }, [agent, isSelected, onSelect]);

  const handleTaskClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (agent.currentTask) {
      onTaskClick?.(agent.currentTask);
    }
  }, [agent.currentTask, onTaskClick]);

  const handleBroadcast = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onBroadcast?.(agent.id);
  }, [agent.id, onBroadcast]);

  // 工作中状态的进度动画
  const isWorking = agent.status === 'working';

  return (
    <motion.div
      onClick={handleClick}
      className={`
        relative overflow-hidden rounded-xl p-4 cursor-pointer
        transition-all duration-200
        ${isSelected
          ? 'bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border-2 border-blue-500/60 shadow-lg shadow-blue-500/25 ring-1 ring-blue-400/30'
          : 'bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20'
        }
      `}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* 工作状态发光边框动画 */}
      {isWorking && (
        <motion.div
          className="absolute inset-0 rounded-xl border-2 border-blue-400/50"
          animate={{
            boxShadow: [
              '0 0 10px rgba(59, 130, 246, 0.3), inset 0 0 10px rgba(59, 130, 246, 0.1)',
              '0 0 20px rgba(59, 130, 246, 0.5), inset 0 0 15px rgba(59, 130, 246, 0.2)',
              '0 0 10px rgba(59, 130, 246, 0.3), inset 0 0 10px rgba(59, 130, 246, 0.1)',
            ],
          }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* 背景渐变动画 - 工作中状态 */}
      {isWorking && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-cyan-500/10 to-blue-500/10"
          animate={{
            backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          style={{ backgroundSize: '200% 100%' }}
        />
      )}

      {/* 头部 */}
      <div className="flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <motion.div
            className={`
              w-10 h-10 rounded-full flex items-center justify-center
              ${isWorking ? 'bg-blue-500/30' : 'bg-white/10'}
            `}
            animate={isWorking ? {
              boxShadow: [
                '0 0 0 rgba(59, 130, 246, 0)',
                '0 0 15px rgba(59, 130, 246, 0.5)',
                '0 0 0 rgba(59, 130, 246, 0)',
              ],
            } : {}}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <Bot size={20} className={status.color} />
          </motion.div>

          <div>
            <h3 className="font-medium text-white text-sm">{agent.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs px-2 py-0.5 rounded-full ${role.bg} ${role.color}`}>
                {role.label}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 操作按钮 */}
          {onBroadcast && (
            <motion.button
              onClick={handleBroadcast}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-cyan-400 transition-colors"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="广播任务"
            >
              <Radio size={14} />
            </motion.button>
          )}

          {/* 状态指示器 */}
          <div className={`
            flex items-center gap-1.5 px-2 py-1 rounded-full text-xs
            ${status.bg} ${status.color}
          `}>
            <StatusIcon size={12} className={isWorking ? 'animate-pulse' : ''} />
            <span>{status.label}</span>
          </div>
        </div>
      </div>

      {/* 当前任务 */}
      {agent.currentTask && (
        <motion.div
          className="mb-3 cursor-pointer relative z-10"
          onClick={handleTaskClick}
          whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs text-slate-400">当前任务</span>
            {onTaskClick && (
              <Info size={10} className="text-slate-500" />
            )}
          </div>
          <div className="text-sm text-white/90 truncate hover:text-white transition-colors">
            {agent.currentTask}
          </div>
        </motion.div>
      )}

      {/* 进度条 */}
      <div className="space-y-1.5 relative z-10">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">进度</span>
          <span className="text-white font-medium">{agent.progress}%</span>
        </div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${agent.progress}%` }}
            transition={{ duration: 0.3 }}
          />
          {/* 工作中状态下的进度条动画 */}
          {isWorking && (
            <motion.div
              className="h-full w-full absolute top-0 left-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
              animate={{
                x: ['-100%', '200%'],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
          )}
        </div>
      </div>

      {/* 能力标签 */}
      {agent.capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3 relative z-10">
          {agent.capabilities.slice(0, 3).map((cap) => (
            <motion.div
              key={cap}
              className="relative"
              onMouseEnter={() => setHoveredCapability(cap)}
              onMouseLeave={() => setHoveredCapability(null)}
            >
              <span className="text-xs px-1.5 py-0.5 rounded bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition-all cursor-help">
                {cap}
              </span>
              {/* Hover 详情提示 */}
              {hoveredCapability === cap && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute bottom-full left-0 mb-2 px-2 py-1.5 bg-slate-800/95 border border-white/10 rounded-lg shadow-xl text-xs text-white/90 whitespace-nowrap z-50"
                >
                  <div className="font-medium text-white mb-0.5">{cap}</div>
                  <div className="text-slate-400 text-[10px]">
                    Agent 能力标签
                  </div>
                  {/* 气泡箭头 */}
                  <div className="absolute top-full left-3 w-2 h-2 bg-slate-800/95 border-left border-bottom border-white/10 transform rotate-45 -translate-y-1" />
                </motion.div>
              )}
            </motion.div>
          ))}
          {agent.capabilities.length > 3 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-white/5 text-slate-500">
              +{agent.capabilities.length - 3}
            </span>
          )}
        </div>
      )}

      {/* 选中高亮 - 优化样式 */}
      {isSelected && (
        <motion.div
          className="absolute top-0 right-0 w-20 h-20"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        >
          {/* 选中角标 */}
          <div className="absolute top-3 right-3 w-3 h-3 rounded-full bg-blue-400 shadow-lg shadow-blue-400/50">
            <motion.div
              className="absolute inset-0 rounded-full bg-blue-400"
              animate={{ scale: [1, 1.5, 1], opacity: [1, 0, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          </div>
        </motion.div>
      )}

      {/* 选中状态下的选择指示器 */}
      {isSelected && onSelect && (
        <motion.div
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-cyan-400"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.3 }}
        />
      )}
    </motion.div>
  );
});

export default AgentCard;
