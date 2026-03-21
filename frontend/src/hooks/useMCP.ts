'use client';

import { useState, useCallback } from 'react';
import { API_ENDPOINTS } from '@/lib/apiConfig';

interface MCPTool {
  name: string;
  description: string;
  category: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

interface MCPStatus {
  connectedServers: string[];
  toolsCount: number;
  tools: MCPTool[];
  builtinTools: string[];
}

const API_BASE = API_ENDPOINTS.mcp;

export function useMCP() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<MCPStatus | null>(null);

  // 获取 MCP 状态
  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/status`);
      const data = await response.json();
      if (data.success) {
        setStatus(data);
        return data;
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取状态失败';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 列出所有工具
  const listTools = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/tools`);
      const data = await response.json();
      if (data.success) {
        return data.tools;
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取工具列表失败';
      setError(message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 调用工具
  const callTool = useCallback(async (toolName: string, args: Record<string, any> = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName, args })
      });
      const data = await response.json();
      if (data.success) {
        return data.result;
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '调用工具失败';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 连接到 MCP 服务器
  const connectServer = useCallback(async (serverName: string, command: string, args: string[] = []) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverName, command, args })
      });
      const data = await response.json();
      if (data.success) {
        await fetchStatus(); // 刷新状态
        return data;
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '连接服务器失败';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [fetchStatus]);

  // 断开 MCP 服务器
  const disconnectServer = useCallback(async (serverName: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverName })
      });
      const data = await response.json();
      if (data.success) {
        await fetchStatus(); // 刷新状态
        return data;
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '断开连接失败';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [fetchStatus]);

  // 便捷方法：使用内置工具
  const calculate = useCallback(async (expression: string) => {
    return callTool('calculator_calculate', { expression });
  }, [callTool]);

  const searchWeb = useCallback(async (query: string, limit = 5) => {
    return callTool('websearch_search', { query, limit });
  }, [callTool]);

  return {
    isLoading,
    error,
    status,
    fetchStatus,
    listTools,
    callTool,
    connectServer,
    disconnectServer,
    // 便捷方法
    calculate,
    searchWeb,
  };
}