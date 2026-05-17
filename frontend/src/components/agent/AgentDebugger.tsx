'use client';

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bug,
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  ChevronRight,
  Terminal,
  Brain,
  Wrench,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Settings,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { fetchApi } from '@/lib/apiClient';

// 断点
export interface Breakpoint {
  id: string;
  nodeId: string;
  line?: number;
  condition?: string;
  enabled: boolean;
  hitCount: number;
}

// 变量
export interface Variable {
  name: string;
  value: unknown;
  type: string;
  scope: 'local' | 'global' | 'context';
}

// 调试帧
export interface DebugFrame {
  id: string;
  name: string;
  type: 'thought' | 'action' | 'observation' | 'error';
  timestamp: number;
  content: string;
  variables?: Variable[];
  duration?: number;
}

// 调试状态
export interface DebugState {
  status: 'idle' | 'running' | 'paused' | 'step' | 'error';
  currentFrameId: string | null;
  frames: DebugFrame[];
  variables: Variable[];
  breakpoints: Breakpoint[];
  callStack: string[];
  logs: string[];
}

// 类型样式
const frameTypeStyles = {
  thought: { icon: <Brain size={12} />, color: 'text-[hsl(var(--accent-500))]', bg: 'bg-[hsl(var(--accent-500))/0.16]', label: '思考' },
  action: { icon: <Wrench size={12} />, color: 'text-primary', bg: 'bg-primary/10', label: '行动' },
  observation: { icon: <Clock size={12} />, color: 'text-[hsl(var(--success-500))]', bg: 'bg-[hsl(var(--success-500))/0.14]', label: '观察' },
  error: { icon: <AlertCircle size={12} />, color: 'text-destructive', bg: 'bg-destructive/10', label: '错误' },
};

// API 响应类型
interface TraceResponse {
  success: boolean;
  traces?: Array<{
    traceId: string;
    query: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    status: string;
    frames?: DebugFrame[];
  }>;
}

// 从 Agent 轨迹 API 获取数据
async function fetchAgentTraces(limit = 10): Promise<DebugFrame[]> {
  try {
    const response = await fetchApi<TraceResponse>('/api/admin/traces');
    if (response.data?.traces) {
      // 将轨迹转换为调试帧
      const frames: DebugFrame[] = [];
      response.data.traces.slice(0, limit).forEach((trace, idx) => {
        frames.push({
          id: `trace_${trace.traceId}`,
          name: `轨迹 ${idx + 1}`,
          type: trace.status === 'completed' ? 'observation' : trace.status === 'error' ? 'error' : 'thought',
          timestamp: trace.startTime,
          content: trace.query || 'Agent 执行',
          duration: trace.duration || 0,
        });
      });
      return frames;
    }
  } catch (error) {
    console.error('Failed to fetch agent traces:', error);
  }
  return [];
}

// 控制栏
interface ControlsBarProps {
  status: DebugState['status'];
  onRun: () => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
}

const ControlsBar = memo(function ControlsBar({
  status,
  onRun,
  onPause,
  onStep,
  onReset,
}: ControlsBarProps) {
  return (
    <div className="flex items-center gap-2 p-2 border-b bg-muted/30">
      <div className="flex items-center gap-1">
        {status === 'running' ? (
          <motion.button
            onClick={onPause}
            className="flex items-center gap-1 px-3 py-1.5 bg-[hsl(var(--warning-500))] text-primary-foreground rounded-lg text-sm"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Pause size={14} />
            暂停
          </motion.button>
        ) : (
          <motion.button
            onClick={onRun}
            className="flex items-center gap-1 px-3 py-1.5 bg-[hsl(var(--success-500))] text-primary-foreground rounded-lg text-sm"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Play size={14} />
            运行
          </motion.button>
        )}
        <motion.button
          onClick={onStep}
          disabled={status === 'running'}
          className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-sm disabled:opacity-50"
          whileHover={{ scale: status === 'running' ? 1 : 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <SkipForward size={14} />
          单步
        </motion.button>
        <motion.button
          onClick={onReset}
          className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-sm"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <RotateCcw size={14} />
          重置
        </motion.button>
      </div>

      {/* 状态指示 */}
      <div className="flex items-center gap-2 ml-auto">
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
          status === 'running' ? 'bg-[hsl(var(--success-500))/0.14] text-[hsl(var(--success-500))]' :
          status === 'paused' ? 'bg-[hsl(var(--warning-500))/0.14] text-[hsl(var(--warning-500))]' :
          status === 'error' ? 'bg-destructive/10 text-destructive' :
          'bg-muted text-muted-foreground'
        }`}>
          {status === 'running' ? <Play size={10} /> :
           status === 'paused' ? <Pause size={10} /> :
           status === 'error' ? <XCircle size={10} /> :
           <CheckCircle2 size={10} />}
          {status === 'running' ? '运行中' :
           status === 'paused' ? '已暂停' :
           status === 'error' ? '错误' : '就绪'}
        </div>
      </div>
    </div>
  );
});

// 帧列表
interface FrameListProps {
  frames: DebugFrame[];
  currentFrameId: string | null;
  onSelectFrame: (id: string) => void;
}

const FrameList = memo(function FrameList({
  frames,
  currentFrameId,
  onSelectFrame,
}: FrameListProps) {
  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {frames.length === 0 ? (
        <div className="p-4 text-center text-muted-foreground text-sm">
          暂无执行记录
        </div>
      ) : (
        <div className="divide-y">
          {frames.map((frame, index) => {
            const style = frameTypeStyles[frame.type];
            const isCurrent = frame.id === currentFrameId;

            return (
              <motion.div
                key={frame.id}
                className={`p-3 cursor-pointer transition-colors ${
                  isCurrent ? 'bg-primary/10' : 'hover:bg-muted/50'
                }`}
                onClick={() => onSelectFrame(frame.id)}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${style.bg} ${style.color}`}>
                    {style.icon}
                    {style.label}
                  </span>
                  <span className="text-sm font-medium flex-1 truncate">{frame.name}</span>
                  {frame.duration && (
                    <span className="text-xs text-muted-foreground">{frame.duration}ms</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 pl-6">
                  {frame.content}
                </p>
                <div className="text-xs text-muted-foreground mt-1 pl-6">
                  {formatTime(frame.timestamp)}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
});

// 变量面板
interface VariablesPanelProps {
  variables: Variable[];
}

const VariablesPanel = memo(function VariablesPanel({
  variables,
}: VariablesPanelProps) {
  const [expandedVars, setExpandedVars] = useState<Set<string>>(new Set());

  const toggleVar = (name: string) => {
    setExpandedVars(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const formatValue = (value: unknown): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  const scopeColors = {
    local: 'text-primary',
    global: 'text-[hsl(var(--accent-500))]',
    context: 'text-[hsl(var(--success-500))]',
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {variables.length === 0 ? (
        <div className="p-4 text-center text-muted-foreground text-sm">
          暂无变量
        </div>
      ) : (
        <div className="divide-y">
          {variables.map((variable) => {
            const isExpanded = expandedVars.has(variable.name);
            const isObject = typeof variable.value === 'object' && variable.value !== null;

            return (
              <div key={variable.name} className="p-2">
                <div
                  className="flex items-center gap-2 cursor-pointer"
                  onClick={() => isObject && toggleVar(variable.name)}
                >
                  {isObject && (
                    <ChevronRight
                      size={12}
                      className={`text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                  )}
                  <span className="text-sm font-medium">{variable.name}</span>
                  <span className={`text-xs ${scopeColors[variable.scope]}`}>
                    {variable.scope}
                  </span>
                  <span className="text-xs text-muted-foreground">: {variable.type}</span>
                </div>
                <div className="mt-1 ml-6">
                  <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto">
                    {formatValue(variable.value)}
                  </pre>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

// 断点面板
interface BreakpointsPanelProps {
  breakpoints: Breakpoint[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

const BreakpointsPanel = memo(function BreakpointsPanel({
  breakpoints,
  onToggle,
  onDelete,
}: BreakpointsPanelProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      {breakpoints.length === 0 ? (
        <div className="p-4 text-center text-muted-foreground text-sm">
          点击行号添加断点
        </div>
      ) : (
        <div className="divide-y">
          {breakpoints.map((bp) => (
            <div key={bp.id} className="flex items-center gap-2 p-2">
              <input
                type="checkbox"
                checked={bp.enabled}
                onChange={() => onToggle(bp.id)}
                className="rounded"
              />
              <span className="flex-1 text-sm truncate">{bp.nodeId}</span>
              {bp.condition && (
                <span className="text-xs text-muted-foreground">条件: {bp.condition}</span>
              )}
              <span className="text-xs text-muted-foreground">
                命中: {bp.hitCount}
              </span>
              <button
                onClick={() => onDelete(bp.id)}
                className="p-1 rounded hover:bg-muted text-muted-foreground"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// 控制台
interface ConsolePanelProps {
  logs: string[];
  onClear: () => void;
}

const ConsolePanel = memo(function ConsolePanel({
  logs,
  onClear,
}: ConsolePanelProps) {
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Terminal size={14} />
          <span className="text-sm font-medium">控制台</span>
          <span className="text-xs text-muted-foreground">{logs.length} 条日志</span>
        </div>
        <button
          onClick={onClear}
          className="p-1 rounded hover:bg-muted text-muted-foreground"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div
        ref={consoleRef}
        className="flex-1 overflow-y-auto p-2 font-mono text-xs space-y-1"
      >
        {logs.map((log, index) => (
          <div key={index} className="text-muted-foreground whitespace-pre-wrap">
            {log}
          </div>
        ))}
      </div>
    </div>
  );
});

// 主组件
interface AgentDebuggerProps {
  className?: string;
}

export const AgentDebugger = memo(function AgentDebugger({
  className='',
}: AgentDebuggerProps) {
  const [state, setState] = useState<DebugState>({
    status: 'idle',
    currentFrameId: null,
    frames: [],
    variables: [],
    breakpoints: [
      { id: 'bp_1', nodeId: 'node_2', enabled: true, hitCount: 0 },
    ],
    callStack: ['main'],
    logs: ['[INFO] Agent 调试器已初始化', '[INFO] 等待真实轨迹数据...'],
  });
  const [activePanel, setActivePanel] = useState<'frames' | 'variables' | 'breakpoints'>('frames');
  const [isLoading, setIsLoading] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // 从 API 获取轨迹数据
  const loadTraces = useCallback(async () => {
    setIsLoading(true);
    try {
      const frames = await fetchAgentTraces(10);
      if (frames.length > 0) {
        setState(prev => ({
          ...prev,
          frames,
          logs: [...prev.logs.slice(-20), `[INFO] 加载了 ${frames.length} 条轨迹`],
        }));
      }
    } catch (error) {
      console.error('Failed to load traces:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    loadTraces();
  }, [loadTraces]);

  // 定时刷新
  useEffect(() => {
    pollRef.current = setInterval(loadTraces, 15000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadTraces]);

  // 控制操作
  const handleRun = useCallback(() => {
    setState(prev => ({ ...prev, status: 'running' }));
  }, []);

  const handlePause = useCallback(() => {
    setState(prev => ({ ...prev, status: 'paused' }));
  }, []);

  const handleStep = useCallback(() => {
    setState(prev => {
      const currentIndex = prev.frames.findIndex(f => f.id === prev.currentFrameId);
      const nextIndex = currentIndex + 1;
      if (nextIndex < prev.frames.length) {
        const nextFrame = prev.frames[nextIndex];
        return {
          ...prev,
          status: 'step',
          currentFrameId: nextFrame.id,
          variables: nextFrame.variables || prev.variables,
        };
      }
      return { ...prev, status: 'paused' };
    });
  }, []);

  const handleReset = useCallback(() => {
    setState(prev => ({
      ...prev,
      status: 'idle',
      currentFrameId: null,
      logs: [...prev.logs, '[INFO] 调试会话重置'],
    }));
  }, []);

  // 选择帧
  const handleSelectFrame = useCallback((id: string) => {
    setState(prev => {
      const frame = prev.frames.find(f => f.id === id);
      return {
        ...prev,
        currentFrameId: id,
        variables: frame?.variables || prev.variables,
      };
    });
  }, []);

  // 断点操作
  const handleToggleBreakpoint = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      breakpoints: prev.breakpoints.map(bp =>
        bp.id === id ? { ...bp, enabled: !bp.enabled } : bp
      ),
    }));
  }, []);

  const handleDeleteBreakpoint = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      breakpoints: prev.breakpoints.filter(bp => bp.id !== id),
    }));
  }, []);

  // 清除日志
  const handleClearLogs = useCallback(() => {
    setState(prev => ({ ...prev, logs: [] }));
  }, []);

  return (
    <motion.div
      className={`flex flex-col bg-background border rounded-xl overflow-hidden ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Bug size={18} className="text-primary" />
          <span className="font-medium">Agent 调试器</span>
          {isLoading && <RefreshCw size={14} className="animate-spin text-muted-foreground" />}
        </div>
        <button
          onClick={loadTraces}
          className="p-1.5 hover:bg-muted rounded-lg transition-colors"
          title="刷新轨迹"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* 控制栏 */}
      <ControlsBar
        status={state.status}
        onRun={handleRun}
        onPause={handlePause}
        onStep={handleStep}
        onReset={handleReset}
      />

      {/* 主内容区 */}
      <div className="flex flex-1 min-h-0">
        {/* 左侧面板 */}
        <div className="w-80 flex flex-col border-r">
          {/* 面板切换 */}
          <div className="flex border-b">
            {[
              { id: 'frames', label: '执行栈', icon: <ChevronRight size={12} /> },
              { id: 'variables', label: '变量', icon: <Settings size={12} /> },
              { id: 'breakpoints', label: '断点', icon: <AlertCircle size={12} /> },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActivePanel(tab.id as typeof activePanel)}
                className={`flex items-center gap-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  activePanel === tab.id
                    ? 'text-primary border-primary'
                    : 'text-muted-foreground border-transparent hover:text-foreground'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* 面板内容 */}
          <AnimatePresence mode="wait">
            {activePanel === 'frames' && (
              <motion.div
                key="frames"
                className="flex flex-col flex-1"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
              >
                <FrameList
                  frames={state.frames}
                  currentFrameId={state.currentFrameId}
                  onSelectFrame={handleSelectFrame}
                />
              </motion.div>
            )}
            {activePanel === 'variables' && (
              <motion.div
                key="variables"
                className="flex flex-col flex-1"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
              >
                <VariablesPanel variables={state.variables} />
              </motion.div>
            )}
            {activePanel === 'breakpoints' && (
              <motion.div
                key="breakpoints"
                className="flex flex-col flex-1"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
              >
                <BreakpointsPanel
                  breakpoints={state.breakpoints}
                  onToggle={handleToggleBreakpoint}
                  onDelete={handleDeleteBreakpoint}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 右侧控制台 */}
        <div className="flex-1 flex flex-col">
          <ConsolePanel logs={state.logs} onClear={handleClearLogs} />
        </div>
      </div>
    </motion.div>
  );
});

export default AgentDebugger;
