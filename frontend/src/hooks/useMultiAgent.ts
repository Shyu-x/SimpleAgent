'use client';

import { useState, useCallback } from 'react';
import { API_ENDPOINTS } from '@/lib/apiConfig';

interface Agent {
  id: string;
  role: string;
  goal: string;
  backstory: string;
  tools: string[];
}

interface Task {
  id: string;
  description: string;
  expectedOutput: string;
}

interface Crew {
  id: string;
  agentCount: number;
  taskCount: number;
  process: string;
  completedTasks: number;
}

interface CrewResult {
  crewId: string;
  results: string[];
  taskCount: number;
  agentCount: number;
}

const API_BASE = API_ENDPOINTS.multiagent;

export function useMultiAgent() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [result, setResult] = useState<CrewResult | null>(null);

  // 获取模板
  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/templates`);
      const data = await response.json();
      return data;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch templates' };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 创建 Agent
  const createAgent = useCallback(async (config: Partial<Agent>) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await response.json();
      if (data.success) {
        setAgents(prev => [...prev, data.agent]);
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create agent';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 创建 Task
  const createTask = useCallback(async (config: Partial<Task> & { agentId?: string }) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await response.json();
      if (data.success) {
        setTasks(prev => [...prev, data.task]);
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create task';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 创建 Crew
  const createCrew = useCallback(async (name: string, process: 'sequential' | 'hierarchical' = 'sequential') => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/crew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          agents: agents.map(a => a.id),
          tasks: tasks.map(t => t.id),
          process
        })
      });
      const data = await response.json();
      if (data.success) {
        setCrews(prev => [...prev, data.crew]);
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create crew';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [agents, tasks]);

  // 执行 Crew
  const executeCrew = useCallback(async (config: {
    crewId?: string;
    agents: any[];
    tasks: any[];
    process?: string;
    llmConfig?: any;
  }) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await response.json();
      if (data.success) {
        setResult(data.result);
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to execute crew';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 获取所有 Crews
  const fetchCrews = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/crews`);
      const data = await response.json();
      if (data.success) {
        setCrews(data.crews);
      }
      return data;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch crews' };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 删除 Crew
  const deleteCrew = useCallback(async (crewId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/crew/${crewId}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.success) {
        setCrews(prev => prev.filter(c => c.id !== crewId));
      }
      return data;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to delete crew' };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 清除状态
  const clearAll = useCallback(() => {
    setAgents([]);
    setTasks([]);
    setResult(null);
    setError(null);
  }, []);

  return {
    isLoading,
    error,
    agents,
    tasks,
    crews,
    result,
    fetchTemplates,
    createAgent,
    createTask,
    createCrew,
    executeCrew,
    fetchCrews,
    deleteCrew,
    clearAll
  };
}

// 预定义 Agent 模板
export const AGENT_TEMPLATES = [
  {
    id: 'researcher',
    role: 'Research Analyst',
    goal: 'Research and gather comprehensive information on the given topic',
    backstory: 'You are a veteran researcher with a keen eye for detail and emerging trends in technology and business.',
    icon: 'search'
  },
  {
    id: 'writer',
    role: 'Content Writer',
    goal: 'Create engaging, well-structured content based on research',
    backstory: 'You are an experienced writer known for clear, compelling prose and storytelling.',
    icon: 'edit'
  },
  {
    id: 'editor',
    role: 'Editor',
    goal: 'Review and refine content for clarity, accuracy, and publication quality',
    backstory: 'You are a meticulous editor with years of publishing experience and high standards.',
    icon: 'file-text'
  },
  {
    id: 'coder',
    role: 'Software Developer',
    goal: 'Write clean, efficient, and maintainable code',
    backstory: 'You are a skilled developer focused on best practices, performance, and security.',
    icon: 'code'
  },
  {
    id: 'reviewer',
    role: 'Code Reviewer',
    goal: 'Review code for bugs, security issues, and improvement opportunities',
    backstory: 'You are a senior developer focused on code quality, security, and best practices.',
    icon: 'search'
  }
];

// 预定义工作流模板
export const WORKFLOW_TEMPLATES = [
  {
    id: 'research-write',
    name: '调研写作工作流',
    description: 'Research → Write → Edit',
    agents: ['researcher', 'writer', 'editor'],
    process: 'sequential'
  },
  {
    id: 'code-review',
    name: '代码开发工作流',
    description: 'Code → Review → Fix',
    agents: ['coder', 'reviewer'],
    process: 'sequential'
  },
  {
    id: 'multi-research',
    name: '多角度调研',
    description: 'Parallel research by multiple agents',
    agents: ['researcher', 'researcher', 'writer'],
    process: 'hierarchical'
  }
];