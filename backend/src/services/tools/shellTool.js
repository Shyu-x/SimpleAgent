/**
 * Shell命令工具 - 安全增强版
 * 提供命令执行能力，同时防止命令注入和安全攻击
 */

const { execFile } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const createLogger = require('../../common/logger');
const logger = createLogger('ShellTool');

/**
 * 危险命令注入模式 - 正则表达式
 */
const DANGEROUS_PATTERNS = [
  // 命令分隔符和管道
  { pattern: /[;&|`$]/, name: '命令分隔符或命令替换' },
  { pattern: /\|\|/, name: '或逻辑运算符' },
  { pattern: /&&/, name: '与逻辑运算符' },
  { pattern: />>/, name: '输出重定向追加' },
  { pattern: /2>&1/, name: '错误输出重定向' },

  // Shell变量和参数展开
  { pattern: /\$\{[^}]+\}/, name: 'Shell变量展开' },
  { pattern: /\$\w+/, name: 'Shell变量' },
  { pattern: /\${IFS}/i, name: 'IFS变量(编码绕过)' },

  // 通配符和路径遍历
  { pattern: /\.\.\//, name: '路径遍历' },
  { pattern: /\/\.\./, name: '路径遍历' },

  // 危险命令的变体
  { pattern: /\brm\s+-rf\s+\//, name: '递归删除根目录' },
  { pattern: /\brm\s+-[rf]+\s+\//, name: '递归删除根目录变体' },
  { pattern: /\bdel\s+.*\/[sqf]/i, name: 'Windows删除命令' },
  { pattern: /\bformat\s+/i, name: '格式化命令' },
  { pattern: /\bmkfs\b/i, name: '文件系统创建' },
  { pattern: /\bdd\s+if=/i, name: '直接磁盘写入' },
  { pattern: />\s*\/dev\/sd/, name: '直接设备写入' },
  { pattern: /\bshutdown\b/i, name: '系统关机' },
  { pattern: /\breboot\b/i, name: '系统重启' },
  { pattern: /\binit\s+0\b/i, name: '系统 halt' },
  { pattern: /\bhalt\b/i, name: '系统 halt' },
  { pattern: /\bkill\s+-9\b/i, name: '强制终止进程' },
  { pattern: /\bmkdir\s+\/.*\/bin/i, name: '创建危险目录' },
  { pattern: /\bchmod\s+[47]\d{3}/i, name: '危险权限设置' },
  { pattern: /\bwget\s+.*\|/, name: '下载并执行' },
  { pattern: /\bcurl\s+.*\|/, name: '下载并执行' },
  { pattern: /\bnc\s+-[elap]/i, name: 'Netcat反向shell' },
  { pattern: /\bpython.*-c.*import\s+os/i, name: 'Python命令执行' },
  { pattern: /\bperl.*-e.*system/i, name: 'Perl命令执行' },
  { pattern: /\bruby.*-e.*system/i, name: 'Ruby命令执行' },
  { pattern: /\bbash\s+-i/i, name: '交互式Bash' },
  { pattern: /\/bin\/sh\b/i, name: '直接调用Shell' },
  { pattern: /\/etc\/passwd/i, name: '读取密码文件' },
  { pattern: /fork\s*bomb/i, name: 'Fork炸弹' },
];

/**
 * ShellTool - 安全Shell命令执行工具
 */
class ShellTool {
  constructor(options = {}) {
    this.name = 'shell';
    this.description = '执行Shell命令（注意：生产环境需谨慎使用）';
    this.category = 'system';
    this.timeout = options.timeout || 30000; // 30秒超时

    // 白名单模式：允许的命令列表
    // 格式：{ cmd: 'ls', args: ['-la', '-h'], description: '列表目录' }
    // args 为空表示不接受任何参数，为 null 表示接受任意参数
    this.allowedCommands = options.allowedCommands || null;

    // 黑名单命令（精确匹配）
    this.blockedCommands = options.blockedCommands || [
      'rm -rf /',
      'del /f /s /q',
      'format',
      'mkfs',
      'dd if=',
      '> /dev/sd',
      'shutdown',
      'reboot',
      'init 0',
      'halt'
    ];

    // 审计日志配置
    this.auditLogPath = options.auditLogPath || null;

    // 是否使用沙箱模式（强烈建议开启）
    this.sandboxMode = options.sandboxMode !== false;
  }

  /**
   * 参数模式定义
   */
  get parameters() {
    return {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: '要执行的命令'
        },
        options: {
          type: 'object',
          properties: {
            cwd: { type: 'string', description: '工作目录' },
            env: { type: 'object', description: '环境变量' },
            timeout: { type: 'number', description: '超时时间(ms)' }
          }
        }
      },
      required: ['command']
    };
  }

  /**
   * 审计日志记录
   */
  _auditLog(entry) {
    if (!this.auditLogPath) return;

    const logLine = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...entry
    }) + '\n';

    try {
      const dir = path.dirname(this.auditLogPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.appendFileSync(this.auditLogPath, logLine);
    } catch (error) {
      logger.error(`审计日志写入失败: ${error.message}`);
    }
  }

  /**
   * 解析命令字符串为命令名和参数数组
   */
  _parseCommand(commandStr) {
    // 使用简单的空格分割，但处理引号
    const tokens = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < commandStr.length; i++) {
      const char = commandStr[i];

      if ((char === '"' || char === "'") && !inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuote) {
        inQuote = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuote) {
        if (current.length > 0) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current.length > 0) {
      tokens.push(current);
    }

    return {
      cmd: tokens[0] || '',
      args: tokens.slice(1)
    };
  }

  /**
   * 检查命令安全性 - 增强版
   */
  isSafe(command) {
    const trimmedCmd = command.trim();

    if (!trimmedCmd || trimmedCmd.length === 0) {
      return { safe: false, reason: '命令为空' };
    }

    // 1. 检查危险模式（正则表达式）
    for (const { pattern, name } of DANGEROUS_PATTERNS) {
      if (pattern.test(trimmedCmd)) {
        this._auditLog({
          event: 'BLOCKED',
          reason: `检测到危险模式: ${name}`,
          command: trimmedCmd,
          pattern: pattern.toString()
        });
        return { safe: false, reason: `检测到危险模式: ${name}` };
      }
    }

    // 2. 检查黑名单命令（大小写不敏感，包含检查防止 rm${IFS}rf 绕过）
    const lowerCmd = trimmedCmd.toLowerCase();
    for (const blocked of this.blockedCommands) {
      const blockedLower = blocked.toLowerCase();
      // 使用正则检查，分隔符可以是空格、$、\ 等
      const escapedBlocked = blockedLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const blockPattern = new RegExp(escapedBlocked.replace(/ /g, '[\\s\\$\\{\\}]*'));
      if (blockPattern.test(lowerCmd)) {
        this._auditLog({
          event: 'BLOCKED',
          reason: `命令包含黑名单操作: ${blocked}`,
          command: trimmedCmd
        });
        return { safe: false, reason: `命令包含危险操作: ${blocked}` };
      }
    }

    // 3. 白名单模式检查
    if (this.allowedCommands && this.allowedCommands.length > 0) {
      const { cmd, args } = this._parseCommand(trimmedCmd);
      const cmdLower = cmd.toLowerCase();

      let isAllowed = false;
      let allowReason = '';

      for (const allowed of this.allowedCommands) {
        const allowedCmd = allowed.cmd.toLowerCase();

        // 检查命令是否匹配
        if (cmdLower === allowedCmd || cmdLower.endsWith('/' + allowedCmd)) {
          // 检查参数是否允许
          if (allowed.args === null) {
            // null 表示接受任意参数
            isAllowed = true;
            allowReason = `白名单命令 ${allowed.cmd}，允许任意参数`;
            break;
          } else if (Array.isArray(allowed.args) && allowed.args.length === 0) {
            // 空数组表示不接受任何参数
            if (args.length === 0) {
              isAllowed = true;
              allowReason = `白名单命令 ${allowed.cmd}，无参数`;
              break;
            } else {
              isAllowed = false;
              allowReason = `命令 ${allowed.cmd} 不接受参数`;
            }
          } else if (Array.isArray(allowed.args)) {
            // 检查参数是否在白名单中
            const allArgsAllowed = args.every(arg =>
              allowed.args.some(allowedArg =>
                arg === allowedArg || arg.startsWith(allowedArg + '=')
              )
            );
            if (allArgsAllowed) {
              isAllowed = true;
              allowReason = `白名单命令 ${allowed.cmd}，参数在允许列表中`;
              break;
            }
          }
        }
      }

      if (!isAllowed) {
        this._auditLog({
          event: 'BLOCKED',
          reason: allowReason || '命令不在白名单中',
          command: trimmedCmd
        });
        return {
          safe: false,
          reason: allowReason || '命令不在白名单中'
        };
      }
    }

    // 4. 检查命令长度（防止缓冲区溢出）
    if (trimmedCmd.length > 10000) {
      return { safe: false, reason: '命令过长' };
    }

    // 5. 检查是否包含可疑的编码序列
    const suspiciousEncodings = [
      /\\x[0-9a-f]{2}/gi,  // 十六进制编码
      /\\u[0-9a-f]{4}/gi,  // Unicode编码
      /%[0-9a-f]{2}/gi     // URL编码
    ];
    for (const encoding of suspiciousEncodings) {
      if (encoding.test(trimmedCmd)) {
        return { safe: false, reason: '检测到可疑编码' };
      }
    }

    this._auditLog({
      event: 'ALLOWED',
      command: trimmedCmd
    });

    return { safe: true };
  }

  /**
   * 执行命令 - 使用 execFile 避免 shell 解析
   */
  async execute(params) {
    const { command, options = {} } = params;
    const startTime = Date.now();

    // 安全检查
    const safetyCheck = this.isSafe(command);
    if (!safetyCheck.safe) {
      return {
        success: false,
        error: safetyCheck.reason,
        blocked: true,
        command: command.trim(),
        timestamp: new Date().toISOString()
      };
    }

    const timeout = options.timeout || this.timeout;
    const cwd = options.cwd || os.homedir();
    const parsed = this._parseCommand(command.trim());

    // 使用 execFile 代替 spawn，避免 shell 解析
    // 只有在需要管道等复杂功能时才使用 shell
    return new Promise((resolve) => {
      const child = execFile(
        parsed.cmd,
        parsed.args,
        {
          cwd,
          env: { ...process.env, ...options.env },
          timeout,
          maxBuffer: 10 * 1024 * 1024, // 10MB 输出限制
          windowsHide: true
        },
        (error, stdout, stderr) => {
          const duration = Date.now() - startTime;

          if (error) {
            // 检查是否是超时错误
            if (error.killed || error.code === 'ETIMEDOUT') {
              resolve({
                success: false,
                error: '命令执行超时',
                timeout: true,
                partialOutput: stdout || '',
                command: command.trim(),
                duration
              });
            } else {
              resolve({
                success: false,
                error: error.message,
                exitCode: error.code,
                stdout: (stdout || '').slice(-100000),
                stderr: (stderr || '').slice(-10000),
                command: command.trim(),
                duration
              });
            }
          } else {
            resolve({
              success: true,
              exitCode: 0,
              stdout: stdout.slice(-100000),
              stderr: stderr.slice(-10000),
              command: command.trim(),
              duration
            });
          }
        }
      );
    });
  }
}

/**
 * 工厂函数：创建白名单模式的 ShellTool
 */
ShellTool.createWhitelistMode = function(allowedCommands) {
  return new ShellTool({
    allowedCommands,
    // 白名单模式下仍然启用黑名单检查作为额外保护
    blockedCommands: [
      'rm -rf /',
      'del /f /s /q',
      'format',
      'mkfs',
      'dd if=',
      'shutdown',
      'reboot'
    ]
  });
};

module.exports = ShellTool;