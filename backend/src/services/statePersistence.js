/**
 * Agent 状态持久化服务
 * 参考 LangGraph 的 Checkpoint 模式实现
 * 支持：检查点保存、故障恢复、长时间运行的工作流
 */

const fs = require('fs').promises;
const path = require('path');
const { createLogger } = require('../infra/logger/AgentLogger');
const logger = createLogger('StatePersistence');
const AppError = require('../common/errors/AppError');

// 默认存储路径
const DEFAULT_STORAGE_PATH = path.join(__dirname, '../../data/agent-states');

/**
 * 检查点状态枚举
 */
const CheckpointStatus = {
  PENDING: 'pending',     // 待执行
  RUNNING: 'running',     // 执行中
  PAUSED: 'paused',       // 已暂停
  COMPLETED: 'completed', // 已完成
  ERROR: 'error',         // 错误
  CHECKPOINT: 'checkpoint' // 检查点保存
};

/**
 * 状态持久化管理器
 */
class StatePersistence {
  constructor(options = {}) {
    this.storagePath = options.storagePath || DEFAULT_STORAGE_PATH;
    this.checkpointInterval = options.checkpointInterval || 5000; // 5秒自动保存
    this.maxCheckpoints = options.maxCheckpoints || 10; // 最多保存10个检查点
    this.currentSession = null;
    this.autoSaveTimer = null;
    this.initialized = false;
  }

  /**
   * 初始化存储目录
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.storagePath, { recursive: true });
      this.initialized = true;
      logger.info(`Initialized at: ${this.storagePath}`);
    } catch (error) {
      logger.error('Init failed:', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * 创建新会话
   */
  async createSession(task, context = {}) {
    await this.initialize();

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session = {
      id: sessionId,
      task,
      context,
      status: CheckpointStatus.PENDING,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      checkpoints: [],
      currentCheckpoint: null,
      metadata: {
        iterations: 0,
        toolCalls: 0,
        errors: 0
      }
    };

    this.currentSession = session;
    await this.saveSession(session);

    logger.info(`Session created: ${sessionId}`);
    return session;
  }

  /**
   * 保存会话状态
   */
  async saveSession(session) {
    await this.initialize();

    const filePath = this.getSessionPath(session.id);
    session.updatedAt = Date.now();

    try {
      await fs.writeFile(filePath, JSON.stringify(session, null, 2));
      return true;
    } catch (error) {
      logger.error('Save session failed:', { error: error.message, stack: error.stack });
      return false;
    }
  }

  /**
   * 加载会话
   */
  async loadSession(sessionId) {
    await this.initialize();

    const filePath = this.getSessionPath(sessionId);

    try {
      const data = await fs.readFile(filePath, 'utf8');
      const session = JSON.parse(data);
      this.currentSession = session;
      return session;
    } catch (error) {
      logger.error('Load session failed:', { error: error.message, stack: error.stack });
      return null;
    }
  }

  /**
   * 创建检查点
   * 参考 LangGraph: 在关键执行点保存完整状态
   */
  async createCheckpoint(sessionId, state) {
    const session = await this.loadSession(sessionId);
    if (!session) {
      throw AppError.agentError('SESSION_NOT_FOUND', `Session not found: ${sessionId}`);
    }

    const checkpointId = `cp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const checkpoint = {
      id: checkpointId,
      createdAt: Date.now(),
      state: {
        iteration: state.iteration || 0,
        status: state.status || CheckpointStatus.RUNNING,
        context: state.context || {},
        toolResults: state.toolResults || [],
        pendingAction: state.pendingAction || null,
        error: state.error || null
      },
      metadata: {
        iteration: state.iteration || 0,
        toolCallsCount: (state.toolResults || []).length
      }
    };

    // 添加到会话检查点列表
    session.checkpoints.push(checkpoint);
    session.currentCheckpoint = checkpointId;
    session.status = CheckpointStatus.CHECKPOINT;
    session.metadata.iterations = state.iteration || 0;

    // 限制检查点数量，删除旧的
    if (session.checkpoints.length > this.maxCheckpoints) {
      session.checkpoints = session.checkpoints.slice(-this.maxCheckpoints);
    }

    await this.saveSession(session);

    logger.info(`Checkpoint created: ${checkpointId}`);
    return checkpoint;
  }

  /**
   * 从检查点恢复
   */
  async restoreFromCheckpoint(sessionId, checkpointId = null) {
    const session = await this.loadSession(sessionId);
    if (!session) {
      throw AppError.agentError('SESSION_NOT_FOUND', `Session not found: ${sessionId}`);
    }

    // 找到要恢复的检查点
    let checkpoint;
    if (checkpointId) {
      checkpoint = session.checkpoints.find(cp => cp.id === checkpointId);
    } else {
      // 默认恢复最新的检查点
      checkpoint = session.checkpoints[session.checkpoints.length - 1];
    }

    if (!checkpoint) {
      throw AppError.notFound(`Checkpoint ${checkpointId || 'latest'}`);
    }

    // 更新会话状态
    session.status = CheckpointStatus.RUNNING;
    session.currentCheckpoint = checkpoint.id;
    await this.saveSession(session);

    logger.info(`Restored from checkpoint: ${checkpoint.id}`);

    return {
      sessionId: session.id,
      task: session.task,
      context: session.context,
      ...checkpoint.state
    };
  }

  /**
   * 启动自动保存
   */
  startAutoSave(getStateCallback) {
    if (this.autoSaveTimer) {
      this.stopAutoSave();
    }

    this.autoSaveTimer = setInterval(async () => {
      if (this.currentSession && getStateCallback) {
        const state = getStateCallback();
        await this.createCheckpoint(this.currentSession.id, state);
      }
    }, this.checkpointInterval);

    logger.info('Auto-save started');
  }

  /**
   * 停止自动保存
   */
  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
      logger.info('Auto-save stopped');
    }
  }

  /**
   * 获取所有会话列表
   */
  async listSessions() {
    await this.initialize();

    try {
      const files = await fs.readdir(this.storagePath);
      const sessions = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.storagePath, file);
          const data = await fs.readFile(filePath, 'utf8');
          const session = JSON.parse(data);
          sessions.push({
            id: session.id,
            task: session.task,
            status: session.status,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            checkpointsCount: session.checkpoints.length
          });
        }
      }

      return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
      logger.error('List sessions failed:', { error: error.message, stack: error.stack });
      return [];
    }
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId) {
    const filePath = this.getSessionPath(sessionId);

    try {
      await fs.unlink(filePath);
      if (this.currentSession && this.currentSession.id === sessionId) {
        this.currentSession = null;
      }
      return true;
    } catch (error) {
      logger.error('Delete session failed:', { error: error.message, stack: error.stack });
      return false;
    }
  }

  /**
   * 获取会话文件路径
   */
  getSessionPath(sessionId) {
    return path.join(this.storagePath, `${sessionId}.json`);
  }

  /**
   * 获取可恢复的会话
   */
  async getRecoverableSessions() {
    const sessions = await this.listSessions();
    return sessions.filter(s =>
      s.status === CheckpointStatus.CHECKPOINT ||
      s.status === CheckpointStatus.PAUSED ||
      s.status === CheckpointStatus.ERROR
    );
  }

  /**
   * 清理过期会话
   */
  async cleanupExpiredSessions(maxAge = 7 * 24 * 60 * 60 * 1000) {
    const sessions = await this.listSessions();
    const now = Date.now();
    let cleaned = 0;

    for (const session of sessions) {
      if (now - session.updatedAt > maxAge) {
        await this.deleteSession(session.id);
        cleaned++;
      }
    }

    logger.info(`Cleaned ${cleaned} expired sessions`);
    return cleaned;
  }
}

module.exports = {
  StatePersistence,
  CheckpointStatus
};