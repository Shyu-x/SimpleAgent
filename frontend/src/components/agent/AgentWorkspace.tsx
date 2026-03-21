'use client';

import { memo, useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  Workflow,
  Users,
  Cpu,
  Bot,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import AgentConfigPanel from './AgentConfigPanel';
import WorkflowEditor from './WorkflowEditor';
import AgentExecutionPanel from './AgentExecutionPanel';
import AgentCollaborationPanel from './AgentCollaborationPanel';
import type {
  AgentConfiguration,
  WorkflowDefinition,
  AgentExecutionState,
  WorkflowConfig,
  WorkflowExecutionState,
} from './index';

// Tab 类型
export type WorkspaceTab = 'config' | 'workflow' | 'collaborate' | 'execution';

// 模块级常量：避免每次渲染时重新创建
const TAB_KEYS: WorkspaceTab[] = ['config', 'workflow', 'collaborate', 'execution'];

// Tab 配置
const tabConfig: Record<WorkspaceTab, {
  icon: React.ReactNode;
  label: string;
  description: string;
}> = {
  config: {
    icon: <Settings size={16} />,
    label: '配置',
    description: 'Agent 配置与工具设置',
  },
  workflow: {
    icon: <Workflow size={16} />,
    label: '工作流',
    description: '可视化工作流编辑器',
  },
  collaborate: {
    icon: <Users size={16} />,
    label: '协作',
    description: '多 Agent 协作管理',
  },
  execution: {
    icon: <Cpu size={16} />,
    label: '执行',
    description: '执行监控与调试',
  },
};

// 面板变体
const panelVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, ease: 'easeOut' as const },
  },
  exit: {
    opacity: 0,
    x: -20,
    transition: { duration: 0.2 },
  },
};

// 属性
interface AgentWorkspaceProps {
  /** 当前激活的 Tab */
  activeTab?: WorkspaceTab;
  /** Tab 切换回调 */
  onTabChange?: (tab: WorkspaceTab) => void;
  /** Agent 配置 */
  agentConfig?: Partial<AgentConfiguration>;
  /** Agent 配置保存回调 */
  onAgentConfigSave?: (config: AgentConfiguration) => void;
  /** 工作流定义 */
  workflow?: WorkflowDefinition;
  /** 工作流保存回调 */
  onWorkflowSave?: (workflow: WorkflowDefinition) => void;
  /** 执行状态 */
  executionState?: AgentExecutionState;
  /** 执行控制回调 */
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  onRetry?: () => void;
  /** 协作工作流配置 */
  collaborationWorkflow?: WorkflowConfig;
  /** 协作执行状态 */
  collaborationExecutionState?: WorkflowExecutionState;
  /** 协作控制回调 */
  onCollaborateStart?: () => void;
  onCollaboratePause?: () => void;
  onCollaborateResume?: () => void;
  onCollaborateStop?: () => void;
  onCollaborateRetry?: () => void;
  /** 折叠状态 */
  collapsed?: boolean;
  /** 折叠切换回调 */
  onCollapseChange?: (collapsed: boolean) => void;
  className?: string;
}

// Agent 工作区主组件
const AgentWorkspace = memo(function AgentWorkspace({
  activeTab: controlledTab,
  onTabChange,
  agentConfig,
  onAgentConfigSave,
  workflow,
  onWorkflowSave,
  executionState,
  onPause,
  onResume,
  onStop,
  onRetry,
  collaborationWorkflow,
  collaborationExecutionState,
  onCollaborateStart,
  onCollaboratePause,
  onCollaborateResume,
  onCollaborateStop,
  onCollaborateRetry,
  collapsed = false,
  onCollapseChange,
  className = '',
}: AgentWorkspaceProps) {
  const [internalTab, setInternalTab] = useState<WorkspaceTab>('config');

  // 受控/非受控 Tab
  const activeTab = controlledTab ?? internalTab;
  const handleTabChange = useCallback((tab: WorkspaceTab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  }, [onTabChange]);

  // 使用 useMemo 缓存默认状态，避免每次渲染时重新创建对象
  const defaultExecutionState = useMemo<AgentExecutionState>(() => ({
    status: 'idle',
    currentIteration: 0,
    maxIterations: 10,
    activeAgent: null,
    allAgents: [],
    toolCalls: [],
    thinkingSteps: [],
    checkpoints: [],
  }), []);

  const defaultCollaborationState = useMemo<WorkflowExecutionState>(() => ({
    status: 'idle',
    currentTaskIndex: 0,
    progress: 0,
    errors: [],
    toolCalls: [],
    pendingConfirmations: [],
  }), []);

  // 折叠切换回调
  const handleCollapse = useCallback(() => {
    onCollapseChange?.(!collapsed);
  }, [collapsed, onCollapseChange]);

  // ESC 键关闭面板
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCollapseChange?.(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCollapseChange]);

  return (
    <motion.div
      className={`flex flex-col bg-background border rounded-xl overflow-hidden shadow-lg ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* 头部 Tab 栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-1">
          <Bot size={18} className="text-primary mr-2" />
          <span className="text-sm font-medium mr-4">Agent 工作区</span>
          {(TAB_KEYS).map((tab) => {
            const config = tabConfig[tab];
            const isActive = activeTab === tab;
            return (
              <motion.button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {config.icon}
                <span className="hidden sm:inline">{config.label}</span>
              </motion.button>
            );
          })}
        </div>

        {/* 折叠按钮 */}
        <motion.button
          onClick={handleCollapse}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title={collapsed ? '展开' : '折叠'}
        >
          {collapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </motion.button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {/* 配置 Tab */}
          {activeTab === 'config' && (
            <motion.div
              key="config"
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="h-full"
            >
              <AgentConfigPanel
                config={agentConfig}
                onSave={onAgentConfigSave}
                className="h-full border-0 rounded-none"
              />
            </motion.div>
          )}

          {/* 工作流 Tab */}
          {activeTab === 'workflow' && (
            <motion.div
              key="workflow"
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="h-full"
            >
              <WorkflowEditor
                workflow={workflow}
                onSave={onWorkflowSave}
                className="h-full border-0 rounded-none"
              />
            </motion.div>
          )}

          {/* 协作 Tab */}
          {activeTab === 'collaborate' && (
            <motion.div
              key="collaborate"
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="h-full"
            >
              {collaborationWorkflow ? (
                <AgentCollaborationPanel
                  workflow={collaborationWorkflow}
                  executionState={collaborationExecutionState ?? defaultCollaborationState}
                  onStart={onCollaborateStart}
                  onPause={onCollaboratePause}
                  onResume={onCollaborateResume}
                  onStop={onCollaborateStop}
                  onRetry={onCollaborateRetry}
                  collapsed={collapsed}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <Users size={48} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">暂无可用的工作流</p>
                    <p className="text-xs mt-1">在工作流 Tab 中创建或选择一个工作流</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* 执行 Tab */}
          {activeTab === 'execution' && (
            <motion.div
              key="execution"
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="h-full"
            >
              <AgentExecutionPanel
                state={executionState ?? defaultExecutionState}
                onPause={onPause}
                onResume={onResume}
                onStop={onStop}
                onRetry={onRetry}
                className="h-full border-0 rounded-none"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
});

export default AgentWorkspace;
