'use client';

import { useState, useCallback } from 'react';
import { API_ENDPOINTS } from '@/lib/apiConfig';

interface Workflow {
  id: string;
  name: string;
  active: boolean;
  nodes: any[];
  connections: any;
}

interface Execution {
  id: string;
  workflowId: string;
  status: string;
  startedAt: string;
  finishedAt: string;
}

interface N8NConfig {
  baseUrl: string;
  hasApiKey: boolean;
}

const API_BASE = API_ENDPOINTS.n8n;

export function useN8N() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<N8NConfig | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);

  // 获取配置
  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/config`);
      const data = await response.json();
      if (data.success) {
        setConfig(data.config);
        return data.config;
      }
      throw new Error(data.error);
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取配置失败';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 测试连接
  const testConnection = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/test`);
      const data = await response.json();
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '连接测试失败';
      return { success: false, message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 获取工作流列表
  const fetchWorkflows = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/workflows`);
      const data = await response.json();
      if (data.success) {
        setWorkflows(data.workflows || []);
        return data.workflows;
      }
      throw new Error(data.error);
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取工作流失败';
      setError(message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 执行工作流
  const executeWorkflow = useCallback(async (workflowId: string, data: Record<string, any> = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId, data })
      });
      const result = await response.json();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : '执行工作流失败';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 触发 Webhook
  const triggerWebhook = useCallback(async (webhookUrl: string, data: Record<string, any> = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl, data })
      });
      const result = await response.json();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : '触发Webhook失败';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 获取执行历史
  const fetchExecutions = useCallback(async (limit = 10) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/executions?limit=${limit}`);
      const data = await response.json();
      if (data.success) {
        setExecutions(data.executions || []);
        return data.executions;
      }
      throw new Error(data.error);
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取执行历史失败';
      setError(message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    error,
    config,
    workflows,
    executions,
    fetchConfig,
    testConnection,
    fetchWorkflows,
    executeWorkflow,
    triggerWebhook,
    fetchExecutions,
  };
}

// 预定义的工作流模板
export const WORKFLOW_TEMPLATES = [
  {
    id: 'email-notification',
    name: '邮件通知',
    description: '发送邮件通知',
    icon: 'mail',
    fields: [
      { name: 'to', label: '收件人', type: 'email', required: true },
      { name: 'subject', label: '主题', type: 'text', required: true },
      { name: 'body', label: '内容', type: 'textarea', required: true }
    ]
  },
  {
    id: 'slack-notification',
    name: 'Slack通知',
    description: '发送Slack消息',
    icon: 'message-square',
    fields: [
      { name: 'channel', label: '频道', type: 'text', required: true },
      { name: 'message', label: '消息内容', type: 'textarea', required: true }
    ]
  },
  {
    id: 'data-processing',
    name: '数据处理',
    description: '处理和转换数据',
    icon: 'refresh-cw',
    fields: [
      { name: 'input', label: '输入数据', type: 'textarea', required: true },
      { name: 'operation', label: '操作', type: 'select', options: ['清洗', '转换', '验证'] }
    ]
  },
  {
    id: 'schedule-task',
    name: '定时任务',
    description: '创建定时执行的任务',
    icon: 'clock',
    fields: [
      { name: 'task', label: '任务名称', type: 'text', required: true },
      { name: 'cron', label: 'Cron表达式', type: 'text', placeholder: '0 9 * * *' }
    ]
  }
];