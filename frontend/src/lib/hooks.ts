// Custom hooks for API integration

import { useState, useEffect, useCallback } from 'react';
import { configApi, ragApi, Channel, KnowledgeBase, RetrieveResult } from './api';
import { useToast } from '@/components/Toast';
import { API_ENDPOINTS } from './apiConfig';

const API_BASE_URL = API_ENDPOINTS.base;

// ============ Model Config Hook ============

export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  apiKey: string;
  baseUrl?: string;
  modelId: string;
  enabled: boolean;
  priority: number;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  createdAt: number;
  updatedAt: number;
}

export function useModelConfig() {
  const [configs, setConfigs] = useState<ModelConfig[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  // Load channels from API
  const loadChannels = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await configApi.getChannels();

    if (error) {
      setError(error);
      showToast('加载渠道失败: ' + error, 'error');
    } else if (data) {
      setChannels(data);

      // Convert channels to model configs
      const modelConfigs: ModelConfig[] = data.map((channel, index) => ({
        id: channel.id,
        name: channel.name,
        provider: channel.id,
        apiKey: '',
        baseUrl: channel.baseUrl,
        modelId: channel.defaultModel,
        enabled: channel.enabled,
        priority: index,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));

      // Load API key status
      const { data: keyStatus } = await configApi.getApiKeyStatus();
      if (keyStatus) {
        modelConfigs.forEach((config) => {
          if (keyStatus[config.provider] === 'configured') {
            config.apiKey = '••••••••';
          }
        });
      }

      setConfigs(modelConfigs);
    }

    setLoading(false);
  }, [showToast]);

  // Toggle channel
  const toggleConfig = useCallback(async (id: string) => {
    const { error } = await configApi.toggleChannel(id);

    if (error) {
      showToast('切换失败: ' + error, 'error');
    } else {
      setConfigs((prev) =>
        prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c))
      );
      showToast('状态已更新', 'success');
    }
  }, [showToast]);

  // Update channel
  const updateConfig = useCallback(async (id: string, updates: Partial<ModelConfig>) => {
    const { error } = await configApi.updateChannel(id, {
      name: updates.name,
      baseUrl: updates.baseUrl,
      defaultModel: updates.modelId,
      enabled: updates.enabled,
    });

    if (error) {
      showToast('更新失败: ' + error, 'error');
      return false;
    }

    setConfigs((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c))
    );
    showToast('配置已更新', 'success');
    return true;
  }, [showToast]);

  // Set API key
  const setApiKey = useCallback(async (provider: string, apiKey: string) => {
    const { error } = await configApi.setApiKey(provider, apiKey);

    if (error) {
      showToast('设置 API Key 失败: ' + error, 'error');
      return false;
    }

    setConfigs((prev) =>
      prev.map((c) =>
        c.provider === provider ? { ...c, apiKey: '••••••••' } : c
      )
    );
    showToast('API Key 已保存', 'success');
    return true;
  }, [showToast]);

  // Set default model
  const setDefaultModel = useCallback(async (channel: string, model: string) => {
    const { error } = await configApi.setDefaults(channel, model);

    if (error) {
      showToast('设置默认模型失败: ' + error, 'error');
      return false;
    }

    showToast('默认模型已更新', 'success');
    return true;
  }, [showToast]);

  // Load on mount
  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  return {
    configs,
    channels,
    loading,
    error,
    loadChannels,
    toggleConfig,
    updateConfig,
    setApiKey,
    setDefaultModel,
  };
}

// ============ Knowledge Base Hook ============

export function useKnowledgeBase() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [activeBase, setActiveBase] = useState<KnowledgeBase | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  // Load all knowledge bases
  const loadKnowledgeBases = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await ragApi.listKnowledgeBases();

    if (error) {
      setError(error);
      showToast('加载知识库失败: ' + error, 'error');
    } else if (data) {
      setKnowledgeBases(data.knowledgeBases || []);
    }

    setLoading(false);
  }, [showToast]);

  // Create knowledge base
  const createKnowledgeBase = useCallback(async (name: string, description?: string) => {
    setLoading(true);

    const { data, error } = await ragApi.createKnowledgeBase(name, description);

    if (error) {
      showToast('创建失败: ' + error, 'error');
      setLoading(false);
      return null;
    }

    if (data) {
      setKnowledgeBases((prev) => [...prev, data.knowledgeBase]);
      setActiveBase(data.knowledgeBase);
      showToast('知识库创建成功', 'success');
    }

    setLoading(false);
    return data?.knowledgeBase || null;
  }, [showToast]);

  // Delete knowledge base
  const deleteKnowledgeBase = useCallback(async (id: string) => {
    const { error } = await ragApi.deleteKnowledgeBase(id);

    if (error) {
      showToast('删除失败: ' + error, 'error');
      return false;
    }

    setKnowledgeBases((prev) => prev.filter((kb) => kb.id !== id));
    if (activeBase?.id === id) {
      setActiveBase(null);
    }
    showToast('知识库已删除', 'success');
    return true;
  }, [activeBase, showToast]);

  // Get knowledge base details
  const getKnowledgeBase = useCallback(async (id: string) => {
    setLoading(true);

    const { data, error } = await ragApi.getKnowledgeBase(id);

    if (error) {
      showToast('加载失败: ' + error, 'error');
    } else if (data) {
      setActiveBase(data.knowledgeBase);
    }

    setLoading(false);
  }, [showToast]);

  // Upload file
  const uploadFile = useCallback(async (kbId: string, file: File) => {
    setUploading(true);

    const { data, error } = await ragApi.uploadFile(kbId, file);

    if (error) {
      showToast('上传失败: ' + error, 'error');
      setUploading(false);
      return null;
    }

    showToast('文档上传成功', 'success');

    // Refresh knowledge base
    await getKnowledgeBase(kbId);
    setUploading(false);
    return data;
  }, [getKnowledgeBase, showToast]);

  // Retrieve knowledge
  const retrieve = useCallback(async (kbId: string, query: string, topK = 5) => {
    const { data, error } = await ragApi.retrieve(kbId, query, topK);

    if (error) {
      showToast('检索失败: ' + error, 'error');
      return [];
    }

    return data?.results || [];
  }, [showToast]);

  // Load on mount
  useEffect(() => {
    loadKnowledgeBases();
  }, [loadKnowledgeBases]);

  return {
    knowledgeBases,
    activeBase,
    loading,
    uploading,
    error,
    loadKnowledgeBases,
    createKnowledgeBase,
    deleteKnowledgeBase,
    getKnowledgeBase,
    setActiveBase,
    uploadFile,
    retrieve,
  };
}

// ============ Chat Hook ============

export function useChat() {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const sendMessage = useCallback(async (
    content: string,
    options?: { channel?: string; model?: string; conversationId?: string }
  ) => {
    // Add user message
    setMessages((prev) => [...prev, { role: 'user', content }]);

    // Add placeholder for assistant response
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    setLoading(true);

    try {
      await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: content,
          channel: options?.channel,
          model: options?.model,
          conversationId: options?.conversationId,
        }),
      });

      // Handle SSE response
      // For now, we'll use a simple approach
      // In production, this would handle the streaming response
    } catch (err) {
      showToast('发送消息失败', 'error');
      // Remove the placeholder
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    loading,
    sendMessage,
    clearMessages,
  };
}

const hooks = {
  useModelConfig,
  useKnowledgeBase,
  useChat,
};

export default hooks;