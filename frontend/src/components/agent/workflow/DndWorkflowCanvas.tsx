'use client';

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  GripVertical,
  Plus,
  Trash2,
  Play,
  Pause,
  Copy,
  Download,
  Circle,
  Square,
  Diamond,
  Hexagon,
  ArrowRight,
  Undo2,
  Redo2,
} from 'lucide-react';
import type { WorkflowNode, WorkflowConnection, NodeType } from '../WorkflowEditor';

// 节点类型配置（简化版，不依赖 @xyflow/react）
const nodeTypeConfig: Record<NodeType, {
  icon: React.ReactNode;
  color: string;
  label: string;
  bgColor: string;
  borderColor: string;
}> = {
  start: {
    icon: <Circle size={16} />,
    color: 'text-[hsl(var(--success-500))]',
    bgColor: 'bg-[hsl(var(--success-500))]',
    borderColor: 'border-[hsl(var(--success-500))]',
    label: '开始',
  },
  end: {
    icon: <Square size={16} />,
    color: 'text-destructive',
    bgColor: 'bg-destructive',
    borderColor: 'border-destructive',
    label: '结束',
  },
  agent: {
    icon: <Hexagon size={16} />,
    color: 'text-primary',
    bgColor: 'bg-primary',
    borderColor: 'border-primary',
    label: 'Agent',
  },
  tool: {
    icon: <Diamond size={16} />,
    color: 'text-[hsl(var(--accent-500))]',
    bgColor: 'bg-[hsl(var(--accent-500))]',
    borderColor: 'border-[hsl(var(--accent-500))]',
    label: '工具',
  },
  condition: {
    icon: <Diamond size={16} />,
    color: 'text-[hsl(var(--warning-500))]',
    bgColor: 'bg-[hsl(var(--warning-500))]',
    borderColor: 'border-[hsl(var(--warning-500))]',
    label: '条件',
  },
  parallel: {
    icon: <Plus size={16} />,
    color: 'text-[hsl(var(--info-500))]',
    bgColor: 'bg-[hsl(var(--info-500))]',
    borderColor: 'border-[hsl(var(--info-500))]',
    label: '并行',
  },
  delay: {
    icon: <Pause size={16} />,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    borderColor: 'border-muted',
    label: '延迟',
  },
};

// 画布节点属性
interface CanvasNodeProps {
  node: WorkflowNode;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDragStart: (id: string, e: React.MouseEvent) => void;
}

// 画布节点组件
const CanvasNode = memo(function CanvasNode({
  node,
  isSelected,
  onSelect,
  onDragStart,
}: CanvasNodeProps) {
  const config = nodeTypeConfig[node.type];

  return (
    <motion.div
      className={`absolute flex flex-col items-center cursor-move select-none ${
        isSelected ? 'z-20' : 'z-10'
      }`}
      style={{ left: node.x, top: node.y }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.05 }}
      onMouseDown={(e) => onDragStart(node.id, e)}
      onClick={() => onSelect(node.id)}
    >
      {/* 节点主体 */}
      <div
        className={`relative flex items-center justify-center w-14 h-14 rounded-2xl text-primary-foreground shadow-lg transition-all ${
          isSelected
            ? `ring-2 ring-offset-2 ring-primary ${config.bgColor}`
            : config.bgColor
        }`}
      >
        {config.icon}

        {/* 连接点 */}
        <div
          className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-background border-2 border-primary cursor-crosshair opacity-0 hover:opacity-100 transition-opacity"
          title="连接起点"
        />
        <div
          className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-background border-2 border-primary cursor-crosshair opacity-0 hover:opacity-100 transition-opacity"
          title="连接终点"
        />
      </div>

      {/* 节点名称 */}
      <div className="mt-1.5 px-2 py-0.5 bg-background/90 backdrop-blur-sm rounded-lg text-xs font-medium shadow-sm whitespace-nowrap border">
        {node.name}
      </div>
    </motion.div>
  );
});

// SVG 连接线组件
interface ConnectionLineProps {
  connection: WorkflowConnection;
  nodes: WorkflowNode[];
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const ConnectionLine = memo(function ConnectionLine({
  connection,
  nodes,
  isSelected,
  onSelect,
}: ConnectionLineProps) {
  const fromNode = nodes.find((n) => n.id === connection.from);
  const toNode = nodes.find((n) => n.id === connection.to);

  if (!fromNode || !toNode) return null;

  // 计算连接点位置
  const x1 = fromNode.x + 56; // 右侧
  const y1 = fromNode.y + 28; // 中间
  const x2 = toNode.x; // 左侧
  const y2 = toNode.y + 28;

  // 贝塞尔曲线控制点
  const midX = (x1 + x2) / 2;

  return (
    <g onClick={() => onSelect(connection.id)} className="cursor-pointer">
      {/* 路径 */}
      <path
        d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
        fill="none"
        stroke={isSelected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
        strokeWidth={isSelected ? 2 : 1.5}
        strokeDasharray={isSelected ? 'none' : '6,4'}
        className="transition-all"
      />
      {/* 箭头 */}
      <polygon
        points={`${x2},${y2} ${x2 - 8},${y2 - 4} ${x2 - 8},${y2 + 4}`}
        fill={isSelected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
      />
    </g>
  );
});

// 主组件属性
interface DndWorkflowCanvasProps {
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
  selectedNodeId: string | null;
  selectedConnectionId: string | null;
  onNodesChange?: (nodes: WorkflowNode[]) => void;
  onConnectionsChange?: (connections: WorkflowConnection[]) => void;
  onNodeSelect?: (id: string | null) => void;
  onConnectionSelect?: (id: string | null) => void;
  onNodeAdd?: (type: NodeType) => void;
  onNodeDelete?: (id: string) => void;
  onSave?: () => void;
  onExport?: () => void;
  className?: string;
}

// DnD 工作流画布（纯 CSS 实现，不依赖 @xyflow/react）
const DndWorkflowCanvas = memo(function DndWorkflowCanvas({
  nodes,
  connections,
  selectedNodeId,
  selectedConnectionId,
  onNodesChange,
  onConnectionsChange,
  onNodeSelect,
  onConnectionSelect,
  onNodeAdd,
  onNodeDelete,
  onSave,
  onExport,
  className = '',
}: DndWorkflowCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [history, setHistory] = useState<{ nodes: WorkflowNode[]; connections: WorkflowConnection[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // 拖拽开始
  const handleDragStart = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    setDragNodeId(id);
    const node = nodes.find((n) => n.id === id);
    if (node) {
      setDragStart({ x: e.clientX - node.x, y: e.clientY - node.y });
    }
    onNodeSelect?.(id);
  }, [nodes, onNodeSelect]);

  // 鼠标移动（拖拽 & 连接）
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && dragNodeId && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const newX = e.clientX - rect.left - dragStart.x + rect.left;
        const newY = e.clientY - rect.top - dragStart.y + rect.top;

        onNodesChange?.(
          nodes.map((n) =>
            n.id === dragNodeId ? { ...n, x: e.clientX - dragStart.x, y: e.clientY - dragStart.y } : n
          )
        );
      }

      if (connectingFrom && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragNodeId(null);
      setConnectingFrom(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragNodeId, dragStart, connectingFrom, nodes, onNodesChange]);

  // 撤销
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      onNodesChange?.(prev.nodes);
      onConnectionsChange?.(prev.connections);
      setHistoryIndex(historyIndex - 1);
    }
  }, [history, historyIndex, onNodesChange, onConnectionsChange]);

  // 重做
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      onNodesChange?.(next.nodes);
      onConnectionsChange?.(next.connections);
      setHistoryIndex(historyIndex + 1);
    }
  }, [history, historyIndex, onNodesChange, onConnectionsChange]);

  // 删除选中节点/连接
  const handleDeleteSelected = useCallback(() => {
    if (selectedNodeId) {
      onNodesChange?.(nodes.filter((n) => n.id !== selectedNodeId));
      onConnectionsChange?.(connections.filter((c) => c.from !== selectedNodeId && c.to !== selectedNodeId));
      onNodeSelect?.(null);
    } else if (selectedConnectionId) {
      onConnectionsChange?.(connections.filter((c) => c.id !== selectedConnectionId));
      onConnectionSelect?.(null);
    }
  }, [selectedNodeId, selectedConnectionId, nodes, connections, onNodesChange, onConnectionsChange, onNodeSelect, onConnectionSelect]);

  // 画布点击（取消选择）
  const handleCanvasClick = useCallback(() => {
    onNodeSelect?.(null);
    onConnectionSelect?.(null);
  }, [onNodeSelect, onConnectionSelect]);

  // 节点连接开始
  const handleConnectionStart = useCallback((id: string) => {
    setConnectingFrom(id);
  }, []);

  // 节点连接结束
  const handleConnectionEnd = useCallback((toId: string) => {
    if (connectingFrom && connectingFrom !== toId) {
      const exists = connections.some(
        (c) => c.from === connectingFrom && c.to === toId
      );
      if (!exists) {
        const newConnection: WorkflowConnection = {
          id: `conn_${Date.now()}`,
          from: connectingFrom,
          to: toId,
        };
        onConnectionsChange?.([...connections, newConnection]);
      }
    }
    setConnectingFrom(null);
  }, [connectingFrom, connections, onConnectionsChange]);

  // 获取连接中的起始节点
  const connectingFromNode = nodes.find((n) => n.id === connectingFrom);

  return (
    <motion.div
      className={`flex flex-col h-full bg-background border rounded-xl overflow-hidden ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-1">
          {/* 撤销/重做 */}
          <button
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-30"
            title="撤销"
          >
            <Undo2 size={16} />
          </button>
          <button
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-30"
            title="重做"
          >
            <Redo2 size={16} />
          </button>

          <div className="w-px h-5 bg-border mx-2" />

          {/* 添加节点 */}
          <div className="flex items-center gap-1">
            {(Object.keys(nodeTypeConfig) as NodeType[]).map((type) => {
              const config = nodeTypeConfig[type];
              return (
                <motion.button
                  key={type}
                  onClick={() => onNodeAdd?.(type)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${config.color} hover:bg-muted transition-colors`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  title={`添加 ${config.label}`}
                >
                  {config.icon}
                </motion.button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 删除 */}
          {(selectedNodeId || selectedConnectionId) && (
            <motion.button
              onClick={handleDeleteSelected}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-destructive hover:bg-destructive/10 transition-colors"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <Trash2 size={12} />
              删除
            </motion.button>
          )}

          {/* 导出 */}
          {onExport && (
            <button
              onClick={onExport}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs border hover:bg-muted transition-colors"
            >
              <Download size={12} />
              导出
            </button>
          )}

          {/* 保存 */}
          {onSave && (
            <button
              onClick={onSave}
              className="flex items-center gap-1 px-3 py-1 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Play size={12} />
              保存
            </button>
          )}
        </div>
      </div>

      {/* 画布区域 */}
      <div
        ref={canvasRef}
        className="flex-1 relative overflow-hidden cursor-crosshair"
        onClick={handleCanvasClick}
        style={{
          backgroundImage:
            'radial-gradient(circle, hsl(var(--muted)) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        {/* SVG 连接线层 */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {connections.map((conn) => (
            <ConnectionLine
              key={conn.id}
              connection={conn}
              nodes={nodes}
              isSelected={conn.id === selectedConnectionId}
              onSelect={onConnectionSelect || (() => {})}
            />
          ))}

          {/* 正在连接的线 */}
          {connectingFrom && connectingFromNode && (
            <path
              d={`M ${connectingFromNode.x + 56} ${connectingFromNode.y + 28} Q ${(connectingFromNode.x + 56 + mousePos.x) / 2} ${connectingFromNode.y + 28} ${mousePos.x} ${mousePos.y}`}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              strokeDasharray="6,4"
              className="pointer-events-none"
            />
          )}
        </svg>

        {/* 节点层 */}
        {nodes.map((node) => (
          <CanvasNode
            key={node.id}
            node={node}
            isSelected={node.id === selectedNodeId}
            onSelect={onNodeSelect || (() => {})}
            onDragStart={handleDragStart}
          />
        ))}

        {/* 空状态 */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-muted-foreground">
              <GripVertical size={48} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">从上方选择节点类型开始构建工作流</p>
            </div>
          </div>
        )}

        {/* 连接提示 */}
        {connectingFrom && (
          <div className="absolute bottom-4 left-4 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs shadow-lg">
            点击目标节点完成连接
          </div>
        )}
      </div>
    </motion.div>
  );
});

export default DndWorkflowCanvas;
