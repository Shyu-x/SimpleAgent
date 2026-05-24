/**
 * SSE 客户端基类
 * 提供 EventSource 连接管理、重连逻辑、心跳机制等共享功能
 */

import { BACKEND_URL } from '@/lib/config';

// ==================== 类型定义 ====================

export interface SSEClientOptions {
  enabled?: boolean;
  autoConnect?: boolean;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
}

export interface SSEClientState {
  connected: boolean;
  reconnectAttempts: number;
  destroyed: boolean;
}

export interface ConnectionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';
  lastEventTime: number | null;
  reconnectAttempts: number;
  error?: string;
}

// ==================== 事件类型 ====================

export interface BaseSSEEvent {
  type: string;
  [key: string]: unknown;
}

// ==================== SSE 基类 ====================

export abstract class BaseSSEClient<TEvent extends BaseSSEEvent = BaseSSEEvent> {
  protected eventSource: EventSource | null = null;
  protected options: Required<SSEClientOptions>;
  protected reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  protected heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  protected state: SSEClientState = {
    connected: false,
    reconnectAttempts: 0,
    destroyed: false,
  };

  constructor(options: SSEClientOptions = {}) {
    this.options = {
      enabled: options.enabled ?? true,
      autoConnect: options.autoConnect ?? true,
      reconnect: options.reconnect ?? true,
      reconnectInterval: options.reconnectInterval ?? 3000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
      onConnected: options.onConnected ?? (() => {}),
      onDisconnected: options.onDisconnected ?? (() => {}),
      onError: options.onError ?? (() => {}),
    };
  }

  /**
   * 获取 SSE 连接的基础 URL
   */
  protected abstract getEndpoint(): string;

  /**
   * 处理收到的消息事件
   */
  protected abstract handleEvent(data: TEvent): void;

  /**
   * 解析事件数据
   */
  protected parseEventData(e: MessageEvent): TEvent {
    try {
      return JSON.parse(e.data) as TEvent;
    } catch {
      return { type: 'unknown', data: e.data } as unknown as TEvent;
    }
  }

  /**
   * 启动心跳机制
   */
  protected startHeartbeat(intervalMs: number = 30000): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      fetch('/api/health', { method: 'HEAD' }).catch(() => {
        // 忽略心跳错误
      });
    }, intervalMs);
  }

  /**
   * 停止心跳机制
   */
  protected stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * 安排重连
   */
  protected scheduleReconnect(): void {
    if (this.state.destroyed) return;
    if (this.state.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.log('[SSE] 达到最大重连次数');
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.state.reconnectAttempts++;
    console.log(`[SSE] 正在重连... (${this.state.reconnectAttempts}/${this.options.maxReconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      if (!this.state.destroyed) {
        this.destroy();
        this.connect();
      }
    }, this.options.reconnectInterval);
  }

  /**
   * 建立 SSE 连接
   */
  connect(): void {
    if (this.state.destroyed) return;
    if (this.eventSource) {
      this.eventSource.close();
    }

    try {
      const endpoint = this.getEndpoint();
      this.eventSource = new EventSource(endpoint);

      this.eventSource.onopen = () => {
        console.log('[SSE] 连接已建立');
        this.state.connected = true;
        this.state.reconnectAttempts = 0;
        this.options.onConnected();
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data = this.parseEventData(event);
          this.handleEvent(data);
        } catch (error) {
          console.error('[SSE] 消息解析失败:', error);
        }
      };

      this.eventSource.onerror = (error) => {
        console.error('[SSE] 连接错误:', error);
        this.state.connected = false;
        this.options.onError(new Error('SSE 连接错误'));

        if (!this.state.destroyed && this.options.reconnect) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      console.error('[SSE] 创建连接失败:', error);
      this.options.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.destroy();
    this.options.onDisconnected();
  }

  /**
   * 销毁连接
   */
  protected destroy(): void {
    this.state.destroyed = true;
    this.state.connected = false;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.stopHeartbeat();

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.state.connected && !this.state.destroyed;
  }

  /**
   * 获取重连次数
   */
  getReconnectAttempts(): number {
    return this.state.reconnectAttempts;
  }
}

// ==================== 管理后台 SSE 客户端 ====================

export interface AdminSSEEvent extends BaseSSEEvent {
  type: 'connected' | 'stats' | 'qdrant_status' | 'qdrant_collections' | 'heartbeat' | 'error';
  clientId?: string;
  data?: unknown;
  message?: string;
}

export interface SystemStats {
  totalRequests: number;
  successRate: number;
  avgLatency: number;
  activeSessions: number;
  modelCalls: { model: string; count: number }[];
  toolCalls: { tool: string; count: number }[];
  knowledgeBases: { name: string; docCount: number }[];
}

export interface QdrantStatus {
  success: boolean;
  healthy: boolean;
  status: string;
  collection: string;
}

export interface CollectionInfo {
  name: string;
  vectorsCount: number;
  pointsCount: number;
  status: string;
  indexed: boolean;
}

export interface AdminSSEClientOptions extends SSEClientOptions {
  onStatsUpdate?: (stats: SystemStats) => void;
  onQdrantStatusChange?: (status: QdrantStatus) => void;
  onCollectionsUpdate?: (collections: CollectionInfo[]) => void;
}

export class AdminSSEClient extends BaseSSEClient<AdminSSEEvent> {
  private adminOptions: Required<AdminSSEClientOptions>;

  constructor(options: AdminSSEClientOptions = {}) {
    super(options);
    this.adminOptions = {
      ...this.options,
      onStatsUpdate: options.onStatsUpdate ?? (() => {}),
      onQdrantStatusChange: options.onQdrantStatusChange ?? (() => {}),
      onCollectionsUpdate: options.onCollectionsUpdate ?? (() => {}),
    };
  }

  protected getEndpoint(): string {
    return `${BACKEND_URL}/api/admin/stream`;
  }

  protected handleEvent(data: AdminSSEEvent): void {
    switch (data.type) {
      case 'connected':
        console.log('[AdminSSE] 连接确认, clientId:', data.clientId);
        break;

      case 'stats':
        if (data.data) {
          this.adminOptions.onStatsUpdate(data.data as SystemStats);
        }
        break;

      case 'qdrant_status':
        if (data.data) {
          this.adminOptions.onQdrantStatusChange(data.data as QdrantStatus);
        }
        break;

      case 'qdrant_collections':
        if (data.data) {
          this.adminOptions.onCollectionsUpdate(data.data as CollectionInfo[]);
        }
        break;

      case 'heartbeat':
        break;

      case 'error':
        console.error('[AdminSSE] 服务器错误:', data.message);
        break;
    }
  }
}

// ==================== HITL SSE 客户端 ====================

export interface HITLCheckpoint {
  id: string;
  type: string;
  title: string;
  description?: string;
  status: 'pending' | 'approved' | 'rejected' | 'timeout' | 'cancelled';
  createdAt: number;
  respondedAt?: number;
  response?: {
    option?: string;
    comment?: string;
    reason?: string;
  };
  context?: Record<string, unknown>;
  riskLevel?: 'high' | 'medium' | 'low';
  estimatedTime?: string;
  impact?: {
    scope?: string;
    affectedFiles?: string[];
    affectedSystems?: string[];
    dataChanges?: string;
    sideEffects?: string[];
  };
  command?: string;
  warnings?: string[];
  similarOperationKey?: string;
}

export interface HITLSSEEvent extends BaseSSEEvent {
  type: 'connected' | 'pending_checkpoints' | 'confirmation' | 'error';
  clientId?: string;
  checkpoints?: HITLCheckpoint[];
  subtype?: 'created' | 'approved' | 'rejected' | 'timeout';
  checkpoint?: HITLCheckpoint;
  message?: string;
}

export type RiskLevel = 'high' | 'medium' | 'low';

export interface HITLSSEClientOptions extends SSEClientOptions {
  onConfirmation?: (checkpoint: HITLCheckpoint) => void;
  onApproved?: (checkpoint: HITLCheckpoint) => void;
  onRejected?: (checkpoint: HITLCheckpoint) => void;
  onTimeout?: (checkpoint: HITLCheckpoint) => void;
}

export class HITLSSEClient extends BaseSSEClient<HITLSSEEvent> {
  private hitlOptions: Required<HITLSSEClientOptions>;

  constructor(options: HITLSSEClientOptions = {}) {
    super(options);
    this.hitlOptions = {
      ...this.options,
      onConfirmation: options.onConfirmation ?? (() => {}),
      onApproved: options.onApproved ?? (() => {}),
      onRejected: options.onRejected ?? (() => {}),
      onTimeout: options.onTimeout ?? (() => {}),
    };
  }

  protected getEndpoint(): string {
    if (typeof window === 'undefined') return '';
    return `${BACKEND_URL}/api/hitl/sse`;
  }

  protected handleEvent(data: HITLSSEEvent): void {
    switch (data.type) {
      case 'connected':
        console.log('[HITL SSE] 连接确认, clientId:', data.clientId);
        break;

      case 'pending_checkpoints':
        console.log('[HITL SSE] 待处理确认:', data.checkpoints?.length);
        break;

      case 'confirmation':
        if (data.checkpoint) {
          switch (data.subtype) {
            case 'created':
              console.log('[HITL SSE] 请求确认:', data.checkpoint.title);
              this.hitlOptions.onConfirmation(data.checkpoint);
              break;
            case 'approved':
              console.log('[HITL SSE] 确认通过:', data.checkpoint.id);
              this.hitlOptions.onApproved(data.checkpoint);
              break;
            case 'rejected':
              console.log('[HITL SSE] 确认拒绝:', data.checkpoint.id);
              this.hitlOptions.onRejected(data.checkpoint);
              break;
            case 'timeout':
              console.log('[HITL SSE] 确认超时:', data.checkpoint.id);
              this.hitlOptions.onTimeout(data.checkpoint);
              break;
          }
        }
        break;

      case 'error':
        console.error('[HITL SSE] 服务器错误:', data.message);
        break;
    }
  }
}

// ==================== Agent SSE 客户端 ====================

export interface AgentSSEEvent extends BaseSSEEvent {
  type: string;
  taskId?: string;
  agentId?: string;
  progress?: number;
  message?: string;
  result?: string;
  error?: string;
  request?: { id: string; type: string; title: string; message: string };
}

export interface AgentSSEClientOptions extends SSEClientOptions {
  sessionId: string;
  onOpen?: () => void;
  onMessage?: (event: AgentSSEEvent) => void;
  onClose?: () => void;
  onTaskStart?: (taskId: string, agentId: string) => void;
  onTaskProgress?: (taskId: string, progress: number, message?: string) => void;
  onTaskComplete?: (taskId: string, result: string) => void;
  onTaskError?: (taskId: string, error: string) => void;
  onWorkflowComplete?: (result: string) => void;
  onWorkflowError?: (error: string) => void;
  onConfirmation?: (request: { id: string; type: string; title: string; message: string }) => void;
}

export class AgentSSEClient extends BaseSSEClient<AgentSSEEvent> {
  private agentOptions: Required<AgentSSEClientOptions>;

  constructor(options: AgentSSEClientOptions) {
    const defaultOptions: SSEClientOptions = {
      enabled: true,
      autoConnect: true,
      reconnect: true,
      reconnectInterval: 3000,
      maxReconnectAttempts: 10,
    };
    super({ ...defaultOptions, ...options });

    this.agentOptions = {
      ...this.options,
      sessionId: options.sessionId,
      onOpen: options.onOpen ?? (() => {}),
      onMessage: options.onMessage ?? (() => {}),
      onClose: options.onClose ?? (() => {}),
      onTaskStart: options.onTaskStart ?? (() => {}),
      onTaskProgress: options.onTaskProgress ?? (() => {}),
      onTaskComplete: options.onTaskComplete ?? (() => {}),
      onTaskError: options.onTaskError ?? (() => {}),
      onWorkflowComplete: options.onWorkflowComplete ?? (() => {}),
      onWorkflowError: options.onWorkflowError ?? (() => {}),
      onConfirmation: options.onConfirmation ?? (() => {}),
    };
  }

  protected getEndpoint(): string {
    return `${BACKEND_URL}/api/multiagent/sse`;
  }

  protected handleEvent(data: AgentSSEEvent): void {
    switch (data.type) {
      case 'task_start':
        this.agentOptions.onTaskStart(data.taskId || '', data.agentId || '');
        break;
      case 'task_progress':
        this.agentOptions.onTaskProgress(data.taskId || '', data.progress || 0, data.message);
        break;
      case 'task_complete':
        this.agentOptions.onTaskComplete(data.taskId || '', data.result || '');
        break;
      case 'task_error':
        this.agentOptions.onTaskError(data.taskId || '', data.error || '');
        break;
      case 'workflow_complete':
        this.agentOptions.onWorkflowComplete(data.result || '');
        break;
      case 'workflow_error':
        this.agentOptions.onWorkflowError(data.error || '');
        break;
      case 'confirmation':
        if (data.request) {
          this.agentOptions.onConfirmation(data.request);
        }
        break;
    }
  }

  connect(): void {
    if (this.state.destroyed) return;
    if (this.eventSource) {
      this.eventSource.close();
    }

    try {
      const urlObj = new URL(this.getEndpoint());
      urlObj.searchParams.set('sessionId', this.agentOptions.sessionId);

      this.eventSource = new EventSource(urlObj.toString(), {
        withCredentials: true,
      });

      this.eventSource.onopen = () => {
        console.log('[AgentSSE] 连接已建立');
        this.state.connected = true;
        this.state.reconnectAttempts = 0;
        this.startHeartbeat();
        this.options.onConnected();
      };

      // 注册所有事件监听器
      this.registerEventListeners();

      this.eventSource.onerror = (e) => {
        console.error('[AgentSSE] 连接错误:', e);
        this.state.connected = false;
        this.options.onError(new Error('SSE 连接错误'));

        if (!this.state.destroyed && this.options.reconnect) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      console.error('[AgentSSE] 创建连接失败:', error);
      this.options.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private registerEventListeners(): void {
    if (!this.eventSource) return;

    const eventTypes = [
      'task_start',
      'task_progress',
      'task_complete',
      'task_error',
      'agent_status',
      'tool_call',
      'workflow_complete',
      'workflow_error',
      'confirmation',
      'progress',
      'heartbeat',
    ];

    eventTypes.forEach((eventType) => {
      this.eventSource!.addEventListener(eventType, (e) => {
        const data = this.parseEventData(e);
        this.handleEvent(data);
      });
    });
  }
}