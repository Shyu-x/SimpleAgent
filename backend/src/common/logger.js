/**
 * 统一日志系统入口
 *
 * 日志规范:
 * - 格式: JSON 结构化日志
 * - 级别: DEBUG(0) < INFO(1) < WARN(2) < ERROR(3) < FATAL(4)
 * - 输出: 控制台 + 文件 (logs/{serviceName}.log)
 * - 滚动: 10MB 文件上限，保留 5 个历史文件
 *
 * 使用方法:
 * const logger = require('../common/logger')('ServiceName');
 * logger.info('操作描述', { context: '数据' });
 * logger.error('错误描述', { error: err.message });
 */

const path = require('path');

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

// 日志配置
const LOG_DIR = process.env.LOG_DIR || './logs';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;

// 获取当前日志级别 (环境变量)
function getLogLevel() {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase();
  if (envLevel && levelNames.includes(envLevel)) {
    return LogLevel[envLevel];
  }
  return process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG;
}

// ANSI 颜色码 (用于控制台彩色输出)
const Colors = {
  RESET: '\x1b[0m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  CYAN: '\x1b[36m',
  BRIGHT_RED: '\x1b[91m',
  BRIGHT_YELLOW: '\x1b[93m',
  BRIGHT_CYAN: '\x1b[96m'
};

/**
 * 日志写入器类
 */
class Logger {
  constructor(serviceName, options = {}) {
    this.serviceName = serviceName;
    this.level = options.level !== undefined ? options.level : getLogLevel();
    this.logDir = options.logDir || LOG_DIR;
    this.enableConsole = options.enableConsole !== false;
    this.enableFile = options.enableFile !== false;
    this.traceId = null;

    // 确保日志目录存在
    if (this.enableFile) {
      const fs = require('fs');
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    }
  }

  /**
   * 设置 traceId (用于链路追踪)
   */
  setTraceId(traceId) {
    this.traceId = traceId;
  }

  /**
   * 格式化日志条目为 JSON
   */
  _format(level, message, context = {}) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level: levelNames[level],
      service: this.serviceName,
      traceId: this.traceId || 'N/A',
      message,
      pid: process.pid,
      ...context
    });
  }

  /**
   * 获取日志文件路径
   */
  _getLogFile() {
    return path.join(this.logDir, `${this.serviceName}.log`);
  }

  /**
   * 滚动日志文件
   */
  _rotateLogFile() {
    const fs = require('fs');
    const logFile = this._getLogFile();
    if (!fs.existsSync(logFile)) return;

    const stats = fs.statSync(logFile);
    if (stats.size < MAX_FILE_SIZE) return;

    // 滚动: logs/service.log.N
    for (let i = MAX_FILES - 1; i >= 1; i--) {
      const oldFile = `${logFile}.${i}`;
      const newFile = `${logFile}.${i + 1}`;
      if (fs.existsSync(oldFile)) {
        if (i === MAX_FILES - 1) {
          fs.unlinkSync(oldFile);
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
    const fs = require('fs');
    try {
      this._rotateLogFile();
      fs.appendFileSync(this._getLogFile(), line + '\n', 'utf8');
    } catch (err) {
      // 避免日志写入失败导致主流程崩溃
      console.error(`[${this.serviceName}] 日志写入失败:`, err.message);
    }
  }

  /**
   * 输出到控制台
   */
  _writeToConsole(level, formatted) {
    if (!this.enableConsole) return;

    const entry = JSON.parse(formatted);
    const prefix = `[${Colors.BRIGHT_CYAN}${entry.level}${Colors.RESET}]`;
    const timestamp = `${Colors.RESET}${entry.timestamp}${Colors.RESET}`;
    const service = `[${Colors.CYAN}${entry.service}${Colors.RESET}]`;

    let color = '';
    if (level >= 3) color = Colors.BRIGHT_RED;
    else if (level >= 2) color = Colors.BRIGHT_YELLOW;

    const output = `${prefix} ${timestamp} ${service} ${color}${entry.message}${Colors.RESET}`;

    if (level >= 3) {
      console.error(output);
    } else if (level >= 2) {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  /**
   * 通用日志方法
   */
  _log(level, message, context = {}) {
    if (this.level > level) return; // 当前级别低于配置级别，跳过

    const formatted = this._format(level, message, context);
    this._writeToConsole(level, formatted);
    if (this.enableFile) {
      this._writeToFile(formatted);
    }
  }

  /**
   * DEBUG 级别 - 开发调试用
   */
  debug(message, context = {}) {
    this._log(LogLevel.DEBUG, message, context);
  }

  /**
   * INFO 级别 - 一般信息
   */
  info(message, context = {}) {
    this._log(LogLevel.INFO, message, context);
  }

  /**
   * WARN 级别 - 警告信息
   */
  warn(message, context = {}) {
    this._log(LogLevel.WARN, message, context);
  }

  /**
   * ERROR 级别 - 错误信息
   */
  error(message, context = {}) {
    this._log(LogLevel.ERROR, message, context);
  }

  /**
   * FATAL 级别 - 致命错误
   */
  fatal(message, context = {}) {
    this._log(LogLevel.FATAL, message, context);
  }

  // ========== 专用方法 ==========

  /**
   * 记录 HTTP 请求
   */
  logRequest(operation, params = {}) {
    this.info(`${operation} 请求`, { params });
  }

  /**
   * 记录 HTTP 响应
   */
  logResponse(operation, duration, result = {}) {
    this.info(`${operation} 响应`, { duration: `${duration}ms`, resultSize: JSON.stringify(result).length });
  }

  /**
   * 记录工具执行
   */
  logToolExecution(toolName, args, success, result = '') {
    const context = { toolName, args, success };
    if (success) {
      this.info(`工具执行成功: ${toolName}`, context);
    } else {
      this.error(`工具执行失败: ${toolName}`, context);
    }
  }

  /**
   * 记录错误 (带堆栈)
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

  /**
   * 记录数据库操作
   */
  logDB(operation, duration, rows = 0) {
    this.debug(`${operation}`, { duration: `${duration}ms`, rows });
  }

  /**
   * 记录 LLM 调用
   */
  logLLM(operation, model, tokens = 0) {
    this.info(`${operation}`, { model, tokens });
  }
}

/**
 * 创建模块 logger 的工厂函数
 *
 * @param {string} serviceName - 服务名称 (用于日志标识)
 * @param {object} options - 配置选项
 * @param {number} options.level - 日志级别 (默认从环境变量读取)
 * @param {string} options.logDir - 日志目录 (默认 ./logs)
 * @param {boolean} options.enableConsole - 是否输出到控制台 (默认 true)
 * @param {boolean} options.enableFile - 是否输出到文件 (默认 true)
 * @returns {Logger}
 */
function createLogger(serviceName, options = {}) {
  return new Logger(serviceName, options);
}

module.exports = createLogger;
module.exports.createLogger = createLogger;
module.exports.Logger = Logger;
module.exports.LogLevel = LogLevel;
module.exports.Colors = Colors;