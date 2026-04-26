import { Injectable, Logger } from '@nestjs/common';

/**
 * MCP工具调用接口
 */
export interface MCPToolCall {
  name: string;
  arguments: Record<string, any>;
}

/**
 * MCP配置接口
 */
export interface MCPConfig {
  name: string;
  url: string;
  apiKey?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

/**
 * MCP工具定义
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  mcpServer?: string;
}

/**
 * MCP执行结果
 */
export interface MCPExecuteResult {
  success: boolean;
  tool: string;
  result?: any;
  error?: string;
  errorType?: string;
  executionTime: number;
}

/**
 * MCP协议执行器
 * 处理与MCP服务器的通信和工具执行
 */
@Injectable()
export class MCPToolExecutorService {
  private connections: Map<string, any> = new Map();
  private toolCache: Map<string, { tools: MCPTool[]; timestamp: number }> = new Map();
  private cacheTTL: number = 5 * 60 * 1000;

  /**
   * 执行MCP工具调用
   */
  async executeMCP(
    toolCall: MCPToolCall,
    mcpConfig: MCPConfig,
    context: Record<string, any> = {},
  ): Promise<MCPExecuteResult> {
    const startTime = Date.now();
    const { name, arguments: args } = toolCall;

    try {
      const connection = await this.getConnection(mcpConfig);

      const request = {
        jsonrpc: '2.0',
        id: this.generateRequestId(),
        method: 'tools/call',
        params: {
          name,
          arguments: args || {},
        },
      };

      const response = await this.sendRequest(connection, request, mcpConfig.timeout || 30000);

      if (response.error) {
        return {
          success: false,
          tool: name,
          error: response.error.message || 'MCP tool execution failed',
          errorType: 'execution',
          executionTime: Date.now() - startTime,
        };
      }

      return {
        success: true,
        tool: name,
        result: response.result || response,
        executionTime: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        tool: name,
        error: error.message || 'MCP tool execution failed',
        errorType: this.classifyError(error),
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * 列出MCP服务器上的所有工具
   */
  async listTools(mcpConfig: MCPConfig): Promise<MCPTool[]> {
    try {
      const cacheKey = this.getCacheKey(mcpConfig);
      const cached = this.getCachedTools(cacheKey);
      if (cached) {
        return cached;
      }

      const connection = await this.getConnection(mcpConfig);

      const request = {
        jsonrpc: '2.0',
        id: this.generateRequestId(),
        method: 'tools/list',
        params: {},
      };

      const response = await this.sendRequest(connection, request, mcpConfig.timeout || 30000);

      const tools = this.parseToolList(response, mcpConfig);
      this.cacheTools(cacheKey, tools);

      return tools;
    } catch (error) {
      console.error(`MCP list tools failed for ${mcpConfig.name}:`, error);
      return [];
    }
  }

  /**
   * 获取工具的schema定义
   */
  async getToolSchema(toolName: string, mcpConfig: MCPConfig): Promise<any | null> {
    try {
      const tools = await this.listTools(mcpConfig);
      const tool = tools.find((t) => t.name === toolName);

      if (!tool) {
        return null;
      }

      return {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema || { type: 'object', properties: {} },
      };
    } catch (error) {
      console.error('MCP get tool schema failed:', error);
      return null;
    }
  }

  /**
   * 批量执行MCP工具
   */
  async executeBatch(
    toolCalls: MCPToolCall[],
    mcpConfig: MCPConfig,
    options: { parallel?: boolean; stopOnError?: boolean; context?: any } = {},
  ): Promise<MCPExecuteResult[]> {
    const parallel = options.parallel !== false;
    const results: MCPExecuteResult[] = [];

    if (parallel) {
      const promises = toolCalls.map((tc) =>
        this.executeMCP(tc, mcpConfig, options.context),
      );
      const settled = await Promise.allSettled(promises);
      results.push(
        ...settled.map((r, i) =>
          r.status === 'fulfilled'
            ? r.value
            : {
                success: false,
                tool: toolCalls[i].name,
                error: r.reason?.message || 'Unknown error',
                errorType: 'execution',
                executionTime: 0,
              },
        ),
      );
    } else {
      for (const toolCall of toolCalls) {
        const result = await this.executeMCP(toolCall, mcpConfig, options.context);
        results.push(result);

        if (!result.success && options.stopOnError) {
          break;
        }
      }
    }

    return results;
  }

  /**
   * 获取或创建MCP连接
   */
  private async getConnection(mcpConfig: MCPConfig): Promise<any> {
    const key = `${mcpConfig.name}:${mcpConfig.url}`;

    if (this.connections.has(key)) {
      const conn = this.connections.get(key);
      if (conn.alive) {
        return conn;
      }
    }

    const connection = await this.establishConnection(mcpConfig);
    this.connections.set(key, {
      ...connection,
      config: mcpConfig,
      alive: true,
      createdAt: Date.now(),
    });

    return this.connections.get(key);
  }

  /**
   * 建立MCP连接
   */
  private async establishConnection(mcpConfig: MCPConfig): Promise<any> {
    const url = mcpConfig.url;

    if (url.startsWith('ws://') || url.startsWith('wss://')) {
      return this.createWebSocketConnection(mcpConfig);
    } else {
      return this.createHTTPConnection(mcpConfig);
    }
  }

  /**
   * 创建HTTP连接
   */
  private createHTTPConnection(mcpConfig: MCPConfig): any {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...mcpConfig.headers,
    };

    if (mcpConfig.apiKey) {
      headers['Authorization'] = `Bearer ${mcpConfig.apiKey}`;
    }

    return {
      type: 'http',
      url: mcpConfig.url,
      headers,
      sendRequest: async (request: any) => {
        const response = await fetch(mcpConfig.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
        }

        return response.json();
      },
    };
  }

  /**
   * 创建WebSocket连接
   */
  private createWebSocketConnection(mcpConfig: MCPConfig): Promise<any> {
    return new Promise((resolve, reject) => {
      const ws = new (require('ws').WebSocket)(mcpConfig.url, {
        headers: mcpConfig.headers || {},
      });

      const pendingRequests = new Map<number, any>();
      let requestId = 0;

      ws.on('open', () => {
        resolve({
          type: 'websocket',
          ws,
          sendRequest: (request: any) => {
            return new Promise((res, rej) => {
              const id = ++requestId;
              pendingRequests.set(id, { resolve: res, reject: rej });
              ws.send(JSON.stringify({ ...request, id }));
            });
          },
          close: () => ws.close(),
        });
      });

      ws.on('message', (data: any) => {
        try {
          const response = JSON.parse(data.toString());
          const pending = pendingRequests.get(response.id);
          if (pending) {
            pendingRequests.delete(response.id);
            pending.resolve(response);
          }
        } catch (e) {
          console.error('WebSocket message parse error:', e);
        }
      });

      ws.on('error', () => {
        reject(new Error('WebSocket connection error'));
      });

      ws.on('close', () => {
        pendingRequests.forEach((p) => p.reject(new Error('WebSocket closed')));
        pendingRequests.clear();
      });

      setTimeout(() => {
        if (ws.readyState !== 1) {
          ws.close();
          reject(new Error('WebSocket connection timeout'));
        }
      }, 30000);
    });
  }

  /**
   * 发送MCP请求
   */
  private async sendRequest(connection: any, request: any, timeout: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('MCP request timeout'));
      }, timeout);

      connection
        .sendRequest(request)
        .then((res: any) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err: any) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /**
   * 解析工具列表响应
   */
  private parseToolList(response: any, mcpConfig: MCPConfig): MCPTool[] {
    const tools = response.result?.tools || response.tools || [];

    return tools.map((tool: any) => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema || tool.parameters || { type: 'object', properties: {} },
      annotations: tool.annotations || null,
      mcpServer: mcpConfig.name,
    }));
  }

  /**
   * 分类错误类型
   */
  private classifyError(error: any): string {
    if (error.message?.includes('timeout')) return 'timeout';
    if (error.message?.includes('401') || error.message?.includes('403')) return 'auth';
    if (error.message?.includes('429')) return 'rate_limit';
    if (error.message?.includes('ECONNREFUSED')) return 'network';
    return 'execution';
  }

  /**
   * 获取缓存键
   */
  private getCacheKey(mcpConfig: MCPConfig): string {
    return `${mcpConfig.name}:${mcpConfig.url}`;
  }

  /**
   * 从缓存获取工具列表
   */
  private getCachedTools(cacheKey: string): MCPTool[] | null {
    const cached = this.toolCache.get(cacheKey);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.toolCache.delete(cacheKey);
      return null;
    }

    return cached.tools;
  }

  /**
   * 缓存工具列表
   */
  private cacheTools(cacheKey: string, tools: MCPTool[]): void {
    this.toolCache.set(cacheKey, {
      tools,
      timestamp: Date.now(),
    });
  }

  /**
   * 生成请求ID
   */
  private generateRequestId(): string {
    return `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 关闭所有连接
   */
  async close(): Promise<void> {
    for (const [key, conn] of this.connections) {
      try {
        if (conn.ws) {
          conn.ws.close();
        }
        if (conn.close) {
          conn.close();
        }
      } catch (e) {
        console.warn(`Failed to close connection ${key}:`, e);
      }
    }
    this.connections.clear();
    this.toolCache.clear();
  }

  /**
   * 移除指定MCP连接
   */
  removeConnection(name: string, url: string): void {
    const key = `${name}:${url}`;
    const conn = this.connections.get(key);
    if (conn) {
      if (conn.ws) conn.ws.close();
      if (conn.close) conn.close();
      this.connections.delete(key);
      this.toolCache.delete(key);
    }
  }
}
