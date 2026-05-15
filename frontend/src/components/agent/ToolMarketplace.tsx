'use client';

import { memo, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { isClient } from '@/lib/ssrStorage';
import { fetchApi } from '@/lib/apiClient';
import {
  Package,
  Search,
  Filter,
  Check,
  X,
  Download,
  Trash2,
  Settings,
  Star,
  Users,
  Tag,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Wrench,
  Code,
  Database,
  Globe,
  Zap,
  Image,
  Terminal,
  Wifi,
  WifiOff,
  Plug,
  PlugZap,
} from 'lucide-react';

const TOOL_MARKETPLACE_STORAGE_KEY = 'tool-marketplace-state';

// 工具类别
export type ToolCategory =
  | 'productivity'
  | 'development'
  | 'data'
  | 'web'
  | 'media'
  | 'automation'
  | 'integration';

// 工具状态
export type ToolStatus = 'available' | 'installed' | 'enabled' | 'updating' | 'error';

// 工具信息
export interface ToolInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: ToolCategory;
  status: ToolStatus;
  icon?: string;
  downloads: number;
  rating: number;
  tags: string[];
  installedAt?: number;
  lastUpdated?: number;
  changelog?: string;
  documentation?: string;
  dependencies?: string[];
}

// 类别配置
const categoryConfig: Record<ToolCategory, { label: string; icon: React.ReactNode; color: string }> = {
  productivity: { label: '生产力', icon: <Zap size={14} />, color: 'text-[hsl(var(--warning-500))]' },
  development: { label: '开发', icon: <Code size={14} />, color: 'text-primary' },
  data: { label: '数据', icon: <Database size={14} />, color: 'text-[hsl(var(--success-500))]' },
  web: { label: '网络', icon: <Globe size={14} />, color: 'text-[hsl(var(--accent-500))]' },
  media: { label: '媒体', icon: <Image size={14} />, color: 'text-[hsl(var(--icon-media))]' },
  automation: { label: '自动化', icon: <Terminal size={14} />, color: 'text-[hsl(var(--info-500))]' },
  integration: { label: '集成', icon: <Package size={14} />, color: 'text-[hsl(var(--warning-500))]' },
};

// MCP 连接状态
export type McpStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// MCP 状态样式
const mcpStatusStyles: Record<McpStatus, { label: string; color: string; icon: React.ReactNode; dotColor: string }> = {
  disconnected: { label: '未连接', color: 'text-muted-foreground', icon: <WifiOff size={14} />, dotColor: 'bg-muted-foreground' },
  connecting: { label: '连接中...', color: 'text-[hsl(var(--warning-500))]', icon: <Loader2 size={14} className="animate-spin" />, dotColor: 'bg-[hsl(var(--warning-500))]' },
  connected: { label: '已连接', color: 'text-[hsl(var(--success-500))]', icon: <Wifi size={14} />, dotColor: 'bg-[hsl(var(--success-500))]' },
  error: { label: '连接失败', color: 'text-destructive', icon: <AlertCircle size={14} />, dotColor: 'bg-destructive' },
};

// 状态样式
const statusStyles: Record<ToolStatus, { label: string; color: string; icon: React.ReactNode }> = {
  available: { label: '可用', color: 'text-muted-foreground', icon: <Download size={12} /> },
  installed: { label: '已安装', color: 'text-primary', icon: <CheckCircle2 size={12} /> },
  enabled: { label: '已启用', color: 'text-[hsl(var(--success-500))]', icon: <CheckCircle2 size={12} /> },
  updating: { label: '更新中', color: 'text-[hsl(var(--warning-500))]', icon: <Loader2 size={12} className="animate-spin" /> },
  error: { label: '错误', color: 'text-destructive', icon: <AlertCircle size={12} /> },
};

// 动画变体
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: 'easeOut' as const }
  }
} as const;

const modalVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 300, damping: 25 }
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.15 }
  }
} as const;

// 工具信息类型（映射后端 API 响应）
interface ToolApiResponse {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  category: string;
  enabled?: boolean;
  tags?: string[];
  metadata?: {
    downloads?: number;
    rating?: number;
    installedAt?: number;
    lastUpdated?: number;
  };
}

function mapApiToToolInfo(apiTool: ToolApiResponse): ToolInfo {
  return {
    id: apiTool.id,
    name: apiTool.name,
    description: apiTool.description,
    version: apiTool.version,
    author: apiTool.author || 'Unknown',
    category: (apiTool.category as ToolCategory) || 'productivity',
    status: apiTool.enabled ? 'enabled' : 'available',
    downloads: apiTool.metadata?.downloads || 0,
    rating: apiTool.metadata?.rating || 0,
    tags: apiTool.tags || [],
    installedAt: apiTool.metadata?.installedAt,
    lastUpdated: apiTool.metadata?.lastUpdated,
  };
}

function loadPersistedTools(): ToolInfo[] {
  if (!isClient()) return [];

  try {
    const raw = window.sessionStorage.getItem(TOOL_MARKETPLACE_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const persisted = JSON.parse(raw) as ToolInfo[];
    const persistedMap = new Map(persisted.map((tool) => [tool.id, tool]));

    // 从 API 获取的工具列表需要与 persisted 合并状态
    // 如果 persisted 为空，返回空数组（将由 API 数据填充）
    if (persisted.length === 0) {
      return [];
    }

    // 返回 persisted 工具（保留用户在 UI 中修改的状态）
    return persisted;
  } catch (error) {
    console.warn('Failed to load tool marketplace state:', error);
    return [];
  }
}

// 工具卡片
interface ToolCardProps {
  tool: ToolInfo;
  onInstall?: (id: string) => void;
  onUninstall?: (id: string) => void;
  onEnable?: (id: string) => void;
  onDisable?: (id: string) => void;
  onUpdate?: (id: string) => void;
  onSelect?: (tool: ToolInfo) => void;
}

const ToolCard = memo(function ToolCard({
  tool,
  onInstall,
  onUninstall,
  onEnable,
  onDisable,
  onUpdate,
  onSelect,
}: ToolCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const category = categoryConfig[tool.category];
  const status = statusStyles[tool.status];

  const handleAction = useCallback((e: React.MouseEvent, action?: (id: string) => void) => {
    e.stopPropagation();
    action?.(tool.id);
  }, [tool.id]);

  return (
    <motion.div
      className="flex flex-col p-4 rounded-xl border bg-card hover:shadow-md transition-shadow cursor-pointer"
      variants={itemVariants}
      whileHover={{ y: -2 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onClick={() => onSelect?.(tool)}
      layout
    >
      {/* 头部 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center w-10 h-10 rounded-lg bg-muted ${category.color}`}>
            <Wrench size={20} />
          </div>
          <div>
            <h3 className="font-medium text-sm">{tool.name}</h3>
            <p className="text-xs text-muted-foreground">v{tool.version}</p>
          </div>
        </div>
        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${status.color} bg-current/10`}>
          {status.icon}
          {status.label}
        </span>
      </div>

      {/* 描述 */}
      <p className="text-xs text-muted-foreground mb-3 line-clamp-2 flex-1">
        {tool.description}
      </p>

      {/* 标签 */}
      <div className="flex flex-wrap gap-1 mb-3">
        {tool.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-muted/50 text-muted-foreground"
          >
            <Tag size={10} />
            {tag}
          </span>
        ))}
      </div>

      {/* 统计 */}
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Download size={12} />
            {tool.downloads.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <Star size={12} className="text-[hsl(var(--warning-500))]" />
            {tool.rating.toFixed(1)}
          </span>
        </div>
        <span className={`flex items-center gap-1 ${category.color}`}>
          {category.icon}
          {category.label}
        </span>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 pt-2 border-t">
        {tool.status === 'available' && (
          <motion.button
            onClick={(e) => handleAction(e, onInstall)}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Download size={14} />
            安装
          </motion.button>
        )}
        {tool.status === 'installed' && (
          <>
            <motion.button
              onClick={(e) => handleAction(e, onEnable)}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-[hsl(var(--success-500))] text-primary-foreground rounded-lg text-xs font-medium"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Check size={14} />
              启用
            </motion.button>
            <motion.button
              onClick={(e) => handleAction(e, onUninstall)}
              className="flex items-center justify-center px-3 py-1.5 border rounded-lg text-xs text-muted-foreground hover:text-destructive"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Trash2 size={14} />
            </motion.button>
          </>
        )}
        {tool.status === 'enabled' && (
          <>
            <motion.button
              onClick={(e) => handleAction(e, onDisable)}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 border rounded-lg text-xs"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <X size={14} />
              禁用
            </motion.button>
            <motion.button
              onClick={(e) => handleAction(e, onUpdate)}
              className="flex items-center justify-center px-3 py-1.5 border rounded-lg text-xs text-muted-foreground"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <RefreshCw size={14} />
            </motion.button>
          </>
        )}
        {tool.status === 'updating' && (
          <div className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 bg-muted rounded-lg text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            更新中...
          </div>
        )}
      </div>
    </motion.div>
  );
});

// 工具详情模态框
interface ToolDetailModalProps {
  tool: ToolInfo | null;
  onClose: () => void;
  onInstall?: (id: string) => void;
  onUninstall?: (id: string) => void;
  onEnable?: (id: string) => void;
  onDisable?: (id: string) => void;
}

const ToolDetailModal = memo(function ToolDetailModal({
  tool,
  onClose,
  onInstall,
  onUninstall,
  onEnable,
  onDisable,
}: ToolDetailModalProps) {
  if (!tool) return null;

  const category = categoryConfig[tool.category];
  const status = statusStyles[tool.status];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-lg bg-background rounded-xl shadow-xl overflow-hidden"
        variants={modalVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className={`flex items-center justify-center w-12 h-12 rounded-lg bg-muted ${category.color}`}>
              <Wrench size={24} />
            </div>
            <div>
              <h2 className="font-semibold">{tool.name}</h2>
              <p className="text-xs text-muted-foreground">
                v{tool.version} by {tool.author}
              </p>
            </div>
          </div>
          <motion.button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <X size={20} />
          </motion.button>
        </div>

        {/* 内容 */}
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* 状态和类别 */}
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${status.color} bg-current/10`}>
              {status.icon}
              {status.label}
            </span>
            <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${category.color} bg-current/10`}>
              {category.icon}
              {category.label}
            </span>
          </div>

          {/* 描述 */}
          <div>
            <h3 className="text-sm font-medium mb-1">描述</h3>
            <p className="text-sm text-muted-foreground">{tool.description}</p>
          </div>

          {/* 统计 */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-center gap-1 text-[hsl(var(--warning-500))] mb-1">
                <Star size={16} />
                <span className="font-semibold">{tool.rating.toFixed(1)}</span>
              </div>
              <p className="text-xs text-muted-foreground">评分</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-center gap-1 text-primary mb-1">
                <Download size={16} />
                <span className="font-semibold">{tool.downloads.toLocaleString()}</span>
              </div>
              <p className="text-xs text-muted-foreground">下载</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-center gap-1 text-[hsl(var(--success-500))] mb-1">
                <Users size={16} />
                <span className="font-semibold">{tool.author.slice(0, 10)}</span>
              </div>
              <p className="text-xs text-muted-foreground">作者</p>
            </div>
          </div>

          {/* 标签 */}
          <div>
            <h3 className="text-sm font-medium mb-2">标签</h3>
            <div className="flex flex-wrap gap-2">
              {tool.tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-muted"
                >
                  <Tag size={10} />
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* 安装信息 */}
          {tool.installedAt && (
            <div>
              <h3 className="text-sm font-medium mb-2">安装信息</h3>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>安装时间: {new Date(tool.installedAt).toLocaleString('zh-CN')}</p>
                {tool.lastUpdated && (
                  <p>最后更新: {new Date(tool.lastUpdated).toLocaleString('zh-CN')}</p>
                )}
              </div>
            </div>
          )}

          {/* 依赖 */}
          {tool.dependencies && tool.dependencies.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">依赖</h3>
              <div className="flex flex-wrap gap-1">
                {tool.dependencies.map((dep) => (
                  <span key={dep} className="px-2 py-1 text-xs rounded bg-muted/50">
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 操作 */}
        <div className="flex items-center gap-2 p-4 border-t bg-muted/30">
          {tool.status === 'available' && (
            <motion.button
              onClick={() => { onInstall?.(tool.id); onClose(); }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Download size={16} />
              安装工具
            </motion.button>
          )}
          {tool.status === 'installed' && (
            <>
              <motion.button
                onClick={() => { onEnable?.(tool.id); onClose(); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[hsl(var(--success-500))] text-primary-foreground rounded-lg font-medium"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Check size={16} />
                启用
              </motion.button>
              <motion.button
                onClick={() => { onUninstall?.(tool.id); onClose(); }}
                className="flex items-center justify-center px-4 py-2 border rounded-lg hover:border-destructive hover:text-destructive"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Trash2 size={16} />
              </motion.button>
            </>
          )}
          {tool.status === 'enabled' && (
            <>
              <motion.button
                onClick={() => { onDisable?.(tool.id); onClose(); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border rounded-lg font-medium"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <X size={16} />
                禁用
              </motion.button>
              <motion.button
                className="flex items-center justify-center px-4 py-2 border rounded-lg"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Settings size={16} />
              </motion.button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
});

// 主组件
interface ToolMarketplaceProps {
  isOpen: boolean;
  onClose: () => void;
}

const ToolMarketplace = memo(function ToolMarketplace({
  isOpen,
  onClose,
}: ToolMarketplaceProps) {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<ToolStatus | 'all'>('all');
  const [selectedTool, setSelectedTool] = useState<ToolInfo | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'downloads' | 'rating'>('downloads');

  // MCP 连接状态
  const [mcpStatus, setMcpStatus] = useState<McpStatus>('disconnected');
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [mcpToolsCount, setMcpToolsCount] = useState(0);
  const [mcpConnecting, setMcpConnecting] = useState(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 过滤和排序工具
  const filteredTools = useMemo(() => {
    return tools
      .filter((tool) => {
        const matchesSearch = tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          tool.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          tool.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;
        const matchesStatus = selectedStatus === 'all' || tool.status === selectedStatus;
        return matchesSearch && matchesCategory && matchesStatus;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'name':
            return a.name.localeCompare(b.name);
          case 'downloads':
            return b.downloads - a.downloads;
          case 'rating':
            return b.rating - a.rating;
          default:
            return 0;
        }
      });
  }, [tools, searchQuery, selectedCategory, selectedStatus, sortBy]);

  // 统计
  const stats = useMemo(() => ({
    total: tools.length,
    installed: tools.filter((t) => t.status === 'installed' || t.status === 'enabled').length,
    enabled: tools.filter((t) => t.status === 'enabled').length,
  }), [tools]);

  // 操作处理
  const handleInstall = useCallback((id: string) => {
    setTools((prev) => prev.map((t) =>
      t.id === id ? { ...t, status: 'installed' as ToolStatus, installedAt: Date.now() } : t
    ));
  }, []);

  const handleUninstall = useCallback((id: string) => {
    setTools((prev) => prev.map((t) =>
      t.id === id ? { ...t, status: 'available' as ToolStatus, installedAt: undefined } : t
    ));
  }, []);

  const handleEnable = useCallback((id: string) => {
    setTools((prev) => prev.map((t) =>
      t.id === id ? { ...t, status: 'enabled' as ToolStatus } : t
    ));
  }, []);

  const handleDisable = useCallback((id: string) => {
    setTools((prev) => prev.map((t) =>
      t.id === id ? { ...t, status: 'installed' as ToolStatus } : t
    ));
  }, []);

  const handleUpdate = useCallback(async (id: string) => {
    // 保存当前状态用于回滚
    const previousTools = tools;
    const currentTool = tools.find((t) => t.id === id);
    if (!currentTool) return;

    // 设置为更新中状态
    setTools((prev) => prev.map((t) =>
      t.id === id ? { ...t, status: 'updating' as ToolStatus } : t
    ));

    try {
      // 调用后端 API 更新工具配置
      const result = await fetchApi(`/api/admin/tools/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: true }),
        throwOnError: true,
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      // 更新成功，设置为已启用
      setTools((prev) => prev.map((t) =>
        t.id === id ? { ...t, status: 'enabled' as ToolStatus, lastUpdated: Date.now() } : t
      ));
    } catch (error) {
      console.error('更新工具失败:', error);
      // 回滚状态
      setTools((prev) => prev.map((t) =>
        t.id === id ? { ...t, status: currentTool.status } : t
      ));
    }
  }, [tools]);

  // MCP 状态获取
  const fetchMcpStatus = useCallback(async () => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:30000';
      const res = await fetch(`${backendUrl}/api/minimax/status`);
      const data = await res.json();
      if (data.success) {
        setMcpStatus(data.mcp_server?.connected ? 'connected' : 'disconnected');
        setMcpToolsCount(data.mcp_server?.tools_count || 0);
        setMcpError(data.mcp_server?.error || null);
      }
    } catch {
      setMcpStatus('disconnected');
      setMcpError('无法获取 MCP 状态');
    }
  }, []);

  // 连接 MCP
  const handleConnectMcp = useCallback(async () => {
    setMcpConnecting(true);
    setMcpStatus('connecting');
    setMcpError(null);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:30000';
      const res = await fetch(`${backendUrl}/api/minimax/connect`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMcpStatus('connected');
        setMcpToolsCount(data.tools_count || 0);
      } else {
        setMcpStatus('error');
        setMcpError(data.error?.message || '连接失败');
      }
    } catch (err: unknown) {
      setMcpStatus('error');
      setMcpError(err instanceof Error ? err.message : '连接失败');
    } finally {
      setMcpConnecting(false);
    }
  }, []);

  // 断开 MCP
  const handleDisconnectMcp = useCallback(async () => {
    setMcpStatus('disconnected');
    setMcpToolsCount(0);
    setMcpError(null);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:30000';
      await fetch(`${backendUrl}/api/minimax/disconnect`, { method: 'POST' });
    } catch {
      // ignore
    }
  }, []);

  // 从 API 获取工具列表
  useEffect(() => {
    async function fetchTools() {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:30000';
        const res = await fetch(`${backendUrl}/api/admin/tools`);
        const data = await res.json();
        if (data.success && data.tools) {
          const mappedTools = data.tools.map(mapApiToToolInfo);
          // 从 sessionStorage 恢复用户修改的状态
          const persisted = loadPersistedTools();
          const persistedMap = new Map(persisted.map((t) => [t.id, t]));
          const mergedTools = mappedTools.map((tool) => {
            const stored = persistedMap.get(tool.id);
            return stored ? { ...tool, ...stored } : tool;
          });
          setTools(mergedTools);
        }
      } catch (error) {
        console.warn('Failed to fetch tools from API:', error);
      } finally {
        setLoading(false);
      }
    }

    if (isOpen) {
      fetchTools();
    }
  }, [isOpen]);

  // 打开时拉取 MCP 状态，启动轮询
  useEffect(() => {
    if (!isOpen) return;
    fetchMcpStatus();
    pollTimerRef.current = setInterval(fetchMcpStatus, 30000);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isOpen, fetchMcpStatus]);

  useEffect(() => {
    if (!isClient()) return;

    try {
      window.sessionStorage.setItem(TOOL_MARKETPLACE_STORAGE_KEY, JSON.stringify(tools));
    } catch (error) {
      console.warn('Failed to persist tool marketplace state:', error);
    }
  }, [tools]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 20, opacity: 0, scale: 0.985 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.985 }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="flex h-[92vh] w-full max-w-[1240px] flex-col overflow-hidden rounded-3xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/98 shadow-2xl backdrop-blur-xl"
            onClick={(event) => event.stopPropagation()}
          >
            {/* 头部 */}
            <div className="flex items-center justify-between border-b p-4">
              <div className="flex items-center gap-3">
                <Package size={20} className="text-primary" />
                <h1 className="text-lg font-semibold">工具市场</h1>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="px-2 py-0.5 rounded-full bg-muted">
                    {stats.installed}/{stats.total} 已安装
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-[hsl(var(--success-500))/0.14] text-[hsl(var(--success-500))]">
                    {stats.enabled} 已启用
                  </span>
                </div>
              </div>
              <motion.button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-muted"
                aria-label="关闭工具市场面板"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <X size={20} />
              </motion.button>
            </div>

            {/* MCP 状态栏 */}
            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-2">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${mcpStatusStyles[mcpStatus].dotColor} ${mcpStatus === 'connecting' ? 'animate-pulse' : ''}`} />
                <span className={`flex items-center gap-1 text-xs font-medium ${mcpStatusStyles[mcpStatus].color}`}>
                  {mcpStatusStyles[mcpStatus].icon}
                  {mcpStatusStyles[mcpStatus].label}
                  {mcpStatus === 'connected' && mcpToolsCount > 0 && (
                    <span className="ml-1 text-muted-foreground">({mcpToolsCount} 个工具)</span>
                  )}
                </span>
              </div>
              {mcpError && (
                <span className="text-xs text-destructive">{mcpError}</span>
              )}
              <div className="ml-auto flex items-center gap-2">
                {mcpStatus === 'connected' || mcpStatus === 'error' ? (
                  <motion.button
                    onClick={handleDisconnectMcp}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-destructive/40 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <PlugZap size={12} />
                    断开
                  </motion.button>
                ) : (
                  <motion.button
                    onClick={handleConnectMcp}
                    disabled={mcpConnecting || mcpStatus === 'connecting'}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                    whileHover={{ scale: mcpConnecting ? 1 : 1.02 }}
                    whileTap={{ scale: mcpConnecting ? 1 : 0.98 }}
                  >
                    {mcpConnecting || mcpStatus === 'connecting' ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        连接中...
                      </>
                    ) : (
                      <>
                        <Plug size={12} />
                        连接 MCP
                      </>
                    )}
                  </motion.button>
                )}
                <motion.button
                  onClick={fetchMcpStatus}
                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  title="刷新 MCP 状态"
                >
                  <RefreshCw size={13} />
                </motion.button>
              </div>
            </div>

            {/* 搜索和过滤 */}
            <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 p-4">
              {/* 搜索框 */}
              <div className="relative flex-1 min-w-[200px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="搜索工具..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* 类别过滤 */}
              <div className="flex items-center gap-2">
                <Filter size={14} className="text-muted-foreground" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value as ToolCategory | 'all')}
                  className="px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="all">所有类别</option>
                  {Object.entries(categoryConfig).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              {/* 状态过滤 */}
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as ToolStatus | 'all')}
                className="px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="all">所有状态</option>
                <option value="available">可用</option>
                <option value="installed">已安装</option>
                <option value="enabled">已启用</option>
              </select>

              {/* 排序 */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="downloads">按下载量</option>
                <option value="rating">按评分</option>
                <option value="name">按名称</option>
              </select>
            </div>

            {/* 工具列表 */}
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                  <Loader2 size={48} className="mb-4 opacity-50 animate-spin" />
                  <p className="text-lg font-medium">加载工具列表...</p>
                  <p className="text-sm">正在从后端获取工具数据</p>
                </div>
              ) : filteredTools.length > 0 ? (
                <motion.div
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {filteredTools.map((tool) => (
                    <ToolCard
                      key={tool.id}
                      tool={tool}
                      onInstall={handleInstall}
                      onUninstall={handleUninstall}
                      onEnable={handleEnable}
                      onDisable={handleDisable}
                      onUpdate={handleUpdate}
                      onSelect={setSelectedTool}
                    />
                  ))}
                </motion.div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                  <Package size={48} className="mb-4 opacity-50" />
                  <p className="text-lg font-medium">未找到工具</p>
                  <p className="text-sm">尝试调整搜索条件或过滤器</p>
                </div>
              )}
            </div>

            {/* 工具详情模态框 */}
            <AnimatePresence>
              {selectedTool && (
                <ToolDetailModal
                  tool={selectedTool}
                  onClose={() => setSelectedTool(null)}
                  onInstall={handleInstall}
                  onUninstall={handleUninstall}
                  onEnable={handleEnable}
                  onDisable={handleDisable}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

export default ToolMarketplace;

