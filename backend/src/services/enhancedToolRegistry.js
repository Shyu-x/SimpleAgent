/**
 * 增强版工具注册中心
 * 支持工具验证、权限控制、执行超时、结果缓存
 */

const { AgentError, ErrorCodes } = require('./errorHandler');
const AppError = require('../common/errors/AppError');

/**
 * 工具权限级别
 */
const PermissionLevel = {
  READ: 'read',           // 只读操作
  WRITE: 'write',         // 写入操作
  EXECUTE: 'execute',     // 执行操作
  ADMIN: 'admin'          // 管理操作
};

/**
 * 工具验证器
 */
class ToolValidator {
  constructor() {
    this.schemas = new Map();
  }

  /**
   * 注册工具 schema
   */
  registerSchema(toolName, schema) {
    this.schemas.set(toolName, schema);
  }

  /**
   * 验证输入参数
   */
  validate(toolName, input) {
    const schema = this.schemas.get(toolName);

    if (!schema) {
      return { valid: true }; // 无 schema 则跳过验证
    }

    const errors = [];

    // 检查必需参数
    if (schema.required) {
      for (const field of schema.required) {
        if (input[field] === undefined) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    // 检查参数类型
    if (schema.properties) {
      for (const [field, propSchema] of Object.entries(schema.properties)) {
        const value = input[field];

        if (value !== undefined) {
          const typeError = this.validateType(field, value, propSchema);
          if (typeError) {
            errors.push(typeError);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证类型
   */
  validateType(field, value, schema) {
    const expectedType = schema.type;
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (expectedType && actualType !== expectedType) {
      return `Field '${field}' should be ${expectedType}, got ${actualType}`;
    }

    // 检查枚举值
    if (schema.enum && !schema.enum.includes(value)) {
      return `Field '${field}' must be one of: ${schema.enum.join(', ')}`;
    }

    // 检查最小值
    if (schema.minimum !== undefined && value < schema.minimum) {
      return `Field '${field}' must be >= ${schema.minimum}`;
    }

    // 检查最大值
    if (schema.maximum !== undefined && value > schema.maximum) {
      return `Field '${field}' must be <= ${schema.maximum}`;
    }

    // 检查最小长度
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      return `Field '${field}' must have at least ${schema.minLength} characters`;
    }

    // 检查最大长度
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      return `Field '${field}' must have at most ${schema.maxLength} characters`;
    }

    // 检查正则模式
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      return `Field '${field}' must match pattern: ${schema.pattern}`;
    }

    return null;
  }
}

/**
 * 工具执行缓存
 */
class ToolCache {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.ttl = options.ttl || 60000; // 默认缓存1分钟
    this.maxSize = options.maxSize || 100;
    this.cache = new Map();
  }

  /**
   * 生成缓存键
   */
  generateKey(toolName, input) {
    const inputHash = JSON.stringify(input);
    return `${toolName}:${inputHash}`;
  }

  /**
   * 获取缓存
   */
  get(toolName, input) {
    if (!this.enabled) return null;

    const key = this.generateKey(toolName, input);
    const cached = this.cache.get(key);

    if (cached && Date.now() < cached.expiry) {
      return cached.result;
    }

    // 清除过期缓存
    if (cached) {
      this.cache.delete(key);
    }

    return null;
  }

  /**
   * 设置缓存
   */
  set(toolName, input, result) {
    if (!this.enabled) return;

    // 限制缓存大小
    if (this.cache.size >= this.maxSize) {
      this.prune();
    }

    const key = this.generateKey(toolName, input);
    this.cache.set(key, {
      result,
      expiry: Date.now() + this.ttl,
      createdAt: Date.now()
    });
  }

  /**
   * 清理过期缓存
   */
  prune() {
    const now = Date.now();
    for (const [key, value] of this.cache) {
      if (now >= value.expiry) {
        this.cache.delete(key);
      }
    }

    // 如果仍然超过限制，删除最旧的
    if (this.cache.size >= this.maxSize) {
      let oldestKey = null;
      let oldestTime = Infinity;

      for (const [key, value] of this.cache) {
        if (value.createdAt < oldestTime) {
          oldestTime = value.createdAt;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }

  /**
   * 清除所有缓存
   */
  clear() {
    this.cache.clear();
  }

  /**
   * 获取缓存统计
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      enabled: this.enabled,
      ttl: this.ttl
    };
  }
}

/**
 * 增强版工具注册中心
 */
class EnhancedToolRegistry {
  constructor(options = {}) {
    this.tools = new Map();
    this.validator = new ToolValidator();
    this.cache = new ToolCache(options.cache || {});
    this.permissions = new Map(); // 工具权限映射
    this.timeouts = new Map(); // 工具超时映射
    this.defaultTimeout = options.defaultTimeout || 30000;
    this.defaultPermission = options.defaultPermission || PermissionLevel.READ;
    this.executionLog = [];
    this.maxLogSize = options.maxLogSize || 100;
  }

  /**
   * 注册工具
   */
  register(tool, options = {}) {
    if (!tool.name || !tool.execute) {
      throw AppError.validationError('name and execute', 'Tool must have name and execute function');
    }

    const toolConfig = {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.parameters || {},
      inputSchema: tool.inputSchema || tool.parameters,
      execute: tool.execute.bind(tool),
      category: tool.category || 'general',
      permission: options.permission || tool.permission || this.defaultPermission,
      timeout: options.timeout || tool.timeout || this.defaultTimeout,
      cacheable: options.cacheable !== false && tool.cacheable !== false,
      validate: options.validate !== false
    };

    this.tools.set(tool.name, toolConfig);

    // 注册验证 schema
    if (toolConfig.inputSchema) {
      this.validator.registerSchema(tool.name, toolConfig.inputSchema);
    }

    return this;
  }

  /**
   * 批量注册工具
   */
  registerMany(tools) {
    tools.forEach(tool => this.register(tool));
    return this;
  }

  /**
   * 获取工具
   */
  get(name) {
    return this.tools.get(name);
  }

  /**
   * 执行工具
   */
  async execute(toolName, input, options = {}) {
    const tool = this.tools.get(toolName);

    if (!tool) {
      throw new AgentError(
        `Tool not found: ${toolName}`,
        ErrorCodes.TOOL_NOT_FOUND,
        { toolName }
      );
    }

    const startTime = Date.now();
    const logEntry = {
      toolName,
      input: this.sanitizeInput(input),
      timestamp: startTime,
      status: 'pending'
    };

    try {
      // 1. 检查权限
      if (options.permission && !this.checkPermission(toolName, options.permission)) {
        throw new AgentError(
          `Permission denied for tool: ${toolName}`,
          ErrorCodes.TOOL_PERMISSION_DENIED,
          { toolName, required: tool.permission, provided: options.permission }
        );
      }

      // 2. 验证输入
      if (tool.validate) {
        const validation = this.validator.validate(toolName, input);
        if (!validation.valid) {
          throw new AgentError(
            `Invalid input: ${validation.errors.join(', ')}`,
            ErrorCodes.INVALID_TOOL_INPUT,
            { toolName, errors: validation.errors }
          );
        }
      }

      // 3. 检查缓存
      if (tool.cacheable) {
        const cached = this.cache.get(toolName, input);
        if (cached) {
          logEntry.status = 'cached';
          logEntry.duration = Date.now() - startTime;
          this.logExecution(logEntry);
          return cached;
        }
      }

      // 4. 带超时执行
      const timeout = options.timeout || tool.timeout;
      const result = await this.executeWithTimeout(
        tool.execute,
        input,
        timeout
      );

      // 5. 缓存结果
      if (tool.cacheable && result.success !== false) {
        this.cache.set(toolName, input, result);
      }

      logEntry.status = 'success';
      logEntry.duration = Date.now() - startTime;
      this.logExecution(logEntry);

      return result;

    } catch (error) {
      logEntry.status = 'error';
      logEntry.error = error.message;
      logEntry.duration = Date.now() - startTime;
      this.logExecution(logEntry);

      if (error instanceof AgentError) {
        throw error;
      }

      throw new AgentError(
        `Tool execution failed: ${error.message}`,
        ErrorCodes.TOOL_EXECUTION_FAILED,
        { toolName, originalError: error.message }
      );
    }
  }

  /**
   * 带超时执行
   */
  async executeWithTimeout(fn, input, timeout) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new AgentError(
          `Tool execution timeout after ${timeout}ms`,
          ErrorCodes.TOOL_TIMEOUT,
          { timeout }
        ));
      }, timeout);

      Promise.resolve(fn(input))
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * 检查权限
   */
  checkPermission(toolName, permission) {
    const tool = this.tools.get(toolName);
    if (!tool) return false;

    const permissionLevels = [
      PermissionLevel.READ,
      PermissionLevel.WRITE,
      PermissionLevel.EXECUTE,
      PermissionLevel.ADMIN
    ];

    const toolLevel = permissionLevels.indexOf(tool.permission);
    const providedLevel = permissionLevels.indexOf(permission);

    return providedLevel >= toolLevel;
  }

  /**
   * 清理输入（移除敏感信息）
   */
  sanitizeInput(input) {
    const sanitized = { ...input };
    const sensitiveFields = ['password', 'apiKey', 'secret', 'token', 'credential'];

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '***REDACTED***';
      }
    }

    return sanitized;
  }

  /**
   * 记录执行日志
   */
  logExecution(entry) {
    this.executionLog.push(entry);

    if (this.executionLog.length > this.maxLogSize) {
      this.executionLog.shift();
    }
  }

  /**
   * 获取执行日志
   */
  getExecutionLog(limit = 50) {
    return this.executionLog.slice(-limit);
  }

  /**
   * 列出所有工具
   */
  listTools() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      category: tool.category,
      permission: tool.permission,
      timeout: tool.timeout
    }));
  }

  /**
   * 获取分类工具
   */
  getByCategory(category) {
    return Array.from(this.tools.values())
      .filter(tool => tool.category === category);
  }

  /**
   * 检查工具是否存在
   */
  has(name) {
    return this.tools.has(name);
  }

  /**
   * 移除工具
   */
  unregister(name) {
    return this.tools.delete(name);
  }

  /**
   * 清除所有工具
   */
  clear() {
    this.tools.clear();
    this.cache.clear();
    this.executionLog = [];
  }

  /**
   * 获取状态
   */
  getStatus() {
    return {
      toolsCount: this.tools.size,
      cacheStats: this.cache.getStats(),
      logSize: this.executionLog.length
    };
  }
}

module.exports = {
  EnhancedToolRegistry,
  ToolValidator,
  ToolCache,
  PermissionLevel
};