// Agent UI Components
// 统一导出所有 Agent 相关组件

// Agent 状态指示器
export {
  default as AgentStatusIndicator,
  AgentStatusPanel,
  MiniStatusIndicator,
} from './AgentStatusIndicator';
export type {
  AgentTool,
  AgentInfo,
} from './AgentStatusIndicator';

// 工具调用展示
export {
  default as ToolCallDisplay,
  ToolCallList,
  MiniToolCall,
} from './ToolCallDisplay';
export type {
  ToolCallStatus,
  ToolType,
  ToolCallParams,
  ToolCallResult,
  ToolCallInfo,
} from './ToolCallDisplay';

// 错误恢复 UI
export {
  default as ErrorRecoveryUI,
  ErrorList,
  MiniError,
} from './ErrorRecoveryUI';
export type {
  ErrorType,
  ErrorSeverity,
  RecoveryStrategy,
  ErrorInfo,
} from './ErrorRecoveryUI';

// 人机确认对话框
export {
  default as HumanConfirmationDialog,
  SimpleConfirmation,
  MiniConfirmation,
} from './HumanConfirmationDialog';
export type {
  ConfirmationType,
  ConfirmationOption,
  ConfirmationRequest,
  ConfirmationResponse,
} from './HumanConfirmationDialog';

// Agent 协作面板
export {
  default as AgentCollaborationPanel,
  WorkflowVisualization,
  WorkflowFlowChart,
} from './AgentCollaborationPanel';
export type {
  WorkflowStatus,
  WorkflowConfig,
  TaskInfo,
  WorkflowExecutionState,
} from './AgentCollaborationPanel';

// Agent 执行面板
export {
  default as AgentExecutionPanel,
  MiniExecutionIndicator,
} from './AgentExecutionPanel';
export type {
  ExecutionStatus,
  ThinkingStep,
  CheckpointData,
  AgentExecutionState,
  LogEntry,
  LogLevel,
} from './AgentExecutionPanel';

// Agent 配置面板
export { default as AgentConfigPanel, AgentConfigPanel as ConfigPanel } from './AgentConfigPanel';
export type {
  AgentCapability,
  ToolConfig,
  MemoryConfig,
  ExecutionConfig,
  AgentConfiguration,
} from './AgentConfigPanel';

// 工具市场
export { default as ToolMarketplace } from './ToolMarketplace';
export type {
  ToolCategory,
  ToolStatus,
  ToolInfo as MarketplaceToolInfo,
} from './ToolMarketplace';

// 执行历史
export { default as ExecutionHistory, ExecutionHistory as ExecutionHistoryPanel } from './ExecutionHistory';
export type {
  ExecutionStatus as HistoryExecutionStatus,
  ExecutionRecord,
} from './ExecutionHistory';

// 配置版本管理
export { default as ConfigVersionManager } from './ConfigVersionManager';
export type {
  ConfigVersion,
  VersionDiff,
} from './ConfigVersionManager';

// 性能监控
export { default as PerformanceMonitor } from './PerformanceMonitor';
export type {
  PerformanceMetrics,
  TimeSeriesPoint,
  RealTimeStatus,
} from './PerformanceMonitor';

// 工作流编辑器
export { default as WorkflowEditor } from './WorkflowEditor';
export type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowConnection,
  NodeType,
  WorkflowTemplate,
  TemplateCategory,
} from './WorkflowEditor';

// Agent 调试器
export { default as AgentDebugger } from './AgentDebugger';
export type {
  DebugState,
  DebugFrame,
  Variable,
  Breakpoint,
} from './AgentDebugger';

// Agent 工作区
export { default as AgentWorkspace } from './AgentWorkspace';
export type {
  WorkspaceTab,
} from './AgentWorkspace';

// DnD 工作流画布
export { default as DndWorkflowCanvas } from './workflow/DndWorkflowCanvas';

// Mission Control
export { default as MissionControl } from './MissionControl/MissionControl';

// Agent Team Orchestrator
export { AgentTeamOrchestrator } from './AgentTeamOrchestrator';
export type {
  TeamAgent,
  TeamTask,
  CollaborationResult,
  TaskResult,
  AgentRole,
  CoordinationMode,
  LayoutMode,
} from './AgentTeamOrchestrator';
export { default as AgentPool } from './MissionControl/AgentPool';
export { default as TaskQueue } from './MissionControl/TaskQueue';
export { default as ResultsFeed } from './MissionControl/ResultsFeed';
export { default as TaskBroadcast } from './MissionControl/TaskBroadcast';
export { default as AgentStatusBar } from './MissionControl/AgentStatusBar';
export { default as ActionBar } from './MissionControl/ActionBar';
export { default as AgentCard } from './MissionControl/AgentCard';
export { useMission } from './MissionControl/useMissionControl';
export type {
  AgentStatus,
  TaskPriority,
  TaskStatus,
  EventType,
  MissionAgent,
  MissionTask,
  MissionEvent,
  MissionControlState,
  MissionControlActions,
  MissionControlStore,
  AgentCardProps,
  TaskQueueProps,
  ResultsFeedProps,
  TaskBroadcastProps,
  AgentStatusBarProps,
  ActionBarProps,
  MissionControlProps,
} from './MissionControl/types';