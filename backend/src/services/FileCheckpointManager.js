/**
 * 文件检查点管理器
 * 支持持久化存储、跨会话恢复、自动清理
 */

const fs = require('fs').promises;
const path = require('path');
const { createLogger } = require('../infra/logger/AgentLogger');
const logger = createLogger('FileCheckpointManager');
const AppError = require('../common/errors/AppError');

class FileCheckpointManager {
  constructor(options = {}) {
    this.checkpointDir = options.checkpointDir || './data/checkpoints';
    this.maxCheckpoints = options.maxCheckpoints || 100;
    this.maxAge = options.maxAge || 7 * 24 * 60 * 60 * 1000; // 7天
  }

  /**
   * 确保检查点目录存在
   */
  async ensureDirectory() {
    try {
      await fs.mkdir(this.checkpointDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        logger.error('创建目录失败:', { error: error.message });
      }
    }
  }

  /**
   * 获取检查点文件路径
   */
  getCheckpointPath(sessionId) {
    return path.join(this.checkpointDir, `${sessionId}.json`);
  }

  /**
   * 保存检查点
   */
  async save(sessionId, state) {
    await this.ensureDirectory();

    const checkpoint = {
      id: `cp_${Date.now()}`,
      sessionId,
      state: this.serializeState(state),
      timestamp: Date.now(),
      status: state.status || 'unknown'
    };

    const filePath = this.getCheckpointPath(sessionId);

    try {
      // 读取现有检查点信息
      let existingCheckpoints = [];
      try {
        const metaPath = path.join(this.checkpointDir, '_meta.json');
        const metaData = await fs.readFile(metaPath, 'utf-8');
        existingCheckpoints = JSON.parse(metaData);
      } catch {}

      // 添加新检查点到列表
      existingCheckpoints.push({
        id: checkpoint.id,
        sessionId,
        filePath: `${sessionId}.json`,
        timestamp: checkpoint.timestamp
      });

      // 限制检查点数量
      if (existingCheckpoints.length > this.maxCheckpoints) {
        const toRemove = existingCheckpoints.shift();
        try {
          await fs.unlink(path.join(this.checkpointDir, toRemove.filePath));
        } catch {}
      }

      // 保存元数据
      const metaPath = path.join(this.checkpointDir, '_meta.json');
      await fs.writeFile(metaPath, JSON.stringify(existingCheckpoints, null, 2));

      // 保存检查点数据
      await fs.writeFile(filePath, JSON.stringify(checkpoint, null, 2));

      logger.info(`保存检查点: ${checkpoint.id} (session: ${sessionId})`);

      return checkpoint;
    } catch (error) {
      logger.error('保存检查点失败:', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * 序列化状态（处理不可序列化的部分）
   */
  serializeState(state) {
    return JSON.parse(JSON.stringify(state, (key, value) => {
      // 跳过函数和循环引用
      if (typeof value === 'function') {
        return undefined;
      }
      if (value instanceof Error) {
        return { message: value.message, name: value.name };
      }
      return value;
    }));
  }

  /**
   * 获取最新检查点
   */
  async getLatest(sessionId) {
    try {
      const filePath = this.getCheckpointPath(sessionId);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error(`读取检查点失败 (${sessionId}):`, { error: error.message });
      }
      return null;
    }
  }

  /**
   * 列出所有检查点
   */
  async list() {
    try {
      const metaPath = path.join(this.checkpointDir, '_meta.json');
      const metaData = await fs.readFile(metaPath, 'utf-8');
      return JSON.parse(metaData);
    } catch {
      return [];
    }
  }

  /**
   * 列出指定会话的检查点
   */
  async listBySession(sessionId) {
    const all = await this.list();
    return all.filter(cp => cp.sessionId === sessionId);
  }

  /**
   * 恢复到指定检查点
   */
  async restore(sessionId, checkpointId = null) {
    try {
      const filePath = this.getCheckpointPath(sessionId);
      const data = await fs.readFile(filePath, 'utf-8');
      const checkpoint = JSON.parse(data);

      if (checkpointId && checkpoint.id !== checkpointId) {
        throw AppError.internalError(`Checkpoint ID mismatch: expected ${checkpointId}, got ${checkpoint.id}`);
      }

      logger.info(`恢复检查点: ${checkpoint.id}`);
      return checkpoint;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * 删除检查点
   */
  async delete(sessionId) {
    try {
      const filePath = this.getCheckpointPath(sessionId);
      await fs.unlink(filePath);

      // 更新元数据
      try {
        const metaPath = path.join(this.checkpointDir, '_meta.json');
        const metaData = await fs.readFile(metaPath, 'utf-8');
        let checkpoints = JSON.parse(metaData);
        checkpoints = checkpoints.filter(cp => cp.sessionId !== sessionId);
        await fs.writeFile(metaPath, JSON.stringify(checkpoints, null, 2));
      } catch {}

      logger.info(`删除检查点: ${sessionId}`);
      return true;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error(`删除检查点失败:`, { error: error.message });
      }
      return false;
    }
  }

  /**
   * 清理过期检查点
   */
  async cleanupExpired() {
    try {
      const now = Date.now();
      const all = await this.list();
      const expired = all.filter(cp => now - cp.timestamp > this.maxAge);

      for (const checkpoint of expired) {
        try {
          await fs.unlink(path.join(this.checkpointDir, checkpoint.filePath));
          logger.info(`清理过期检查点: ${checkpoint.sessionId}`);
        } catch {}
      }

      // 更新元数据
      const remaining = all.filter(cp => now - cp.timestamp <= this.maxAge);
      const metaPath = path.join(this.checkpointDir, '_meta.json');
      await fs.writeFile(metaPath, JSON.stringify(remaining, null, 2));

      return expired.length;
    } catch (error) {
      logger.error('清理过期检查点失败:', { error: error.message, stack: error.stack });
      return 0;
    }
  }

  /**
   * 清理所有检查点
   */
  async clearAll() {
    try {
      const all = await this.list();

      for (const checkpoint of all) {
        try {
          await fs.unlink(path.join(this.checkpointDir, checkpoint.filePath));
        } catch {}
      }

      const metaPath = path.join(this.checkpointDir, '_meta.json');
      await fs.writeFile(metaPath, JSON.stringify([], null, 2));

      logger.info('清理所有检查点');
      return true;
    } catch (error) {
      logger.error('清理所有检查点失败:', { error: error.message, stack: error.stack });
      return false;
    }
  }

  /**
   * 获取统计信息
   */
  async getStats() {
    try {
      const all = await this.list();
      const now = Date.now();

      return {
        total: all.length,
        sessions: [...new Set(all.map(cp => cp.sessionId))].length,
        expired: all.filter(cp => now - cp.timestamp > this.maxAge).length,
        oldest: all.length > 0 ? Math.min(...all.map(cp => cp.timestamp)) : null,
        newest: all.length > 0 ? Math.max(...all.map(cp => cp.timestamp)) : null
      };
    } catch {
      return {
        total: 0,
        sessions: 0,
        expired: 0,
        oldest: null,
        newest: null
      };
    }
  }
}

module.exports = FileCheckpointManager;
