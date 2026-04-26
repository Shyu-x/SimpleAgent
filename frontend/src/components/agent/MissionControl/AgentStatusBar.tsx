'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import {
  Bot,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  Zap
} from 'lucide-react';
import type { AgentStatusBarProps, MissionAgent, AgentStatus } from './types';

// 状态统计
const statusStats = (agents: MissionAgent[]) => {
  const stats: Record<AgentStatus, number> = {
    idle: 0,
    thinking: 0,
    working: 0,
    waiting: 0,
    completed: 0,
    error: 0,
  };
  agents.forEach((a) => {
    stats[a.status]++;
  });
  return stats;
};

// Agent 头像列表
const AgentAvatars = memo(function AgentAvatars({ agents }: { agents: MissionAgent[] }) {
  const displayAgents = agents.slice(0, 5);
  const remaining = agents.length - 5;

  return (
    <div className="flex items-center -space-x-2">
      {displayAgents.map((agent, i) => (
        <motion.div
          key={agent.id}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: i * 0.05 }}
          className={`
            w-8 h-8 rounded-full flex items-center justify-center
            border-2 border-slate-900
            ${agent.status === 'working' ? 'bg-blue-500/30' : 'bg-slate-800'}
            ${agent.status === 'error' ? 'ring-2 ring-red-500' : ''}
          `}
          title={`${agent.name}: ${agent.status}`}
        >
          <Bot size={14} className={
            agent.status === 'working' ? 'text-blue-400' :
            agent.status === 'error' ? 'text-red-400' :
            'text-slate-400'
          } />
        </motion.div>
      ))}
      {remaining > 0 && (
        <div className="w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-900 flex items-center justify-center">
          <span className="text-xs text-slate-400">+{remaining}</span>
        </div>
      )}
    </div>
  );
});

// 进度环
const ProgressRing = memo(function ProgressRing({
  completed,
  total,
  size = 36,
}: {
  completed: number;
  total: number;
  size?: number;
}) {
  const progress = total > 0 ? (completed / total) * 100 : 0;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        {/* 背景圆环 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* 进度圆环 */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#progressGradient)"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.5 }}
          strokeDasharray={circumference}
        />
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-medium text-white">{completed}</span>
      </div>
    </div>
  );
});

// 状态条组件
const AgentStatusBar = memo(function AgentStatusBar({
  agents,
  totalTasks,
  completedTasks,
  failedTasks,
  isActive,
}: AgentStatusBarProps) {
  const stats = statusStats(agents);
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-slate-900/50 border-b border-white/10">
      {/* 左侧: 状态 */}
      <div className="flex items-center gap-4">
        {/* 活动状态 */}
        <div className="flex items-center gap-2">
          {isActive ? (
            <>
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-2 h-2 rounded-full bg-emerald-400"
              />
              <span className="text-xs text-emerald-400 font-medium">进行中</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-slate-500" />
              <span className="text-xs text-slate-400">已停止</span>
            </>
          )}
        </div>

        {/* 分隔线 */}
        <div className="w-px h-4 bg-white/10" />

        {/* Agent 头像组 */}
        <AgentAvatars agents={agents} />

        {/* Agent 统计 */}
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-blue-400">
            <Zap size={12} />
            {stats.working}
          </span>
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckCircle2 size={12} />
            {stats.completed}
          </span>
          <span className="flex items-center gap-1 text-red-400">
            <XCircle size={12} />
            {stats.error}
          </span>
          <span className="flex items-center gap-1 text-slate-400">
            <Clock size={12} />
            {stats.idle}
          </span>
        </div>
      </div>

      {/* 右侧: 任务进度 */}
      <div className="flex items-center gap-4">
        {/* 进度环 */}
        <ProgressRing completed={completedTasks} total={totalTasks} />

        {/* 进度详情 */}
        <div className="text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">任务进度</span>
            <span className="font-medium text-white">{progress}%</span>
          </div>
          <div className="text-slate-500">
            {completedTasks}/{totalTasks} 完成
            {failedTasks > 0 && <span className="text-red-400 ml-1">({failedTasks} 失败)</span>}
          </div>
        </div>

        {/* 活动指示器 */}
        {isActive && (
          <motion.div
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/20"
          >
            <Activity size={12} className="text-blue-400" />
            <span className="text-xs text-blue-400">LIVE</span>
          </motion.div>
        )}
      </div>
    </div>
  );
});

export default AgentStatusBar;
