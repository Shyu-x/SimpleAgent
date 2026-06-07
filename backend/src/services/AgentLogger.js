/**
 * Agent 日志系统
 * 借鉴 MiniMax Mini-Agent 的结构化日志设计
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = './logs/agent';

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * AgentLogger - 结构化JSON日志
 */
class AgentLogger {
  constructor(options = {}) {
    this.logDir = options.logDir || LOG_DIR;
    this.currentRunId = null;
    this.currentLogFile = null;
  }

  /**
   * 开始新的运行
   */
  startNewRun() {
    this.currentRunId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.currentLogFile = path.join(this.logDir, `${this.currentRunId}.json`);

    // 写入运行开始标记
    this._writeLog({
      type: 'run_start',
      runId: this.currentRunId,
      timestamp: new Date().toISOString(),
      pid: process.pid
    });

    return this.currentRunId;
  }

  /**
   * 获取当前日志文件路径
   */
  getLogFilePath() {
    return this.currentLogFile;
  }

  /**
   * 写入日志
   */
  _writeLog(entry) {
    if (!this.currentLogFile) return;

    try {
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.currentLogFile, line, 'utf8');
    } catch (err) {
      console.error('[AgentLogger] Write failed:', err.message);
    }
  }

  /**
   * 记录 LLM 请求
   */
  logRequest(messages, tools = []) {
    const messageSummary = messages.map(m => ({
      role: m.role,
      contentLength: typeof m.content === 'string' ? m.content.length : '[complex]'
    }));

    const toolSummary = tools.map(t => ({
      name: t.name,
      description: t.description?.slice(0, 100)
    }));

    this._writeLog({
      type: 'llm_request',
      runId: this.currentRunId,
      timestamp: new Date().toISOString(),
      messages: messageSummary,
      toolCount: tools.length,
      toolNames: tools.map(t => t.name)
    });
  }

  /**
   * 记录 LLM 响应
   */
  logResponse(response) {
    this._writeLog({
      type: 'llm_response',
      runId: this.currentRunId,
      timestamp: new Date().toISOString(),
      content: response.content?.slice(0, 500) || null,
      thinking: response.thinking?.slice(0, 500) || null,
      hasThinking: !!response.thinking,
      toolCalls: response.tool_calls?.map(tc => ({
        id: tc.id,
        name: tc.function?.name
      })) || [],
      finishReason: response.finish_reason,
      usage: response.usage || null
    });
  }

  /**
   * 记录工具执行结果
   */
  logToolResult(toolName, args, success, result, error) {
    this._writeLog({
      type: 'tool_result',
      runId: this.currentRunId,
      timestamp: new Date().toISOString(),
      toolName,
      arguments: this._truncateArgs(args),
      success,
      resultLength: result?.length || 0,
      resultPreview: result?.slice(0, 300),
      error: error?.slice(0, 500) || null
    });
  }

  /**
   * 记录执行步骤开始
   */
  logStepStart(step) {
    this._writeLog({
      type: 'step_start',
      runId: this.currentRunId,
      timestamp: new Date().toISOString(),
      step
    });
  }

  /**
   * 记录执行步骤结束
   */
  logStepEnd(step, elapsed) {
    this._writeLog({
      type: 'step_end',
      runId: this.currentRunId,
      timestamp: new Date().toISOString(),
      step,
      elapsedMs: elapsed
    });
  }

  /**
   * 记录错误
   */
  logError(error, context = {}) {
    this._writeLog({
      type: 'error',
      runId: this.currentRunId,
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack?.slice(0, 1000),
      ...context
    });
  }

  /**
   * 信息日志 (兼容 trace 调用)
   */
  info(message, meta = {}) {
    this._writeLog({
      type: 'info',
      runId: this.currentRunId,
      timestamp: new Date().toISOString(),
      message,
      ...meta
    });
  }

  /**
   * 调试日志 (兼容 trace 调用)
   */
  debug(message, meta = {}) {
    this._writeLog({
      type: 'debug',
      runId: this.currentRunId,
      timestamp: new Date().toISOString(),
      message,
      ...meta
    });
  }

  /**
   * 截断参数（避免日志过长）
   */
  _truncateArgs(args, maxLength = 200) {
    if (!args) return {};
    const truncated = {};
    for (const [key, value] of Object.entries(args)) {
      const strVal = String(value);
      truncated[key] = strVal.length > maxLength ? strVal.slice(0, maxLength) + '...' : strVal;
    }
    return truncated;
  }
}

// ANSI颜色码
const Colors = {
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m',
  DIM: '\x1b[2m',

  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',

  BRIGHT_RED: '\x1b[91m',
  BRIGHT_GREEN: '\x1b[92m',
  BRIGHT_YELLOW: '\x1b[93m',
  BRIGHT_BLUE: '\x1b[94m',
  BRIGHT_MAGENTA: '\x1b[95m',
  BRIGHT_CYAN: '\x1b[96m'
};

/**
 * 控制台输出格式化
 */
const formatConsole = {
  step: (step, maxSteps) => {
    const text = `${Colors.BOLD}${Colors.BRIGHT_CYAN}Step ${step}/${maxSteps}${Colors.RESET}`;
    return `\n${Colors.DIM}╭${'─'.repeat(50)}╮${Colors.RESET}\n` +
           `${Colors.DIM}│${Colors.RESET} ${text}${Colors.DIM}${' '.repeat(Math.max(0, 50 - 15))}│${Colors.RESET}\n` +
           `${Colors.DIM}╰${'─'.repeat(50)}╯${Colors.RESET}`;
  },

  thinking: (content) => {
    const truncated = content.length > 500 ? content.slice(0, 500) + '...' : content;
    return `\n${Colors.BOLD}${Colors.MAGENTA}Thinking:${Colors.RESET}\n${Colors.DIM}${truncated}${Colors.RESET}`;
  },

  assistant: (content) => {
    return `\n${Colors.BOLD}${Colors.BRIGHT_BLUE}Assistant:${Colors.RESET}\n${content}`;
  },

  toolCall: (name, args) => {
    const truncatedArgs = {};
    for (const [key, value] of Object.entries(args || {})) {
      const strVal = String(value);
      truncatedArgs[key] = strVal.length > 100 ? strVal.slice(0, 100) + '...' : strVal;
    }
    return `\n${Colors.BRIGHT_YELLOW}Tool:${Colors.RESET} ${Colors.CYAN}${name}${Colors.RESET}\n` +
           `${Colors.DIM}Args: ${JSON.stringify(truncatedArgs, null, 2)}${Colors.RESET}`;
  },

  success: (content) => {
    const truncated = content.length > 300 ? content.slice(0, 300) + '...' : content;
    return `${Colors.BRIGHT_GREEN}✓${Colors.RESET} ${truncated}`;
  },

  error: (content) => {
    return `${Colors.BRIGHT_RED}✗${Colors.RESET} ${Colors.RED}${content}${Colors.RESET}`;
  },

  warning: (content) => {
    return `${Colors.BRIGHT_YELLOW}⚠${Colors.RESET} ${content}`;
  },

  info: (label, content) => {
    return `${Colors.BRIGHT_CYAN}${label}${Colors.RESET} ${content}`;
  },

  timing: (stepMs, totalMs) => {
    return `${Colors.DIM}⏱ Step: ${stepMs.toFixed(2)}s | Total: ${totalMs.toFixed(2)}s${Colors.RESET}`;
  }
};

module.exports = {
  AgentLogger,
  Colors,
  formatConsole
};
