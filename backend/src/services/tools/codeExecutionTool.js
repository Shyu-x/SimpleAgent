/**
 * 代码执行工具
 * 安全执行 JavaScript 代码
 */

const { VM } = require('vm2');

class CodeExecutionTool {
  constructor(options = {}) {
    this.name = 'code_execution';
    this.description = '执行 JavaScript 代码并返回结果';
    this.category = 'compute';
    this.timeout = options.timeout || 5000; // 5秒超时
    this.maxOutputSize = options.maxOutputSize || 10000; // 最大输出字符数
    this.allowedModules = options.allowedModules || [];
  }

  /**
   * 参数模式
   */
  get parameters() {
    return {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: '要执行的 JavaScript 代码'
        },
        language: {
          type: 'string',
          enum: ['javascript', 'js'],
          description: '编程语言（目前仅支持 JavaScript）'
        },
        context: {
          type: 'object',
          description: '执行上下文变量'
        },
        options: {
          type: 'object',
          properties: {
            timeout: { type: 'number', description: '超时时间(ms)' },
            silent: { type: 'boolean', description: '是否静默模式' }
          }
        }
      },
      required: ['code']
    };
  }

  /**
   * 执行代码
   */
  async execute(params) {
    const { code, language = 'javascript', context = {}, options = {} } = params;
    const timeout = options.timeout || this.timeout;

    // 代码安全检查
    const securityCheck = this.checkCodeSecurity(code);
    if (!securityCheck.safe) {
      return {
        success: false,
        error: `安全检查失败: ${securityCheck.reason}`,
        code: code.substring(0, 100) + '...'
      };
    }

    try {
      const startTime = Date.now();

      // 创建沙箱环境
      const vm = new VM({
        timeout,
        sandbox: {
          // 提供安全的内置对象
          console: this.createSafeConsole(options.silent),
          Math: Math,
          Date: Date,
          Array: Array,
          Object: Object,
          String: String,
          Number: Number,
          Boolean: Boolean,
          JSON: JSON,
          parseInt: parseInt,
          parseFloat: parseFloat,
          isNaN: isNaN,
          isFinite: isFinite,
          encodeURIComponent: encodeURIComponent,
          decodeURIComponent: decodeURIComponent,
          ...context
        }
      });

      // 包装代码以捕获输出
      const wrappedCode = `
        (function() {
          const __result__ = { output: [], value: undefined };
          const __original_log__ = console.log;
          console.log = function(...args) {
            __result__.output.push(args.map(a => String(a)).join(' '));
          };

          try {
            __result__.value = ${code};
          } catch (e) {
            __result__.error = e.message;
          }

          return __result__;
        })()
      `;

      const result = vm.run(wrappedCode);
      const duration = Date.now() - startTime;

      // 限制输出大小
      const output = result.output
        .join('\n')
        .substring(0, this.maxOutputSize);

      return {
        success: !result.error,
        value: this.formatValue(result.value),
        output,
        error: result.error,
        duration,
        language
      };

    } catch (error) {
      // 处理超时和其他错误
      if (error.message && error.message.includes('timeout')) {
        return {
          success: false,
          error: `执行超时 (${timeout}ms)`,
          timeout: true
        };
      }

      return {
        success: false,
        error: error.message,
        language
      };
    }
  }

  /**
   * 代码安全检查
   */
  checkCodeSecurity(code) {
    // 危险模式检测
    const dangerousPatterns = [
      /require\s*\(/,
      /import\s+/,
      /eval\s*\(/,
      /Function\s*\(/,
      /process\s*\./,
      /global\s*\./,
      /__dirname/,
      /__filename/,
      /child_process/,
      /fs\./,
      /\.exit\s*\(/,
      /while\s*\(\s*true\s*\)/,
      /for\s*\(\s*;\s*;\s*\)/
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        return {
          safe: false,
          reason: `检测到潜在危险代码: ${pattern.source}`
        };
      }
    }

    return { safe: true };
  }

  /**
   * 创建安全的 console 对象
   */
  createSafeConsole(silent = false) {
    const logs = [];
    return {
      log: (...args) => {
        if (!silent) {
          logs.push(args.map(a => String(a)).join(' '));
        }
      },
      error: (...args) => {
        logs.push('[ERROR] ' + args.map(a => String(a)).join(' '));
      },
      warn: (...args) => {
        logs.push('[WARN] ' + args.map(a => String(a)).join(' '));
      },
      _logs: logs
    };
  }

  /**
   * 格式化返回值
   */
  formatValue(value) {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'function') return '[Function]';
    if (typeof value === 'symbol') return value.toString();

    try {
      const str = JSON.stringify(value, null, 2);
      return str.substring(0, this.maxOutputSize);
    } catch {
      return String(value);
    }
  }
}

module.exports = CodeExecutionTool;