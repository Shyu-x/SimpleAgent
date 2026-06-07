'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';

// ==================== 类型定义 ====================

type TaskStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
type TaskRole = 'PLANNER' | 'EXECUTOR' | 'REVIEWER' | 'COORDINATOR';

interface TaskNode {
  id: string;
  name: string;
  status: TaskStatus;
  role: TaskRole;
  dependencies: string[]; // 依赖的taskId列表
}

interface TooltipData {
  node: TaskNode;
  x: number;
  y: number;
}

// ==================== 常量配置 ====================

const STATUS_COLORS: Record<TaskStatus, string> = {
  PENDING: '#9CA3AF',
  RUNNING: '#3B82F6',
  COMPLETED: '#22C55E',
  FAILED: '#EF4444',
  CANCELLED: '#EAB308',
};

const ROLE_LABELS: Record<TaskRole, string> = {
  PLANNER: '规划器',
  EXECUTOR: '执行器',
  REVIEWER: '审核员',
  COORDINATOR: '协调员',
};

const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;
const LAYER_GAP = 100;
const NODE_GAP = 40;
const PADDING = 60;

// ==================== 工具函数 ====================

/**
 * 计算拓扑层级（基于依赖关系）
 */
function calculateLayers(tasks: TaskNode[]): Map<string, number> {
  const layers = new Map<string, number>();
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // 初始化
  tasks.forEach(task => {
    inDegree.set(task.id, 0);
    adjacency.set(task.id, []);
  });

  // 构建图
  tasks.forEach(task => {
    task.dependencies.forEach(depId => {
      if (taskMap.has(depId)) {
        inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
        adjacency.get(depId)?.push(task.id);
      }
    });
  });

  // Kahn算法计算层级
  const queue: string[] = [];
  inDegree.forEach((degree, id) => {
    if (degree === 0) queue.push(id);
  });

  let currentLayer = 0;
  while (queue.length > 0) {
    const size = queue.length;
    for (let i = 0; i < size; i++) {
      const nodeId = queue.shift()!;
      layers.set(nodeId, currentLayer);

      adjacency.get(nodeId)?.forEach(childId => {
        const newDegree = (inDegree.get(childId) || 0) - 1;
        inDegree.set(childId, newDegree);
        if (newDegree === 0) queue.push(childId);
      });
    }
    currentLayer++;
  }

  // 处理未访问的节点（环形依赖）
  tasks.forEach(task => {
    if (!layers.has(task.id)) {
      layers.set(task.id, currentLayer);
    }
  });

  return layers;
}

/**
 * 布局计算
 */
function calculateLayout(tasks: TaskNode[], layers: Map<string, number>) {
  const layerNodes = new Map<number, TaskNode[]>();

  layers.forEach((layer, nodeId) => {
    const task = tasks.find(t => t.id === nodeId);
    if (task) {
      if (!layerNodes.has(layer)) layerNodes.set(layer, []);
      layerNodes.get(layer)!.push(task);
    }
  });

  const positions = new Map<string, { x: number; y: number }>();
  let maxWidth = 0;

  layerNodes.forEach((nodes, layer) => {
    const totalWidth = nodes.length * NODE_WIDTH + (nodes.length - 1) * NODE_GAP;
    maxWidth = Math.max(maxWidth, totalWidth);

    const startX = (maxWidth - totalWidth) / 2;

    nodes.forEach((node, index) => {
      positions.set(node.id, {
        x: startX + index * (NODE_WIDTH + NODE_GAP),
        y: layer * (NODE_HEIGHT + LAYER_GAP),
      });
    });
  });

  return { positions, width: maxWidth + PADDING * 2, height: (layers.size || 1) * (NODE_HEIGHT + LAYER_GAP) + PADDING };
}

// ==================== 主组件 ====================

interface TaskDependencyGraphProps {
  tasks: TaskNode[];
  width?: number;
  height?: number;
  onTaskClick?: (task: TaskNode) => void;
  className?: string;
}

const TaskDependencyGraph: React.FC<TaskDependencyGraphProps> = ({
  tasks,
  width: containerWidth = 800,
  height: containerHeight = 600,
  onTaskClick,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  // 计算层级和布局
  const { positions, width: svgWidth, height: svgHeight } = useMemo(() => {
    if (tasks.length === 0) {
      return { positions: new Map(), width: containerWidth, height: containerHeight };
    }
    const layers = calculateLayers(tasks);
    return { ...calculateLayout(tasks, layers), layers };
  }, [tasks, containerWidth, containerHeight]);

  // 鼠标事件处理
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  }, [isPanning, lastMousePos]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.min(Math.max(prev * delta, 0.3), 3));
  }, []);

  // 节点交互
  const handleNodeMouseEnter = useCallback((task: TaskNode, e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setTooltip({
        node: task,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  }, []);

  const handleNodeMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleNodeClick = useCallback((task: TaskNode) => {
    onTaskClick?.(task);
  }, [onTaskClick]);

  // 渲染依赖连线
  const renderEdges = useMemo(() => {
    const edges: React.ReactNode[] = [];

    tasks.forEach(task => {
      const targetPos = positions.get(task.id);
      if (!targetPos) return;

      task.dependencies.forEach(depId => {
        const sourcePos = positions.get(depId);
        if (!sourcePos) return;

        const sourceTask = tasks.find(t => t.id === depId);
        const isCompleted = sourceTask?.status === 'COMPLETED';

        // 计算起点和终点（从节点右边缘到左边缘）
        const x1 = sourcePos.x + NODE_WIDTH;
        const y1 = sourcePos.y + NODE_HEIGHT / 2;
        const x2 = targetPos.x;
        const y2 = targetPos.y + NODE_HEIGHT / 2;

        // 贝塞尔曲线控制点
        const controlOffset = Math.min(Math.abs(x2 - x1) / 2, 50);

        edges.push(
          <g key={`${depId}-${task.id}`}>
            {/* 连线 */}
            <path
              d={`M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke={isCompleted ? '#22C55E' : '#9CA3AF'}
              strokeWidth={2}
              className={isCompleted ? 'edge-completed' : ''}
              style={{
                transition: 'stroke 0.3s ease',
              }}
            />
            {/* 箭头 */}
            <polygon
              points={`
                ${x2},${y2}
                ${x2 - 12},${y2 - 6}
                ${x2 - 12},${y2 + 6}
              `}
              fill={isCompleted ? '#22C55E' : '#9CA3AF'}
              style={{
                transition: 'fill 0.3s ease',
              }}
            />
          </g>
        );
      });
    });

    return edges;
  }, [tasks, positions]);

  // 渲染任务节点
  const renderNodes = useMemo(() => {
    return tasks.map(task => {
      const pos = positions.get(task.id);
      if (!pos) return null;

      const color = STATUS_COLORS[task.status];
      const isClickable = !!onTaskClick;

      return (
        <g
          key={task.id}
          transform={`translate(${pos.x}, ${pos.y})`}
          onMouseEnter={(e) => handleNodeMouseEnter(task, e)}
          onMouseLeave={handleNodeMouseLeave}
          onClick={() => handleNodeClick(task)}
          style={{ cursor: isClickable ? 'pointer' : 'default' }}
          className="task-node"
        >
          {/* 节点背景 */}
          <rect
            x={0}
            y={0}
            width={NODE_WIDTH}
            height={NODE_HEIGHT}
            rx={8}
            ry={8}
            fill="#1F2937"
            stroke={color}
            strokeWidth={2}
            style={{
              transition: 'stroke 0.3s ease, filter 0.2s ease',
            }}
          />

          {/* 状态指示器 */}
          <rect
            x={0}
            y={0}
            width={8}
            height={NODE_HEIGHT}
            rx={8}
            ry={8}
            fill={color}
            style={{
              transition: 'fill 0.3s ease',
            }}
          />
          <rect x={0} y={8} width={8} height={NODE_HEIGHT - 16} fill={color} />

          {/* 任务名称 */}
          <text
            x={NODE_WIDTH / 2}
            y={NODE_HEIGHT / 2 - 8}
            textAnchor="middle"
            fill="#F9FAFB"
            fontSize={14}
            fontWeight={600}
            style={{ pointerEvents: 'none' }}
          >
            {task.name.length > 16 ? task.name.slice(0, 14) + '...' : task.name}
          </text>

          {/* 角色标签 */}
          <text
            x={NODE_WIDTH / 2}
            y={NODE_HEIGHT / 2 + 12}
            textAnchor="middle"
            fill="#9CA3AF"
            fontSize={11}
            style={{ pointerEvents: 'none' }}
          >
            {ROLE_LABELS[task.role]}
          </text>

          {/* 运行中动画 */}
          {task.status === 'RUNNING' && (
            <rect
              x={0}
              y={NODE_HEIGHT - 4}
              width={NODE_WIDTH}
              height={4}
              fill={color}
              className="running-indicator"
            >
              <animate
                attributeName="width"
                values="0;160;0"
                dur="1.5s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="x"
                values="0;0;0"
                dur="1.5s"
                repeatCount="indefinite"
              />
            </rect>
          )}
        </g>
      );
    });
  }, [tasks, positions, handleNodeMouseEnter, handleNodeMouseLeave, handleNodeClick, onTaskClick]);

  // 渲染Tooltip
  const renderTooltip = useMemo(() => {
    if (!tooltip) return null;

    return (
      <div
        className="absolute bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl z-50 pointer-events-none"
        style={{
          left: tooltip.x + 10,
          top: tooltip.y + 10,
          minWidth: 200,
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: STATUS_COLORS[tooltip.node.status] }}
          />
          <span className="text-white font-semibold">{tooltip.node.name}</span>
        </div>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">状态:</span>
            <span className="text-white">{tooltip.node.status}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">角色:</span>
            <span className="text-white">{ROLE_LABELS[tooltip.node.role]}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">依赖:</span>
            <span className="text-white">
              {tooltip.node.dependencies.length > 0
                ? tooltip.node.dependencies.join(', ')
                : '无'}
            </span>
          </div>
        </div>
      </div>
    );
  }, [tooltip]);

  // 空状态
  if (tasks.length === 0) {
    return (
      <div className={`flex items-center justify-center bg-gray-800 rounded-lg ${className}`} style={{ width: containerWidth, height: containerHeight }}>
        <div className="text-center text-gray-400">
          <svg className="w-16 h-16 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p>暂无任务数据</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative bg-gray-900 rounded-lg overflow-hidden ${className}`}
      style={{ width: containerWidth, height: containerHeight }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* 控制栏 */}
      <div className="absolute top-2 right-2 flex gap-2 z-20">
        <button
          onClick={() => setScale(prev => Math.min(prev * 1.2, 3))}
          className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
        >
          +
        </button>
        <span className="px-2 py-1 bg-gray-800 text-gray-300 rounded text-sm">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale(prev => Math.max(prev / 1.2, 0.3))}
          className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
        >
          -
        </button>
        <button
          onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }}
          className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
        >
          重置
        </button>
      </div>

      {/* 图例 */}
      <div className="absolute top-2 left-2 bg-gray-800 rounded-lg p-3 z-20">
        <div className="text-xs text-gray-400 mb-2">状态图例</div>
        <div className="space-y-1">
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <div key={status} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
              <span className="text-xs text-gray-300">{status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SVG画布 */}
      <svg
        width="100%"
        height="100%"
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      >
        <defs>
          {/* 箭头标记 */}
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#9CA3AF" />
          </marker>

          {/* 完成状态的箭头 */}
          <marker
            id="arrowhead-completed"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#22C55E" />
          </marker>

          {/* 节点阴影 */}
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3" />
          </filter>

          {/* 节点悬停效果 */}
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 变换组 */}
        <g transform={`translate(${pan.x + PADDING}, ${pan.y + PADDING}) scale(${scale})`}>
          {/* 网格背景 */}
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#374151" strokeWidth="0.5" opacity="0.3" />
          </pattern>
          <rect width="200%" height="200%" fill="url(#grid)" transform="translate(-100, -100)" />

          {/* 层级指示线 */}
          {Array.from(new Set(Array.from(positions.values()).map(p => p.y))).map(y => (
            <line
              key={`layer-${y}`}
              x1={-50}
              y1={y + NODE_HEIGHT / 2}
              x2={svgWidth + 50}
              y2={y + NODE_HEIGHT / 2}
              stroke="#4B5563"
              strokeWidth="1"
              strokeDasharray="5,5"
              opacity="0.5"
            />
          ))}

          {/* 连线 */}
          {renderEdges}

          {/* 节点 */}
          {renderNodes}
        </g>
      </svg>

      {/* Tooltip */}
      {renderTooltip}

      {/* 操作提示 */}
      <div className="absolute bottom-2 left-2 text-xs text-gray-500 z-20">
        按住 Alt + 拖拽 或 中键拖拽平移 | 滚轮缩放
      </div>
    </div>
  );
};

export default TaskDependencyGraph;

// ==================== 导出类型和工具函数 ====================

export type { TaskNode, TaskStatus, TaskRole };
export { STATUS_COLORS, ROLE_LABELS };