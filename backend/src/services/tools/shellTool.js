/**
 * Shell命令工具
 * 安全执行Shell命令
 */

const { exec, spawn } = require('child_process');
const os = require('os');

class ShellTool {
  constructor(options = {}) {
    this.name = 'shell';
    this.description = '执行Shell命令（注意：生产环境需谨慎使用）';
    this.category = 'system';
    this.timeout = options.timeout || 30000; // 30秒超时
    this.allowedCommands = options.allowedCommands || null; // 白名单模式
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
  }

  /**
   * 参数模式
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
            timeout: { type: 'number', description: '超时时间(ms)' },
            shell: { type: 'boolean', description: '是否使用shell' }
          }
        }
      },
      required: ['command']
    };
  }

  /**
   * 检查命令安全性
   */
  isSafe(command) {
    const lowerCmd = command.toLowerCase().trim();

    // 检查黑名单
    for (const blocked of this.blockedCommands) {
      if (lowerCmd.includes(blocked.toLowerCase())) {
        return { safe: false, reason: `命令包含危险操作: ${blocked}` };
      }
    }

    // 白名单模式检查
    if (this.allowedCommands && this.allowedCommands.length > 0) {
      const isAllowed = this.allowedCommands.some(allowed =>
        lowerCmd.startsWith(allowed.toLowerCase())
      );
      if (!isAllowed) {
        return { safe: false, reason: '命令不在白名单中' };
      }
    }

    return { safe: true };
  }

  /**
   * 执行命令
   */
  async execute(params) {
    const { command, options = {} } = params;

    // 安全检查
    const safetyCheck = this.isSafe(command);
    if (!safetyCheck.safe) {
      return {
        success: false,
        error: safetyCheck.reason,
        blocked: true
      };
    }

    const timeout = options.timeout || this.timeout;
    const cwd = options.cwd || os.homedir();

    return new Promise((resolve) => {
      const startTime = Date.now();
      const child = spawn(command, [], {
        cwd,
        shell: options.shell !== false,
        env: { ...process.env, ...options.env },
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
      });

      child.stderr.on('data', (data) => {
        stderr += Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
      });

      // 超时处理
      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({
          success: false,
          error: '命令执行超时',
          timeout: true,
          partialOutput: stdout
        });
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        resolve({
          success: code === 0,
          exitCode: code,
          stdout: stdout.slice(-100000), // 限制输出长度
          stderr: stderr.slice(-10000),
          duration,
          command
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          error: error.message,
          command
        });
      });
    });
  }
}

module.exports = ShellTool;
