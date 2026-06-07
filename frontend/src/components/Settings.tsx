'use client';

import { useState, useEffect, useRef, useCallback, startTransition } from 'react';
import { useChatStore } from '@/store/chatStore';
import { AVAILABLE_MODELS, Model } from '@/types';
import { Settings as SettingsIcon, X, Check, Sun, Moon, Type, Keyboard, ChevronDown, Layout, Sparkles, Volume2, VolumeX, Zap, RefreshCw, Brain, Wifi, WifiOff, Loader2, AlertCircle, Plug, PlugZap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getBaseURLForModel, syncBaseURLForPresetModel } from '@/lib/modelConfig';
import { BACKEND_URL } from '@/lib/config';

// 模态框动画变体
const modalVariants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
    y: 20,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 300,
      damping: 25,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 20,
    transition: {
      duration: 0.2,
    },
  },
} as const;

// 背景遮罩动画变体
const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
} as const;

// 标签页内容动画变体
const tabContentVariants = {
  hidden: {
    opacity: 0,
    x: -10,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.2,
    },
  },
  exit: {
    opacity: 0,
    x: 10,
    transition: {
      duration: 0.15,
    },
  },
} as const;

// 按钮动画变体
const buttonVariants = {
  rest: { scale: 1 },
  hover: { scale: 1.02 },
  tap: { scale: 0.98 },
} as const;

const DESKTOP_PALETTES = [
  {
    id: 'aurora',
    name: '极光',
    hint: '蓝紫清透',
    swatches: ['hsl(var(--guide-8))', 'hsl(var(--guide-10))', 'hsl(var(--guide-12))'],
  },
  {
    id: 'mint',
    name: '薄荷',
    hint: '青绿明亮',
    swatches: ['hsl(var(--guide-5))', 'hsl(var(--guide-6))', 'hsl(var(--guide-8))'],
  },
  {
    id: 'sunset',
    name: '落日',
    hint: '暖橙柔和',
    swatches: ['hsl(var(--guide-1))', 'hsl(var(--guide-3))', 'hsl(var(--guide-10))'],
  },
] as const;

interface SettingsProps {
  autoOpen?: boolean;
  hideTrigger?: boolean;
}

export default function Settings({ autoOpen = false, hideTrigger = false }: SettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { apiConfig, setApiConfig, settings, setSettings } = useChatStore();

  const [localConfig, setLocalConfig] = useState(apiConfig);
  const [localSettings, setLocalSettings] = useState({ ...settings, desktopPalette: settings.desktopPalette || 'aurora' });
  const [activeTab, setActiveTab] = useState<'api' | 'appearance' | 'advanced' | 'tools'>('api');
  const [isMobile, setIsMobile] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // MCP 状态
  type McpStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
  const [mcpStatus, setMcpStatus] = useState<McpStatus>('disconnected');
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [mcpToolsCount, setMcpToolsCount] = useState(0);
  const [mcpConnecting, setMcpConnecting] = useState(false);

  // 从 store 获取动画设置
  const animationsEnabled = settings.animationsEnabled;

  // 检测移动端视口
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 移除了主题应用逻辑 - 主题由 page.tsx 统一管理
  // 只在组件挂载时应用字体大小
  useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = `${localSettings.fontSize}px`;
  }, [localSettings.fontSize]);

  const handleSave = () => {
    setApiConfig({
      ...localConfig,
      baseURL: localConfig.baseURL || getBaseURLForModel(localConfig.model),
    });
    setSettings(localSettings);
    startTransition(() => {
      setIsOpen(false);
    });
  };

  const handleOpen = () => {
    // 从 store 获取最新状态
    const currentState = useChatStore.getState();
    setLocalConfig(currentState.apiConfig);
    setLocalSettings({ ...currentState.settings, desktopPalette: currentState.settings.desktopPalette || 'aurora' });
    startTransition(() => {
      setIsOpen(true);
    });
  };

  // 监听 store 变化，保持状态同步
  useEffect(() => {
    if (!isOpen) {
      setLocalConfig(apiConfig);
      setLocalSettings({ ...settings, desktopPalette: settings.desktopPalette || 'aurora' });
    }
  }, [isOpen, apiConfig, settings]);

  // 支持在侧栏内挂载后自动弹出设置面板
  useEffect(() => {
    if (!autoOpen) return;
    const currentState = useChatStore.getState();
    setLocalConfig(currentState.apiConfig);
    setLocalSettings({ ...currentState.settings, desktopPalette: currentState.settings.desktopPalette || 'aurora' });
    setIsOpen(true);
  }, [autoOpen]);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        startTransition(() => {
          setIsOpen(false);
        });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Click outside to close on mobile
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isMobile && isOpen && settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        startTransition(() => {
          setIsOpen(false);
        });
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobile, isOpen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // MCP 状态获取
  const fetchMcpStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/minimax/status`);
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
      const res = await fetch(`${BACKEND_URL}/api/minimax/connect`, { method: 'POST' });
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
      await fetch(`${BACKEND_URL}/api/minimax/disconnect`, { method: 'POST' });
    } catch {
      // ignore
    }
  }, []);

  // 工具标签页打开时拉取 MCP 状态
  useEffect(() => {
    if (isOpen && activeTab === 'tools') {
      fetchMcpStatus();
    }
  }, [isOpen, activeTab, fetchMcpStatus]);

  return (
    <>
      {!hideTrigger && (
        <motion.button
          onClick={handleOpen}
          className="flex items-center justify-center rounded-md border bg-background text-sm transition-colors hover:bg-muted touch-manipulation w-10 h-10 sm:w-9 sm:h-9"
          title="设置"
          whileHover={animationsEnabled ? 'hover' : undefined}
          whileTap={animationsEnabled ? 'tap' : undefined}
          variants={animationsEnabled ? buttonVariants : undefined}
        >
          <SettingsIcon size={18} />
        </motion.button>
      )}

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
            <motion.div
              ref={settingsRef}
              className="relative mx-4 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/98 p-6 shadow-2xl backdrop-blur-xl"
              variants={animationsEnabled ? modalVariants : undefined}
              initial={animationsEnabled ? 'hidden' : undefined}
              animate={animationsEnabled ? 'visible' : undefined}
              exit={animationsEnabled ? 'exit' : undefined}
            >
              <div className="flex items-center justify-between mb-4">
                <motion.h2
                  className="text-base sm:text-lg font-semibold"
                  initial={animationsEnabled ? { opacity: 0, x: -10 } : undefined}
                  animate={animationsEnabled ? { opacity: 1, x: 0 } : undefined}
                  transition={{ delay: 0.1 }}
                >
                  设置
                </motion.h2>
                <motion.button
                  onClick={() => startTransition(() => setIsOpen(false))}
                  className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted touch-manipulation"
                  whileHover={animationsEnabled ? { scale: 1.1, rotate: 90 } : undefined}
                  whileTap={animationsEnabled ? { scale: 0.9 } : undefined}
                >
                  <X size={18} />
                </motion.button>
              </div>

              {/* Tabs */}
              <motion.div
                className="flex border-b mb-3 sm:mb-4 overflow-x-auto"
                initial={animationsEnabled ? { opacity: 0 } : undefined}
                animate={animationsEnabled ? { opacity: 1 } : undefined}
                transition={{ delay: 0.1 }}
              >
                {(['api', 'appearance', 'advanced', 'tools'] as const).map((tab, index) => (
                  <motion.button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                      activeTab === tab
                        ? 'border-b-2 border-primary text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    whileHover={animationsEnabled ? { y: -2 } : undefined}
                    initial={animationsEnabled ? { opacity: 0, y: -10 } : undefined}
                    animate={animationsEnabled ? { opacity: 1, y: 0 } : undefined}
                    transition={{ delay: 0.1 + index * 0.05 }}
                  >
                    {tab === 'api' ? 'API 配置' : tab === 'appearance' ? '外观' : tab === 'advanced' ? '高级' : '工具'}
                  </motion.button>
                ))}
              </motion.div>

              <div className="flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">
                  {activeTab === 'api' && (
                    <motion.div
                      key="api"
                      variants={animationsEnabled ? tabContentVariants : undefined}
                      initial={animationsEnabled ? 'hidden' : undefined}
                      animate={animationsEnabled ? 'visible' : undefined}
                      exit={animationsEnabled ? 'exit' : undefined}
                      className="space-y-3 sm:space-y-4"
                    >
                      {/* 安全提示 */}
                      <div className="rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-muted))]/75 p-3">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">安全模式：</span>
                          API Key 由后端服务器安全管理，无需在前端配置。
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs sm:text-sm font-medium mb-1.5">API 端点 (Base URL)</label>
                        <input
                          type="text"
                          value={localConfig.baseURL}
                          onChange={(e) => setLocalConfig({ ...localConfig, baseURL: e.target.value })}
                          placeholder="https://api.openai.com/v1 或 https://api.anthropic.com"
                          className="w-full rounded-md border bg-background px-3 py-2.5 sm:py-2 text-xs sm:text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <p className="text-xs text-muted-foreground mt-1">支持 OpenAI 兼容格式 (/v1) 或 Anthropic 格式</p>
                      </div>

                      <div>
                        <label className="block text-xs sm:text-sm font-medium mb-1.5">API Key</label>
                        <input
                          type="password"
                          value={localConfig.apiKey || ''}
                          onChange={(e) => setLocalConfig({ ...localConfig, apiKey: e.target.value })}
                          placeholder="sk-xxx 或 sk-ant-xxx"
                          className="w-full rounded-md border bg-background px-3 py-2.5 sm:py-2 text-xs sm:text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <p className="text-xs text-muted-foreground mt-1">留空则使用后端配置的 API Key</p>
                      </div>

                      <div>
                        <label className="block text-xs sm:text-sm font-medium mb-1.5">模型名称</label>
                        <input
                          type="text"
                          value={localConfig.model}
                          onChange={(e) => setLocalConfig({ ...localConfig, model: e.target.value })}
                          placeholder="gpt-4o, claude-sonnet-4-20250514, MiniMax-M2.7-highspeed 等"
                          className="w-full rounded-md border bg-background px-3 py-2.5 sm:py-2 text-xs sm:text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <p className="text-xs text-muted-foreground mt-1">可输入任意模型名称</p>
                      </div>

                      <div>
                        <label className="block text-xs sm:text-sm font-medium mb-1.5">或选择预设模型</label>
                        <div className="relative">
                          <select
                            value={localConfig.model}
                            onChange={(e) => setLocalConfig({
                              ...localConfig,
                              model: e.target.value,
                              baseURL: syncBaseURLForPresetModel(e.target.value, localConfig.baseURL),
                            })}
                            className="w-full rounded-md border bg-background px-3 py-2.5 sm:py-2 text-xs sm:text-sm outline-none focus:ring-2 focus:ring-primary/20 appearance-none pr-10"
                          >
                            {AVAILABLE_MODELS.map((model: Model) => (
                              <option key={model.id} value={model.id}>
                                {model.name} ({model.provider})
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        </div>
                      </div>

                      {/* MiniMax M2.7 高级选项 */}
                      {localConfig.model.toLowerCase().includes('minimax') && (
                        <div className="space-y-3 rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-muted))]/50 p-3">
                          <p className="text-xs font-medium flex items-center gap-1.5">
                            <Brain size={13} className="text-primary" />
                            MiniMax M2.7 思维链配置
                          </p>

                          {/* reasoningSplit 开关 */}
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-medium">思维链分离</p>
                              <p className="text-[10px] text-muted-foreground">thinking content 单独返回</p>
                            </div>
                            <motion.button
                              onClick={() => setLocalConfig({ ...localConfig, reasoningSplit: !localConfig.reasoningSplit })}
                              className={`relative w-10 h-5 rounded-full transition-colors ${
                                localConfig.reasoningSplit ? 'bg-primary' : 'bg-muted'
                              }`}
                              whileTap={animationsEnabled ? { scale: 0.95 } : undefined}
                            >
                              <motion.span
                                className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-background"
                                animate={{ x: localConfig.reasoningSplit ? 18 : 0 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                              />
                            </motion.button>
                          </div>

                          {/* thinkingBudget */}
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <p className="text-xs font-medium">思维预算</p>
                              <span className="text-[10px] text-muted-foreground font-mono">{localConfig.thinkingBudget ?? 4000} tokens</span>
                            </div>
                            <input
                              type="range"
                              min="1"
                              max="32000"
                              step="500"
                              value={localConfig.thinkingBudget ?? 4000}
                              onChange={(e) => setLocalConfig({ ...localConfig, thinkingBudget: Number(e.target.value) })}
                              className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer"
                            />
                            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                              <span>1</span>
                              <span>32k</span>
                            </div>
                          </div>

                          {/* showThinking 开关 */}
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-medium">显示思考内容</p>
                              <p className="text-[10px] text-muted-foreground">在对话中显示 thinking</p>
                            </div>
                            <motion.button
                              onClick={() => setLocalConfig({ ...localConfig, showThinking: !localConfig.showThinking })}
                              className={`relative w-10 h-5 rounded-full transition-colors ${
                                localConfig.showThinking ? 'bg-primary' : 'bg-muted'
                              }`}
                              whileTap={animationsEnabled ? { scale: 0.95 } : undefined}
                            >
                              <motion.span
                                className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-background"
                                animate={{ x: localConfig.showThinking ? 18 : 0 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                              />
                            </motion.button>
                          </div>
                        </div>
                      )}

                      {/* 通用高级参数 */}
                      <div className="space-y-3 rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-muted))]/50 p-3">
                        <p className="text-xs font-medium flex items-center gap-1.5">
                          <Sparkles size={13} className="text-primary" />
                          高级生成参数
                        </p>

                        {/* Temperature */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <p className="text-xs font-medium">Temperature</p>
                            <span className="text-[10px] text-muted-foreground font-mono">{localConfig.temperature ?? 0.7}</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="2"
                            step="0.05"
                            value={localConfig.temperature ?? 0.7}
                            onChange={(e) => setLocalConfig({ ...localConfig, temperature: Number(e.target.value) })}
                            className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                            <span>精确</span>
                            <span>随机</span>
                          </div>
                        </div>

                        {/* Max Tokens */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <p className="text-xs font-medium">最大输出 Token</p>
                            <span className="text-[10px] text-muted-foreground font-mono">{localConfig.maxTokens ?? 16384}</span>
                          </div>
                          <input
                            type="range"
                            min="256"
                            max="100000"
                            step="256"
                            value={localConfig.maxTokens ?? 16384}
                            onChange={(e) => setLocalConfig({ ...localConfig, maxTokens: Number(e.target.value) })}
                            className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                            <span>256</span>
                            <span>100k</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'appearance' && (
                    <motion.div
                      key="appearance"
                      variants={animationsEnabled ? tabContentVariants : undefined}
                      initial={animationsEnabled ? 'hidden' : undefined}
                      animate={animationsEnabled ? 'visible' : undefined}
                      exit={animationsEnabled ? 'exit' : undefined}
                      className="space-y-6"
                    >
                      {/* Theme */}
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium mb-3">
                          <Sun size={16} />
                          主题模式
                        </label>
                        <div className="flex gap-2">
                          {(['light', 'dark', 'system'] as const).map((theme) => (
                            <motion.button
                              key={theme}
                              onClick={() => {
                                setLocalSettings({ ...localSettings, theme });
                                setSettings({ theme });
                              }}
                              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 sm:py-2 rounded-md border text-xs sm:text-sm transition-colors ${
                                localSettings.theme === theme
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'hover:bg-muted'
                              }`}
                              whileHover={animationsEnabled ? { scale: 1.02 } : undefined}
                              whileTap={animationsEnabled ? { scale: 0.98 } : undefined}
                            >
                              {theme === 'light' && <Sun size={14} />}
                              {theme === 'dark' && <Moon size={14} />}
                              {theme === 'system' && <SettingsIcon size={14} />}
                              <span className="hidden sm:inline">
                                {theme === 'light' ? '浅色' : theme === 'dark' ? '深色' : '跟随系统'}
                              </span>
                              <span className="sm:hidden">
                                {theme === 'light' ? '浅' : theme === 'dark' ? '深' : '系统'}
                              </span>
                            </motion.button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium mb-3">
                          <Sparkles size={16} />
                          桌面配色套系
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {DESKTOP_PALETTES.map((palette) => {
                            const isActive = localSettings.desktopPalette === palette.id;

                            return (
                              <motion.button
                                key={palette.id}
                                onClick={() => setLocalSettings({ ...localSettings, desktopPalette: palette.id })}
                                className={`rounded-md border p-2 text-left transition-colors ${
                                  isActive ? 'border-primary bg-primary/10' : 'hover:bg-muted'
                                }`}
                                whileHover={animationsEnabled ? { scale: 1.02 } : undefined}
                                whileTap={animationsEnabled ? { scale: 0.98 } : undefined}
                              >
                                <div className="mb-2 flex items-center gap-1">
                                  {palette.swatches.map((color, index) => (
                                    <span
                                      key={index}
                                      className="h-2.5 w-2.5 rounded-full"
                                      style={{ backgroundColor: color }}
                                    />
                                  ))}
                                </div>
                                <div className="text-xs font-semibold">{palette.name}</div>
                                <div className="text-[10px] text-muted-foreground">{palette.hint}</div>
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Typing Speed */}
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium mb-3">
                          <Keyboard size={16} />
                          打字速度
                        </label>
                        <div className="space-y-2">
                          <input
                            type="range"
                            min="10"
                            max="100"
                            step="10"
                            value={localSettings.typingSpeed}
                            onChange={(e) => setLocalSettings({ ...localSettings, typingSpeed: Number(e.target.value) })}
                            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>快</span>
                            <span>{localSettings.typingSpeed}ms/字</span>
                            <span>慢</span>
                          </div>
                        </div>
                      </div>

                      {/* Font Size */}
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium mb-3">
                          <Type size={16} />
                          字体大小
                        </label>
                        <div className="space-y-2">
                          <input
                            type="range"
                            min="12"
                            max="20"
                            step="1"
                            value={localSettings.fontSize}
                            onChange={(e) => setLocalSettings({ ...localSettings, fontSize: Number(e.target.value) })}
                            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>小</span>
                            <span>{localSettings.fontSize}px</span>
                            <span>大</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'advanced' && (
                    <motion.div
                      key="advanced"
                      variants={animationsEnabled ? tabContentVariants : undefined}
                      initial={animationsEnabled ? 'hidden' : undefined}
                      animate={animationsEnabled ? 'visible' : undefined}
                      exit={animationsEnabled ? 'exit' : undefined}
                      className="space-y-6"
                    >
                      {/* Window Layout */}
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium mb-3">
                          <Layout size={16} />
                          默认窗口布局
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            { id: 'single', label: '单窗口', icon: '▢' },
                            { id: 'horizontal', label: '水平分屏', icon: '▤' },
                            { id: 'vertical', label: '垂直分屏', icon: '▥' },
                            { id: 'grid', label: '网格布局', icon: '▦' },
                          ] as const).map((layout) => (
                            <motion.button
                              key={layout.id}
                              onClick={() => setLocalSettings({ ...localSettings, windowLayout: layout.id })}
                              className={`flex items-center justify-center gap-2 px-3 py-3 rounded-md border text-sm transition-colors ${
                                localSettings.windowLayout === layout.id
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'hover:bg-muted'
                              }`}
                              whileHover={animationsEnabled ? { scale: 1.02 } : undefined}
                              whileTap={animationsEnabled ? { scale: 0.98 } : undefined}
                            >
                              <span className="text-lg">{layout.icon}</span>
                              <span>{layout.label}</span>
                            </motion.button>
                          ))}
                        </div>
                      </div>

                      {/* Animations */}
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium mb-3">
                          <RefreshCw size={16} />
                          动画效果
                        </label>
                        <motion.div
                          className="flex items-center justify-between rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-muted))]/65 p-3"
                          whileHover={animationsEnabled ? { backgroundColor: 'hsl(var(--text-main) / 0.04)' } : undefined}
                        >
                          <div className="flex items-center gap-2">
                            <Zap size={16} className="text-muted-foreground" />
                            <span className="text-sm">启用平滑动画</span>
                          </div>
                          <motion.button
                            onClick={() => setLocalSettings({ ...localSettings, animationsEnabled: !localSettings.animationsEnabled })}
                            className={`relative w-12 h-6 rounded-full transition-colors ${
                              localSettings.animationsEnabled ? 'bg-primary' : 'bg-muted'
                            }`}
                            whileTap={animationsEnabled ? { scale: 0.95 } : undefined}
                          >
                            <motion.span
                              className="absolute top-1 left-1 w-4 h-4 rounded-full bg-background"
                              animate={{
                                x: localSettings.animationsEnabled ? 24 : 0,
                              }}
                              transition={{
                                type: 'spring',
                                stiffness: 500,
                                damping: 30,
                              }}
                            />
                          </motion.button>
                        </motion.div>
                      </div>

                      {/* Sound */}
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium mb-3">
                          {localSettings.soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                          声音提示
                        </label>
                        <motion.div
                          className="flex items-center justify-between rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-muted))]/65 p-3"
                          whileHover={animationsEnabled ? { backgroundColor: 'hsl(var(--text-main) / 0.04)' } : undefined}
                        >
                          <div className="flex items-center gap-2">
                            <Sparkles size={16} className="text-muted-foreground" />
                            <span className="text-sm">AI回复完成提示音</span>
                          </div>
                          <motion.button
                            onClick={() => setLocalSettings({ ...localSettings, soundEnabled: !localSettings.soundEnabled })}
                            className={`relative w-12 h-6 rounded-full transition-colors ${
                              localSettings.soundEnabled ? 'bg-primary' : 'bg-muted'
                            }`}
                            whileTap={animationsEnabled ? { scale: 0.95 } : undefined}
                          >
                            <motion.span
                              className="absolute top-1 left-1 w-4 h-4 rounded-full bg-background"
                              animate={{
                                x: localSettings.soundEnabled ? 24 : 0,
                              }}
                              transition={{
                                type: 'spring',
                                stiffness: 500,
                                damping: 30,
                              }}
                            />
                          </motion.button>
                        </motion.div>
                      </div>

                      {/* Auto Title */}
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium mb-3">
                          <SettingsIcon size={16} />
                          自动生成标题
                        </label>
                        <motion.div
                          className="flex items-center justify-between rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-muted))]/65 p-3"
                          whileHover={animationsEnabled ? { backgroundColor: 'hsl(var(--text-main) / 0.04)' } : undefined}
                        >
                          <div className="flex items-center gap-2">
                            <Type size={16} className="text-muted-foreground" />
                            <span className="text-sm">新对话自动生成标题</span>
                          </div>
                          <motion.button
                            onClick={() => setLocalSettings({ ...localSettings, autoTitle: !localSettings.autoTitle })}
                            className={`relative w-12 h-6 rounded-full transition-colors ${
                              localSettings.autoTitle ? 'bg-primary' : 'bg-muted'
                            }`}
                            whileTap={animationsEnabled ? { scale: 0.95 } : undefined}
                          >
                            <motion.span
                              className="absolute top-1 left-1 w-4 h-4 rounded-full bg-background"
                              animate={{
                                x: localSettings.autoTitle ? 24 : 0,
                              }}
                              transition={{
                                type: 'spring',
                                stiffness: 500,
                                damping: 30,
                              }}
                            />
                          </motion.button>
                        </motion.div>
                      </div>

                      {/* Keyboard Shortcuts Info */}
                      <div className="pt-4 border-t">
                        <h3 className="text-sm font-medium mb-3">键盘快捷键</h3>
                        <div className="space-y-2 text-xs text-muted-foreground">
                          <div className="flex justify-between">
                            <span>打开快捷键帮助</span>
                            <kbd className="px-2 py-0.5 bg-muted rounded text-foreground">Ctrl + /</kbd>
                          </div>
                          <div className="flex justify-between">
                            <span>打开Prompt选择器</span>
                            <kbd className="px-2 py-0.5 bg-muted rounded text-foreground">Ctrl + Shift + P</kbd>
                          </div>
                          <div className="flex justify-between">
                            <span>新建对话</span>
                            <kbd className="px-2 py-0.5 bg-muted rounded text-foreground">Ctrl + N</kbd>
                          </div>
                          <div className="flex justify-between">
                            <span>关闭弹窗</span>
                            <kbd className="px-2 py-0.5 bg-muted rounded text-foreground">Esc</kbd>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'tools' && (
                    <motion.div
                      key="tools"
                      variants={animationsEnabled ? tabContentVariants : undefined}
                      initial={animationsEnabled ? 'hidden' : undefined}
                      animate={animationsEnabled ? 'visible' : undefined}
                      exit={animationsEnabled ? 'exit' : undefined}
                      className="space-y-4"
                    >
                      {/* MCP 状态卡片 */}
                      <div className="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-muted))]/40 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Plug size={16} className="text-primary" />
                            <h3 className="text-sm font-semibold">MiniMax MCP Server</h3>
                          </div>
                          {/* 状态指示器 */}
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${
                              mcpStatus === 'connected' ? 'bg-[hsl(var(--success-500))] animate-pulse' :
                              mcpStatus === 'connecting' ? 'bg-[hsl(var(--warning-500))] animate-pulse' :
                              mcpStatus === 'error' ? 'bg-destructive' : 'bg-muted-foreground'
                            }`} />
                            <span className={`text-xs font-medium ${
                              mcpStatus === 'connected' ? 'text-[hsl(var(--success-500))]' :
                              mcpStatus === 'connecting' ? 'text-[hsl(var(--warning-500))]' :
                              mcpStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'
                            }`}>
                              {mcpStatus === 'connected' ? '已连接' :
                               mcpStatus === 'connecting' ? '连接中...' :
                               mcpStatus === 'error' ? '连接失败' : '未连接'}
                            </span>
                          </div>
                        </div>

                        {/* 状态图标与描述 */}
                        <div className="flex items-center gap-3 mb-4">
                          <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${
                            mcpStatus === 'connected' ? 'bg-[hsl(var(--success-500))]/15 text-[hsl(var(--success-500))]' :
                            mcpStatus === 'connecting' ? 'bg-[hsl(var(--warning-500))]/15 text-[hsl(var(--warning-500))]' :
                            mcpStatus === 'error' ? 'bg-destructive/15 text-destructive' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {mcpStatus === 'connected' ? <Wifi size={24} /> :
                             mcpStatus === 'connecting' ? <Loader2 size={24} className="animate-spin" /> :
                             mcpStatus === 'error' ? <AlertCircle size={24} /> :
                             <WifiOff size={24} />}
                          </div>
                          <div>
                            {mcpStatus === 'connected' && mcpToolsCount > 0 ? (
                              <p className="text-sm font-medium">MCP Server 运行中</p>
                            ) : mcpStatus === 'connected' ? (
                              <p className="text-sm font-medium">已连接，待加载工具</p>
                            ) : mcpStatus === 'connecting' ? (
                              <p className="text-sm font-medium text-[hsl(var(--warning-500))]">正在建立连接...</p>
                            ) : mcpStatus === 'error' ? (
                              <>
                                <p className="text-sm font-medium text-destructive">连接失败</p>
                                {mcpError && <p className="text-xs text-muted-foreground">{mcpError}</p>}
                              </>
                            ) : (
                              <p className="text-sm text-muted-foreground">点击连接以启用 MiniMax MCP 工具</p>
                            )}
                            {mcpStatus === 'connected' && mcpToolsCount > 0 && (
                              <p className="text-xs text-muted-foreground mt-0.5">{mcpToolsCount} 个工具已注册</p>
                            )}
                          </div>
                        </div>

                        {/* 操作按钮 */}
                        <div className="flex items-center gap-2">
                          {mcpStatus === 'connected' || mcpStatus === 'error' ? (
                            <>
                              <motion.button
                                onClick={handleDisconnectMcp}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-destructive/40 text-xs text-destructive hover:bg-destructive/10 transition-colors font-medium"
                                whileHover={animationsEnabled ? { scale: 1.02 } : undefined}
                                whileTap={animationsEnabled ? { scale: 0.98 } : undefined}
                              >
                                <PlugZap size={14} />
                                断开连接
                              </motion.button>
                              <motion.button
                                onClick={fetchMcpStatus}
                                className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg border text-xs text-muted-foreground hover:bg-muted transition-colors"
                                whileHover={animationsEnabled ? { scale: 1.02 } : undefined}
                                whileTap={animationsEnabled ? { scale: 0.98 } : undefined}
                              >
                                <RefreshCw size={13} />
                                刷新
                              </motion.button>
                            </>
                          ) : (
                            <>
                              <motion.button
                                onClick={handleConnectMcp}
                                disabled={mcpConnecting || mcpStatus === 'connecting'}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                                whileHover={animationsEnabled && !mcpConnecting ? { scale: 1.02 } : undefined}
                                whileTap={animationsEnabled && !mcpConnecting ? { scale: 0.98 } : undefined}
                              >
                                {mcpConnecting || mcpStatus === 'connecting' ? (
                                  <>
                                    <Loader2 size={14} className="animate-spin" />
                                    连接中...
                                  </>
                                ) : (
                                  <>
                                    <Plug size={14} />
                                    连接 MCP Server
                                  </>
                                )}
                              </motion.button>
                              <motion.button
                                onClick={fetchMcpStatus}
                                className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg border text-xs text-muted-foreground hover:bg-muted transition-colors"
                                whileHover={animationsEnabled ? { scale: 1.02 } : undefined}
                                whileTap={animationsEnabled ? { scale: 0.98 } : undefined}
                              >
                                <RefreshCw size={13} />
                                刷新
                              </motion.button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* 说明 */}
                      <div className="rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-muted))]/30 p-3">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">MiniMax MCP Server</span>
                          提供文档处理、网页抓取等工具能力。
                          需要配置 <span className="font-mono text-foreground">MINIMAX_API_KEY</span> 环境变量。
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="mt-4 sm:mt-6 flex justify-end gap-2 pt-3 sm:pt-4 border-t">
                <motion.button
                  onClick={() => startTransition(() => setIsOpen(false))}
                  className="flex items-center gap-1 rounded-md px-4 py-2.5 sm:py-2 text-sm hover:bg-muted"
                  whileHover={animationsEnabled ? 'hover' : undefined}
                  whileTap={animationsEnabled ? 'tap' : undefined}
                  variants={animationsEnabled ? buttonVariants : undefined}
                >
                  <X size={16} />
                  取消
                </motion.button>
                <motion.button
                  onClick={handleSave}
                  className="flex items-center gap-1 rounded-md bg-primary px-4 py-2.5 sm:py-2 text-sm text-primary-foreground hover:bg-primary/90"
                  whileHover={animationsEnabled ? { scale: 1.02 } : undefined}
                  whileTap={animationsEnabled ? { scale: 0.98 } : undefined}
                >
                  <Check size={16} />
                  保存
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

