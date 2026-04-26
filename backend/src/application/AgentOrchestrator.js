/**
 * Agent 编排器 - 负责 Agent 相关业务逻辑
 * 将 enhancedAgent.js 和 mcpAgent.js 中的业务逻辑抽取到此处
 */

const {
  EnhancedAgentEngine,
  CheckpointManager,
  DualMemorySystem,
  HumanInTheLoopManager
} = require('../services/enhancedAgentEngine');
const { MiniMaxAgentRunner } = require('../services/miniMaxAgentRunner');

// 会话存储 (内存)
const sessions = new Map();
const miniMaxSessions = new Map();

// 清理过期会话
setInterval(() => {
  const now = Date.now();
  const sessionTimeout = 30 * 60 * 1000;
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastAccess > sessionTimeout) {
      sessions.delete(sessionId);
    }
  }
  for (const [sessionId, session] of miniMaxSessions.entries()) {
    if (now - session.lastActivity > sessionTimeout) {
      miniMaxSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);

class AgentOrchestrator {
  // ==================== 增强 Agent (enhancedAgent.js) ====================

  getOrCreateSession(sessionId) {
    if (!sessions.has(sessionId)) {
      const engine = new EnhancedAgentEngine({
        sessionId,
        enableCheckpoints: true,
        enableHumanLoop: true,
        maxIterations: 10
      });

      // Event: checkpoint_saved - operational info
      engine.on('checkpoint_saved', (checkpoint) => {
        // [Session ${sessionId}] Checkpoint saved: ${checkpoint.id}
      });
      // Event: confirmation_required - operational info
      engine.on('confirmation_required', (confirmation) => {
        // [Session ${sessionId}] Confirmation required: ${confirmation.id}
      });
      // Event: waiting_confirmation - operational info
      engine.on('waiting_confirmation', () => {
        // [Session ${sessionId}] Waiting for confirmation
      });

      sessions.set(sessionId, { engine, createdAt: Date.now(), lastAccess: Date.now() });
    }

    const session = sessions.get(sessionId);
    session.lastAccess = Date.now();
    return session;
  }

  async execute({ sessionId, task, context = {} }) {
    const session = this.getOrCreateSession(sessionId || `session_${Date.now()}`);
    return session.engine.execute(task, context);
  }

  getState(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return null;
    return session.engine.getState();
  }

  pause(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return null;
    session.engine.pause();
    return { checkpoint: session.engine.state.currentCheckpoint };
  }

  resume(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return null;
    session.engine.resume();
    return { success: true };
  }

  saveCheckpoint(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return null;
    return session.engine.checkpointManager.save(sessionId, session.engine.state);
  }

  listCheckpoints(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return null;
    return session.engine.checkpointManager.list(sessionId);
  }

  async restoreFromCheckpoint(sessionId, checkpointId) {
    const session = sessions.get(sessionId);
    if (!session) return null;
    return session.engine.restoreFromCheckpoint(checkpointId);
  }

  getPendingConfirmations(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return null;
    return session.engine.humanLoop.getPending(sessionId);
  }

  respondToConfirmation(sessionId, confirmationId, approved, modifiedInput) {
    const session = sessions.get(sessionId);
    if (!session) return null;
    return session.engine.respondToConfirmation(confirmationId, approved, modifiedInput);
  }

  getMemory(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return null;
    return session.engine.memory.export();
  }

  searchMemory(sessionId, query, limit = 10) {
    const session = sessions.get(sessionId);
    if (!session) return null;
    return session.engine.memory.search(query, { limit });
  }

  promoteMemory(sessionId, content, type, importance) {
    const session = sessions.get(sessionId);
    if (!session) return null;
    return session.engine.memory.promoteToLongTerm({ content, type, importance });
  }

  async cleanupSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return false;
    await session.engine.cleanup();
    sessions.delete(sessionId);
    return true;
  }

  listSessions() {
    return Array.from(sessions.entries()).map(([id, session]) => ({
      id,
      createdAt: session.createdAt,
      lastAccess: session.lastAccess,
      status: session.engine.state.status
    }));
  }

  // ==================== 持久化相关 ====================

  async listPersistentSessions() {
    const AgentEngine = require('../services/agentEngine');
    const engine = new AgentEngine();
    return engine.listSessions();
  }

  async getRecoverableSessions() {
    const AgentEngine = require('../services/agentEngine');
    const engine = new AgentEngine();
    return engine.getRecoverableSessions();
  }

  async executePersistent({ task, context = {}, resumeSessionId }) {
    const AgentEngine = require('../services/agentEngine');
    const engine = new AgentEngine({ autoCheckpoint: true, checkpointEvery: 1 });
    return engine.execute(task, context, resumeSessionId);
  }

  async resumeFromPersistent(sessionId) {
    const AgentEngine = require('../services/agentEngine');
    const engine = new AgentEngine();
    return engine.resumeFromCheckpoint(sessionId);
  }

  async deletePersistentSession(sessionId) {
    const AgentEngine = require('../services/agentEngine');
    const engine = new AgentEngine();
    return engine.deleteSession(sessionId);
  }

  async cleanupExpiredPersistentSessions(maxAgeDays = 7) {
    const AgentEngine = require('../services/agentEngine');
    const engine = new AgentEngine();
    return engine.cleanupExpiredSessions(maxAgeDays * 24 * 60 * 60 * 1000);
  }

  // ==================== MiniMax Agent (mcpAgent.js) ====================

  createMiniMaxSession({ apiKey, baseURL, model, workspaceDir, maxSteps, reasoningSplit, thinkingBudget, showThinking }) {
    const agent = new MiniMaxAgentRunner({
      apiKey,
      baseURL: baseURL || 'https://api.minimaxi.com/anthropic',
      model: model || 'MiniMax-M2.7',
      workspaceDir: workspaceDir || './workspace',
      maxSteps: maxSteps || 50,
      reasoningSplit: reasoningSplit !== false,
      thinkingBudget: thinkingBudget || 8000,
      showThinking: showThinking || false
    });

    const sessionId = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    miniMaxSessions.set(sessionId, {
      agent,
      createdAt: Date.now(),
      lastActivity: Date.now()
    });

    return {
      sessionId,
      tools: agent.getToolSchemas().map(t => ({ name: t.name, description: t.description }))
    };
  }

  getMiniMaxSession(sessionId) {
    return miniMaxSessions.get(sessionId) || null;
  }

  deleteMiniMaxSession(sessionId) {
    if (!miniMaxSessions.has(sessionId)) return false;
    miniMaxSessions.delete(sessionId);
    return true;
  }

  getMiniMaxTools() {
    return [
      {
        name: 'file_read', description: '读取文件内容',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' }, lines: { type: 'integer' } },
          required: ['path']
        }
      },
      {
        name: 'file_write', description: '写入内容到文件',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' }, content: { type: 'string' }, append: { type: 'boolean' } },
          required: ['path', 'content']
        }
      },
      {
        name: 'file_list', description: '列出目录中的文件',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' }, recursive: { type: 'boolean' } }
        }
      },
      {
        name: 'shell', description: '执行 Shell 命令',
        parameters: {
          type: 'object',
          properties: { command: { type: 'string' }, timeout: { type: 'integer' } },
          required: ['command']
        }
      },
      {
        name: 'web_search', description: '搜索网络信息',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' }, max_results: { type: 'integer' } },
          required: ['query']
        }
      }
    ];
  }
}

module.exports = { AgentOrchestrator };
