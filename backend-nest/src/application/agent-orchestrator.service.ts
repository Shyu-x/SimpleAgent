/**
 * Agent编排器服务 - 负责Agent相关业务逻辑
 * 端口自 backend/src/application/AgentOrchestrator.js
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';

export interface AgentSession {
  id: string;
  engine: any;
  createdAt: number;
  lastAccess: number;
  status: string;
}

export interface MiniMaxSession {
  sessionId: string;
  agent: any;
  createdAt: number;
  lastActivity: number;
  tools: Array<{ name: string; description: string }>;
}

export interface Checkpoint {
  id: string;
  state: any;
  timestamp: number;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

@Injectable()
export class AgentOrchestratorService implements OnModuleDestroy {
  private readonly logger = new Logger(AgentOrchestratorService.name);
  private readonly sessions: Map<string, AgentSession> = new Map();
  private readonly miniMaxSessions: Map<string, MiniMaxSession> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // 清理过期会话
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  private cleanupExpiredSessions() {
    const now = Date.now();
    const sessionTimeout = 30 * 60 * 1000;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastAccess > sessionTimeout) {
        this.sessions.delete(sessionId);
        this.logger.log(`Cleaned up expired session: ${sessionId}`);
      }
    }

    for (const [sessionId, session] of this.miniMaxSessions.entries()) {
      if (now - session.lastActivity > sessionTimeout) {
        this.miniMaxSessions.delete(sessionId);
        this.logger.log(`Cleaned up expired MiniMax session: ${sessionId}`);
      }
    }
  }

  // ==================== Agent会话管理 ====================

  getOrCreateSession(sessionId: string, options: {
    enableCheckpoints?: boolean;
    enableHumanLoop?: boolean;
    maxIterations?: number;
  } = {}): AgentSession {
    if (!this.sessions.has(sessionId)) {
      const session: AgentSession = {
        id: sessionId,
        engine: {
          state: { status: 'idle', currentCheckpoint: null },
          execute: async (task: string, context: any) => ({ task, context, result: 'mock' }),
          pause: () => { session.engine.state.status = 'paused'; },
          resume: () => { session.engine.state.status = 'running'; },
          getState: () => session.engine.state,
          cleanup: async () => {},
        },
        createdAt: Date.now(),
        lastAccess: Date.now(),
        status: 'idle',
      };

      this.sessions.set(sessionId, session);
      this.logger.log(`Created new session: ${sessionId}`);
    }

    const session = this.sessions.get(sessionId)!;
    session.lastAccess = Date.now();
    return session;
  }

  async execute(params: {
    sessionId?: string;
    task: string;
    context?: Record<string, any>;
  }) {
    const { sessionId, task, context = {} } = params;
    const session = this.getOrCreateSession(sessionId || `session_${Date.now()}`);
    session.status = 'running';
    try {
      const result = await session.engine.execute(task, context);
      session.status = 'completed';
      return result;
    } catch (error) {
      session.status = 'error';
      throw error;
    }
  }

  getState(sessionId: string): any {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return session.engine.getState();
  }

  pause(sessionId: string): { checkpoint: Checkpoint | null } {
    const session = this.sessions.get(sessionId);
    if (!session) return { checkpoint: null };
    session.engine.pause();
    return { checkpoint: session.engine.state.currentCheckpoint };
  }

  resume(sessionId: string): { success: boolean } {
    const session = this.sessions.get(sessionId);
    if (!session) return { success: false };
    session.engine.resume();
    return { success: true };
  }

  saveCheckpoint(sessionId: string): Checkpoint | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const checkpoint: Checkpoint = {
      id: `cp_${Date.now()}`,
      state: session.engine.state,
      timestamp: Date.now(),
    };
    session.engine.state.currentCheckpoint = checkpoint;
    return checkpoint;
  }

  listCheckpoints(sessionId: string): Checkpoint[] | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return session.engine.state.checkpoints || [];
  }

  async restoreFromCheckpoint(sessionId: string, checkpointId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const checkpoint = session.engine.state.checkpoints?.find((cp: Checkpoint) => cp.id === checkpointId);
    if (checkpoint) {
      session.engine.state = checkpoint.state;
      return true;
    }
    return false;
  }

  getPendingConfirmations(sessionId: string): any[] | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return session.engine.pendingConfirmations || [];
  }

  respondToConfirmation(
    sessionId: string,
    confirmationId: string,
    approved: boolean,
    modifiedInput?: any,
  ): { success: boolean } {
    const session = this.sessions.get(sessionId);
    if (!session) return { success: false };
    return { success: true };
  }

  getMemory(sessionId: string): any | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return session.engine.memory || {};
  }

  searchMemory(sessionId: string, query: string, limit = 10): any[] | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return [];
  }

  promoteMemory(
    sessionId: string,
    content: string,
    type: string,
    importance: number,
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    return true;
  }

  async cleanupSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    await session.engine.cleanup();
    this.sessions.delete(sessionId);
    return true;
  }

  listSessions(): Array<{
    id: string;
    createdAt: number;
    lastAccess: number;
    status: string;
  }> {
    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      createdAt: session.createdAt,
      lastAccess: session.lastAccess,
      status: session.status,
    }));
  }

  // ==================== MiniMax Agent ====================

  createMiniMaxSession(params: {
    apiKey?: string;
    baseURL?: string;
    model?: string;
    workspaceDir?: string;
    maxSteps?: number;
    reasoningSplit?: boolean;
    thinkingBudget?: number;
    showThinking?: boolean;
  }): { sessionId: string; tools: Array<{ name: string; description: string }> } {
    const {
      apiKey,
      baseURL = 'https://api.minimaxi.com/anthropic',
      model = 'MiniMax-M2.7',
      workspaceDir = './workspace',
      maxSteps = 50,
      reasoningSplit = true,
      thinkingBudget = 8000,
      showThinking = false,
    } = params;

    const sessionId = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const session: MiniMaxSession = {
      sessionId,
      agent: {
        apiKey,
        baseURL,
        model,
        workspaceDir,
        maxSteps,
        reasoningSplit,
        thinkingBudget,
        showThinking,
        getToolSchemas: () => this.getMiniMaxTools(),
      },
      createdAt: Date.now(),
      lastActivity: Date.now(),
      tools: this.getMiniMaxTools(),
    };

    this.miniMaxSessions.set(sessionId, session);
    return { sessionId, tools: session.tools };
  }

  getMiniMaxSession(sessionId: string): MiniMaxSession | null {
    const session = this.miniMaxSessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
    return session || null;
  }

  deleteMiniMaxSession(sessionId: string): boolean {
    if (!this.miniMaxSessions.has(sessionId)) return false;
    this.miniMaxSessions.delete(sessionId);
    return true;
  }

  getMiniMaxTools(): Array<{ name: string; description: string }> {
    return [
      {
        name: 'file_read',
        description: '读取文件内容',
      },
      {
        name: 'file_write',
        description: '写入内容到文件',
      },
      {
        name: 'file_list',
        description: '列出目录中的文件',
      },
      {
        name: 'shell',
        description: '执行Shell命令',
      },
      {
        name: 'web_search',
        description: '搜索网络信息',
      },
    ];
  }
}
