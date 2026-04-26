/**
 * 计算器工具
 * 支持数学表达式计算、科学计算、单位转换
 */

import { Logger } from '@nestjs/common';
import { ToolDefinition, ToolExecutionResult } from './tool-registry.service';
import { validateRequiredParams } from './base.tool';

const logger = new Logger('CalculatorTool');

/**
 * 创建计算器工具定义
 */
export function createCalculatorTool(): ToolDefinition {
  return {
    name: 'calculator',
    description: 'Perform mathematical calculations. Supports basic operations, percentages, powers, roots, and common functions.',
    category: 'utility',
    keywords: ['计算', 'calculate', '等于', '加', '减', '乘', '除', '+', '-', '*', '/', 'math'],
    examples: [
      '计算 123 + 456',
      '求 2 的 10 次方',
      '计算 25% of 200',
      'sqrt(144)'
    ],
    parameters: {
      properties: {
        expression: {
          type: 'string',
          description: 'Mathematical expression to evaluate'
        }
      },
      required: ['expression']
    },
    execute: async (params: { expression: string }): Promise<ToolExecutionResult> => {
      const startTime = Date.now();
      const expression = params.expression?.trim();

      if (!expression) {
        return {
          success: false,
          tool: 'calculator',
          error: 'Expression is required',
          errorType: 'validation',
          executionTime: 0
        };
      }

      try {
        const result = evaluateExpression(expression);

        return {
          success: true,
          tool: 'calculator',
          result: {
            expression,
            result,
            formatted: formatResult(result)
          },
          executionTime: Date.now() - startTime
        };
      } catch (error) {
        logger.warn(`Calculation failed: ${error.message}`);
        return {
          success: false,
          tool: 'calculator',
          error: error.message,
          errorType: 'calculation_error',
          executionTime: Date.now() - startTime
        };
      }
    }
  };
}

/**
 * 评估数学表达式
 */
function evaluateExpression(expr: string): number {
  // 清理表达式
  let cleaned = expr
    .replace(/[{}]/g, '') // 移除花括号
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, 'PI')
    .replace(/π/g, '3.14159265359')
    .replace(/e(?![xp])/g, '2.71828182846'); // 自然常数 e

  // 处理百分比
  cleaned = processPercentages(cleaned);

  // 处理常见数学函数
  cleaned = processMathFunctions(cleaned);

  // 验证表达式安全性
  if (!isValidExpression(cleaned)) {
    throw new Error('Invalid or unsafe expression');
  }

  // 使用 Function 构造器进行计算（比 eval 更安全）
  const calculate = new Function('return ' + cleaned);
  const result = calculate();

  if (typeof result !== 'number' || !isFinite(result)) {
    throw new Error('Invalid result');
  }

  // 四舍五入到合理精度
  return Math.round(result * 1e10) / 1e10;
}

/**
 * 处理百分比
 */
function processPercentages(expr: string): string {
  // 处理 "X% of Y" 格式
  expr = expr.replace(/(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)/gi, '($1/100)*$2');

  // 处理 "X%" 格式 (转换为小数)
  expr = expr.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)');

  return expr;
}

/**
 * 处理数学函数
 */
function processMathFunctions(expr: string): string {
  // 替换数学函数
  const functionMap: Record<string, string> = {
    'sqrt': 'Math.sqrt',
    'abs': 'Math.abs',
    'sin': 'Math.sin',
    'cos': 'Math.cos',
    'tan': 'Math.tan',
    'log': 'Math.log10',
    'ln': 'Math.log',
    'exp': 'Math.exp',
    'floor': 'Math.floor',
    'ceil': 'Math.ceil',
    'round': 'Math.round',
    'pow': 'Math.pow',
    'max': 'Math.max',
    'min': 'Math.min',
    'PI': '3.14159265359'
  };

  let result = expr;

  for (const [func, replacement] of Object.entries(functionMap)) {
    // 使用正则确保匹配完整函数名
    const regex = new RegExp(`\\b${func}\\b`, 'gi');
    result = result.replace(regex, replacement);
  }

  // 处理阶乘 (递归实现)
  if (result.includes('!')) {
    result = processFactorial(result);
  }

  return result;
}

/**
 * 处理阶乘
 */
function processFactorial(expr: string): string {
  const factorialRegex = /(\d+)!/g;
  return expr.replace(factorialRegex, (match, num) => {
    return factorial(parseInt(num, 10)).toString();
  });
}

/**
 * 计算阶乘
 */
function factorial(n: number): number {
  if (n < 0) throw new Error('Factorial of negative number');
  if (n === 0 || n === 1) return 1;

  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

/**
 * 验证表达式安全性
 */
function isValidExpression(expr: string): boolean {
  // 允许的字符：数字、运算符、括号、小数点、空格、数学函数
  const allowed = /^[0-9+\-*/().%\s\w]+$/;

  if (!allowed.test(expr)) {
    return false;
  }

  // 检查是否包含可疑模式
  const suspiciousPatterns = [
    /require\s*\(/,
    /import\s*\(/,
    /eval\s*\(/,
    /Function\s*\(/,
    /window\./,
    /document\./,
    /process\./,
    /__/  // 双下划线通常用于特殊属性
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(expr)) {
      return false;
    }
  }

  // 检查括号匹配
  let depth = 0;
  for (const char of expr) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (depth < 0) return false;
  }

  return depth === 0;
}

/**
 * 格式化结果
 */
function formatResult(result: number): string {
  // 处理极大或极小的数字
  if (Math.abs(result) >= 1e10 || (Math.abs(result) < 1e-6 && result !== 0)) {
    return result.toExponential(4);
  }

  // 常规数字保留合理精度
  const rounded = Math.round(result * 1e8) / 1e8;

  // 移除不必要的尾随零
  return parseFloat(rounded.toString()).toString();
}
