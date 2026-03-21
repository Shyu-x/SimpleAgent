'use client';

import { memo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  Wrench,
  Terminal,
  FileCode,
  Database,
  Globe,
  Search,
  Copy,
  Check
} from 'lucide-react';

// 工具调用状态
export type ToolCallStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled';

// 工具类型
export type ToolType = 'function' | 'api' | 'database' | 'web' | 'search' | 'code' | 'file';

// 工具调用参数
export interface ToolCallParams {
  [key: string]: unknown;
}

// 工具调用结果
export interface ToolCallResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration?: number; // ms
}

// 工具调用信息
export interface ToolCallInfo {
  id: string;
  name: string;
  type: ToolType;
  status: ToolCallStatus;
  params?: ToolCallParams;
  result?: ToolCallResult;
  startedAt?: string;
  completedAt?: string;
  agentName?: string;
}

// 状态样式映射
const statusStyles: Record<ToolCallStatus, { color: string; icon: React.ReactNode; label: string }> = {
  pending: { color: 'text-muted-foreground', icon: <Clock size={14} />, label: '等待中' },
  running: { color: 'text-primary', icon: <Loader2 size={14} className="animate-spin" />, label: '执行中' },
  success: { color: 'text-[hsl(var(--success-500))]', icon: <CheckCircle2 size={14} />, label: '成功' },
  error: { color: 'text-destructive', icon: <AlertCircle size={14} />, label: '失败' },
  cancelled: { color: 'text-[hsl(var(--warning-500))]', icon: <Clock size={14} />, label: '已取消' },
};

// 工具类型图标
const toolTypeIcons: Record<ToolType, React.ReactNode> = {
  function: <Wrench size={14} />,
  api: <Globe size={14} />,
  database: <Database size={14} />,
  web: <Globe size={14} />,
  search: <Search size={14} />,
  code: <FileCode size={14} />,
  file: <Terminal size={14} />,
};

// 动画变体
const containerVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2 }
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: 0.15 }
  }
};

const contentVariants = {
  collapsed: { height: 0, opacity: 0 },
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: { duration: 0.2, ease: 'easeOut' as const }
  }
} as const;

// 单个工具调用展示
interface ToolCallItemProps {
  toolCall: ToolCallInfo;
  defaultExpanded?: boolean;
  showTimestamp?: boolean;
}

const ToolCallItem = memo(function ToolCallItem({
  toolCall,
  defaultExpanded = false,
  showTimestamp = true,
}: ToolCallItemProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);
  const status = statusStyles[toolCall.status];
  const toolIcon = toolTypeIcons[toolCall.type];

  const toggleExpand = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const handleCopy = useCallback(async (text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Handle copy error silently
    }
  }, []);

  // 格式化参数显示
  const formatParams = (params: ToolCallParams | undefined): string => {
    if (!params) return '';
    try {
      return JSON.stringify(params, null, 2);
    } catch {
      return String(params);
    }
  };

  // 格式化结果显示
  const formatResult = (result: ToolCallResult | undefined): string => {
    if (!result) return '';
    if (result.data !== undefined) {
      try {
        return JSON.stringify(result.data, null, 2);
      } catch {
        return String(result.data);
      }
    }
    return result.error || '';
  };

  return (
    <motion.div
      className="flex flex-col rounded-lg border bg-muted/30 overflow-hidden"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      layout
    >
      {/* 头部 */}
      <motion.button
        className="flex items-center gap-2 p-2.5 hover:bg-muted/50 transition-colors text-left w-full"
        onClick={toggleExpand}
        whileTap={{ scale: 0.98 }}
      >
        {/* 展开/折叠图标 */}
        <motion.div
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-muted-foreground"
        >
          <ChevronRight size={14} />
        </motion.div>

        {/* 工具图标 */}
        <div className={`flex items-center justify-center w-6 h-6 rounded-md bg-muted ${status.color}`}>
          {toolIcon}
        </div>

        {/* 工具名称 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{toolCall.name}</span>
            {toolCall.agentName && (
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {toolCall.agentName}
              </span>
            )}
          </div>
        </div>

        {/* 状态 */}
        <div className={`flex items-center gap-1 ${status.color}`}>
          {status.icon}
          <span className="text-xs">{status.label}</span>
        </div>

        {/* 执行时间 */}
        {toolCall.result?.duration && (
          <span className="text-xs text-muted-foreground">
            {toolCall.result.duration}ms
          </span>
        )}
      </motion.button>

      {/* 展开内容 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            variants={contentVariants}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2 border-t">
              {/* 参数 */}
              {toolCall.params && Object.keys(toolCall.params).length > 0 && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground">参数</span>
                    <button
                      onClick={(e) => handleCopy(formatParams(toolCall.params), e)}
                      className="p-1 hover:bg-muted rounded transition-colors"
                      title="复制参数"
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                  <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto max-h-32">
                    <code>{formatParams(toolCall.params)}</code>
                  </pre>
                </div>
              )}

              {/* 结果 */}
              {toolCall.result && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {toolCall.result.success ? '返回结果' : '错误信息'}
                    </span>
                    <button
                      onClick={(e) => handleCopy(formatResult(toolCall.result), e)}
                      className="p-1 hover:bg-muted rounded transition-colors"
                      title="复制结果"
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                  <pre className={`text-xs p-2 rounded overflow-x-auto max-h-48 ${
                    toolCall.result.success ? 'bg-muted/50' : 'bg-destructive/10 text-destructive'
                  }`}>
                    <code>{formatResult(toolCall.result)}</code>
                  </pre>
                </div>
              )}

              {/* 时间戳 */}
              {showTimestamp && (toolCall.startedAt || toolCall.completedAt) && (
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {toolCall.startedAt && (
                    <span>开始: {toolCall.startedAt}</span>
                  )}
                  {toolCall.completedAt && (
                    <span>完成: {toolCall.completedAt}</span>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

// 工具调用列表
interface ToolCallListProps {
  toolCalls: ToolCallInfo[];
  defaultExpanded?: boolean;
  showTimestamp?: boolean;
  maxHeight?: string;
}

export const ToolCallList = memo(function ToolCallList({
  toolCalls,
  defaultExpanded = false,
  showTimestamp = true,
  maxHeight = '400px',
}: ToolCallListProps) {
  const runningCount = toolCalls.filter(tc => tc.status === 'running').length;
  const successCount = toolCalls.filter(tc => tc.status === 'success').length;
  const errorCount = toolCalls.filter(tc => tc.status === 'error').length;

  return (
    <motion.div
      className="flex flex-col gap-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* 统计栏 */}
      <div className="flex items-center gap-3 px-1 text-xs">
        <span className="text-muted-foreground">共 {toolCalls.length} 次调用</span>
        {runningCount > 0 && (
          <span className="text-primary flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" />
            {runningCount} 执行中
          </span>
        )}
        {successCount > 0 && (
          <span className="text-[hsl(var(--success-500))] flex items-center gap-1">
            <CheckCircle2 size={12} />
            {successCount} 成功
          </span>
        )}
        {errorCount > 0 && (
          <span className="text-destructive flex items-center gap-1">
            <AlertCircle size={12} />
            {errorCount} 失败
          </span>
        )}
      </div>

      {/* 列表 */}
      <div
        className="flex flex-col gap-2 overflow-y-auto"
        style={{ maxHeight }}
      >
        <AnimatePresence mode="popLayout">
          {toolCalls.map((toolCall) => (
            <ToolCallItem
              key={toolCall.id}
              toolCall={toolCall}
              defaultExpanded={defaultExpanded}
              showTimestamp={showTimestamp}
            />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
});

// 迷你工具调用指示器
interface MiniToolCallProps {
  name: string;
  status: ToolCallStatus;
}

export const MiniToolCall = memo(function MiniToolCall({
  name,
  status,
}: MiniToolCallProps) {
  const style = statusStyles[status];

  return (
    <motion.span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-muted ${style.color}`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <Wrench size={10} />
      <span className="truncate max-w-[100px]">{name}</span>
      {style.icon}
    </motion.span>
  );
});

export default ToolCallItem;
