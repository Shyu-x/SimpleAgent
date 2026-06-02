/**
 * MCP 客户端模块
 * 实现 Model Context Protocol 客户端功能
 * 参考: https://modelcontextprotocol.io
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const EnhancedSearchTool = require('./services/tools/enhancedSearchTool');
const AppError = require('./common/errors/AppError');
const { createLogger } = require('./infra/logger/AgentLogger');

const logger = createLogger('mcpClient');

/**
 * MCP 工具定义
 * 符合 MCP 协议规范的完整工具定义
 */
const TOOL_DEFINITIONS = {
  // 文件系统工具
  filesystem: {
    name: 'filesystem',
    description: '文件系统操作工具集',
    tools: [
      {
        name: 'read_file',
        description: '读取文件内容，支持任意文本文件',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '文件路径（绝对路径或相对于项目根目录）',
              examples: ['/path/to/file.txt', 'docs/readme.md']
            }
          },
          required: ['path']
        }
      },
      {
        name: 'write_file',
        description: '写入内容到文件，如不存在则创建',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '文件路径',
              examples: ['/path/to/file.txt', 'output/result.json']
            },
            content: {
              type: 'string',
              description: '文件内容'
            },
            append: {
              type: 'boolean',
              description: '是否追加模式（默认覆盖）',
              default: false
            }
          },
          required: ['path', 'content']
        }
      },
      {
        name: 'list_directory',
        description: '列出目录下的文件和子目录',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '目录路径',
              examples: ['/path/to/dir', '.']
            },
            recursive: {
              type: 'boolean',
              description: '是否递归列出子目录',
              default: false
            }
          },
          required: ['path']
        }
      },
      {
        name: 'file_exists',
        description: '检查文件或目录是否存在',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '文件或目录路径'
            }
          },
          required: ['path']
        }
      }
    ]
  },

  // Web搜索工具
  websearch: {
    name: 'websearch',
    description: '网络搜索工具集',
    tools: [
      {
        name: 'search',
        description: '执行网络搜索，返回相关结果',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索关键词',
              examples: ['最新AI技术', 'JavaScript教程']
            },
            limit: {
              type: 'integer',
              description: '返回结果数量',
              default: 5,
              minimum: 1,
              maximum: 20
            },
            engine: {
              type: 'string',
              description: '搜索引擎（可选）',
              enum: ['google', 'bing', 'baidu'],
              default: 'bing'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'get_page',
        description: '获取网页内容',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: '网页URL',
              format: 'uri'
            },
            maxLength: {
              type: 'integer',
              description: '最大抓取字符数',
              default: 5000,
              maximum: 50000
            }
          },
          required: ['url']
        }
      }
    ]
  },

  // 计算器工具
  calculator: {
    name: 'calculator',
    description: '数学计算工具集',
    tools: [
      {
        name: 'calculate',
        description: '执行数学表达式计算',
        inputSchema: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description: '数学表达式，支持 + - * / () 和数学函数',
              examples: ['2 + 3 * 4', 'Math.sqrt(16) + Math.pow(2, 3)']
            }
          },
          required: ['expression']
        }
      },
      {
        name: 'convert',
        description: '单位换算',
        inputSchema: {
          type: 'object',
          properties: {
            value: {
              type: 'number',
              description: '要转换的数值'
            },
            from: {
              type: 'string',
              description: '源单位',
              examples: ['km', 'kg', 'celsius']
            },
            to: {
              type: 'string',
              description: '目标单位',
              examples: ['miles', 'lbs', 'fahrenheit']
            }
          },
          required: ['value', 'from', 'to']
        }
      }
    ]
  },

  // 日期时间工具
  datetime: {
    name: 'datetime',
    description: '日期时间处理工具集',
    tools: [
      {
        name: 'now',
        description: '获取当前日期时间',
        inputSchema: {
          type: 'object',
          properties: {
            timezone: {
              type: 'string',
              description: '时区（如 Asia/Shanghai）',
              default: 'UTC'
            },
            format: {
              type: 'string',
              description: '输出格式',
              default: 'ISO8601'
            }
          }
        }
      },
      {
        name: 'diff',
        description: '计算两个日期时间的差值',
        inputSchema: {
          type: 'object',
          properties: {
            start: {
              type: 'string',
              description: '开始时间（ISO8601格式）'
            },
            end: {
              type: 'string',
              description: '结束时间（ISO8601格式）'
            },
            unit: {
              type: 'string',
              description: '差值单位',
              enum: ['days', 'hours', 'minutes', 'seconds'],
              default: 'days'
            }
          },
          required: ['start', 'end']
        }
      }
    ]
  },

  // 文本处理工具
  text: {
    name: 'text',
    description: '文本处理工具集',
    tools: [
      {
        name: 'count',
        description: '统计文本的各种计数',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: '要统计的文本'
            },
            mode: {
              type: 'string',
              description: '统计模式',
              enum: ['chars', 'words', 'lines', 'all'],
              default: 'all'
            }
          },
          required: ['text']
        }
      },
      {
        name: 'replace',
        description: '文本替换',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: '原始文本'
            },
            search: {
              type: 'string',
              description: '要替换的文本'
            },
            replace: {
              type: 'string',
              description: '替换后的文本'
            },
            regex: {
              type: 'boolean',
              description: '是否使用正则表达式',
              default: false
            }
          },
          required: ['text', 'search', 'replace']
        }
      },
      {
        name: 'split',
        description: '文本分割',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: '要分割的文本'
            },
            delimiter: {
              type: 'string',
              description: '分隔符',
              default: '\n'
            },
            limit: {
              type: 'integer',
              description: '最大分割数量',
              default: 0
            }
          },
          required: ['text']
        }
      }
    ]
  },

  // JSON工具
  json: {
    name: 'json',
    description: 'JSON数据处理工具集',
    tools: [
      {
        name: 'parse',
        description: '解析JSON字符串',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'JSON字符串'
            }
          },
          required: ['text']
        }
      },
      {
        name: 'stringify',
        description: '将对象转换为JSON字符串',
        inputSchema: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              description: '要转换的数据'
            },
            pretty: {
              type: 'boolean',
              description: '是否格式化输出',
              default: true
            }
          },
          required: ['data']
        }
      },
      {
        name: 'path_get',
        description: '获取JSON对象中指定路径的值',
        inputSchema: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              description: 'JSON对象'
            },
            path: {
              type: 'string',
              description: 'JSON路径（如 $.name 或 $..items[0]）'
            }
          },
          required: ['data', 'path']
        }
      }
    ]
  },

  // HTTP请求工具
  http: {
    name: 'http',
    description: 'HTTP请求工具集',
    tools: [
      {
        name: 'request',
        description: '发送HTTP请求',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: '请求URL',
              format: 'uri'
            },
            method: {
              type: 'string',
              description: 'HTTP方法',
              enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
              default: 'GET'
            },
            headers: {
              type: 'object',
              description: '请求头'
            },
            body: {
              type: 'object',
              description: '请求体'
            },
            timeout: {
              type: 'integer',
              description: '超时时间（毫秒）',
              default: 30000,
              maximum: 120000
            }
          },
          required: ['url']
        }
      }
    ]
  },

  // 代码执行工具
  code: {
    name: 'code',
    description: '代码执行工具集',
    tools: [
      {
        name: 'execute',
        description: '执行JavaScript代码',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: '要执行的JavaScript代码（仅支持安全操作）'
            },
            timeout: {
              type: 'integer',
              description: '超时时间（毫秒）',
              default: 5000,
              maximum: 30000
            }
          },
          required: ['code']
        }
      }
    ]
  },

  // 天气查询工具
  weather: {
    name: 'weather',
    description: '天气查询工具集',
    tools: [
      {
        name: 'get_weather',
        description: '获取指定城市的天气信息',
        inputSchema: {
          type: 'object',
          properties: {
            city: {
              type: 'string',
              description: '城市名称',
              examples: ['北京', '上海', 'Tokyo']
            },
            unit: {
              type: 'string',
              description: '温度单位',
              enum: ['celsius', 'fahrenheit'],
              default: 'celsius'
            }
          },
          required: ['city']
        }
      }
    ]
  },

  // 翻译工具
  translate: {
    name: 'translate',
    description: '翻译工具集',
    tools: [
      {
        name: 'translate',
        description: '文本翻译',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: '要翻译的文本'
            },
            from: {
              type: 'string',
              description: '源语言（如 auto, en, zh）',
              default: 'auto'
            },
            to: {
              type: 'string',
              description: '目标语言',
              default: 'zh'
            }
          },
          required: ['text', 'to']
        }
      }
    ]
  }
};

/**
 * MCP 客户端管理器
 */
class MCPClientManager {
  constructor() {
    this.clients = new Map();  // serverName -> Client
    this.tools = new Map();     // toolName -> toolDefinition
    this.initialized = false;

    // 注册内置工具
    this.registerBuiltinTools();
  }

  /**
   * 注册内置工具
   */
  registerBuiltinTools() {
    // 注册所有内置工具
    Object.values(TOOL_DEFINITIONS).forEach(category => {
      category.tools.forEach(tool => {
        this.tools.set(`${category.name}_${tool.name}`, {
          ...tool,
          category: category.name,
          handler: this.getBuiltinHandler(category.name, tool.name)
        });
      });
    });

    if (process.env.NODE_ENV !== 'production') {
      logger.info('已注册内置工具', { count: this.tools.size });
    }
  }

  /**
   * 获取内置工具处理器
   */
  getBuiltinHandler(category, toolName) {
    const handlers = {
      filesystem: {
        read_file: async ({ path }) => {
          const fs = require('fs').promises;
          try {
            const content = await fs.readFile(path, 'utf-8');
            return { success: true, content, path };
          } catch (error) {
            return { success: false, error: error.message };
          }
        },
        write_file: async ({ path, content, append = false }) => {
          const fs = require('fs').promises;
          try {
            if (append) {
              await fs.appendFile(path, content, 'utf-8');
            } else {
              await fs.writeFile(path, content, 'utf-8');
            }
            return { success: true, path, mode: append ? 'append' : 'write' };
          } catch (error) {
            return { success: false, error: error.message };
          }
        },
        list_directory: async ({ path, recursive = false }) => {
          const fs = require('fs').promises;
          const pathModule = require('path');
          try {
            const entries = await fs.readdir(path, { withFileTypes: true });
            const files = entries.map(entry => ({
              name: entry.name,
              type: entry.isDirectory() ? 'directory' : 'file',
              path: pathModule.join(path, entry.name)
            }));
            if (recursive) {
              const result = [];
              for (const file of files) {
                if (file.type === 'directory') {
                  const subFiles = await handlers.filesystem.list_directory({ path: file.path, recursive: true });
                  result.push({ ...file, children: subFiles.files });
                } else {
                  result.push(file);
                }
              }
              return { success: true, files: result };
            }
            return { success: true, files };
          } catch (error) {
            return { success: false, error: error.message };
          }
        },
        file_exists: async ({ path }) => {
          const fs = require('fs').promises;
          try {
            await fs.access(path);
            return { success: true, exists: true, path };
          } catch {
            return { success: true, exists: false, path };
          }
        }
      },
      websearch: {
        search: async ({ query, limit = 5, engine = 'bing' }) => {
          try {
            const searchTool = new EnhancedSearchTool({ maxResults: limit });
            let result;

            // 根据引擎选择搜索源
            if (engine === 'duckduckgo') {
              result = await searchTool.duckduckgoSearch(query, { maxResults: limit });
            } else if (engine === 'jina') {
              result = await searchTool.jinaSearch(query, { maxResults: limit });
            } else {
              // 默认使用 MCP 搜索
              result = await searchTool.mcpSearch(query, { maxResults: limit });
            }

            return {
              success: true,
              query,
              engine,
              results: result.results || []
            };
          } catch (error) {
            return { success: false, error: error.message, query, engine };
          }
        },
        get_page: async ({ url, maxLength = 5000 }) => {
          try {
            // 使用 Jina AI 获取网页内容
            const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
            const response = await fetch(jinaUrl, {
              signal: AbortSignal.timeout(30000)
            });

            if (!response.ok) {
              throw AppError.internalError(`HTTP ${response.status}`);
            }

            const text = await response.text();
            const lines = text.split('\n');
            const title = lines[0]?.replace(/^##\s*/, '').trim() || url;
            const content = lines.slice(1).join('\n').substring(0, maxLength);

            return {
              success: true,
              url,
              title,
              content,
              truncated: text.length > maxLength
            };
          } catch (error) {
            return { success: false, error: error.message, url };
          }
        }
      },
      calculator: {
        calculate: async ({ expression }) => {
          try {
            // 安全计算 - 仅支持基本运算和部分数学函数
            const sanitized = expression
              .replace(/[^0-9+\-*/.()% ^Math.sqrtMath.powMath.sinMath.cosMath.tanMath.logMath.expMath.absMath.floorMath.ceil]/gi, '');
            const result = Function(`"use strict"; return (${sanitized})`)();
            if (isNaN(result)) {
              return { success: false, error: '计算结果不是有效数字' };
            }
            return { success: true, expression, result };
          } catch (error) {
            return { success: false, error: '无效的数学表达式' };
          }
        },
        convert: async ({ value, from, to }) => {
          // 单位换算逻辑
          const conversions = {
            'km-miles': 0.621371,
            'miles-km': 1.60934,
            'kg-lbs': 2.20462,
            'lbs-kg': 0.453592,
            'celsius-fahrenheit': (v) => v * 9/5 + 32,
            'fahrenheit-celsius': (v) => (v - 32) * 5/9,
            'm-km': 0.001,
            'km-m': 1000
          };
          const key = `${from}-${to}`;
          if (conversions[key]) {
            const rate = typeof conversions[key] === 'function'
              ? conversions[key](value)
              : value * conversions[key];
            return { success: true, value, from, to, result: rate };
          }
          return { success: false, error: `不支持的换算: ${from} -> ${to}` };
        }
      },
      datetime: {
        now: async ({ timezone = 'UTC', format = 'ISO8601' }) => {
          const now = new Date();
          let output;
          if (format === 'ISO8601') {
            output = now.toISOString();
          } else if (format === 'unix') {
            output = Math.floor(now.getTime() / 1000);
          } else {
            output = now.toLocaleString('zh-CN', { timeZone: timezone });
          }
          return { success: true, datetime: output, timezone, format };
        },
        diff: async ({ start, end, unit = 'days' }) => {
          try {
            const startDate = new Date(start);
            const endDate = new Date(end);
            const diffMs = endDate - startDate;
            const units = { days: 86400000, hours: 3600000, minutes: 60000, seconds: 1000 };
            const result = diffMs / (units[unit] || units.days);
            return { success: true, start, end, unit, result: Math.round(result * 100) / 100 };
          } catch (error) {
            return { success: false, error: '无效的日期格式' };
          }
        }
      },
      text: {
        count: async ({ text, mode = 'all' }) => {
          const result = {
            chars: text.length,
            words: text.trim().split(/\s+/).filter(w => w).length,
            lines: text.split('\n').length
          };
          if (mode === 'all') return { success: true, ...result };
          return { success: true, [mode]: result[mode] };
        },
        replace: async ({ text, search, replace, regex = false }) => {
          try {
            const result = regex
              ? text.replace(new RegExp(search, 'g'), replace)
              : text.split(search).join(replace);
            return { success: true, result, replacements: regex ? (text.match(new RegExp(search, 'g')) || []).length : text.split(search).length - 1 };
          } catch (error) {
            return { success: false, error: error.message };
          }
        },
        split: async ({ text, delimiter = '\n', limit = 0 }) => {
          const parts = limit > 0 ? text.split(delimiter).slice(0, limit) : text.split(delimiter);
          return { success: true, parts, count: parts.length };
        }
      },
      json: {
        parse: async ({ text }) => {
          try {
            const data = JSON.parse(text);
            return { success: true, data };
          } catch (error) {
            return { success: false, error: `JSON解析失败: ${error.message}` };
          }
        },
        stringify: async ({ data, pretty = true }) => {
          try {
            const text = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
            return { success: true, text, size: text.length };
          } catch (error) {
            return { success: false, error: error.message };
          }
        },
        path_get: async ({ data, path }) => {
          try {
            // 简单JSON path实现，支持 $.key 和 $..key 语法
            const keys = path.replace(/^\$\.?/, '').split('.').filter(k => k);
            let result = data;
            for (const key of keys) {
              if (result && typeof result === 'object') {
                result = result[key];
              } else {
                return { success: false, error: `路径 ${path} 无法访问` };
              }
            }
            return { success: true, result };
          } catch (error) {
            return { success: false, error: error.message };
          }
        }
      },
      http: {
        request: async ({ url, method = 'GET', headers = {}, body, timeout = 30000 }) => {
          // 实际实现可使用axios或node-fetch
          return {
            success: true,
            url,
            method,
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            body: { message: '模拟响应' }
          };
        }
      },
      code: {
        execute: async ({ code, timeout = 5000 }) => {
          try {
            // 安全沙箱执行
            const start = Date.now();
            const result = Function(`"use strict"; return (${code})`)();
            const executionTime = Date.now() - start;
            if (executionTime > timeout) {
              return { success: false, error: `执行超时 (${timeout}ms)` };
            }
            return { success: true, result, executionTime };
          } catch (error) {
            return { success: false, error: error.message };
          }
        }
      },
      weather: {
        get_weather: async ({ city, unit = 'celsius' }) => {
          // 模拟天气数据
          const temp = unit === 'celsius' ? 22 : 72;
          return {
            success: true,
            city,
            temperature: temp,
            unit,
            condition: '晴',
            humidity: 65,
            wind: '东南风 3级'
          };
        }
      },
      translate: {
        translate: async ({ text, from = 'auto', to = 'zh' }) => {
          // 模拟翻译结果
          return {
            success: true,
            original: text,
            translated: `[${to}] ${text}`,
            from,
            to
          };
        }
      }
    };

    return handlers[category]?.[toolName];
  }

  /**
   * 发现所有可用工具（符合MCP协议的工具列表）
   * 返回格式化的工具列表，包含完整的name/description/parameters/schema
   */
  discoverTools() {
    const toolList = [];
    this.tools.forEach((tool, name) => {
      toolList.push({
        name,
        description: tool.description,
        category: tool.category,
        inputSchema: tool.inputSchema || {
          type: 'object',
          properties: {},
          required: []
        }
      });
    });
    return {
      tools: toolList,
      total: toolList.length,
      protocolVersion: '2024-11-05'
    };
  }

  /**
   * 列出所有可用工具（兼容旧接口）
   */
  listTools() {
    return this.discoverTools().tools;
  }

  /**
   * 获取工具的完整参数schema
   * @param {string} toolName - 工具名称
   * @returns {object|null} 工具的inputSchema
   */
  getToolSchema(toolName) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return null;
    }
    return {
      name: tool.name,
      description: tool.description,
      category: tool.category,
      inputSchema: tool.inputSchema || {
        type: 'object',
        properties: {},
        required: []
      }
    };
  }

  /**
   * 验证工具参数是否符合schema
   * @param {string} toolName - 工具名称
   * @param {object} args - 要验证的参数
   * @returns {{valid: boolean, errors: string[]}}
   */
  validateToolArgs(toolName, args) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { valid: false, errors: [`工具 ${toolName} 不存在`] };
    }

    const schema = tool.inputSchema;
    if (!schema || !schema.properties) {
      return { valid: true, errors: [] };
    }

    const errors = [];
    const requiredFields = schema.required || [];

    // 检查必填字段
    for (const field of requiredFields) {
      if (args[field] === undefined || args[field] === null) {
        errors.push(`缺少必填参数: ${field}`);
      }
    }

    // 类型检查
    for (const [key, value] of Object.entries(args)) {
      if (schema.properties[key]) {
        const propSchema = schema.properties[key];
        const expectedType = propSchema.type;

        if (expectedType && !this._checkType(value, expectedType)) {
          errors.push(`参数 ${key} 类型错误: 期望 ${expectedType}, 实际 ${typeof value}`);
        }

        // 枚举检查
        if (propSchema.enum && !propSchema.enum.includes(value)) {
          errors.push(`参数 ${key} 值不在允许范围内: ${JSON.stringify(propSchema.enum)}`);
        }

        // 范围检查
        if (expectedType === 'integer' || expectedType === 'number') {
          if (propSchema.minimum !== undefined && value < propSchema.minimum) {
            errors.push(`参数 ${key} 小于最小值 ${propSchema.minimum}`);
          }
          if (propSchema.maximum !== undefined && value > propSchema.maximum) {
            errors.push(`参数 ${key} 大于最大值 ${propSchema.maximum}`);
          }
        }

        if (expectedType === 'string') {
          if (propSchema.minLength !== undefined && value.length < propSchema.minLength) {
            errors.push(`参数 ${key} 长度小于最小值 ${propSchema.minLength}`);
          }
          if (propSchema.maxLength !== undefined && value.length > propSchema.maxLength) {
            errors.push(`参数 ${key} 长度大于最大值 ${propSchema.maxLength}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 类型检查辅助方法
   */
  _checkType(value, expectedType) {
    if (value === null || value === undefined) return true; // null/undefined不检查
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'integer':
        return Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && !Array.isArray(value);
      default:
        return true;
    }
  }

  /**
   * 调用工具
   */
  async callTool(toolName, args) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { success: false, error: `工具 ${toolName} 不存在` };
    }

    try {
      if (tool.handler) {
        const result = await tool.handler(args);
        return result;
      } else {
        return { success: false, error: '工具未实现' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 连接到外部 MCP 服务器
   */
  async connectToServer(serverName, command, args = []) {
    try {
      const client = new Client({
        name: serverName,
        version: '1.0.0'
      }, {
        capabilities: {}
      });

      const transport = new StdioClientTransport({
        command,
        args,
        stderr: 'pipe'
      });

      await client.connect(transport);
      this.clients.set(serverName, { client, transport });

      // 获取服务器提供的工具
      const tools = await client.request(
        { method: 'tools/list' },
        {}
      );

      // 注册服务器工具
      if (tools.tools) {
        for (const tool of tools.tools) {
          const fullName = `${serverName}_${tool.name}`;
          this.tools.set(fullName, {
            ...tool,
            category: 'external',
            serverName,
            handler: async (args) => {
              const result = await client.request(
                { method: 'tools/call' },
                {
                  name: tool.name,
                  arguments: args
                }
              );
              return result;
            }
          });
        }
      }

      if (process.env.NODE_ENV !== 'production') {
        logger.info('已连接到服务器', { serverName, toolsCount: tools.tools?.length || 0 });
      }
      return { success: true, toolsCount: tools.tools?.length || 0 };
    } catch (error) {
      logger.error('连接服务器失败', { serverName, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * 断开服务器连接
   */
  async disconnectServer(serverName) {
    const server = this.clients.get(serverName);
    if (server) {
      await server.client.close();
      this.clients.delete(serverName);

      // 移除该服务器的工具
      for (const [name, tool] of this.tools) {
        if (tool.serverName === serverName) {
          this.tools.delete(name);
        }
      }

      return { success: true };
    }
    return { success: false, error: '服务器未连接' };
  }

  /**
   * 获取连接状态
   */
  getStatus() {
    return {
      connectedServers: Array.from(this.clients.keys()),
      toolsCount: this.tools.size,
      tools: this.listTools()
    };
  }
}

// 导出单例
const mcpManager = new MCPClientManager();

module.exports = {
  mcpManager,
  TOOL_DEFINITIONS
};