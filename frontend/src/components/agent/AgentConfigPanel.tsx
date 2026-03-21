'use client';

import { memo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  Bot,
  Brain,
  Zap,
  Globe,
  Database,
  Terminal,
  FileCode,
  Search,
  Sliders,
  CheckCircle2,
  RotateCcw,
  Save,
  Copy,
  Download,
  Upload,
} from 'lucide-react';

// Agent 能力类型
export type AgentCapability =
  | 'reasoning'      // 推理
  | 'code_execution' // 代码执行
  | 'web_search'     // 网络搜索
  | 'file_ops'       // 文件操作
  | 'api_calls'      // API 调用
  | 'data_analysis'  // 数据分析
  | 'memory'         // 记忆系统
  | 'planning';      // 规划

// 工具配置
export interface ToolConfig {
  name: string;
  enabled: boolean;
  config?: Record<string, unknown>;
  permissions?: string[];
}

// 记忆配置
export interface MemoryConfig {
  shortTermEnabled: boolean;
  longTermEnabled: boolean;
  maxShortTermItems: number;
  maxLongTermItems: number;
  compressionThreshold: number;
}

// 执行配置
export interface ExecutionConfig {
  maxIterations: number;
  timeout: number;
  checkpointInterval: number;
  enableHumanLoop: boolean;
  criticalActions: string[];
}

// Agent 配置
export interface AgentConfiguration {
  id: string;
  name: string;
  description: string;
  model: string;
  systemPrompt: string;
  capabilities: AgentCapability[];
  tools: ToolConfig[];
  memory: MemoryConfig;
  execution: ExecutionConfig;
  metadata: {
    createdAt: number;
    updatedAt: number;
    version: number;
    tags: string[];
  };
}

// 默认配置
const defaultConfig: AgentConfiguration = {
  id: '',
  name: '新 Agent',
  description: '',
  model: 'claude-sonnet-4-6',
  systemPrompt: '你是一个智能助手，可以帮助用户完成各种任务。',
  capabilities: ['reasoning', 'memory'],
  tools: [],
  memory: {
    shortTermEnabled: true,
    longTermEnabled: false,
    maxShortTermItems: 50,
    maxLongTermItems: 1000,
    compressionThreshold: 40,
  },
  execution: {
    maxIterations: 10,
    timeout: 60000,
    checkpointInterval: 1,
    enableHumanLoop: true,
    criticalActions: ['delete', 'execute', 'send'],
  },
  metadata: {
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    tags: [],
  },
};

// 可用模型
const availableModels = [
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', description: '最强推理能力' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', description: '平衡性能与速度' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', description: '快速响应' },
  { id: 'gpt-4o', name: 'GPT-4o', description: 'OpenAI 多模态' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'OpenAI 高性能' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Google 快速模型' },
];

// 能力配置
const capabilityConfig: Record<AgentCapability, { icon: React.ReactNode; label: string; description: string }> = {
  reasoning: {
    icon: <Brain size={16} className="text-[hsl(var(--accent-500))]" />,
    label: '推理能力',
    description: '复杂问题分析和逻辑推理',
  },
  code_execution: {
    icon: <FileCode size={16} className="text-[hsl(var(--success-500))]" />,
    label: '代码执行',
    description: '在沙箱环境中执行代码',
  },
  web_search: {
    icon: <Search size={16} className="text-primary" />,
    label: '网络搜索',
    description: '搜索互联网获取信息',
  },
  file_ops: {
    icon: <Database size={16} className="text-[hsl(var(--warning-500))]" />,
    label: '文件操作',
    description: '读写文件系统',
  },
  api_calls: {
    icon: <Globe size={16} className="text-[hsl(var(--info-500))]" />,
    label: 'API 调用',
    description: '发送 HTTP 请求',
  },
  data_analysis: {
    icon: <Terminal size={16} className="text-[hsl(var(--icon-media))]" />,
    label: '数据分析',
    description: '处理和分析数据',
  },
  memory: {
    icon: <Brain size={16} className="text-[hsl(var(--accent-500))]" />,
    label: '记忆系统',
    description: '短期和长期记忆支持',
  },
  planning: {
    icon: <Zap size={16} className="text-[hsl(var(--warning-500))]" />,
    label: '规划能力',
    description: '多步骤任务规划',
  },
};

// 配置项组件
interface ConfigItemProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

const ConfigItem = memo(function ConfigItem({ label, description, children }: ConfigItemProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
});

// 开关组件
interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

const Toggle = memo(function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors ${
        checked ? 'bg-primary' : 'bg-muted'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <motion.div
        className="absolute top-0.5 w-4 h-4 rounded-full bg-background shadow"
        animate={{ left: checked ? '22px' : '2px' }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  );
});

// 数字输入组件
interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

const NumberInput = memo(function NumberInput({
  value,
  onChange,
  min = 0,
  max = 1000,
  step = 1,
}: NumberInputProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(min, value - step))}
        className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
      >
        -
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, parseInt(e.target.value) || min)))}
        className="w-16 h-6 text-center text-sm border rounded bg-background"
        min={min}
        max={max}
      />
      <button
        onClick={() => onChange(Math.min(max, value + step))}
        className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
      >
        +
      </button>
    </div>
  );
});

// Agent 配置面板
interface AgentConfigPanelProps {
  config?: Partial<AgentConfiguration>;
  onSave?: (config: AgentConfiguration) => void;
  onExport?: (config: AgentConfiguration) => void;
  onImport?: (config: AgentConfiguration) => void;
  className?: string;
}

export const AgentConfigPanel = memo(function AgentConfigPanel({
  config: initialConfig,
  onSave,
  onExport,
  onImport,
  className='',
}: AgentConfigPanelProps) {
  const [config, setConfig] = useState<AgentConfiguration>({
    ...defaultConfig,
    ...initialConfig,
    id: initialConfig?.id || `agent_${Date.now()}`,
  });
  const [activeSection, setActiveSection] = useState<'general' | 'tools' | 'memory' | 'execution'>('general');
  const [hasChanges, setHasChanges] = useState(false);
  const [saved, setSaved] = useState(false);

  // 更新配置
  const updateConfig = useCallback(<K extends keyof AgentConfiguration>(
    key: K,
    value: AgentConfiguration[K]
  ) => {
    setConfig(prev => ({
      ...prev,
      [key]: value,
      metadata: {
        ...prev.metadata,
        updatedAt: Date.now(),
      },
    }));
    setHasChanges(true);
  }, []);

  // 切换能力
  const toggleCapability = useCallback((capability: AgentCapability) => {
    setConfig(prev => {
      const capabilities = prev.capabilities.includes(capability)
        ? prev.capabilities.filter(c => c !== capability)
        : [...prev.capabilities, capability];
      return {
        ...prev,
        capabilities,
        metadata: { ...prev.metadata, updatedAt: Date.now() },
      };
    });
    setHasChanges(true);
  }, []);

  // 保存配置
  const handleSave = useCallback(() => {
    if (onSave) {
      onSave(config);
      setHasChanges(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }, [config, onSave]);

  // 重置配置
  const handleReset = useCallback(() => {
    setConfig({
      ...defaultConfig,
      id: config.id,
      metadata: {
        ...defaultConfig.metadata,
        createdAt: config.metadata.createdAt,
      },
    });
    setHasChanges(true);
  }, [config.id, config.metadata.createdAt]);

  // 导入配置
  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          const text = await file.text();
          const imported = JSON.parse(text) as AgentConfiguration;
          setConfig(imported);
          setHasChanges(true);
          onImport?.(imported);
        } catch (err) {
          console.error('Import failed:', err);
        }
      }
    };
    input.click();
  }, [onImport]);

  // 导出配置
  const handleExport = useCallback(() => {
    const data = JSON.stringify(config, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.name.replace(/\s+/g, '_')}_config.json`;
    a.click();
    URL.revokeObjectURL(url);
    onExport?.(config);
  }, [config, onExport]);

  // 复制配置
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    } catch (err) {
      console.error('Copy failed:', err);
    }
  }, [config]);

  const sections = [
    { id: 'general', label: '基础配置', icon: <Settings size={16} /> },
    { id: 'tools', label: '工具配置', icon: <Sliders size={16} /> },
    { id: 'memory', label: '记忆系统', icon: <Brain size={16} /> },
    { id: 'execution', label: '执行参数', icon: <Zap size={16} /> },
  ];

  return (
    <motion.div
      className={`flex flex-col bg-background border rounded-xl overflow-hidden ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Bot size={20} className="text-primary" />
          <span className="font-medium">Agent 配置</span>
          {hasChanges && (
            <span className="text-xs text-[hsl(var(--warning-500))] bg-[hsl(var(--warning-500))/0.14] px-2 py-0.5 rounded-full">
              未保存
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
            title="复制配置"
          >
            <Copy size={16} />
          </button>
          <button
            onClick={handleImport}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
            title="导入配置"
          >
            <Upload size={16} />
          </button>
          <button
            onClick={handleExport}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
            title="导出配置"
          >
            <Download size={16} />
          </button>
          <button
            onClick={handleReset}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
            title="重置配置"
          >
            <RotateCcw size={16} />
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              saved
                ? 'bg-[hsl(var(--success-500))/0.14] text-[hsl(var(--success-500))]'
                : hasChanges
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}
          >
            {saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
            {saved ? '已保存' : '保存'}
          </button>
        </div>
      </div>

      {/* 标签导航 */}
      <div className="flex border-b">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id as typeof activeSection)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeSection === section.id
                ? 'text-primary border-primary'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
          >
            {section.icon}
            {section.label}
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        <AnimatePresence mode="wait">
          {activeSection === 'general' && (
            <motion.div
              key="general"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4"
            >
              {/* 名称 */}
              <ConfigItem label="Agent 名称" description="为你的 Agent 命名">
                <input
                  type="text"
                  value={config.name}
                  onChange={(e) => updateConfig('name', e.target.value)}
                  className="w-48 h-8 px-3 text-sm border rounded-lg bg-background"
                  placeholder="输入名称"
                />
              </ConfigItem>

              {/* 描述 */}
              <div className="py-3">
                <div className="text-sm font-medium mb-2">描述</div>
                <textarea
                  value={config.description}
                  onChange={(e) => updateConfig('description', e.target.value)}
                  className="w-full h-20 px-3 py-2 text-sm border rounded-lg bg-background resize-none"
                  placeholder="描述这个 Agent 的用途..."
                />
              </div>

              {/* 模型选择 */}
              <ConfigItem label="AI 模型" description="选择 Agent 使用的基础模型">
                <select
                  value={config.model}
                  onChange={(e) => updateConfig('model', e.target.value)}
                  className="w-48 h-8 px-3 text-sm border rounded-lg bg-background"
                >
                  {availableModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </ConfigItem>

              {/* 系统提示 */}
              <div className="py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">系统提示</div>
                  <span className="text-xs text-muted-foreground">
                    {config.systemPrompt.length} 字符
                  </span>
                </div>
                <textarea
                  value={config.systemPrompt}
                  onChange={(e) => updateConfig('systemPrompt', e.target.value)}
                  className="w-full h-32 px-3 py-2 text-sm border rounded-lg bg-background resize-none font-mono"
                  placeholder="定义 Agent 的行为和角色..."
                />
              </div>

              {/* 能力选择 */}
              <div className="py-3">
                <div className="text-sm font-medium mb-3">Agent 能力</div>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(capabilityConfig) as AgentCapability[]).map((capability) => {
                    const cap = capabilityConfig[capability];
                    const enabled = config.capabilities.includes(capability);
                    return (
                      <motion.button
                        key={capability}
                        onClick={() => toggleCapability(capability)}
                        className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-colors ${
                          enabled
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-muted-foreground'
                        }`}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          enabled ? 'bg-primary/10' : 'bg-muted'
                        }`}>
                          {cap.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{cap.label}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {cap.description}
                          </div>
                        </div>
                        {enabled && (
                          <CheckCircle2 size={16} className="text-primary shrink-0" />
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === 'memory' && (
            <motion.div
              key="memory"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4"
            >
              {/* 短期记忆 */}
              <div className="p-4 rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-medium">短期记忆</div>
                    <div className="text-xs text-muted-foreground">当前会话的工作记忆</div>
                  </div>
                  <Toggle
                    checked={config.memory.shortTermEnabled}
                    onChange={(checked) =>
                      updateConfig('memory', { ...config.memory, shortTermEnabled: checked })
                    }
                  />
                </div>
                {config.memory.shortTermEnabled && (
                  <div className="space-y-3 pt-3 border-t">
                    <ConfigItem label="最大条目数" description="短期记忆容量">
                      <NumberInput
                        value={config.memory.maxShortTermItems}
                        onChange={(v) =>
                          updateConfig('memory', { ...config.memory, maxShortTermItems: v })
                        }
                        min={10}
                        max={200}
                        step={10}
                      />
                    </ConfigItem>
                  </div>
                )}
              </div>

              {/* 长期记忆 */}
              <div className="p-4 rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-medium">长期记忆</div>
                    <div className="text-xs text-muted-foreground">跨会话的持久化记忆</div>
                  </div>
                  <Toggle
                    checked={config.memory.longTermEnabled}
                    onChange={(checked) =>
                      updateConfig('memory', { ...config.memory, longTermEnabled: checked })
                    }
                  />
                </div>
                {config.memory.longTermEnabled && (
                  <div className="space-y-3 pt-3 border-t">
                    <ConfigItem label="最大条目数" description="长期记忆容量">
                      <NumberInput
                        value={config.memory.maxLongTermItems}
                        onChange={(v) =>
                          updateConfig('memory', { ...config.memory, maxLongTermItems: v })
                        }
                        min={100}
                        max={5000}
                        step={100}
                      />
                    </ConfigItem>
                  </div>
                )}
              </div>

              {/* 压缩阈值 */}
              <ConfigItem
                label="压缩阈值"
                description="短期记忆超过此数量时触发压缩"
              >
                <NumberInput
                  value={config.memory.compressionThreshold}
                  onChange={(v) =>
                    updateConfig('memory', { ...config.memory, compressionThreshold: v })
                  }
                  min={20}
                  max={100}
                  step={5}
                />
              </ConfigItem>
            </motion.div>
          )}

          {activeSection === 'execution' && (
            <motion.div
              key="execution"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4"
            >
              <ConfigItem
                label="最大迭代次数"
                description="Agent 循环的最大执行次数"
              >
                <NumberInput
                  value={config.execution.maxIterations}
                  onChange={(v) =>
                    updateConfig('execution', { ...config.execution, maxIterations: v })
                  }
                  min={1}
                  max={50}
                  step={1}
                />
              </ConfigItem>

              <ConfigItem
                label="执行超时"
                description="单次执行的最长时间（毫秒）"
              >
                <NumberInput
                  value={config.execution.timeout}
                  onChange={(v) =>
                    updateConfig('execution', { ...config.execution, timeout: v })
                  }
                  min={5000}
                  max={300000}
                  step={5000}
                />
              </ConfigItem>

              <ConfigItem
                label="检查点间隔"
                description="每 N 次迭代保存一次检查点"
              >
                <NumberInput
                  value={config.execution.checkpointInterval}
                  onChange={(v) =>
                    updateConfig('execution', { ...config.execution, checkpointInterval: v })
                  }
                  min={1}
                  max={10}
                  step={1}
                />
              </ConfigItem>

              <div className="p-4 rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-sm font-medium">人机协作</div>
                    <div className="text-xs text-muted-foreground">
                      关键操作前请求用户确认
                    </div>
                  </div>
                  <Toggle
                    checked={config.execution.enableHumanLoop}
                    onChange={(checked) =>
                      updateConfig('execution', { ...config.execution, enableHumanLoop: checked })
                    }
                  />
                </div>
              </div>

              <div className="py-3">
                <div className="text-sm font-medium mb-2">关键操作关键词</div>
                <div className="text-xs text-muted-foreground mb-2">
                  包含这些关键词的操作会触发用户确认
                </div>
                <div className="flex flex-wrap gap-2">
                  {config.execution.criticalActions.map((action, index) => (
                    <motion.span
                      key={action}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="px-2 py-1 text-xs bg-muted rounded-full flex items-center gap-1"
                    >
                      {action}
                      <button
                        onClick={() => {
                          const actions = [...config.execution.criticalActions];
                          actions.splice(index, 1);
                          updateConfig('execution', { ...config.execution, criticalActions: actions });
                        }}
                        className="hover:text-destructive"
                      >
                        ×
                      </button>
                    </motion.span>
                  ))}
                  <input
                    type="text"
                    placeholder="+ 添加"
                    className="w-16 h-6 px-2 text-xs border rounded-full bg-background"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const value = (e.target as HTMLInputElement).value.trim();
                        if (value && !config.execution.criticalActions.includes(value)) {
                          updateConfig('execution', {
                            ...config.execution,
                            criticalActions: [...config.execution.criticalActions, value],
                          });
                        }
                        (e.target as HTMLInputElement).value = '';
                      }
                    }}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === 'tools' && (
            <motion.div
              key="tools"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
            >
              <div className="text-center py-8 text-muted-foreground">
                <Sliders size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">工具配置</p>
                <p className="text-xs mt-1">在工具市场中配置可用工具</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
});

export default AgentConfigPanel;
