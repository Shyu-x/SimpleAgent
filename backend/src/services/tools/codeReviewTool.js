/**
 * 代码审查工具
 * 对代码进行静态分析和最佳实践检查
 */

class CodeReviewTool {
  constructor(options = {}) {
    this.name = 'code_review';
    this.description = '代码审查 - 检查代码质量、安全漏洞、最佳实践';
    this.category = 'developer';
    this.timeout = options.timeout || 30000;
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: '要审查的代码'
        },
        language: {
          type: 'string',
          description: '编程语言 (javascript, python, java, go, rust, cpp, c, typescript)'
        },
        options: {
          type: 'object',
          properties: {
            checkSecurity: { type: 'boolean', default: true },
            checkBestPractices: { type: 'boolean', default: true },
            checkPerformance: { type: 'boolean', default: true }
          }
        }
      },
      required: ['code', 'language']
    };
  }

  async execute(params) {
    const { code, language, options = {} } = params;
    const { checkSecurity = true, checkBestPractices = true, checkPerformance = true } = options;

    if (!code || code.trim().length === 0) {
      return { success: false, error: '代码不能为空' };
    }

    const languageMap = {
      javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts',
      python: 'py', py: 'py',
      java: 'java',
      go: 'go', golang: 'go',
      rust: 'rust', rs: 'rust',
      cpp: 'cpp', 'c++': 'cpp',
      c: 'c'
    };

    const lang = languageMap[language.toLowerCase()] || language.toLowerCase();

    const issues = [];
    const warnings = [];
    const suggestions = [];

    // 基础代码检查
    this.checkSecurity(code, lang, issues, warnings);
    this.checkBestPractices(code, lang, issues, suggestions);
    this.checkPerformance(code, lang, warnings, suggestions);

    const summary = {
      issues: issues.length,
      warnings: warnings.length,
      suggestions: suggestions.length,
      score: this.calculateScore(issues.length, warnings.length, suggestions.length)
    };

    return {
      success: true,
      language: lang,
      summary,
      issues: issues.slice(0, 20),
      warnings: warnings.slice(0, 20),
      suggestions: suggestions.slice(0, 10)
    };
  }

  checkSecurity(code, lang, issues, warnings) {
    // SQL注入检测
    if (/SELECT|INSERT|UPDATE|DELETE|DROP/i.test(code) && /['"]\s*(SELECT|INSERT|UPDATE|DELETE)/i.test(code)) {
      issues.push({
        type: 'security',
        severity: 'high',
        message: '可能的SQL注入风险',
        line: this.findLine(code, /['"]\s*(SELECT|INSERT|UPDATE|DELETE)/i)
      });
    }

    // XSS检测
    if (/innerHTML|document\.write|eval\s*\(|new\s+Function/i.test(code)) {
      issues.push({
        type: 'security',
        severity: 'high',
        message: '可能的XSS攻击风险 - 避免使用innerHTML或eval',
        line: this.findLine(code, /innerHTML|document\.write|eval\s*\(|new\s+Function/)
      });
    }

    // 硬编码密码检测
    if (/(password|passwd|pwd|secret|api_key|apikey)\s*=\s*['"][^'"]+['"]/i.test(code)) {
      issues.push({
        type: 'security',
        severity: 'critical',
        message: '发现硬编码的敏感信息',
        line: this.findLine(code, /(password|passwd|pwd|secret|api_key|apikey)\s*=\s*['"]/)
      });
    }

    // 命令注入检测
    if (/exec\s*\(|system\s*\(|shell_exec|Popen/i.test(code)) {
      issues.push({
        type: 'security',
        severity: 'high',
        message: '可能的命令注入风险',
        line: this.findLine(code, /exec\s*\(|system\s*\(|shell_exec|Popen/)
      });
    }
  }

  checkBestPractices(code, lang, issues, suggestions) {
    // 空catch块
    if (/catch\s*\([^)]*\)\s*\{\s*\}/g.test(code)) {
      suggestions.push({
        type: 'best_practice',
        message: '避免空的catch块，应该处理或记录异常'
      });
    }

    // TODO注释检查
    const todos = code.match(/\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b/gi);
    if (todos) {
      warnings.push({
        type: 'best_practice',
        severity: 'low',
        message: `代码中有 ${todos.length} 个TODO/FIXME注释`
      });
    }

    // 魔法数字
    const magicNumbers = code.match(/(?<![.\w])\d{3,}(?![.\w])/g);
    if (magicNumbers) {
      suggestions.push({
        type: 'best_practice',
        message: '建议将魔法数字提取为命名常量'
      });
    }

    // 过长函数警告
    const functionMatches = code.match(/function\s+\w+|def\s+\w+|\w+\s*=\s*\([^)]*\)\s*=>/g);
    if (functionMatches && functionMatches.length > 10) {
      warnings.push({
        type: 'best_practice',
        severity: 'medium',
        message: '文件中定义了较多函数，考虑拆分'
      });
    }
  }

  checkPerformance(code, lang, warnings, suggestions) {
    // 循环内字符串拼接 (Python/JS)
    if (/for\s*\([^)]*\)[^{]*\+=  |for\s*\([^)]*\)[^{]*=\s*.*\+/s.test(code)) {
      warnings.push({
        type: 'performance',
        severity: 'medium',
        message: '循环内字符串拼接可能导致性能问题，考虑使用join或StringBuilder'
      });
    }

    // 重复查询数据库
    if (/SELECT\s+.*FROM/i.test(code)) {
      const selectCount = (code.match(/SELECT\s+.*FROM/gi) || []).length;
      if (selectCount > 3) {
        suggestions.push({
          type: 'performance',
          message: `检测到 ${selectCount} 次数据库查询，考虑合并或使用批量查询`
        });
      }
    }

    // 未使用变量
    const unusedVars = code.match(/const\s+(\w+)\s*=|let\s+(\w+)\s*=/g);
    if (unusedVars && unusedVars.length > 5) {
      warnings.push({
        type: 'performance',
        severity: 'low',
        message: '可能存在未使用的变量'
      });
    }
  }

  findLine(code, pattern) {
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) return i + 1;
    }
    return 0;
  }

  calculateScore(issues, warnings, suggestions) {
    // 10分制评分
    let score = 10;
    score -= issues * 1.5;
    score -= warnings * 0.5;
    score -= suggestions * 0.2;
    return Math.max(0, Math.min(10, score)).toFixed(1);
  }
}

module.exports = CodeReviewTool;
