'use client';

import { memo, useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Radio,
  AlertTriangle,
  Info,
  UserPlus,
  UserCheck,
  Play,
  Search,
  Download,
  Filter,
  X,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Activity,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useMissionControlStore } from './store';
import type { MissionEvent, EventType } from './types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// 事件类型分类
type EventCategory = 'all' | 'task' | 'agent' | 'system';

const TASK_EVENTS: EventType[] = ['task_created', 'task_assigned', 'task_started', 'task_progress', 'task_completed', 'task_failed'];
const AGENT_EVENTS: EventType[] = ['agent_status_change'];
const SYSTEM_EVENTS: EventType[] = ['broadcast', 'system'];

// 事件类型配置
const eventConfig: Record<EventType, { icon: typeof Info; color: string; bg: string }> = {
  task_created: { icon: Zap, color: 'text-blue-400', bg: 'bg-blue-400/20' },
  task_assigned: { icon: UserPlus, color: 'text-violet-400', bg: 'bg-violet-400/20' },
  task_started: { icon: Play, color: 'text-cyan-400', bg: 'bg-cyan-400/20' },
  task_progress: { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-400/20' },
  task_completed: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-400/20' },
  task_failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-400/20' },
  agent_status_change: { icon: UserCheck, color: 'text-blue-400', bg: 'bg-blue-400/20' },
  broadcast: { icon: Radio, color: 'text-purple-400', bg: 'bg-purple-400/20' },
  system: { icon: Info, color: 'text-slate-400', bg: 'bg-slate-400/20' },
};

// 格式化时间
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

// 格式化完整时间
function formatFullTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

// 获取事件分类
function getEventCategory(type: EventType): EventCategory {
  if (TASK_EVENTS.includes(type)) return 'task';
  if (AGENT_EVENTS.includes(type)) return 'agent';
  return 'system';
}

// 过滤事件
function filterEvents(events: MissionEvent[], category: EventCategory, search: string): MissionEvent[] {
  return events.filter(event => {
    const matchCategory = category === 'all' || getEventCategory(event.type) === category;
    const matchSearch = !search || event.message.toLowerCase().includes(search.toLowerCase()) ||
      event.agentId?.toLowerCase().includes(search.toLowerCase()) ||
      event.taskId?.toLowerCase().includes(search.toLowerCase());
    return matchCategory && matchSearch;
  });
}

// 计算时间统计数据
function computeTimeStats(events: MissionEvent[], mode: 'hour' | 'minute') {
  const now = Date.now();
  const buckets: Record<string, number> = {};

  // 初始化最近的时间桶
  for (let i = mode === 'hour' ? 23 : 59; i >= 0; i--) {
    const time = new Date(now - i * (mode === 'hour' ? 3600000 : 60000));
    const key = mode === 'hour'
      ? `${time.getHours().toString().padStart(2, '0')}:00`
      : `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
    buckets[key] = 0;
  }

  // 统计事件
  events.forEach(event => {
    const time = new Date(event.timestamp);
    const key = mode === 'hour'
      ? `${time.getHours().toString().padStart(2, '0')}:00`
      : `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
    if (key in buckets) buckets[key]++;
  });

  return Object.entries(buckets).map(([time, count]) => ({ time, count }));
}

// 虚拟滚动单个事件项
const VirtualEventItem = memo(function VirtualEventItem({
  event,
  style
}: {
  event: MissionEvent;
  style: React.CSSProperties;
}) {
  const config = eventConfig[event.type];
  const Icon = config.icon;

  return (
    <div style={style} className="px-3 py-2 hover:bg-white/5 transition-colors">
      <div className="flex items-start gap-3">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${config.bg}`}>
          <Icon size={12} className={config.color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-white/90 truncate">{event.message}</p>
            <span className="text-xs text-slate-500 flex-shrink-0">{formatTime(event.timestamp)}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {event.agentId && (
              <p className="text-xs text-slate-500">
                Agent: <span className="text-blue-400">{event.agentId}</span>
              </p>
            )}
            {event.taskId && (
              <p className="text-xs text-slate-500">
                Task: <span className="text-purple-400">{event.taskId.slice(0, 8)}...</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

// 单个事件项
const EventItem = memo(function EventItem({ event }: { event: MissionEvent }) {
  const config = eventConfig[event.type];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex items-start gap-3 py-2 px-3 hover:bg-white/5 rounded-lg transition-colors"
    >
      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${config.bg}`}>
        <Icon size={12} className={config.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-white/90 truncate">{event.message}</p>
          <span className="text-xs text-slate-500 flex-shrink-0">{formatTime(event.timestamp)}</span>
        </div>
        {event.agentId && (
          <p className="text-xs text-slate-500 mt-0.5">
            Agent: <span className="text-blue-400">{event.agentId}</span>
          </p>
        )}
        {event.taskId && (
          <p className="text-xs text-slate-500 mt-0.5">
            Task: <span className="text-purple-400">{event.taskId.slice(0, 8)}...</span>
          </p>
        )}
      </div>
    </motion.div>
  );
});

// 统计图表组件
const StatsChart = memo(function StatsChart({
  data,
  title
}: {
  data: { time: string; count: number }[];
  title: string;
}) {
  return (
    <div className="p-3 border-t border-white/10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-400">{title}</span>
      </div>
      <div className="h-20">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="time"
              tick={{ fontSize: 8, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                background: 'rgba(10, 10, 15, 0.9)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px',
                fontSize: '11px'
              }}
              labelStyle={{ color: '#94a3b8' }}
              itemStyle={{ color: '#3b82f6' }}
            />
            <Bar dataKey="count" fill="#3b82f6" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

// SSE 模拟连接组件
const SSESimulator = memo(function SSESimulator({
  isConnected,
  eventCount
}: {
  isConnected: boolean;
  eventCount: number;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-white/5">
      {isConnected ? (
        <>
          <Wifi size={12} className="text-emerald-400" />
          <span className="text-xs text-emerald-400">实时连接</span>
        </>
      ) : (
        <>
          <WifiOff size={12} className="text-slate-500" />
          <span className="text-xs text-slate-500">断开</span>
        </>
      )}
      <span className="text-xs text-slate-500 ml-auto">{eventCount} 条/秒</span>
    </div>
  );
});

// 事件过滤器组件
const EventFilter = memo(function EventFilter({
  category,
  onCategoryChange,
  search,
  onSearchChange
}: {
  category: EventCategory;
  onCategoryChange: (c: EventCategory) => void;
  search: string;
  onSearchChange: (s: string) => void;
}) {
  const [showSearch, setShowSearch] = useState(false);

  const categories: { key: EventCategory; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: 0 },
    { key: 'task', label: '任务', count: 0 },
    { key: 'agent', label: 'Agent', count: 0 },
    { key: 'system', label: '系统', count: 0 },
  ];

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10">
      {/* 分类过滤 */}
      <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
        {categories.map(cat => (
          <button
            key={cat.key}
            onClick={() => onCategoryChange(cat.key)}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${
              category === cat.key
                ? 'bg-blue-500/30 text-blue-400'
                : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {/* 搜索切换 */}
      <button
        onClick={() => setShowSearch(!showSearch)}
        className={`p-1.5 rounded transition-colors ${showSearch ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
      >
        <Search size={14} />
      </button>

      {/* 搜索框 */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 160, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="搜索事件..."
              className="w-full px-2.5 py-1 bg-white/5 border border-white/10 rounded text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// 导出菜单组件
const ExportMenu = memo(function ExportMenu({
  events,
  onClose
}: {
  events: MissionEvent[];
  onClose: () => void;
}) {
  const exportJSON = () => {
    const data = JSON.stringify(events, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `events-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  const exportCSV = () => {
    const headers = ['ID', '类型', '时间', '消息', 'Agent ID', 'Task ID'];
    const rows = events.map(e => [
      e.id,
      e.type,
      new Date(e.timestamp).toISOString(),
      `"${e.message.replace(/"/g, '""')}"`,
      e.agentId || '',
      e.taskId || ''
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `events-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="absolute top-full right-0 mt-1 py-1 bg-[#1a1a24] border border-white/10 rounded-lg shadow-xl z-50 min-w-[120px]"
    >
      <button
        onClick={exportJSON}
        className="w-full px-3 py-1.5 text-xs text-left text-slate-300 hover:bg-white/10 hover:text-white flex items-center gap-2"
      >
        <span>导出 JSON</span>
      </button>
      <button
        onClick={exportCSV}
        className="w-full px-3 py-1.5 text-xs text-left text-slate-300 hover:bg-white/10 hover:text-white flex items-center gap-2"
      >
        <span>导出 CSV</span>
      </button>
    </motion.div>
  );
});

// 结果/事件流组件
const ResultsFeed = memo(function ResultsFeed() {
  const events = useMissionControlStore(state => state.events);
  const clearEvents = useMissionControlStore(state => state.clearEvents);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [category, setCategory] = useState<EventCategory>('all');
  const [search, setSearch] = useState('');
  const [showStats, setShowStats] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [statsMode, setStatsMode] = useState<'hour' | 'minute'>('minute');
  const [isSSEConnected, setIsSSEConnected] = useState(true);

  // 虚拟滚动状态
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemHeight = 60;
  const visibleCount = 10;
  const totalHeight = events.length * itemHeight;

  // 过滤事件
  const filteredEvents = useMemo(() => filterEvents(events, category, search), [events, category, search]);

  // 统计图表数据
  const statsData = useMemo(() => computeTimeStats(filteredEvents, statsMode), [filteredEvents, statsMode]);

  // 虚拟滚动范围
  const virtualRange = useMemo(() => {
    const startIndex = Math.floor(scrollTop / itemHeight);
    const start = Math.max(0, startIndex - 2);
    const end = Math.min(filteredEvents.length, startIndex + visibleCount + 2);
    return { start, end };
  }, [scrollTop, filteredEvents.length]);

  // 滚动处理
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current && category === 'all' && !search) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events, category, search]);

  // 模拟 SSE 事件
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        setIsSSEConnected(prev => !prev ? true : true);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
          <Radio size={24} className="text-slate-500" />
        </div>
        <p className="text-sm text-slate-400">暂无事件</p>
        <p className="text-xs text-slate-500 mt-1">任务开始后将显示实时动态</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Radio size={14} className="text-purple-400 animate-pulse" />
          <span className="text-xs text-slate-400">实时事件流</span>
          <span className="text-xs text-slate-500">({filteredEvents.length})</span>
        </div>
        <div className="flex items-center gap-1">
          {/* 统计按钮 */}
          <button
            onClick={() => setShowStats(!showStats)}
            className={`p-1.5 rounded transition-colors ${showStats ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
          >
            <BarChart3 size={14} />
          </button>

          {/* 导出按钮 */}
          <div className="relative">
            <button
              onClick={() => setShowExport(!showExport)}
              className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Download size={14} />
            </button>
            <AnimatePresence>
              {showExport && (
                <ExportMenu events={filteredEvents} onClose={() => setShowExport(false)} />
              )}
            </AnimatePresence>
          </div>

          {/* 清除按钮 */}
          <button
            onClick={clearEvents}
            className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-white/10 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* SSE 状态 */}
      <SSESimulator isConnected={isSSEConnected} eventCount={filteredEvents.length} />

      {/* 过滤器 */}
      <EventFilter
        category={category}
        onCategoryChange={setCategory}
        search={search}
        onSearchChange={setSearch}
      />

      {/* 统计图表 */}
      <AnimatePresence>
        {showStats && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-white/10"
          >
            {/* 时间模式切换 */}
            <div className="flex items-center justify-between px-4 pt-2">
              <span className="text-xs text-slate-500">
                {statsMode === 'hour' ? '每小时' : '每分钟'}事件统计
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setStatsMode('minute')}
                  className={`px-2 py-0.5 rounded text-xs ${statsMode === 'minute' ? 'bg-blue-500/30 text-blue-400' : 'text-slate-500 hover:text-white'}`}
                >
                  分钟
                </button>
                <button
                  onClick={() => setStatsMode('hour')}
                  className={`px-2 py-0.5 rounded text-xs ${statsMode === 'hour' ? 'bg-blue-500/30 text-blue-400' : 'text-slate-500 hover:text-white'}`}
                >
                  小时
                </button>
              </div>
            </div>
            <StatsChart data={statsData} title="" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 事件列表 - 虚拟滚动 */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto mc-scrollbar"
      >
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto p-2"
        >
          {/* 虚拟滚动占位 */}
          <div style={{ height: totalHeight, position: 'relative' }}>
            <AnimatePresence mode="popLayout">
              {filteredEvents.slice(virtualRange.start, virtualRange.end).map((event, index) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  style={{
                    position: 'absolute',
                    top: (virtualRange.start + index) * itemHeight,
                    left: 0,
                    right: 0,
                    height: itemHeight
                  }}
                >
                  <VirtualEventItem event={event} style={{ height: '100%' }} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* 底部统计 */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-white/10 text-xs text-slate-500">
        <span>显示 {virtualRange.start + 1}-{Math.min(virtualRange.end, filteredEvents.length)} / {filteredEvents.length}</span>
        <span>总计 {events.length} 条事件</span>
      </div>
    </div>
  );
});

export default ResultsFeed;
