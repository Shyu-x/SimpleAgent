/**
 * MCP 客户端模块
 * 实现 Model Context Protocol 客户端功能
 * 参考: https://modelcontextprotocol.io
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

/**
 * MCP 工具定义
 */
const TOOL_DEFINITIONS = {
  // 文件系统工具
  filesystem: {
    name: 'filesystem',
    description: '读取和写入文件系统',
    tools: [
      {
        name: 'read_file',
        description: '读取文件内容',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件路径' }
          },
          required: ['path']
        }
      },
      {
        name: 'write_file',
        description: '写入文件内容',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件路径' },
            content: { type: 'string', description: '文件内容' }
          },
          required: ['path', 'content']
        }
      },
      {
        name: 'list_directory',
        description: '列出目录内容',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '目录路径' }
          },
          required: ['path']
        }
      }
    ]
  },

  // Web搜索工具
  websearch: {
    name: 'websearch',
    description: '搜索网络信息',
    tools: [
      {
        name: 'search',
        description: '搜索网络',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词' },
            limit: { type: 'number', description: '返回结果数量', default: 5 }
          },
          required: ['query']
        }
      }
    ]
  },

  // 计算器工具
  calculator: {
    name: 'calculator',
    description: '数学计算',
    tools: [
      {
        name: 'calculate',
        description: '执行数学计算',
        inputSchema: {
          type: 'object',
          properties: {
            expression: { type: 'string', description: '数学表达式' }
          },
          required: ['expression']
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
      console.log(`[MCP] 已注册 ${this.tools.size} 个内置工具`);
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
            return { success: true, content };
          } catch (error) {
            return { success: false, error: error.message };
          }
        },
        write_file: async ({ path, content }) => {
          const fs = require('fs').promises;
          try {
            await fs.writeFile(path, content, 'utf-8');
            return { success: true };
          } catch (error) {
            return { success: false, error: error.message };
          }
        },
        list_directory: async ({ path }) => {
          const fs = require('fs').promises;
          try {
            const files = await fs.readdir(path);
            return { success: true, files };
          } catch (error) {
            return { success: false, error: error.message };
          }
        }
      },
      websearch: {
        // 简化版Web搜索 - 实际需要API
        search: async ({ query, limit = 5 }) => {
          // 这里可以集成真实的搜索API
          return {
            success: true,
            results: [
              { title: `${query} - 结果1`, url: 'https://example.com/1', snippet: '这是搜索结果的摘要...' },
              { title: `${query} - 结果2`, url: 'https://example.com/2', snippet: '这是搜索结果的摘要...' },
            ].slice(0, limit)
          };
        }
      },
      calculator: {
        calculate: async ({ expression }) => {
          try {
            // 安全计算 - 仅支持基本运算
            const sanitized = expression.replace(/[^0-9+\-*/.() ]/g, '');
            const result = Function(`"use strict"; return (${sanitized})`)();
            return { success: true, result };
          } catch (error) {
            return { success: false, error: '无效的数学表达式' };
          }
        }
      }
    };

    return handlers[category]?.[toolName];
  }

  /**
   * 列出所有可用工具
   */
  listTools() {
    const toolList = [];
    this.tools.forEach((tool, name) => {
      toolList.push({
        name,
        description: tool.description,
        category: tool.category,
        inputSchema: tool.inputSchema
      });
    });
    return toolList;
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
        console.log(`[MCP] 已连接到服务器: ${serverName}, 工具数: ${tools.tools?.length || 0}`);
      }
      return { success: true, toolsCount: tools.tools?.length || 0 };
    } catch (error) {
      console.error(`[MCP] 连接服务器失败: ${serverName}`, error.message);
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