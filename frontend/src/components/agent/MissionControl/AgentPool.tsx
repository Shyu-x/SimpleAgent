'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Clock, Zap, CheckCircle2, AlertCircle, X, Brain, Zap as ZapIcon, User } from 'lucide-react';
import AgentCard from './AgentCard';
import { useMissionControlStore } from './store';
import type { MissionAgent, AgentStatus } from './types';

// 状态配置
const statusConfig: Record<AgentStatus, { color: string; bg: string; icon: typeof Bot; label: string }> = {
  idle: { color: 'text-slate-400', bg: 'bg-slate-400/20', icon: Clock, label: '空闲' },
  thinking: { color: 'text-cyan-400', bg: 'bg-cyan-400/20', icon: Brain, label: '思考中' },
  working: { color: 'text-blue-400', bg: 'bg-blue-400/20', icon: ZapIcon, label: '工作中' },
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

export default function AgentPool() {
  const agents = useMissionControlStore((state) => state.agents);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // 计算统计数据
  const stats = useMemo(() => {
    return {
      idle: agents.filter((a) => a.status === 'idle').length,
      working: agents.filter((a) => a.status === 'working' || a.status === 'thinking').length,
      completed: agents.filter((a) => a.status === 'completed').length,
      error: agents.filter((a) => a.status === 'error').length,
    };
  }, [agents]);

  // 获取选中的 Agent
  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedAgentId),
    [agents, selectedAgentId]
  );

  // 处理 Agent 选择
  const handleAgentClick = (agent: MissionAgent) => {
    setSelectedAgentId((prev) => (prev === agent.id ? null : agent.id));
  };

  // 关闭详情面板
  const handleCloseDetail = () => {
    setSelectedAgentId(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* 主体区域 */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* 左侧 Agent 卡片网格 */}
        <div className={`flex-1 transition-all duration-300 ${selectedAgent ? 'w-1/2' : 'w-full'}`}>
          <div className="grid grid-cols-2 gap-3 h-full content-start">
            {agents.length === 0 ? (
              <div className="col-span-2 flex flex-col items-center justify-center py-12 text-slate-400">
                <Bot size={48} className="mb-4 opacity-50" />
                <p>暂无 Agent</p>
              </div>
            ) : (
              agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  isSelected={agent.id === selectedAgentId}
                  onClick={handleAgentClick}
                />
              ))
            )}
          </div>
        </div>

        {/* 右侧详情面板 */}
        <AnimatePresence>
          {selectedAgent && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: '50%', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="h-full glass-card p-4 flex flex-col">
                {/* 面板头部 */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-medium">Agent 详情</h3>
                  <button
                    onClick={handleCloseDetail}
                    className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Agent 信息 */}
                <div className="flex-1 overflow-auto mc-scrollbar">
                  {/* 基本信息 */}
                  <div className="mb-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <Bot size={24} className="text-blue-400" />
                      </div>
                      <div>
                        <h4 className="text-white font-medium">{selectedAgent.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${roleConfig[selectedAgent.role].bg} ${roleConfig[selectedAgent.role].color}`}>
                            {roleConfig[selectedAgent.role].label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 状态 */}
                  <div className="mb-4">
                    <div className="text-xs text-slate-400 mb-2">状态</div>
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${statusConfig[selectedAgent.status].bg} ${statusConfig[selectedAgent.status].color}`}>
                      {(() => {
                        const StatusIcon = statusConfig[selectedAgent.status].icon;
                        return <StatusIcon size={14} />;
                      })()}
                      <span className="text-sm font-medium">{statusConfig[selectedAgent.status].label}</span>
                    </div>
                  </div>

                  {/* 当前任务 */}
                  <div className="mb-4">
                    <div className="text-xs text-slate-400 mb-2">当前任务</div>
                    <div className="text-sm text-white/90">
                      {selectedAgent.currentTask || '暂无任务'}
                    </div>
                  </div>

                  {/* 进度 */}
                  <div className="mb-4">
                    <div className="text-xs text-slate-400 mb-2">进度</div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${selectedAgent.progress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                      <span className="text-sm text-white font-medium">{selectedAgent.progress}%</span>
                    </div>
                  </div>

                  {/* 能力 */}
                  <div className="mb-4">
                    <div className="text-xs text-slate-400 mb-2">能力</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedAgent.capabilities.length === 0 ? (
                        <span className="text-sm text-slate-500">暂无能力</span>
                      ) : (
                        selectedAgent.capabilities.map((cap) => (
                          <span
                            key={cap}
                            className="text-xs px-2 py-1 rounded bg-white/5 text-slate-300 border border-white/10"
                          >
                            {cap}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* 最后心跳 */}
                  <div className="mb-4">
                    <div className="text-xs text-slate-400 mb-2">最后心跳</div>
                    <div className="text-sm text-white/70">
                      {new Date(selectedAgent.lastHeartbeat).toLocaleTimeString()}
                    </div>
                  </div>

                  {/* ID */}
                  <div>
                    <div className="text-xs text-slate-400 mb-2">Agent ID</div>
                    <div className="text-xs text-slate-500 font-mono break-all">
                      {selectedAgent.id}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 底部统计栏 */}
      <div className="mt-4 glass-card p-3">
        <div className="flex items-center justify-around">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-slate-400" />
            <span className="text-xs text-slate-400">空闲</span>
            <span className="text-sm font-medium text-white ml-1">{stats.idle}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-xs text-slate-400">工作中</span>
            <span className="text-sm font-medium text-white ml-1">{stats.working}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-xs text-slate-400">已完成</span>
            <span className="text-sm font-medium text-white ml-1">{stats.completed}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-xs text-slate-400">错误</span>
            <span className="text-sm font-medium text-white ml-1">{stats.error}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
