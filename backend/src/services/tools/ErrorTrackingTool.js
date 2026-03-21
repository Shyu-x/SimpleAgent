/**
 * 错误跟踪工具
 * 集成 Sentry.io 风格的错误跟踪
 */

class ErrorTrackingTool {
  constructor(options = {}) {
    this.name = 'error_tracking';
    this.description = '错误跟踪 - 报告和查询错误，支持Sentry集成';
    this.category = 'developer';
    this.timeout = options.timeout || 10000;
    this.dsn = options.dsn || process.env.SENTRY_DSN;
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['report', 'query', 'list'],
          description: '操作类型'
        },
        error: {
          type: 'object',
          description: '错误对象 {message, stack, level}'
        },
        options: {
          type: 'object',
          properties: {
            project: { type: 'string', description: '项目名称' },
            level: { type: 'string', enum: ['error', 'warning', 'info'], default: 'error' },
            query: { type: 'string', description: '查询条件' },
            limit: { type: 'number', default: 10, description: '返回数量' }
          }
        }
      },
      required: ['action']
    };
  }

  async execute(params) {
    const { action, error, options = {} } = params;

    try {
      switch (action) {
        case 'report':
          return await this.reportError(error, options);
        case 'query':
          return await this.queryErrors(options);
        case 'list':
          return await this.listProjects(options);
        default:
          return { success: false, error: `未知操作: ${action}` };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async reportError(error, options = {}) {
    const { project = 'default', level = 'error' } = options;

    if (!error || !error.message) {
      return { success: false, error: '错误信息不能为空' };
    }

    const event = {
      event_id: this.generateId(),
      timestamp: new Date().toISOString(),
      level,
      platform: 'node',
      logger: 'agent',
      message: error.message,
      stacktrace: error.stack ? this.parseStack(error.stack) : null,
      tags: {
        project,
        runtime: 'node'
      },
      extra: {
        ...error
      }
    };

    // 如果配置了 Sentry DSN，发送到 Sentry
    if (this.dsn) {
      try {
        await this.sendToSentry(event);
      } catch (e) {
        console.error('Failed to send to Sentry:', e.message);
      }
    }

    // 本地存储（内存中）
    this.storeError(event);

    return {
      success: true,
      eventId: event.event_id,
      message: '错误已报告',
      level
    };
  }

  async sendToSentry(event) {
    const parsed = new URL(this.dsn);
    const projectId = parsed.pathname.slice(1);
    const url = `${parsed.origin}/api/${projectId}/store/?sentry_key=${parsed.username}`;

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(5000)
    });
  }

  parseStack(stack) {
    if (!stack) return null;

    const frames = stack.split('\n')
      .slice(1)
      .map(line => {
        const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
        if (match) {
          return {
            function: match[1],
            filename: match[2],
            lineno: parseInt(match[3]),
            colno: parseInt(match[4])
          };
        }
        return { raw: line.trim() };
      });

    return { frames };
  }

  generateId() {
    return 'xxxxxxxxxxxx'.replace(/x/g, () =>
      Math.floor(Math.random() * 16).toString(16)
    );
  }

  // 简单的内存存储
  storeError(event) {
    if (!this.errors) this.errors = [];
    this.errors.unshift(event);
    // 只保留最近100条
    if (this.errors.length > 100) this.errors = this.errors.slice(0, 100);
  }

  async queryErrors(options = {}) {
    const { query, level, limit = 10 } = options;

    if (!this.errors || this.errors.length === 0) {
      return { success: true, errors: [], total: 0 };
    }

    let filtered = this.errors;

    if (level) {
      filtered = filtered.filter(e => e.level === level);
    }

    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(e =>
        e.message.toLowerCase().includes(q) ||
        (e.tags?.project?.toLowerCase().includes(q))
      );
    }

    return {
      success: true,
      errors: filtered.slice(0, limit).map(e => ({
        eventId: e.event_id,
        message: e.message,
        level: e.level,
        project: e.tags?.project,
        timestamp: e.timestamp
      })),
      total: filtered.length
    };
  }

  async listProjects(options = {}) {
    const { limit = 20 } = options;

    if (!this.errors || this.errors.length === 0) {
      return { success: true, projects: [], total: 0 };
    }

    const projectCounts = {};
    for (const e of this.errors) {
      const p = e.tags?.project || 'default';
      projectCounts[p] = (projectCounts[p] || 0) + 1;
    }

    const projects = Object.entries(projectCounts)
      .map(([name, count]) => ({ name, errorCount: count }))
      .sort((a, b) => b.errorCount - a.errorCount)
      .slice(0, limit);

    return { success: true, projects, total: projects.length };
  }
}

module.exports = ErrorTrackingTool;
