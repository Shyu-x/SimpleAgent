/**
 * MCP 参数自动提取器
 * 从用户查询中自动抽取工具参数
 *
 * 功能：
 * 1. 分析工具的参数模式 (JSON Schema)
 * 2. 使用正则和 LLM 从查询中提取参数
 * 3. 支持参数验证和类型转换
 * 4. 手动参数覆盖
 *
 * @author AI Chat 玩具团队
 * @date 2026-04-01
 */

const createLogger = require('../../../common/logger');
const logger = createLogger('MCPParameterExtractor');

/**
 * 参数提取结果
 * @typedef {Object} ExtractionResult
 * @property {boolean} success - 是否提取成功
 * @property {Object} parameters - 提取的参数
 * @property {Object} missing - 缺失的必需参数
 * @property {string} reasoning - 提取推理过程
 * @property {number} confidence - 置信度 (0-1)
 */

/**
 * 参数类型映射
 */
const TYPE_MAPPINGS = {
  'string': ['text', 'string', 'str'],
  'number': ['number', 'num', 'integer', 'int', 'count'],
  'boolean': ['boolean', 'bool', 'flag'],
  'array': ['array', 'list', 'array'],
  'object': ['object', 'dict', 'map']
};

/**
 * 常用参数模式
 * 用于快速匹配常见参数
 */
const COMMON_PATTERNS = {
  // 数字相关
  number: [
    /\d+\.?\d*/g,
    /(\d+)个?/g,
    /(?:第)?(\d+)/g
  ],
  // URL
  url: [
    /https?:\/\/[^\s]+/g,
    /www\.[^\s]+/g
  ],
  // 邮箱
  email: [
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  ],
  // 文件路径
  filepath: [
    /[a-zA-Z]:\\[^\s]+/g,           // Windows
    /\/[^\s]+\.[a-zA-Z]+/g           // Unix
  ],
  // 日期时间
  datetime: [
    /\d{4}[-/]\d{2}[-/]\d{2}/g,      // 2024-01-01
    /\d{2}:\d{2}(:\d{2})?/g          // 12:30:59
  ]
};

/**
 * MCP 参数提取器
 */
class MCPParameterExtractor {
  constructor(options = {}) {
    this.options = {
      useLLM: options.useLLM !== false,
      confidenceThreshold: options.confidenceThreshold || 0.6,
      llmExtractor: options.llmExtractor || null,
      ...options
    };

    /** @type {Map<string, Object>} 工具参数模式缓存 */
    this.schemaCache = new Map();
    /** @type {Map<string, RegExp[]>} 参数模式正则缓存 */
    this.patternCache = new Map();
  }

  /**
   * 设置 LLM 提取器
   * @param {Function} extractor - LLM 提取函数
   */
  setLLMExtractor(extractor) {
    this.options.llmExtractor = extractor;
  }

  /**
   * 从工具获取参数模式
   * @param {Object} tool - 工具对象或工具元信息
   * @returns {Object} JSON Schema
   */
  getSchema(tool) {
    if (this.schemaCache.has(tool.name)) {
      return this.schemaCache.get(tool.name);
    }

    const schema = tool.parameters || tool.inputSchema || { type: 'object', properties: {} };
    this.schemaCache.set(tool.name, schema);
    return schema;
  }

  /**
   * 从用户查询中提取参数
   * @param {Object} tool - 工具元信息
   * @param {string} query - 用户查询
   * @param {Object} existingParams - 已有的参数（手动覆盖）
   * @returns {ExtractionResult}
   */
  extract(tool, query, existingParams = {}) {
    const schema = this.getSchema(tool);
    const extracted = { ...existingParams };
    const missing = [];
    const reasoning = [];

    // 1. 解析参数模式
    const properties = schema.properties || {};
    const required = schema.required || [];

    // 2. 对每个参数进行提取
    for (const [paramName, paramSchema] of Object.entries(properties)) {
      // 跳过已有参数
      if (extracted[paramName] !== undefined) {
        reasoning.push(`参数 ${paramName} 使用手动指定值`);
        continue;
      }

      // 3. 尝试各种提取方法
      const result = this._extractParameter(paramName, paramSchema, query, extracted);

      if (result.success) {
        extracted[paramName] = result.value;
        reasoning.push(result.reasoning);
      } else if (required.includes(paramName)) {
        missing.push({
          name: paramName,
          schema: paramSchema,
          reason: result.reason
        });
      }
    }

    // 4. 计算置信度
    const confidence = this._calculateConfidence(schema, extracted, missing);

    return {
      success: missing.length === 0 && confidence >= this.options.confidenceThreshold,
      parameters: extracted,
      missing,
      reasoning: reasoning.join('; '),
      confidence
    };
  }

  /**
   * 提取单个参数
   * @private
   */
  _extractParameter(paramName, paramSchema, query, context) {
    const type = paramSchema.type || 'string';
    const description = paramSchema.description || '';

    // 1. 尝试从描述中提取线索
    const descriptionResult = this._extractFromDescription(paramName, description, query);
    if (descriptionResult.success) {
      return descriptionResult;
    }

    // 2. 尝试正则匹配
    const regexResult = this._extractByRegex(type, paramName, paramSchema, query);
    if (regexResult.success) {
      return regexResult;
    }

    // 3. 尝试位置匹配（参数名在查询中）
    const positionResult = this._extractByPosition(paramName, paramSchema, query);
    if (positionResult.success) {
      return positionResult;
    }

    // 4. 尝试 LLM 提取（如果可用）
    if (this.options.llmExtractor) {
      const llmResult = this._extractByLLM(paramName, paramSchema, query);
      if (llmResult.success) {
        return llmResult;
      }
    }

    return {
      success: false,
      reason: `无法从查询中提取参数 ${paramName}`
    };
  }

  /**
   * 从参数描述中提取
   * @private
   */
  _extractFromDescription(paramName, description, query) {
    // 检查描述中是否包含格式示例
    // 例如: "邮箱地址，格式为 user@example.com"
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const urlPattern = /https?:\/\/[^\s]+/g;
    const numberPattern = /\d+\.?\d*/g;

    if (description.includes('邮箱') || description.includes('email')) {
      const match = query.match(emailPattern);
      if (match) {
        return {
          success: true,
          value: match[0],
          reasoning: `从描述线索（邮箱）匹配到 ${match[0]}`
        };
      }
    }

    if (description.includes('URL') || description.includes('链接') || description.includes('网址')) {
      const match = query.match(urlPattern);
      if (match) {
        return {
          success: true,
          value: match[0],
          reasoning: `从描述线索（URL）匹配到 ${match[0]}`
        };
      }
    }

    if (description.includes('数量') || description.includes('次数') || description.includes('个数')) {
      const match = query.match(numberPattern);
      if (match) {
        return {
          success: true,
          value: parseFloat(match[0]),
          reasoning: `从描述线索（数量）匹配到 ${match[0]}`
        };
      }
    }

    return { success: false };
  }

  /**
   * 通过正则提取
   * @private
   */
  _extractByRegex(type, paramName, paramSchema, query) {
    // 通用正则模式
    const patterns = [];

    switch (type) {
      case 'string':
        // 引号内的内容
        patterns.push(/"([^"]+)"/g);
        patterns.push(/'([^']+)'/g);
        patterns.push(/([^"\s]+)/g);
        break;

      case 'number':
        // 数字
        patterns.push(/\d+\.?\d*/g);
        break;

      case 'boolean':
        // 是否/有没有
        patterns.push(/(?:是|有|开启|启用|true|yes)/gi);
        patterns.push(/(?:否|无|关闭|禁用|false|no)/gi);
        break;
    }

    // 根据参数名添加特定模式
    const nameLower = paramName.toLowerCase();

    // URL 参数
    if (nameLower.includes('url') || nameLower.includes('link')) {
      const urlMatch = query.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        return {
          success: true,
          value: urlMatch[0],
          reasoning: `通过参数名 ${paramName} 匹配 URL: ${urlMatch[0]}`
        };
      }
    }

    // 邮箱参数
    if (nameLower.includes('email') || nameLower.includes('mail')) {
      const emailMatch = query.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) {
        return {
          success: true,
          value: emailMatch[0],
          reasoning: `通过参数名 ${paramName} 匹配邮箱: ${emailMatch[0]}`
        };
      }
    }

    // 查询参数
    if (nameLower.includes('query') || nameLower.includes('search') || nameLower.includes('term')) {
      // 尝试匹配 "搜索 XXX" 或 "查询 XXX" 模式
      const searchMatch = query.match(/(?:搜索|查询|找)[:\s]+(.+?)(?:\s|$)/);
      if (searchMatch) {
        return {
          success: true,
          value: searchMatch[1].trim(),
          reasoning: `通过参数名 ${paramName} 提取搜索词: ${searchMatch[1]}`
        };
      }
    }

    // 通用正则匹配
    for (const pattern of patterns) {
      const matches = query.match(pattern);
      if (matches && matches.length > 0) {
        let value = matches[0];

        // 类型转换
        if (type === 'number') {
          value = parseFloat(value);
          if (isNaN(value)) continue;
        }

        return {
          success: true,
          value,
          reasoning: `通过正则匹配到 ${paramName}: ${value}`
        };
      }
    }

    return { success: false };
  }

  /**
   * 通过位置提取
   * @private
   */
  _extractByPosition(paramName, paramSchema, query) {
    const nameLower = paramName.toLowerCase();
    const words = query.split(/\s+/);

    // 查找参数名在查询中的位置
    for (let i = 0; i < words.length; i++) {
      const word = words[i].toLowerCase().replace(/[?:,。!！]/g, '');

      if (word === nameLower || word.includes(nameLower)) {
        // 尝试获取下一个词作为值
        if (i + 1 < words.length) {
          const nextWord = words[i + 1].replace(/[?:,。!！]/g, '');
          const type = paramSchema.type || 'string';

          if (type === 'number') {
            const num = parseFloat(nextWord);
            if (!isNaN(num)) {
              return {
                success: true,
                value: num,
                reasoning: `在参数名 ${paramName} 位置后提取到数字: ${num}`
              };
            }
          } else {
            return {
              success: true,
              value: nextWord,
              reasoning: `在参数名 ${paramName} 位置后提取到值: ${nextWord}`
            };
          }
        }

        // 尝试获取后续所有词作为值
        if (i + 2 < words.length) {
          const rest = words.slice(i + 1).join(' ');
          return {
            success: true,
            value: rest,
            reasoning: `在参数名 ${paramName} 位置后提取到文本: ${rest}`
          };
        }
      }
    }

    // 尝试中文字符分词
    if (/[\u4e00-\u9fa5]/.test(nameLower)) {
      // 中文参数名处理
      const chineseIndex = query.indexOf(nameLower);
      if (chineseIndex !== -1) {
        // 尝试获取冒号或等号后的值
        const afterColon = query.substring(chineseIndex).match(/[:：=\s]+(.+?)(?:\s|$)/);
        if (afterColon && afterColon[1]) {
          return {
            success: true,
            value: afterColon[1].trim(),
            reasoning: `从中文参数 ${paramName} 后提取到值: ${afterColon[1]}`
          };
        }
      }
    }

    return { success: false };
  }

  /**
   * 通过 LLM 提取
   * @private
   */
  async _extractByLLM(paramName, paramSchema, query) {
    try {
      const result = await this.options.llmExtractor({
        paramName,
        paramSchema,
        query,
        context: {}
      });

      if (result.success && result.confidence >= this.options.confidenceThreshold) {
        return {
          success: true,
          value: result.value,
          reasoning: `LLM 提取 ${paramName}: ${result.reasoning}`
        };
      }
    } catch (error) {
      logger.warn('LLM 提取失败', { error: error.message });
    }

    return { success: false };
  }

  /**
   * 计算置信度
   * @private
   */
  _calculateConfidence(schema, extracted, missing) {
    const properties = schema.properties || {};
    const required = schema.required || [];
    const total = Object.keys(properties).length;

    if (total === 0) return 1.0;

    // 已提取参数占比
    const extractedCount = Object.keys(extracted).length;
    const extractionRate = extractedCount / total;

    // 必需参数满足率
    const requiredMet = required.filter(r => extracted[r] !== undefined).length;
    const requiredRate = required.length > 0 ? requiredMet / required.length : 1.0;

    // 综合置信度
    const confidence = (extractionRate * 0.4 + requiredRate * 0.6);

    return Math.min(1.0, confidence);
  }

  /**
   * 验证提取的参数
   * @param {Object} tool - 工具元信息
   * @param {Object} parameters - 参数
   * @returns {{valid: boolean, errors: Object[]}}
   */
  validate(tool, parameters) {
    const schema = this.getSchema(tool);
    const properties = schema.properties || {};
    const required = schema.required || [];
    const errors = [];

    // 检查必需参数
    for (const param of required) {
      if (parameters[param] === undefined || parameters[param] === null) {
        errors.push({
          field: param,
          message: `缺少必需参数: ${param}`
        });
      }
    }

    // 检查参数类型
    for (const [key, value] of Object.entries(parameters)) {
      if (value === undefined || value === null) continue;

      const expectedType = properties[key]?.type;

      if (expectedType) {
        const valid = this._checkType(value, expectedType);
        if (!valid) {
          errors.push({
            field: key,
            message: `参数 ${key} 类型错误，期望 ${expectedType}，实际 ${typeof value}`,
            expected: expectedType,
            actual: typeof value
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 类型检查
   * @private
   */
  _checkType(value, expectedType) {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return true;
    }
  }

  /**
   * 转换参数类型
   * @param {Object} parameters - 原始参数
   * @param {Object} schema - 参数模式
   * @returns {Object} 转换后的参数
   */
  coerceTypes(parameters, schema) {
    const properties = schema.properties || {};
    const coerced = { ...parameters };

    for (const [key, value] of Object.entries(coerced)) {
      const paramSchema = properties[key];
      if (!paramSchema) continue;

      const expectedType = paramSchema.type;

      // 字符串转数字
      if (expectedType === 'number' && typeof value === 'string') {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          coerced[key] = num;
        }
      }

      // 字符串转布尔
      if (expectedType === 'boolean' && typeof value === 'string') {
        if (['true', 'yes', '1', '是', '有', '开启', '启用'].includes(value.toLowerCase())) {
          coerced[key] = true;
        } else if (['false', 'no', '0', '否', '无', '关闭', '禁用'].includes(value.toLowerCase())) {
          coerced[key] = false;
        }
      }

      // 字符串转数组（逗号分隔）
      if (expectedType === 'array' && typeof value === 'string') {
        coerced[key] = value.split(/[,，]/).map(s => s.trim()).filter(s => s);
      }
    }

    return coerced;
  }

  /**
   * 获取参数建议
   * @param {Object} tool - 工具元信息
   * @param {string} query - 用户查询
   * @returns {Object[]} 参数建议
   */
  getSuggestions(tool, query) {
    const schema = this.getSchema(tool);
    const properties = schema.properties || {};
    const suggestions = [];

    for (const [paramName, paramSchema] of Object.entries(properties)) {
      const result = this._extractParameter(paramName, paramSchema, query, {});

      suggestions.push({
        name: paramName,
        description: paramSchema.description || '',
        type: paramSchema.type,
        required: (schema.required || []).includes(paramName),
        suggested: result.success ? result.value : null,
        confidence: result.success ? 0.8 : 0
      });
    }

    return suggestions;
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.schemaCache.clear();
    this.patternCache.clear();
  }
}

/**
 * 创建参数提取器实例
 * @param {Object} options - 配置选项
 * @returns {MCPParameterExtractor}
 */
function createParameterExtractor(options = {}) {
  return new MCPParameterExtractor(options);
}

module.exports = {
  MCPParameterExtractor,
  MCPParameterExtractor: MCPParameterExtractor,
  createParameterExtractor
};
