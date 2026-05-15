/**
 * SessionService - 会话服务
 * 使用 Map 替代数组解决 O(n) 查找问题，持久化到文件系统解决内存泄漏
 */

const fs = require('fs').promises;
const path = require('path');
const { createLogger } = require('../infra/logger/AgentLogger');

const logger = createLogger('SessionService');

class SessionService {
  constructor(options = {}) {
    this.dataDir = options.dataDir || './data/sessions';
    this.dataFile = path.join(this.dataDir, 'sessions.json');
    this.sessions = new Map(); // 使用 Map 替代数组，O(1) 查找
  }

  /**
   * 初始化服务，加载持久化数据
   */
  async init() {
    await this._ensureDirectory();
    await this._loadFromDisk();
    logger.info(`SessionService 初始化完成，加载 ${this.sessions.size} 个会话`);
  }

  /**
   * 生成会话 ID
   */
  generateId() {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 生成自动标题（从第一条用户消息提取）
   */
  _generateTitle(content) {
    const title = content.substring(0, 50);
    return title + (content.length > 50 ? '...' : '');
  }

  /**
   * 确保数据目录存在
   */
  async _ensureDirectory() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * 从磁盘加载数据
   */
  async _loadFromDisk() {
    try {
      const data = await fs.readFile(this.dataFile, 'utf-8');
      const arr = JSON.parse(data);
      this.sessions.clear();
      for (const s of arr) {
        this.sessions.set(s.id, s);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn(`加载会话数据失败: ${error.message}，使用空存储`);
      }
      this.sessions.clear();
    }
  }

  /**
   * 保存数据到磁盘
   */
  async _saveToDisk() {
    try {
      const arr = Array.from(this.sessions.values());
      await fs.writeFile(this.dataFile, JSON.stringify(arr, null, 2), 'utf-8');
    } catch (error) {
      logger.error(`保存会话数据失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取所有会话列表（不含消息详情）
   */
  list() {
    return Array.from(this.sessions.values())
      .map(s => ({
        id: s.id,
        title: s.title,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messageCount: s.messages.length
      }))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  /**
   * 获取单个会话
   */
  get(id) {
    return this.sessions.get(id) || null;
  }

  /**
   * 创建会话
   */
  async create(data = {}) {
    const { title = '新对话', messages = [] } = data;
    const session = {
      id: this.generateId(),
      title: String(title).substring(0, 200),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: Array.isArray(messages) ? messages.slice(0, 1000) : []
    };
    this.sessions.set(session.id, session);
    await this._saveToDisk();
    return session;
  }

  /**
   * 更新会话
   */
  async update(id, data = {}) {
    const session = this.sessions.get(id);
    if (!session) {
      return null;
    }
    const { title, messages } = data;
    if (title) {
      session.title = String(title).substring(0, 200);
    }
    if (messages) {
      session.messages = Array.isArray(messages) ? messages.slice(0, 1000) : session.messages;
    }
    session.updatedAt = new Date().toISOString();
    await this._saveToDisk();
    return session;
  }

  /**
   * 添加消息（支持自动生成标题）
   */
  async addMessage(id, message) {
    const session = this.sessions.get(id);
    if (!session) {
      return null;
    }
    const { role, content } = message;
    const msg = {
      role,
      content: String(content).substring(0, 100000),
      timestamp: new Date().toISOString()
    };
    session.messages.push(msg);
    session.updatedAt = new Date().toISOString();

    // 自动生成标题（第一条用户消息）
    if (session.messages.length === 1 && role === 'user') {
      session.title = this._generateTitle(content);
    }

    await this._saveToDisk();
    return msg;
  }

  /**
   * 删除会话
   */
  async delete(id) {
    const session = this.sessions.get(id);
    if (!session) {
      return false;
    }
    this.sessions.delete(id);
    await this._saveToDisk();
    return true;
  }

  /**
   * 清空所有会话
   */
  async clearAll() {
    this.sessions.clear();
    await this._saveToDisk();
    return true;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      total: this.sessions.size,
      oldest: this.sessions.size > 0
        ? Math.min(...Array.from(this.sessions.values()).map(s => new Date(s.createdAt).getTime()))
        : null,
      newest: this.sessions.size > 0
        ? Math.max(...Array.from(this.sessions.values()).map(s => new Date(s.createdAt).getTime()))
        : null
    };
  }
}

// 单例导出
const sessionService = new SessionService();

module.exports = sessionService;