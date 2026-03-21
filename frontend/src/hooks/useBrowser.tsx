'use client';

import { useState, useCallback } from 'react';
import { API_ENDPOINTS } from '@/lib/apiConfig';

interface BrowserSession {
  id: string;
  createdAt: number;
}

interface BrowserState {
  initialized: boolean;
  sessions: string[];
  sessionCount: number;
}

const API_BASE = API_ENDPOINTS.browser;

export function useBrowser() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<BrowserState | null>(null);
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);

  // 初始化浏览器
  const initBrowser = useCallback(async (browserType = 'chromium') => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ browserType })
      });
      const data = await response.json();
      if (data.success) {
        setStatus(prev => prev ? { ...prev, initialized: true } : { initialized: true, sessions: [], sessionCount: 0 });
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '初始化失败';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 创建会话
  const createSession = useCallback(async (sessionId?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      const data = await response.json();
      if (data.success) {
        setCurrentSession(data.sessionId);
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '创建会话失败';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 导航
  const navigate = useCallback(async (url: string) => {
    if (!currentSession) return { success: false, error: 'No active session' };

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, url })
      });
      const data = await response.json();
      if (data.screenshot) {
        setScreenshot(data.screenshot);
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '导航失败';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [currentSession]);

  // 点击
  const click = useCallback(async (selector: string) => {
    if (!currentSession) return { success: false, error: 'No active session' };

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/click`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, selector })
      });
      const data = await response.json();
      if (data.screenshot) {
        setScreenshot(data.screenshot);
      }
      return data;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Click failed' };
    } finally {
      setIsLoading(false);
    }
  }, [currentSession]);

  // 输入
  const type = useCallback(async (selector: string, text: string) => {
    if (!currentSession) return { success: false, error: 'No active session' };

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/type`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, selector, text })
      });
      return await response.json();
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Type failed' };
    } finally {
      setIsLoading(false);
    }
  }, [currentSession]);

  // 获取内容
  const getContent = useCallback(async () => {
    if (!currentSession) return { success: false, error: 'No active session' };

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession })
      });
      return await response.json();
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Get content failed' };
    } finally {
      setIsLoading(false);
    }
  }, [currentSession]);

  // 截图
  const takeScreenshot = useCallback(async () => {
    if (!currentSession) return null;

    try {
      const response = await fetch(`${API_BASE}/screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession })
      });
      const data = await response.json();
      if (data.screenshot) {
        setScreenshot(data.screenshot);
      }
      return data.screenshot;
    } catch (err) {
      return null;
    }
  }, [currentSession]);

  // 滚动
  const scroll = useCallback(async (direction: 'up' | 'down' = 'down', amount = 500) => {
    if (!currentSession) return { success: false, error: 'No active session' };

    try {
      const response = await fetch(`${API_BASE}/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, direction, amount })
      });
      const data = await response.json();
      if (data.success) {
        await takeScreenshot();
      }
      return data;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Scroll failed' };
    }
  }, [currentSession, takeScreenshot]);

  // 关闭会话
  const closeSession = useCallback(async () => {
    if (!currentSession) return { success: false, error: 'No active session' };

    try {
      const response = await fetch(`${API_BASE}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession })
      });
      const data = await response.json();
      if (data.success) {
        setCurrentSession(null);
        setScreenshot(null);
      }
      return data;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Close failed' };
    }
  }, [currentSession]);

  // 获取状态
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/status`);
      const data = await response.json();
      if (data.success) {
        setStatus(data);
      }
      return data;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Status fetch failed' };
    }
  }, []);

  return {
    isLoading,
    error,
    status,
    currentSession,
    screenshot,
    initBrowser,
    createSession,
    navigate,
    click,
    type,
    getContent,
    takeScreenshot,
    scroll,
    closeSession,
    fetchStatus,
  };
}

// 便捷组件：浏览器控制面板
export function BrowserControlPanel() {
  const {
    isLoading,
    currentSession,
    screenshot,
    initBrowser,
    createSession,
    navigate,
    takeScreenshot,
    closeSession
  } = useBrowser();

  const [url, setUrl] = useState('');

  const handleNavigate = async () => {
    if (!url) return;
    if (!currentSession) {
      await createSession();
    }
    await navigate(url);
  };

  return (
    <div className="p-4 border rounded-lg space-y-4">
      <h3 className="font-semibold">浏览器自动化</h3>

      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="输入 URL..."
          className="flex-1 px-3 py-2 border rounded"
        />
        <button
          onClick={handleNavigate}
          disabled={isLoading}
          className="px-4 py-2 bg-primary text-primary-foreground rounded disabled:opacity-50"
        >
          导航
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => initBrowser()}
          className="px-3 py-1 bg-muted rounded"
        >
          初始化
        </button>
        <button
          onClick={() => createSession()}
          className="px-3 py-1 bg-muted rounded"
        >
          新建会话
        </button>
        <button
          onClick={() => takeScreenshot()}
          className="px-3 py-1 bg-muted rounded"
        >
          截图
        </button>
        <button
          onClick={() => closeSession()}
          className="px-3 py-1 bg-destructive text-primary-foreground rounded"
        >
          关闭
        </button>
      </div>

      {screenshot && (
        <div className="mt-4">
          <img src={screenshot} alt="Browser screenshot" className="max-w-full border rounded" />
        </div>
      )}
    </div>
  );
}
