'use client';

import { memo, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  Key,
  Cpu,
  Zap,
  RefreshCw,
  Globe,
  Loader2,
  Check,
  X,
  Cloud,
  Settings,
  Bot,
  Hexagon,
} from 'lucide-react';
import { useToast } from './Toast';
import { configApi, Channel } from '@/lib/api';

// 动画变体
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: -10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2 },
  },
};

// 模型卡片组件
interface ModelCardProps {
  channel: Channel;
  hasKey: boolean;
  onEdit: (id: string) => void;
  onToggle: (id: string) => void;
}

const ModelCard = memo(function ModelCard({
  channel,
  hasKey,
  onEdit,
  onToggle,
}: ModelCardProps) {
  return (
    <motion.div
      className={`rounded-lg border bg-card overflow-hidden ${
        channel.enabled ? '' : 'opacity-60'
      }`}
      variants={itemVariants}
      layout
    >
      <div className="flex items-center gap-3 p-4">
        {/* 图标 */}
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted">
          {channel.id === 'openai' ? <Globe size={20} /> :
           channel.id === 'claude' ? <Bot size={20} /> :
           channel.id === 'zhipu' ? <Hexagon size={20} /> :
           channel.id === 'minimax' ? <Zap size={20} /> : <Settings size={20} />}
        </div>

        {/* 模型信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{channel.name}</span>
            {!channel.enabled && (
              <span className="px-1.5 py-0.5 rounded bg-muted text-xs text-muted-foreground">
                已禁用
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span className="font-mono">{channel.defaultModel}</span>
            <span>•</span>
            <span>{channel.models.length} 个模型</span>
          </div>
        </div>

        {/* API Key 状态 */}
        <div className="flex items-center gap-1 px-2 py-1 rounded bg-muted/50">
          <Key size={12} className={hasKey ? 'text-[hsl(var(--success-500))]' : 'text-muted-foreground'} />
          <span className="text-xs">
            {hasKey ? '已配置' : '未设置'}
          </span>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1">
          <motion.button
            onClick={() => onToggle(channel.id)}
            className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
              channel.enabled
                ? 'text-[hsl(var(--success-500))] hover:bg-[hsl(var(--success-500))/0.2]'
                : 'text-muted-foreground hover:bg-muted'
            }`}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title={channel.enabled ? '禁用' : '启用'}
          >
            <Zap size={16} />
          </motion.button>
          <motion.button
            onClick={() => onEdit(channel.id)}
            className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="编辑"
          >
            <Edit2 size={16} />
          </motion.button>
        </div>
      </div>

      {/* 模型列表 */}
      <div className="px-4 pb-3 flex flex-wrap gap-1">
        {channel.models.slice(0, 4).map((model) => (
          <span
            key={model}
            className={`px-2 py-0.5 rounded text-xs ${
              model === channel.defaultModel
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {model}
          </span>
        ))}
        {channel.models.length > 4 && (
          <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
            +{channel.models.length - 4}
          </span>
        )}
      </div>
    </motion.div>
  );
});

// 编辑表单
interface EditFormProps {
  channel: Channel;
  hasKey: boolean;
  onSave: (id: string, data: { defaultModel: string; apiKey?: string }) => Promise<boolean>;
  onCancel: () => void;
}

const EditForm = memo(function EditForm({
  channel,
  hasKey,
  onSave,
  onCancel,
}: EditFormProps) {
  const [defaultModel, setDefaultModel] = useState(channel.defaultModel);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    const success = await onSave(channel.id, {
      defaultModel,
      apiKey: apiKey || undefined,
    });
    setSaving(false);

    if (success) {
      onCancel();
    }
  }, [channel.id, defaultModel, apiKey, onSave, onCancel]);

  return (
    <motion.div
      className="bg-card rounded-xl border p-6 shadow-lg"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <h3 className="font-semibold mb-4">编辑 {channel.name}</h3>

      <div className="space-y-4">
        {/* 默认模型 */}
        <div>
          <label className="text-sm font-medium mb-1 block">默认模型</label>
          <select
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            className="w-full h-10 px-3 border rounded-lg bg-background"
          >
            {channel.models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </div>

        {/* API Key */}
        <div>
          <label className="text-sm font-medium mb-1 block">
            API Key {hasKey && <span className="text-[hsl(var(--success-500))]">(已配置)</span>}
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full h-10 px-3 pr-10 border rounded-lg bg-background font-mono text-sm"
              placeholder={hasKey ? '输入新的 API Key 更新' : '输入 API Key'}
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Base URL */}
        {channel.baseUrl && (
          <div>
            <label className="text-sm font-medium mb-1 block">Base URL</label>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted">
              <Globe size={14} className="text-muted-foreground" />
              <span className="text-sm font-mono">{channel.baseUrl}</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg hover:bg-muted"
        >
          取消
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : '保存'}
        </button>
      </div>
    </motion.div>
  );
});

// 主组件 - 使用 API 集成
interface MultiModelConfigProps {
  className?: string;
}

export const MultiModelConfig = memo(function MultiModelConfig({
  className='',
}: MultiModelConfigProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [keyStatus, setKeyStatus] = useState<Record<string, 'configured' | 'not_set'>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  // 加载渠道和 API Key 状态
  const loadData = useCallback(async () => {
    setLoading(true);

    const [channelsRes, keysRes] = await Promise.all([
      configApi.getChannels(),
      configApi.getApiKeyStatus(),
    ]);

    if (channelsRes.data) {
      setChannels(channelsRes.data);
    }
    if (keysRes.data) {
      setKeyStatus(keysRes.data);
    }

    setLoading(false);
  }, []);

  // 切换渠道启用状态
  const handleToggle = useCallback(async (id: string) => {
    const { error } = await configApi.toggleChannel(id);

    if (error) {
      showToast('切换失败: ' + error, 'error');
    } else {
      setChannels((prev) =>
        prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c))
      );
      showToast('状态已更新', 'success');
    }
  }, [showToast]);

  // 保存配置
  const handleSave = useCallback(async (id: string, data: { defaultModel: string; apiKey?: string }) => {
    // 更新默认模型
    if (data.defaultModel) {
      const { error } = await configApi.updateChannel(id, {
        defaultModel: data.defaultModel,
      });

      if (error) {
        showToast('更新模型失败: ' + error, 'error');
        return false;
      }

      setChannels((prev) =>
        prev.map((c) => (c.id === id ? { ...c, defaultModel: data.defaultModel } : c))
      );
    }

    // 更新 API Key
    if (data.apiKey) {
      const { error } = await configApi.setApiKey(id, data.apiKey);

      if (error) {
        showToast('设置 API Key 失败: ' + error, 'error');
        return false;
      }

      setKeyStatus((prev) => ({
        ...prev,
        [id]: 'configured',
      }));
    }

    showToast('配置已保存', 'success');
    return true;
  }, [showToast]);

  // 加载数据
  useEffect(() => {
    loadData();
  }, [loadData]);

  const editingChannel = editingId ? channels.find((c) => c.id === editingId) : null;

  return (
    <motion.div
      className={`flex flex-col bg-background border rounded-xl overflow-hidden ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Cpu size={20} className="text-primary" />
          <span className="font-medium">多模型配置</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {channels.filter((c) => c.enabled).length}/{channels.length} 已启用
          </span>
          <motion.button
            onClick={loadData}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="刷新"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </motion.button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* 编辑表单 */}
            <AnimatePresence>
              {editingChannel && (
                <motion.div
                  className="mb-4"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <EditForm
                    channel={editingChannel}
                    hasKey={keyStatus[editingChannel.id] === 'configured'}
                    onSave={handleSave}
                    onCancel={() => setEditingId(null)}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* 渠道列表 */}
            {channels.length > 0 ? (
              <motion.div
                className="space-y-3"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {channels.map((channel) => (
                  <ModelCard
                    key={channel.id}
                    channel={channel}
                    hasKey={keyStatus[channel.id] === 'configured'}
                    onEdit={setEditingId}
                    onToggle={handleToggle}
                  />
                ))}
              </motion.div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <Cpu size={32} className="mb-2 opacity-50" />
                <p className="text-sm">暂无渠道配置</p>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
});

export default MultiModelConfig;
