/**
 * MiniMax M2.7 Agent 运行器
 * 参考 Mini-Agent (https://github.com/MiniMax-AI/Mini-Agent)
 * 实现完整的 Agent 执行循环，支持交错式思维和工具调用
 */

const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const EXECUTION_TIMEOUT = 60000; // 60秒执行超时

/**
 * 工具执行结果
 */
class ToolResult {
  constructor(success, content = '', error = null) {
    this.success = success;
    this.content = content;
    this.error = error;
  }

  toJSON() {
    return {
      success: this.success,
      content: this.content,
      error: this.error
    };
  }
}

/**
 * 消息结构
 */
class Message {
  constructor(role, content, options = {}) {
    this.role = role;
    this.content = content;
    this.thinking = options.thinking || null;
    this.tool_calls = options.tool_calls || null;
    this.tool_call_id = options.tool_call_id || null;
  }

  toAPIFormat() {
    const msg = {
      role: this.role,
      content: this.content
    };
    // MiniMax M2.7: 保留 reasoning_details
    if (this.thinking) {
      msg.reasoning_details = [{ type: 'reasoning.text', text: this.thinking }];
    }
    if (this.tool_calls) {
      msg.tool_calls = this.tool_calls;
    }
    if (this.tool_call_id) {
      msg.tool_call_id = this.tool_call_id;
    }
    return msg;
  }
}

/**
 * 基础工具类
 */
class BaseTool {
  constructor(name, description, parameters) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
  }

  getSchema() {
    return {
      name: this.name,
      description: this.description,
      input_schema: this.parameters
    };
  }

  getOpenAISchema() {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters
      }
    };
  }

  async execute(input) {
    throw new Error('子类必须实现 execute 方法');
  }
}

/**
 * 文件读取工具
 */
class FileReadTool extends BaseTool {
  constructor(workspaceDir = './workspace') {
    super(
      'file_read',
      '读取文件内容',
      {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文件路径（相对于工作目录）'
          },
          lines: {
            type: 'integer',
            description: '最多读取的行数（默认全部）',
            default: -1
          }
        },
        required: ['path']
      }
    );
    this.workspaceDir = path.resolve(workspaceDir);
  }

  async execute(input) {
    try {
      const filePath = path.join(this.workspaceDir, input.path);
      const stats = await fs.stat(filePath);

      if (!stats.isFile()) {
        return new ToolResult(false, '', '不是文件');
      }

      const content = await fs.readFile(filePath, 'utf-8');

      if (input.lines && input.lines > 0) {
        const lines = content.split('\n').slice(0, input.lines);
        return new ToolResult(true, lines.join('\n') + `\n\n[...共 ${content.split('\n').length} 行]`);
      }

      return new ToolResult(true, content);
    } catch (error) {
      return new ToolResult(false, '', error.message);
    }
  }
}

/**
 * 文件写入工具
 */
class FileWriteTool extends BaseTool {
  constructor(workspaceDir = './workspace') {
    super(
      'file_write',
      '写入内容到文件',
      {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文件路径（相对于工作目录）'
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
    );
    this.workspaceDir = path.resolve(workspaceDir);
  }

  async execute(input) {
    try {
      const filePath = path.join(this.workspaceDir, input.path);
      const dir = path.dirname(filePath);

      // 确保目录存在
      await fs.mkdir(dir, { recursive: true });

      // 写入文件
      if (input.append) {
        await fs.appendFile(filePath, input.content, 'utf-8');
      } else {
        await fs.writeFile(filePath, input.content, 'utf-8');
      }

      return new ToolResult(true, `文件 ${input.path} ${input.append ? '已追加' : '已写入'}`);
    } catch (error) {
      return new ToolResult(false, '', error.message);
    }
  }
}

/**
 * 文件列表工具
 */
class FileListTool extends BaseTool {
  constructor(workspaceDir = './workspace') {
    super(
      'file_list',
      '列出目录中的文件',
      {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '目录路径（相对于工作目录，默认根目录）',
            default: '.'
          },
          recursive: {
            type: 'boolean',
            description: '是否递归列出子目录',
            default: false
          }
        }
      }
    );
    this.workspaceDir = path.resolve(workspaceDir);
  }

  async execute(input) {
    try {
      const dirPath = path.join(this.workspaceDir, input.path || '.');

      if (input.recursive) {
        const files = await this._listRecursive(dirPath, this.workspaceDir);
        return new ToolResult(true, files.join('\n'));
      } else {
        const entries = await fs.readdir(dirPath);
        const result = [];
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry);
          const stats = await fs.stat(fullPath);
          result.push(`${stats.isDirectory() ? '[DIR]' : '[FILE]'} ${entry}`);
        }
        return new ToolResult(true, result.join('\n'));
      }
    } catch (error) {
      return new ToolResult(false, '', error.message);
    }
  }

  async _listRecursive(dir, baseDir, depth = 0) {
    const results = [];
    const entries = await fs.readdir(dir);

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const relativePath = path.relative(baseDir, fullPath);
      const stats = await fs.stat(fullPath);

      results.push(`${'  '.repeat(depth)}${stats.isDirectory() ? '[DIR]' : '[FILE]'} ${relativePath}`);

      if (stats.isDirectory() && depth < 5) {
        const subResults = await this._listRecursive(fullPath, baseDir, depth + 1);
        results.push(...subResults);
      }
    }

    return results;
  }
}

/**
 * Shell 执行工具
 */
class ShellTool extends BaseTool {
  constructor(workspaceDir = './workspace') {
    super(
      'shell',
      '执行 Shell 命令',
      {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: '要执行的命令'
          },
          timeout: {
            type: 'integer',
            description: '超时时间（毫秒）',
            default: 30000
          }
        },
        required: ['command']
      }
    );
    this.workspaceDir = path.resolve(workspaceDir);
  }

  async execute(input) {
    return new Promise((resolve) => {
      const timeout = input.timeout || 30000;
      const timer = setTimeout(() => {
        resolve(new ToolResult(false, '', `命令执行超时 (${timeout}ms)`));
      }, timeout);

      try {
        exec(input.command, {
          cwd: this.workspaceDir,
          maxBuffer: 10 * 1024 * 1024, // 10MB
          encoding: 'utf-8'
        }, (error, stdout, stderr) => {
          clearTimeout(timer);

          if (error && !stdout) {
            resolve(new ToolResult(false, '', `错误: ${error.message}`));
          } else {
            let result = '';
            if (stdout) result += stdout;
            if (stderr) result += `\n[STDERR]\n${stderr}`;
            resolve(new ToolResult(true, result.trim()));
          }
        });
      } catch (error) {
        clearTimeout(timer);
        resolve(new ToolResult(false, '', error.message));
      }
    });
  }
}

/**
 * 搜索工具
 */
class WebSearchTool extends BaseTool {
  constructor() {
    super(
      'web_search',
      '搜索网络信息',
      {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词'
          },
          max_results: {
            type: 'integer',
            description: '最大结果数',
            default: 5
          }
        },
        required: ['query']
      }
    );
  }

  async execute(input) {
    try {
      // 使用后端搜索 API
      const backendUrl = process.env.MINIMAX_BASE_URL?.replace('/anthropic', '') || 'http://localhost:30000';
      const maxResults = input.max_results || 5;

      const response = await fetch(`${backendUrl}/api/search/web`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: input.query,
          limit: maxResults,
          format: 'json'
        })
      });

      if (!response.ok) {
        throw new Error(`Search API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.results && data.results.length > 0) {
        const results = data.results.map((r, i) =>
          `${i + 1}. ${r.title || '无标题'}\n   ${r.snippet || r.content || ''}\n   ${r.url || ''}`
        ).join('\n\n');
        return new ToolResult(true, `搜索结果 (${data.results.length}):\n\n${results}`);
      } else if (data.markdown) {
        return new ToolResult(true, `搜索结果:\n\n${data.markdown}`);
      } else if (data.content) {
        return new ToolResult(true, `搜索结果:\n\n${data.content}`);
      }

      return new ToolResult(true, `未找到与 "${input.query}" 相关的搜索结果`);
    } catch (error) {
      // 如果搜索失败，返回提示信息而非模拟数据
      return new ToolResult(false, '', `搜索失败: ${error.message}。请检查后端搜索服务是否运行。`);
    }
  }
}

/**
 * MiniMax M2.7 Agent 运行器
 */
class MiniMaxAgentRunner extends EventEmitter {
  constructor(options = {}) {
    super();

    this.apiKey = options.apiKey || process.env.MINIMAX_API_KEY;
    this.baseURL = options.baseURL || process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/anthropic';
    this.model = options.model || 'MiniMax-M2.7';
    this.workspaceDir = options.workspaceDir || './workspace';
    this.maxSteps = options.maxSteps || 50;
    this.tokenLimit = options.tokenLimit || 80000;

    // 推理配置
    this.reasoningSplit = options.reasoningSplit !== false;
    this.thinkingBudget = options.thinkingBudget || 8000;
    this.showThinking = options.showThinking || false;

    // 初始化工具
    this.tools = [
      new FileReadTool(this.workspaceDir),
      new FileWriteTool(this.workspaceDir),
      new FileListTool(this.workspaceDir),
      new ShellTool(this.workspaceDir),
      new WebSearchTool()
    ];

    // 消息历史
    this.messages = [];

    // 取消事件
    this.cancelEvent = { isSet: () => false };

    // 统计
    this.stats = {
      totalTokens: 0,
      thinkingTokens: 0,
      completionTokens: 0,
      apiCalls: 0
    };
  }

  /**
   * 构建系统提示词
   */
  buildSystemPrompt() {
    return `你是 MiniMax M2.7 AI 助手，运行在 AI Chat 玩具 中。

## 工作目录
当前工作目录: ${this.workspaceDir}
所有文件操作都在此目录下进行。

## 可用工具
你可以使用以下工具来完成复杂任务。工具调用格式:
- tool_call: {"name": "工具名", "arguments": {...}}

### 工具列表
${this.tools.map(t => `- **${t.name}**: ${t.description}`).join('\n')}

## 响应格式
重要: 响应必须是一个有效的 JSON 对象:
- 直接输出文本: {"type": "text", "content": "你的回答"}
- 调用工具: {"type": "tool_use", "name": "工具名", "input": {"参数": "值"}}

## 最佳实践
1. 对于复杂任务，先规划步骤再执行
2. 使用工具获取信息，而非猜测
3. 每次只调用一个工具，等待结果后再决定下一步
4. 完成后简洁总结结果`;
  }

  /**
   * 初始化消息历史
   */
  initMessages() {
    this.messages = [
      new Message('system', this.buildSystemPrompt())
    ];
  }

  /**
   * 添加用户消息
   */
  addUserMessage(content) {
    this.messages.push(new Message('user', content));
  }

  /**
   * 估算 token 数
   */
  estimateTokens() {
    let total = 0;
    for (const msg of this.messages) {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      // 简化的估算
      total += Math.ceil(content.length / 4);
      if (msg.thinking) {
        total += Math.ceil(msg.thinking.length / 4);
      }
    }
    return total;
  }

  /**
   * 调用 MiniMax API
   */
  async callAPI(stream = true) {
    const url = `${this.baseURL}/v1/messages`;

    // 构建请求
    const requestBody = {
      model: this.model,
      max_tokens: this.thinkingBudget,
      messages: this.messages.map(m => m.toAPIFormat()),
      stream: stream,
      extra_body: {
        reasoning_split: this.reasoningSplit
      }
    };

    // 添加工具定义
    if (this.tools.length > 0) {
      requestBody.tools = this.tools.map(t => t.getSchema());
    }

    this.stats.apiCalls++;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API Error ${response.status}: ${error}`);
      }

      if (stream) {
        return await this.handleStreamResponse(response);
      } else {
        return await response.json();
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * 处理流式响应
   */
  async handleStreamResponse(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = '';
    let currentEvent = '';
    let thinkingContent = '';
    let textContent = '';
    let toolCalls = [];
    let currentToolCall = null;
    let inThinkingBlock = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('event: ')) {
          currentEvent = trimmed.slice(7);
          continue;
        }

        if (!trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          return {
            thinking: thinkingContent,
            content: textContent,
            tool_calls: toolCalls
          };
        }

        try {
          const parsed = JSON.parse(data);

          if (currentEvent === 'content_block_delta') {
            const delta = parsed.delta;

            if (delta?.type === 'thinking_delta') {
              thinkingContent += delta.text;
              inThinkingBlock = true;
              this.stats.thinkingTokens++;
            } else if (delta?.type === 'text_delta') {
              if (inThinkingBlock) {
                inThinkingBlock = false;
              }
              textContent += delta.text;
            } else if (delta?.type === 'input_json_delta' && currentToolCall) {
              // 处理工具调用的参数增量
              currentToolCall.input += delta.partial_json;
            }
          } else if (currentEvent === 'content_block_start') {
            if (parsed.content_block?.type === 'tool_use') {
              currentToolCall = {
                id: parsed.content_block.id,
                name: parsed.content_block.name,
                input: ''
              };
            } else if (parsed.content_block?.type === 'thinking') {
              inThinkingBlock = true;
            }
          } else if (currentEvent === 'content_block_stop') {
            if (currentToolCall) {
              try {
                currentToolCall.input = JSON.parse(currentToolCall.input);
              } catch {
                // 保持原样
              }
              toolCalls.push(currentToolCall);
              currentToolCall = null;
            }
            inThinkingBlock = false;
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }

    return {
      thinking: thinkingContent,
      content: textContent,
      tool_calls: toolCalls
    };
  }

  /**
   * 执行工具
   */
  async executeTool(name, input) {
    const tool = this.tools.find(t => t.name === name);
    if (!tool) {
      return new ToolResult(false, '', `未知工具: ${name}`);
    }

    try {
      const result = await tool.execute(input);
      return result;
    } catch (error) {
      return new ToolResult(false, '', error.message);
    }
  }

  /**
   * 运行 Agent
   */
  async run() {
    this.initMessages();
    const startTime = Date.now();
    const steps = [];

    this.emit('start', { totalTokens: this.estimateTokens() });

    for (let step = 0; step < this.maxSteps; step++) {
      // 检查取消
      if (this.cancelEvent?.isSet()) {
        this.emit('cancelled', { steps });
        return {
          success: false,
          message: '任务被用户取消',
          steps
        };
      }

      this.emit('step_start', { step: step + 1, totalSteps: this.maxSteps });

      // 1. Token 检查
      const estimatedTokens = this.estimateTokens();
      if (estimatedTokens > this.tokenLimit) {
        this.emit('token_limit_warning', { tokens: estimatedTokens, limit: this.tokenLimit });
      }

      // 2. 调用 API
      let response;
      try {
        response = await this.callAPI(false); // 非流式用于循环
      } catch (error) {
        this.emit('error', { error: error.message });
        return {
          success: false,
          message: `API 调用失败: ${error.message}`,
          steps
        };
      }

      // 3. 处理响应
      const assistantMessage = new Message('assistant', response.content, {
        thinking: response.thinking,
        tool_calls: response.tool_calls
      });
      this.messages.push(assistantMessage);

      // 记录 thinking
      if (response.thinking && this.showThinking) {
        this.emit('thinking', { content: response.thinking });
      }

      // 更新统计
      if (response.usage) {
        this.stats.totalTokens += response.usage.input_tokens + response.usage.output_tokens;
        this.stats.completionTokens += response.usage.output_tokens;
      }

      const stepRecord = {
        step: step + 1,
        thinking: response.thinking,
        content: response.content,
        toolCalls: response.tool_calls?.length || 0
      };

      // 4. 检查是否有工具调用
      if (response.tool_calls && response.tool_calls.length > 0) {
        const toolResult = await this.executeTool(
          response.tool_calls[0].name,
          response.tool_calls[0].input
        );

        const toolMessage = new Message(
          'user',
          `[TOOL_RESULT for ${response.tool_calls[0].name}]\n${toolResult.content}`,
          { tool_call_id: response.tool_calls[0].id }
        );
        this.messages.push(toolMessage);

        stepRecord.toolResult = toolResult.toJSON();
        this.emit('tool_call', {
          tool: response.tool_calls[0].name,
          input: response.tool_calls[0].input,
          result: toolResult.toJSON()
        });
      } else {
        // 没有工具调用，任务完成
        this.emit('complete', {
          content: response.content,
          steps: steps.length + 1,
          duration: Date.now() - startTime,
          stats: this.stats
        });

        return {
          success: true,
          message: response.content,
          thinking: response.thinking,
          steps: [...steps, stepRecord],
          duration: Date.now() - startTime,
          stats: this.stats
        };
      }

      steps.push(stepRecord);
    }

    // 达到最大步数
    this.emit('max_steps_reached', { steps });
    return {
      success: false,
      message: '达到最大步数限制',
      steps,
      duration: Date.now() - startTime
    };
  }

  /**
   * 获取工具列表
   */
  getToolSchemas() {
    return this.tools.map(t => t.getSchema());
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      messageCount: this.messages.length,
      estimatedTokens: this.estimateTokens()
    };
  }
}

module.exports = {
  MiniMaxAgentRunner,
  ToolResult,
  Message,
  BaseTool,
  FileReadTool,
  FileWriteTool,
  FileListTool,
  ShellTool,
  WebSearchTool
};
