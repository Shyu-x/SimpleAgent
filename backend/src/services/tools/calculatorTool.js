/**
 * 计算器工具
 * 执行数学计算和表达式求值
 */

class CalculatorTool {
  constructor(options = {}) {
    this.name = 'calculator';
    this.description = '执行数学计算、表达式求值';
    this.category = 'compute';
    this.maxExpressionLength = options.maxExpressionLength || 1000;
  }

  /**
   * 参数模式
   */
  get parameters() {
    return {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: '数学表达式'
        },
        options: {
          type: 'object',
          properties: {
            precision: { type: 'number', description: '小数精度' },
            angleMode: { type: 'string', enum: ['deg', 'rad'], description: '角度模式' }
          }
        }
      },
      required: ['expression']
    };
  }

  /**
   * 执行计算
   */
  async execute(params) {
    const { expression, options = {} } = params;

    // 长度检查
    if (expression.length > this.maxExpressionLength) {
      return {
        success: false,
        error: `表达式过长: ${expression.length} 字符`
      };
    }

    // 安全检查
    const safetyCheck = this.checkExpressionSafety(expression);
    if (!safetyCheck.safe) {
      return {
        success: false,
        error: `不安全的表达式: ${safetyCheck.reason}`
      };
    }

    try {
      const result = this.evaluate(expression, options);
      return {
        success: true,
        expression,
        result,
        type: typeof result
      };
    } catch (error) {
      return {
        success: false,
        error: `计算错误: ${error.message}`,
        expression
      };
    }
  }

  /**
   * 表达式安全检查
   */
  checkExpressionSafety(expression) {
    // 只允许数字、运算符、括号、小数点、空格和数学函数
    const safePattern = /^[0-9+\-*/().%\s,a-zA-Z]+$/;

    if (!safePattern.test(expression)) {
      return {
        safe: false,
        reason: '包含非法字符'
      };
    }

    // 检查括号匹配
    let depth = 0;
    for (const char of expression) {
      if (char === '(') depth++;
      if (char === ')') depth--;
      if (depth < 0) {
        return { safe: false, reason: '括号不匹配' };
      }
    }
    if (depth !== 0) {
      return { safe: false, reason: '括号不匹配' };
    }

    return { safe: true };
  }

  /**
   * 计算表达式
   */
  evaluate(expression, options = {}) {
    const { angleMode = 'rad', precision = 10 } = options;

    // 预处理表达式
    let processed = expression
      .replace(/\^/g, '**')
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/π/g, 'Math.PI')
      .replace(/e(?![a-zA-Z])/g, 'Math.E');

    // 数学函数映射
    const mathFunctions = {
      'sin': 'Math.sin',
      'cos': 'Math.cos',
      'tan': 'Math.tan',
      'asin': 'Math.asin',
      'acos': 'Math.acos',
      'atan': 'Math.atan',
      'sqrt': 'Math.sqrt',
      'abs': 'Math.abs',
      'floor': 'Math.floor',
      'ceil': 'Math.ceil',
      'round': 'Math.round',
      'log': 'Math.log',
      'log10': 'Math.log10',
      'log2': 'Math.log2',
      'exp': 'Math.exp',
      'pow': 'Math.pow',
      'min': 'Math.min',
      'max': 'Math.max',
      'random': 'Math.random'
    };

    // 替换数学函数
    for (const [name, fn] of Object.entries(mathFunctions)) {
      const regex = new RegExp(`\\b${name}\\b`, 'g');
      processed = processed.replace(regex, fn);
    }

    // 角度转弧度（如果需要）
    if (angleMode === 'deg') {
      // 对于三角函数，需要转换
      processed = processed.replace(/Math\.(sin|cos|tan)\(([^)]+)\)/g, (match, fn, arg) => {
        return `Math.${fn}((${arg}) * Math.PI / 180)`;
      });
    }

    // 安全执行
    const safeEval = new Function(`
      "use strict";
      return (${processed});
    `);

    let result = safeEval();

    // 处理精度
    if (typeof result === 'number' && !Number.isInteger(result)) {
      result = parseFloat(result.toFixed(precision));
    }

    return result;
  }
}

module.exports = CalculatorTool;