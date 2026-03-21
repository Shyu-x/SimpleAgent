'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '@/store/chatStore';
import { Sparkles, Bot, Send, Square, Trash2, ChevronDown, ChevronUp, Loader2, Terminal } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';

interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'thinking';
  content: string;
  timestamp: number;
  toolCalls?: Array<{
    name: string;
    input: any;
    result?: any;
  }>;
}

interface AgentConfig {
  sessionId: string | null;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  tools: Array<{
    name: string;
    description: string;
  }>;
  stats: {
    totalTokens: number;
    thinkingTokens: number;
    completionTokens: number;
    steps: number;
  };
}

export default function MiniMaxAgent() {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showThinking, setShowThinking] = useState(true);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [config, setConfig] = useState<AgentConfig>({
    sessionId: null,
    status: 'idle',
    tools: [],
    stats: {
      totalTokens: 0,
      thinkingTokens: 0,
      completionTokens: 0,
      steps: 0
    }
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8081';

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 初始化 Agent 会话
  const initSession = async () => {
    try {
      const apiConfig = useChatStore.getState().apiConfig;

      const response = await fetch(`${backendUrl}/api/minimax-agent/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          apiKey: apiConfig.apiKey,
          baseURL: apiConfig.baseURL || 'https://api.minimaxi.com/anthropic',
          model: apiConfig.model || 'MiniMax-M2.7-highspeed',
          reasoningSplit: apiConfig.reasoningSplit !== false,
          thinkingBudget: apiConfig.thinkingBudget || 8000,
          showThinking: apiConfig.showThinking || false
        })
      });

      const data = await response.json();

      if (data.success) {
        setConfig(prev => ({
          ...prev,
          sessionId: data.sessionId,
          tools: data.tools,
          status: 'idle'
        }));
        return data.sessionId;
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('初始化会话失败:', error);
      setConfig(prev => ({ ...prev, status: 'error' }));
      return null;
    }
  };

  // 执行任务
  const executeTask = async (task: string) => {
    let sessionId = config.sessionId;

    if (!sessionId) {
      sessionId = await initSession();
      if (!sessionId) return;
    }

    // 添加用户消息
    const userMessage: AgentMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: task,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setConfig(prev => ({ ...prev, status: 'running' }));

    try {
      const response = await fetch(`${backendUrl}/api/minimax-agent/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sessionId, task })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

    let currentAssistantMessage: AgentMessage | null = null;
    let currentStepId: string | null = null;

    const processLine = (line: string) => {
      if (!line.startsWith('data: ')) return;
      const data = line.slice(6);
      if (data === '[DONE]' || !data) return;

      try {
        const parsed = JSON.parse(data);

        switch (parsed.type) {
          case 'start':
            // 开始执行
            break;

          case 'step_start':
            // 开始新步骤
            currentStepId = `step_${parsed.step}`;
            currentAssistantMessage = {
              id: `assistant_${Date.now()}`,
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
              toolCalls: []
            };
            break;

          case 'thinking':
            // Thinking 内容
            if (showThinking && currentAssistantMessage) {
              setMessages(prev => {
                const updated = [...prev];
                const lastIndex = updated.length - 1;
                if (updated[lastIndex]?.role === 'thinking') {
                  updated[lastIndex].content += parsed.content;
                } else {
                  updated.push({
                    id: `thinking_${Date.now()}`,
                    role: 'thinking',
                    content: parsed.content,
                    timestamp: Date.now()
                  });
                }
                return updated;
              });
            }
            break;

          case 'tool_call':
            // 工具调用
            if (currentAssistantMessage) {
              currentAssistantMessage.toolCalls?.push({
                name: parsed.tool,
                input: parsed.input,
                result: parsed.result
              });
              currentAssistantMessage.content += `\n[调用工具: ${parsed.tool}] `;
              setMessages(prev => {
                const updated = [...prev];
                const lastIndex = updated.length - 1;
                if (updated[lastIndex]?.id === currentAssistantMessage!.id) {
                  updated[lastIndex] = { ...currentAssistantMessage! };
                } else {
                  updated.push({ ...currentAssistantMessage! });
                }
                return updated;
              });
            }
            break;

          case 'complete':
            // 完成
            if (currentAssistantMessage) {
              currentAssistantMessage.content = parsed.content;
              setMessages(prev => {
                const updated = prev.filter(m => m.role !== 'thinking');
                const lastIndex = updated.length - 1;
                if (updated[lastIndex]?.id === currentAssistantMessage!.id) {
                  updated[lastIndex] = { ...currentAssistantMessage! };
                } else {
                  updated.push({ ...currentAssistantMessage! });
                }
                return updated;
              });
            }
            setConfig(prev => ({
              ...prev,
              status: 'completed',
              stats: {
                totalTokens: parsed.stats?.totalTokens || 0,
                thinkingTokens: parsed.stats?.thinkingTokens || 0,
                completionTokens: parsed.stats?.completionTokens || 0,
                steps: parsed.steps || 0
              }
            }));
            break;

          case 'error':
            setMessages(prev => [
              ...prev.filter(m => m.role !== 'thinking'),
              {
                id: `error_${Date.now()}`,
                role: 'assistant',
                content: `错误: ${parsed.error}`,
                timestamp: Date.now()
              }
            ]);
            setConfig(prev => ({ ...prev, status: 'error' }));
            break;

          case 'done':
            setIsLoading(false);
            break;
        }
      } catch (e) {
        console.error('解析 SSE 数据失败:', e);
      }
    };

    // 读取 SSE 流
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        processLine(line);
      }
    }

    setIsLoading(false);
    } catch (error: any) {
      console.error('执行任务失败:', error);
      setMessages(prev => [
        ...prev.filter(m => m.role !== 'thinking'),
        {
          id: `error_${Date.now()}`,
          role: 'assistant',
          content: `错误: ${error.message}`,
          timestamp: Date.now()
        }
      ]);
      setIsLoading(false);
      setConfig(prev => ({ ...prev, status: 'error' }));
    }
  };

  // 停止执行
  const stopExecution = () => {
    // 使用 fetch 的 SSE 不支持直接停止，这里只是更新 UI 状态
    setIsLoading(false);
    setConfig(prev => ({ ...prev, status: 'idle' }));
  };

  // 清除会话
  const clearSession = async () => {
    if (config.sessionId) {
      await fetch(`${backendUrl}/api/minimax-agent/session/${config.sessionId}`, {
        method: 'DELETE'
      });
    }
    setMessages([]);
    setConfig(prev => ({
      ...prev,
      sessionId: null,
      status: 'idle',
      stats: {
        totalTokens: 0,
        thinkingTokens: 0,
        completionTokens: 0,
        steps: 0
      }
    }));
  };

  // 提交处理
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      executeTask(input);
    }
  };

  // 切换步骤展开
  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stepId)) {
        newSet.delete(stepId);
      } else {
        newSet.add(stepId);
      }
      return newSet;
    });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Bot size={18} className="text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">MiniMax Agent</h2>
            <p className="text-xs text-muted-foreground">
              {config.status === 'running' ? '执行中...' : config.status === 'completed' ? '已完成' : '准备就绪'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 统计信息 */}
          {config.stats.steps > 0 && (
            <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
              <span>步骤: {config.stats.steps}</span>
              <span>Tokens: {config.stats.totalTokens}</span>
            </div>
          )}

          {/* 显示 Thinking 开关 */}
          <button
            onClick={() => setShowThinking(!showThinking)}
            className={`p-2 rounded-lg transition-colors ${
              showThinking ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            }`}
            title={showThinking ? '隐藏思考过程' : '显示思考过程'}
          >
            <Sparkles size={16} />
          </button>

          {/* 清除按钮 */}
          <button
            onClick={clearSession}
            className="p-2 rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="清除会话"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* 工具栏 */}
      <div className="px-4 py-2 border-b bg-muted/20">
        <div className="flex items-center gap-2 text-xs text-muted-foreground overflow-x-auto">
          <Terminal size={12} />
          <span className="shrink-0">可用工具:</span>
          {config.tools.map(tool => (
            <span
              key={tool.name}
              className="px-2 py-0.5 bg-primary/10 text-primary rounded-full shrink-0"
            >
              {tool.name}
            </span>
          ))}
          {config.tools.length === 0 && (
            <span className="text-muted-foreground/50">加载中...</span>
          )}
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <Sparkles size={48} className="mb-4 opacity-30" />
            <p className="text-sm">输入任务开始执行</p>
            <p className="text-xs mt-1 opacity-70">
              Agent 会自动规划并调用工具完成任务
            </p>
          </div>
        )}

        {messages.map(message => {
          if (message.role === 'thinking') {
            if (!showThinking) return null;
            return (
              <div
                key={message.id}
                className="flex gap-3 p-3 rounded-lg bg-muted/50 border-l-2 border-primary/50"
              >
                <Sparkles size={16} className="text-primary shrink-0 mt-1" />
                <div className="flex-1 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">思考过程</p>
                  <pre className="whitespace-pre-wrap font-mono overflow-x-auto">
                    {message.content}
                  </pre>
                </div>
              </div>
            );
          }

          if (message.role === 'user') {
            return (
              <div key={message.id} className="flex gap-3 justify-end">
                <div className="max-w-[80%] rounded-2xl px-4 py-2 bg-primary text-primary-foreground">
                  <p className="text-sm">{message.content}</p>
                </div>
              </div>
            );
          }

          // assistant
          return (
            <div key={message.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
                <Bot size={16} className="text-primary-foreground" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="rounded-2xl px-4 py-2 bg-muted border">
                  <div className="markdown-content text-sm">
                    <MarkdownRenderer content={message.content} />
                  </div>
                </div>

                {/* 工具调用详情 */}
                {message.toolCalls && message.toolCalls.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">
                      工具调用 ({message.toolCalls.length})
                    </p>
                    {message.toolCalls.map((call, idx) => (
                      <div key={idx} className="rounded-lg border bg-muted/30 overflow-hidden">
                        <button
                          onClick={() => toggleStep(`${message.id}_${idx}`)}
                          className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-primary">
                              {call.name}
                            </span>
                          </div>
                          {expandedSteps.has(`${message.id}_${idx}`) ? (
                            <ChevronUp size={14} className="text-muted-foreground" />
                          ) : (
                            <ChevronDown size={14} className="text-muted-foreground" />
                          )}
                        </button>
                        {expandedSteps.has(`${message.id}_${idx}`) && (
                          <div className="px-3 py-2 border-t text-xs space-y-2">
                            <div>
                              <p className="text-muted-foreground">输入:</p>
                              <pre className="mt-1 p-2 bg-background rounded font-mono overflow-x-auto">
                                {JSON.stringify(call.input, null, 2)}
                              </pre>
                            </div>
                            {call.result && (
                              <div>
                                <p className="text-muted-foreground">结果:</p>
                                <pre className={`mt-1 p-2 rounded font-mono overflow-x-auto ${
                                  call.result.success ? 'bg-green-500/10' : 'bg-red-500/10'
                                }`}>
                                  {call.result.success ? call.result.content : call.result.error}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Bot size={16} className="text-primary-foreground" />
            </div>
            <div className="rounded-2xl px-4 py-3 bg-muted border">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={16} className="animate-spin" />
                <span>Agent 正在思考...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <form onSubmit={handleSubmit} className="p-4 border-t bg-background">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入任务描述..."
            disabled={isLoading}
            className="flex-1 rounded-lg border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
          {isLoading ? (
            <button
              type="button"
              onClick={stopExecution}
              className="p-2.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
            >
              <Square size={18} />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="p-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={18} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
