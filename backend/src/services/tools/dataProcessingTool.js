/**
 * 数据处理工具
 * 处理 JSON、CSV、文本等数据格式
 */

class DataProcessingTool {
  constructor(options = {}) {
    this.name = 'data_processing';
    this.description = '处理和转换数据格式：JSON、CSV、文本处理';
    this.category = 'data';
    this.maxDataSize = options.maxDataSize || 1024 * 1024; // 1MB
  }

  /**
   * 参数模式
   */
  get parameters() {
    return {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: [
            'json_parse', 'json_stringify', 'json_query',
            'csv_parse', 'csv_stringify',
            'text_split', 'text_join', 'text_replace', 'text_extract',
            'data_filter', 'data_map', 'data_sort', 'data_group',
            'base64_encode', 'base64_decode',
            'hash'
          ],
          description: '操作类型'
        },
        data: {
          type: 'string',
          description: '输入数据'
        },
        options: {
          type: 'object',
          description: '操作选项'
        }
      },
      required: ['operation', 'data']
    };
  }

  /**
   * 执行数据处理
   */
  async execute(params) {
    const { operation, data, options = {} } = params;

    // 数据大小检查
    if (data.length > this.maxDataSize) {
      return {
        success: false,
        error: `数据过大: ${data.length} bytes`
      };
    }

    try {
      switch (operation) {
        case 'json_parse':
          return this.jsonParse(data, options);

        case 'json_stringify':
          return this.jsonStringify(data, options);

        case 'json_query':
          return this.jsonQuery(data, options);

        case 'csv_parse':
          return this.csvParse(data, options);

        case 'csv_stringify':
          return this.csvStringify(data, options);

        case 'text_split':
          return this.textSplit(data, options);

        case 'text_join':
          return this.textJoin(data, options);

        case 'text_replace':
          return this.textReplace(data, options);

        case 'text_extract':
          return this.textExtract(data, options);

        case 'data_filter':
          return this.dataFilter(data, options);

        case 'data_map':
          return this.dataMap(data, options);

        case 'data_sort':
          return this.dataSort(data, options);

        case 'data_group':
          return this.dataGroup(data, options);

        case 'base64_encode':
          return this.base64Encode(data);

        case 'base64_decode':
          return this.base64Decode(data);

        case 'hash':
          return this.hashData(data, options);

        default:
          return { success: false, error: `未知操作: ${operation}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        operation
      };
    }
  }

  /**
   * JSON 解析
   */
  jsonParse(data, options) {
    try {
      const result = JSON.parse(data);
      return {
        success: true,
        data: result,
        type: Array.isArray(result) ? 'array' : typeof result
      };
    } catch (error) {
      return { success: false, error: `JSON 解析失败: ${error.message}` };
    }
  }

  /**
   * JSON 序列化
   */
  jsonStringify(data, options) {
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      const indent = options.pretty ? 2 : 0;
      const result = JSON.stringify(parsed, null, indent);
      return {
        success: true,
        data: result,
        size: result.length
      };
    } catch (error) {
      return { success: false, error: `JSON 序列化失败: ${error.message}` };
    }
  }

  /**
   * JSON 查询 (简单路径查询)
   */
  jsonQuery(data, options) {
    try {
      const parsed = JSON.parse(data);
      const path = options.path || '';

      if (!path) {
        return { success: true, data: parsed };
      }

      const keys = path.split('.').filter(k => k);
      let result = parsed;

      for (const key of keys) {
        if (result === null || result === undefined) {
          return { success: false, error: `路径不存在: ${path}` };
        }

        // 处理数组索引
        const arrayMatch = key.match(/^(\w+)\[(\d+)\]$/);
        if (arrayMatch) {
          const [, arrayKey, index] = arrayMatch;
          result = result[arrayKey]?.[parseInt(index)];
        } else {
          result = result[key];
        }
      }

      return {
        success: true,
        data: result,
        path
      };
    } catch (error) {
      return { success: false, error: `JSON 查询失败: ${error.message}` };
    }
  }

  /**
   * CSV 解析
   */
  csvParse(data, options) {
    try {
      const delimiter = options.delimiter || ',';
      const hasHeader = options.hasHeader !== false;
      const lines = data.split('\n').filter(line => line.trim());

      if (lines.length === 0) {
        return { success: true, data: [] };
      }

      const parseRow = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
          const char = line[i];

          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === delimiter && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());

        return result;
      };

      const headers = hasHeader ? parseRow(lines[0]) : null;
      const startIndex = hasHeader ? 1 : 0;

      const result = [];
      for (let i = startIndex; i < lines.length; i++) {
        const values = parseRow(lines[i]);
        if (headers) {
          const row = {};
          headers.forEach((h, idx) => {
            row[h] = values[idx] || '';
          });
          result.push(row);
        } else {
          result.push(values);
        }
      }

      return {
        success: true,
        data: result,
        rowCount: result.length,
        headers
      };
    } catch (error) {
      return { success: false, error: `CSV 解析失败: ${error.message}` };
    }
  }

  /**
   * CSV 序列化
   */
  csvStringify(data, options) {
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      const delimiter = options.delimiter || ',';

      if (!Array.isArray(parsed) || parsed.length === 0) {
        return { success: true, data: '' };
      }

      const escapeField = (field) => {
        const str = String(field ?? '');
        if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const isArray = Array.isArray(parsed[0]) && typeof parsed[0][0] !== 'object';
      let result;

      if (isArray) {
        result = parsed.map(row => row.map(escapeField).join(delimiter)).join('\n');
      } else {
        const headers = Object.keys(parsed[0]);
        const headerRow = headers.map(escapeField).join(delimiter);
        const dataRows = parsed.map(row =>
          headers.map(h => escapeField(row[h])).join(delimiter)
        );
        result = [headerRow, ...dataRows].join('\n');
      }

      return {
        success: true,
        data: result,
        size: result.length
      };
    } catch (error) {
      return { success: false, error: `CSV 序列化失败: ${error.message}` };
    }
  }

  /**
   * 文本分割
   */
  textSplit(data, options) {
    const separator = options.separator || '\n';
    const limit = options.limit || undefined;
    const result = data.split(separator).filter(s => s || options.keepEmpty);

    return {
      success: true,
      data: limit ? result.slice(0, limit) : result,
      count: result.length
    };
  }

  /**
   * 文本连接
   */
  textJoin(data, options) {
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      const separator = options.separator || '\n';

      if (!Array.isArray(parsed)) {
        return { success: false, error: '输入必须是数组' };
      }

      const result = parsed.join(separator);
      return {
        success: true,
        data: result,
        count: parsed.length
      };
    } catch (error) {
      return { success: false, error: `文本连接失败: ${error.message}` };
    }
  }

  /**
   * 文本替换
   */
  textReplace(data, options) {
    const { pattern, replacement, flags = 'g' } = options;

    if (!pattern) {
      return { success: false, error: '缺少 pattern 参数' };
    }

    try {
      const regex = new RegExp(pattern, flags);
      const result = data.replace(regex, replacement || '');

      return {
        success: true,
        data: result,
        replacements: (data.match(regex) || []).length
      };
    } catch (error) {
      return { success: false, error: `正则表达式错误: ${error.message}` };
    }
  }

  /**
   * 文本提取
   */
  textExtract(data, options) {
    const { pattern, flags = 'g' } = options;

    if (!pattern) {
      return { success: false, error: '缺少 pattern 参数' };
    }

    try {
      const regex = new RegExp(pattern, flags);
      const matches = data.match(regex) || [];

      return {
        success: true,
        data: matches,
        count: matches.length
      };
    } catch (error) {
      return { success: false, error: `正则表达式错误: ${error.message}` };
    }
  }

  /**
   * 数据过滤
   */
  dataFilter(data, options) {
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      const { field, operator = 'eq', value } = options;

      if (!Array.isArray(parsed)) {
        return { success: false, error: '输入必须是数组' };
      }

      const operators = {
        eq: (a, b) => a === b,
        ne: (a, b) => a !== b,
        gt: (a, b) => a > b,
        gte: (a, b) => a >= b,
        lt: (a, b) => a < b,
        lte: (a, b) => a <= b,
        contains: (a, b) => String(a).includes(b),
        starts: (a, b) => String(a).startsWith(b),
        ends: (a, b) => String(a).endsWith(b)
      };

      const op = operators[operator];
      if (!op) {
        return { success: false, error: `未知操作符: ${operator}` };
      }

      const result = parsed.filter(item => {
        const fieldValue = field ? item[field] : item;
        return op(fieldValue, value);
      });

      return {
        success: true,
        data: result,
        filtered: parsed.length - result.length
      };
    } catch (error) {
      return { success: false, error: `数据过滤失败: ${error.message}` };
    }
  }

  /**
   * 数据映射
   */
  dataMap(data, options) {
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      const { fields } = options;

      if (!Array.isArray(parsed)) {
        return { success: false, error: '输入必须是数组' };
      }

      if (!fields) {
        return { success: false, error: '缺少 fields 参数' };
      }

      const result = parsed.map(item => {
        if (Array.isArray(fields)) {
          return fields.map(f => item[f]);
        } else {
          const mapped = {};
          for (const [key, sourceKey] of Object.entries(fields)) {
            mapped[key] = item[sourceKey];
          }
          return mapped;
        }
      });

      return {
        success: true,
        data: result
      };
    } catch (error) {
      return { success: false, error: `数据映射失败: ${error.message}` };
    }
  }

  /**
   * 数据排序
   */
  dataSort(data, options) {
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      const { field, order = 'asc' } = options;

      if (!Array.isArray(parsed)) {
        return { success: false, error: '输入必须是数组' };
      }

      const result = [...parsed].sort((a, b) => {
        const valA = field ? a[field] : a;
        const valB = field ? b[field] : b;

        let comparison = 0;
        if (valA < valB) comparison = -1;
        if (valA > valB) comparison = 1;

        return order === 'desc' ? -comparison : comparison;
      });

      return {
        success: true,
        data: result
      };
    } catch (error) {
      return { success: false, error: `数据排序失败: ${error.message}` };
    }
  }

  /**
   * 数据分组
   */
  dataGroup(data, options) {
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      const { field } = options;

      if (!Array.isArray(parsed)) {
        return { success: false, error: '输入必须是数组' };
      }

      if (!field) {
        return { success: false, error: '缺少 field 参数' };
      }

      const groups = {};
      for (const item of parsed) {
        const key = item[field];
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(item);
      }

      return {
        success: true,
        data: groups,
        groupCount: Object.keys(groups).length
      };
    } catch (error) {
      return { success: false, error: `数据分组失败: ${error.message}` };
    }
  }

  /**
   * Base64 编码
   */
  base64Encode(data) {
    try {
      const encoded = Buffer.from(data, 'utf-8').toString('base64');
      return {
        success: true,
        data: encoded
      };
    } catch (error) {
      return { success: false, error: `Base64 编码失败: ${error.message}` };
    }
  }

  /**
   * Base64 解码
   */
  base64Decode(data) {
    try {
      const decoded = Buffer.from(data, 'base64').toString('utf-8');
      return {
        success: true,
        data: decoded
      };
    } catch (error) {
      return { success: false, error: `Base64 解码失败: ${error.message}` };
    }
  }

  /**
   * 哈希计算
   */
  hashData(data, options) {
    try {
      const algorithm = options.algorithm || 'sha256';
      const crypto = require('crypto');
      const hash = crypto.createHash(algorithm).update(data, 'utf-8').digest('hex');

      return {
        success: true,
        data: hash,
        algorithm
      };
    } catch (error) {
      return { success: false, error: `哈希计算失败: ${error.message}` };
    }
  }
}

module.exports = DataProcessingTool;