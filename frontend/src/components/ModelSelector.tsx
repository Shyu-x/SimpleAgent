'use client';

/**
 * 模型选择器组件
 *
 * 功能：
 * - 从后端实时获取 MiniMax 平台模型列表
 * - 支持在前端切换模型
 * - 显示模型详情
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, Check, RefreshCw, Zap } from 'lucide-react';
import { isClient } from '@/lib/ssrStorage';

interface PlatformModel {
  id: string;
  display_name: string;
  type: string;
  created_at: string;
}

interface ModelInfo {
  id: string;
  name: string;
  description: string;
  maxTokens: number;
  features: string[];
}

const MODEL_INFO: Record<string, ModelInfo> = {
  'MiniMax-M2.7': {
    id: 'MiniMax-M2.7',
    name: 'M2.7 旗舰编程版',
    description: '最新一代旗舰模型，编程能力最强',
    maxTokens: 100000,
    features: ['编程增强', '长上下文', '思维链']
  },
  'MiniMax-M2.7-highspeed': {
    id: 'MiniMax-M2.7-highspeed',
    name: 'M2.7 高速版',
    description: 'M2.7 高速响应版本',
    maxTokens: 100000,
    features: ['快速响应', '编程增强', '思维链']
  },
  'MiniMax-M2.5': {
    id: 'MiniMax-M2.5',
    name: 'M2.5 标准版',
    description: '平衡性能与速度',
    maxTokens: 100000,
    features: ['编程增强', '长上下文']
  },
  'MiniMax-M2.5-highspeed': {
    id: 'MiniMax-M2.5-highspeed',
    name: 'M2.5 高速版',
    description: 'M2.5 快速响应版本',
    maxTokens: 100000,
    features: ['快速响应', '编程增强']
  },
  'MiniMax-M2.1': {
    id: 'MiniMax-M2.1',
    name: 'M2.1 轻量版',
    description: '轻量级模型，适合简单任务',
    maxTokens: 100000,
    features: ['轻量', '快速']
  },
  'MiniMax-M2': {
    id: 'MiniMax-M2',
    name: 'M2 基础版',
    description: '基础对话模型',
    maxTokens: 100000,
    features: ['基础对话']
  },
  'MiniMax-VL-01': {
    id: 'MiniMax-VL-01',
    name: 'VL-01 多模态版',
    description: '支持图像理解的多模态模型',
    maxTokens: 32000,
    features: ['图像理解', '多模态']
  },
  'MiniMax-Text-01': {
    id: 'MiniMax-Text-01',
    name: 'Text-01 长文本版',
    description: '超长上下文处理',
    maxTokens: 400000,
    features: ['长文本', '400K上下文']
  }
};

export default function ModelSelector() {
  const [models, setModels] = useState<PlatformModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('MiniMax-M2.7');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/models/platform');
      const result = await response.json();

      if (result.success) {
        setModels(result.data.models || []);
        setLastRefresh(new Date());
      } else {
        setError(result.error || '获取模型列表失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const handleModelSelect = (modelId: string) => {
    setSelectedModel(modelId);
    setIsOpen(false);
    // 通过 localStorage 通知 ChatInput (SSR 安全)
    if (isClient()) {
      localStorage.setItem('selected-model', modelId);
    }
    window.dispatchEvent(new CustomEvent('model-change', { detail: { model: modelId } }));
  };

  const currentInfo = MODEL_INFO[selectedModel] || {
    id: selectedModel,
    name: selectedModel,
    description: '自定义模型',
    maxTokens: 100000,
    features: []
  };

  return (
    <div className="relative">
      {/* 当前模型按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 hover:border-blue-500/40 transition-all"
      >
        <Zap size={16} className="text-blue-500" />
        <span className="text-sm font-medium">{currentInfo.name}</span>
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* 下拉面板 */}
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* 下拉内容 */}
          <div className="absolute right-0 top-full mt-2 w-80 bg-[hsl(var(--bg-surface))] border border-[hsl(var(--border-subtle))] rounded-2xl shadow-xl z-50 overflow-hidden">
            {/* 头部 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--border-subtle))]">
              <div>
                <h3 className="font-semibold text-sm">选择模型</h3>
                <p className="text-xs text-[hsl(var(--text-muted))]">
                  {lastRefresh ? `更新于 ${lastRefresh.toLocaleTimeString()}` : '加载中...'}
                </p>
              </div>
              <button
                onClick={fetchModels}
                disabled={loading}
                className="p-2 rounded-lg hover:bg-[hsl(var(--bg-muted))] transition-colors disabled:opacity-50"
                title="刷新模型列表"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* 错误提示 */}
            {error && (
              <div className="px-4 py-2 bg-red-500/10 text-red-500 text-xs">
                {error}
              </div>
            )}

            {/* 模型列表 */}
            <div className="max-h-80 overflow-y-auto">
              {models.map((model) => {
                const info = MODEL_INFO[model.id] || {
                  name: model.display_name || model.id,
                  description: 'MiniMax 模型',
                  maxTokens: 100000,
                  features: []
                };
                const isSelected = selectedModel === model.id;

                return (
                  <button
                    key={model.id}
                    onClick={() => handleModelSelect(model.id)}
                    className={`w-full px-4 py-3 flex items-start gap-3 hover:bg-[hsl(var(--bg-muted))] transition-colors text-left ${
                      isSelected ? 'bg-blue-500/10' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{info.name}</span>
                        {isSelected && (
                          <Check size={14} className="text-blue-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-[hsl(var(--text-muted))] mt-0.5 truncate">
                        {info.description}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {info.features.map((feature) => (
                          <span
                            key={feature}
                            className="px-1.5 py-0.5 text-[10px] bg-[hsl(var(--bg-muted))] rounded"
                          >
                            {feature}
                          </span>
                        ))}
                        <span className="px-1.5 py-0.5 text-[10px] bg-green-500/10 text-green-600 rounded">
                          {(info.maxTokens / 1000).toFixed(0)}K tokens
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}

              {loading && models.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-[hsl(var(--text-muted))]">
                  加载中...
                </div>
              )}
            </div>

            {/* 底部 */}
            <div className="px-4 py-2 border-t border-[hsl(var(--border-subtle))] text-[10px] text-[hsl(var(--text-muted))]">
              模型数据来自 MiniMax 平台 · API 调用可能需要配额
            </div>
          </div>
        </>
      )}
    </div>
  );
}