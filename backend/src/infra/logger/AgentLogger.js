/**
 * AgentLogger - 通用结构化日志服务
 * 支持多级别日志、JSON格式输出、文件滚动
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = './logs';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;

/**
 * 日志级别枚举
 */
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4
};

const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

/**
 * AgentLogger - 结构化JSON日志
 */
class AgentLogger {
  constructor(serviceName, options = {}) {
    this.serviceName = serviceName;
    this.level = options.level || LogLevel.INFO;
    this.logDir = options.logDir || LOG_DIR;
    this.enableConsole = options.enableConsole !== false;
    this.enableFile = options.enableFile !== false;
    this.traceId = null;

    // 确保日志目录存在
    if (this.enableFile && !fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * 设置traceId
   */
  setTraceId(traceId) {
    this.traceId = traceId;
  }

  /**
   * 格式化日志条目
   */
  _format(level, message, context = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level: levelNames[level],
      service: this.serviceName,
      traceId: this.traceId || process.env.TRACE_ID || 'N/A',
      message,
      pid: process.pid,
      ...context
    };
    return JSON.stringify(entry);
  }

  /**
   * 获取当前日志文件路径
   */
  _getLogFile() {
    return path.join(this.logDir, `${this.serviceName}.log`);
  }

  /**
   * 滚动日志文件
   */
  _rotateLogFile() {
    const logFile = this._getLogFile();
    if (!fs.existsSync(logFile)) return;

    const stats = fs.statSync(logFile);
    if (stats.size < MAX_FILE_SIZE) return;

    // 滚动旧文件
    for (let i = MAX_FILES - 1; i >= 1; i--) {
      const oldFile = `${logFile}.${i}`;
      const newFile = `${logFile}.${i + 1}`;
      if (fs.existsSync(oldFile)) {
        if (i === MAX_FILES - 1) {
          fs.unlinkSync(oldFile); // 删除最旧的
        } else {
          fs.renameSync(oldFile, newFile);
        }
      }
    }
    fs.renameSync(logFile, `${logFile}.1`);
  }

  /**
   * 写入日志到文件
   */
  _writeToFile(line) {
    try {
      this._rotateLogFile();
      fs.appendFileSync(this._getLogFile(), line + '\n', 'utf8');
    } catch (err) {
      console.error('[AgentLogger] Write failed:', err.message);
    }
  }

  /**
   * 输出到控制台
   */
  _writeToConsole(level, formatted) {
    if (!this.enableConsole) return;

    if (level >= LogLevel.ERROR) {
      console.error(formatted);
    } else if (level >= LogLevel.WARN) {
      console.warn(formatted);
    } else if (level >= LogLevel.INFO) {
      console.log(formatted);
    } else if (level >= LogLevel.DEBUG) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(formatted);
      }
    }
  }

  /**
   * 通用日志方法
   */
  _log(level, message, context = {}) {
    const formatted = this._format(level, message, context);
    this._writeToConsole(level, formatted);
    if (this.enableFile) {
      this._writeToFile(formatted);
    }
  }

  /**
   * DEBUG级别 - 开发调试用
   */
  debug(message, context = {}) {
    if (this.level <= LogLevel.DEBUG) {
      this._log(LogLevel.DEBUG, message, context);
    }
  }

  /**
   * INFO级别 - 一般信息
   */
  info(message, context = {}) {
    if (this.level <= LogLevel.INFO) {
      this._log(LogLevel.INFO, message, context);
    }
  }

  /**
   * WARN级别 - 警告信息
   */
  warn(message, context = {}) {
    if (this.level <= LogLevel.WARN) {
      this._log(LogLevel.WARN, message, context);
    }
  }

  /**
   * ERROR级别 - 错误信息
   */
  error(message, context = {}) {
    if (this.level <= LogLevel.ERROR) {
      this._log(LogLevel.ERROR, message, context);
    }
  }

  /**
   * FATAL级别 - 致命错误
   */
  fatal(message, context = {}) {
    this._log(LogLevel.FATAL, message, context);
  }

  // ========== 专用方法 ==========

  /**
   * 记录HTTP请求
   */
  logRequest(operation, params = {}) {
    this.info(`${operation} 请求`, { params });
  }

  /**
   * 记录HTTP响应
   */
  logResponse(operation, duration, result = {}) {
    this.info(`${operation} 响应`, { duration, resultSize: JSON.stringify(result).length });
  }

  /**
   * 记录工具执行
   */
  logToolExecution(toolName, args, success, result = '') {
    const context = { args, success };
    if (success) {
      this.info(`工具执行: ${toolName}`, context);
    } else {
      this.error(`工具执行失败: ${toolName}`, context);
    }
  }

  /**
   * 记录错误（带堆栈）
   */
  logError(operation, error) {
    if (error instanceof Error) {
      this.error(`${operation} 错误`, {
        error: error.message,
        stack: error.stack
      });
    } else {
      this.error(`${operation} 错误`, { error: String(error) });
    }
  }
}

/**
 * 创建模块logger的工厂函数
 */
function createLogger(serviceName, options = {}) {
  return new AgentLogger(serviceName, options);
}

module.exports = {
  AgentLogger,
  createLogger,
  LogLevel
};
