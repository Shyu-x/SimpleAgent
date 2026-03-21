'use client';

import { memo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Key, Bot, Check, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useToast } from './Toast';
import { AVAILABLE_MODELS } from '@/types';

// MiniMax 单一架构 - 简化的模型配置
export interface MiniMaxConfig {
  apiKey: string;
  modelId: string;
}

// 获取 MiniMax 模型列表
const getMiniMaxModels = (): string[] => {
  return AVAILABLE_MODELS.map(m => m.id);
};

interface MiniMaxConfigPanelProps {
  className?: string;
}

export const MiniMaxConfigPanel = memo(function MiniMaxConfigPanel({
  className = '',
}: MiniMaxConfigPanelProps) {
  const [apiKey, setApiKey] = useState('');
  const [modelId, setModelId] = useState('MiniMax-M2.7-highspeed');
  const [showApiKey, setShowApiKey] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { showToast } = useToast();

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!apiKey.trim()) {
      newErrors.apiKey = '请输入 API Key';
    } else if (!apiKey.startsWith('eyJ') && !apiKey.startsWith('sk-')) {
      newErrors.apiKey = 'MiniMax API Key 格式不正确';
    }

    if (!modelId) {
      newErrors.modelId = '请选择模型';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = useCallback(() => {
    if (!validate()) return;
    showToast('配置已保存', 'success');
  }, [apiKey, modelId, showToast]);

  const models = getMiniMaxModels();

  return (
    <motion.div
      className={`bg-card rounded-xl border p-6 ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* 头部 */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
          <Bot size={20} className="text-primary" />
        </div>
        <div>
          <h3 className="font-semibold">MiniMax 配置</h3>
          <p className="text-xs text-muted-foreground">使用 MiniMax Token Plan API</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* API Key */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">
            API Key
            <span className="text-destructive ml-1">*</span>
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                if (errors.apiKey) setErrors({ ...errors, apiKey: '' });
              }}
              className={`w-full h-10 px-3 pr-10 border rounded-lg bg-background font-mono text-sm ${
                errors.apiKey ? 'border-destructive' : ''
              }`}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.apiKey && (
            <p className="text-xs text-destructive mt-1 flex items-center gap-1">
              <AlertCircle size={12} />
              {errors.apiKey}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            从 MiniMax 控制台获取 Token Plan API Key
          </p>
        </div>

        {/* 模型选择 */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">
            模型
            <span className="text-destructive ml-1">*</span>
          </label>
          <select
            value={modelId}
            onChange={(e) => {
              setModelId(e.target.value);
              if (errors.modelId) setErrors({ ...errors, modelId: '' });
            }}
            className={`w-full h-10 px-3 border rounded-lg bg-background ${
              errors.modelId ? 'border-destructive' : ''
            }`}
          >
            {models.map((model) => (
              <option key={model} value={model}>
                {AVAILABLE_MODELS.find(m => m.id === model)?.name || model}
              </option>
            ))}
          </select>
          {errors.modelId && (
            <p className="text-xs text-destructive mt-1 flex items-center gap-1">
              <AlertCircle size={12} />
              {errors.modelId}
            </p>
          )}
        </div>

        {/* Token Plan 说明 */}
        <div className="p-3 rounded-lg bg-muted/50 border">
          <div className="flex items-start gap-2">
            <Key size={14} className="text-primary mt-0.5" />
            <div className="text-xs">
              <p className="font-medium mb-1">Token Plan 优势</p>
              <ul className="text-muted-foreground space-y-0.5">
                <li>• 包含 M2.7 旗舰编程模型</li>
                <li>• 支持思维链分离 (reasoning_split)</li>
                <li>• 支持多模态 (VL-01)</li>
                <li>• 高速通道可用</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* 保存按钮 */}
      <div className="flex justify-end gap-2 mt-6">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Check size={16} />
          保存配置
        </button>
      </div>
    </motion.div>
  );
});

export default MiniMaxConfigPanel;
