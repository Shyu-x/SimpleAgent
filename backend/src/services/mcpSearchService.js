/**
 * MiniMax MCP 联网搜索服务
 * 通过 MCP 协议调用 MiniMax Coding Plan 的 web_search 工具
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');

class MiniMaxMCPSearchService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.apiKey = options.apiKey || process.env.MINIMAX_API_KEY;
    this.apiHost = options.apiHost || process.env.MINIMAX_API_HOST || 'https://api.minimaxi.com';
    this.process = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.initialized = false;
    this.initPromise = null;
  }

  /**
   * 初始化 MCP 服务器进程
   */
  async initialize() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._startMCPServer();
    return this.initPromise;
  }

  async _startMCPServer() {
    return new Promise((resolve, reject) => {
      try {
        // 使用 uvx 启动 MiniMax MCP 服务器
        this.process = spawn('uvx', ['minimax-coding-plan-mcp'], {
          env: {
            ...process.env,
            MINIMAX_API_KEY: this.apiKey,
            MINIMAX_API_HOST: this.apiHost
          },
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let buffer = '';

        this.process.stdout.on('data', (data) => {
          const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
          buffer += text;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                const message = JSON.parse(line);
                this._handleMessage(message);
              } catch (e) {
                // 忽略无法解析的行
              }
            }
          }
        });

        this.process.stderr.on('data', (data) => {
          console.error('[MCP Search] stderr:', data.toString());
        });

        this.process.on('error', (error) => {
          console.error('[MCP Search] 进程错误:', error);
          this.emit('error', error);
          reject(error);
        });

        this.process.on('exit', (code) => {
          console.log('[MCP Search] 进程退出:', code);
          this.initialized = false;
          this.emit('exit', code);
        });

        // 等待进程启动
        setTimeout(() => {
          this.initialized = true;
          console.log('[MCP Search] MCP 服务器已启动');
          resolve();
        }, 2000);

      } catch (error) {
        console.error('[MCP Search] 启动失败:', error);
        reject(error);
      }
    });
  }

  /**
   * 处理 MCP 消息
   */
  _handleMessage(message) {
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message || message.error));
      } else {
        resolve(message.result);
      }
    }
  }

  /**
   * 发送 MCP 请求
   */
  async _sendRequest(method, params = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const id = ++this.requestId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      if (this.process && this.process.stdin) {
        this.process.stdin.write(JSON.stringify(request) + '\n');
      } else {
        reject(new Error('MCP 进程未运行'));
      }

      // 超时处理
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('请求超时'));
        }
      }, 30000);
    });
  }

  /**
   * 执行搜索
   */
  async search(query, options = {}) {
    try {
      // 调用 MCP 的 web_search 工具
      const result = await this._sendRequest('tools/call', {
        name: 'web_search',
        arguments: {
          query,
          ...options
        }
      });

      return {
        success: true,
        query,
        results: result.results || [],
        totalResults: result.totalResults || 0
      };
    } catch (error) {
      console.error('[MCP Search] 搜索失败:', error);
      return {
        success: false,
        error: error.message,
        query
      };
    }
  }

  /**
   * 关闭 MCP 服务器
   */
  async close() {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.initialized = false;
    }
  }
}

// 导出单例
let mcpSearchInstance = null;

function getMCPSearchService(options = {}) {
  if (!mcpSearchInstance) {
    mcpSearchInstance = new MiniMaxMCPSearchService(options);
  }
  return mcpSearchInstance;
}

module.exports = {
  MiniMaxMCPSearchService,
  getMCPSearchService
};
