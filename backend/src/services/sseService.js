/**
 * SSE流式输出服务
 * MiniMax 单一架构 - 实际调用 MiniMax API
 */

const { AgentLogger, createLogger } = require('../infra/logger/AgentLogger');
const { MiniMaxRouter } = require('./router/modelRouter');
const { classifyRetryableError } = require('../common/errors/errorClassifier');

// 工具声明注入（B4 TOOL-1）- 让 LLM 知道可用工具
// MiniMax M2.7 工具调用协议: 输出 <<<TOOL:tool_name:args>>> 触发调用
// 协议触发后由本文件的 detectAndExecuteTool() 解析并执行
const TOOL_SYSPROMPT = `\n\n[可用工具]
- calculator(expression): 数学计算，例如 <<<TOOL:calculator:123 * 456>>>
- datetime(operation='now'): 获取当前时间，例如 <<<TOOL:datetime:now>>>
- web_search(query): 联网搜索，例如 <<<TOOL:web_search:人工智能最新进展>>>
- file_read(path): 读取本地文件，例如 <<<TOOL:file_read:/etc/hostname>>>
需要使用工具时，在回复末尾单独一行输出 <<<TOOL:tool_name:args>>> 格式。
args 仅为纯文本参数，多个参数用空格分隔，系统会自动转换。`;

// B4 TOOL-1 + B4b TOOL-2: 工具名映射（LLM 声明 → 工具注册表实际名）
const TOOL_NAME_ALIAS = {
  get_current_time: 'datetime',
  get_time: 'datetime',
  current_time: 'datetime',
  calc: 'calculator',
  calculate: 'calculator',
  search: 'web_search',
  knowledge_base_search: 'web_search',
  knowledge_search: 'web_search',
  read_file: 'file_read',
  file_read: 'file_read'
};

// B4b TOOL-2: 工具参数归一化（LLM 输出的纯文本 → 注册表期望的 JSON）
function normalizeToolArgs(toolName, rawArgs) {
  const args = (rawArgs || '').trim();
  switch (toolName) {
    case 'datetime':
      // LLM 可能输出: "now" / "" / "now,timezone=Asia/Shanghai"
      if (!args) return { operation: 'now' };
      if (args.startsWith('{')) {
        try { return JSON.parse(args); } catch { /* fallthrough */ }
      }
      const firstToken = args.split(/[\s,]+/)[0];
      if (['now', 'format', 'parse', 'add', 'subtract', 'diff'].includes(firstToken)) {
        return { operation: firstToken };
      }
      return { operation: 'now' };
    case 'calculator':
      // 直接当表达式
      return { expression: args };
    case 'web_search':
      return { query: args };
    case 'file_read':
      return { path: args };
    default:
      // 尝试 JSON → 否则当 query
      if (args.startsWith('{')) {
        try { return JSON.parse(args); } catch { return { query: args }; }
      }
      return { query: args };
  }
}

// RAG 注入（B5 RAG-1）- 懒加载
let _intentClassifier = null;
let _ragService = null;

function getIntentClassifier() {
  if (!_intentClassifier) {
    // 使用 services/agent/IntentClassifier：含 knowledge/tool_use/chat/task 语义
    // 相比 domain/rag/TreeIntentClassifier 的细粒度 domain，更适合路由决策
    const { IntentClassifier } = require('./agent/IntentClassifier');
    _intentClassifier = new IntentClassifier({
      enableLLM: false,
      enableKeywordFallback: true
    });
  }
  return _intentClassifier;
}

function getRagService() {
  if (!_ragService) {
    const RAGService = require('./ragService');
    _ragService = RAGService.getSharedRagService();
  }
  return _ragService;
}

// B4b TOOL-2: 获取默认工具注册表（懒加载）
let _defaultToolRegistry = null;
function getDefaultToolRegistry() {
  if (!_defaultToolRegistry) {
    const { createDefaultToolRegistry } = require('./tools');
    _defaultToolRegistry = createDefaultToolRegistry();
  }
  return _defaultToolRegistry;
}

// 创建日志记录器
const logger = new AgentLogger('sse');

// 创建路由器实例
const miniMaxRouter = new MiniMaxRouter({
  defaultModel: 'MiniMax-M2.7',
  enableFirstChunkProbe: true,
  enableMultiModelFallback: true
});

// 错误类型分类
const ErrorType = {
  VALIDATION: 'validation_error',
  AUTH: 'authentication_error',
  RATE_LIMIT: 'rate_limit_error',
  API: 'api_error',
  TIMEOUT: 'timeout_error',
  SERVER: 'server_error',
  UNKNOWN: 'unknown_error'
};

// 错误类型到 ErrorType 的映射
const ERROR_TYPE_MAP = {
  auth: ErrorType.AUTH,
  parameter: ErrorType.VALIDATION,
  rate_limit: ErrorType.RATE_LIMIT,
  transient: ErrorType.SERVER,
  resource: ErrorType.SERVER,
  unknown: ErrorType.UNKNOWN
};

// 用户友好的错误消息
const ERROR_MESSAGES = {
  [ErrorType.AUTH]: 'API Key无效或未配置，请检查设置',
  [ErrorType.RATE_LIMIT]: '请求过于频繁，请稍后再试',
  [ErrorType.TIMEOUT]: '请求超时，请检查网络或稍后重试',
  [ErrorType.SERVER]: 'MiniMax服务暂时不可用，请稍后重试',
  [ErrorType.VALIDATION]: '请求参数无效，请检查输入内容',
  [ErrorType.API]: '服务异常，请稍后重试',
  [ErrorType.UNKNOWN]: '服务异常，请稍后重试'
};

/**
 * 分类错误类型
 */
function classifyError(error, response = null) {
  const message = error.message || String(error);

  // API 密钥问题
  if (message.includes('API Key') || message.includes('apiKey') || message.includes('401')) {
    return { type: ErrorType.AUTH, message: ERROR_MESSAGES[ErrorType.AUTH] };
  }

  // 速率限制
  if (message.includes('429') || message.includes('rate limit') || message.includes('请求过于频繁')) {
    return { type: ErrorType.RATE_LIMIT, message: ERROR_MESSAGES[ErrorType.RATE_LIMIT] };
  }

  // 超时错误
  if (message.includes('timeout') || message.includes('Timeout') || message.includes('504')) {
    return { type: ErrorType.TIMEOUT, message: ERROR_MESSAGES[ErrorType.TIMEOUT] };
  }

  // API 错误（带状态码）
  if (response?.status) {
    if (response.status >= 500) {
      return { type: ErrorType.SERVER, message: ERROR_MESSAGES[ErrorType.SERVER] };
    }
    if (response.status >= 400) {
      return { type: ErrorType.API, message: `请求参数错误: ${message}` };
    }
  }

  // MiniMax API 特定错误
  if (message.includes('MiniMax API Error')) {
    if (message.includes('400')) {
      return { type: ErrorType.VALIDATION, message: ERROR_MESSAGES[ErrorType.VALIDATION] };
    }
    if (message.includes('401') || message.includes('403')) {
      return { type: ErrorType.AUTH, message: ERROR_MESSAGES[ErrorType.AUTH] };
    }
    return { type: ErrorType.API, message: `MiniMax API错误: ${message}` };
  }

  // 使用共享工具进行分类，映射到 ErrorType
  const errorType = classifyRetryableError(error);
  const mappedType = ERROR_TYPE_MAP[errorType] || ErrorType.UNKNOWN;

  // 通用错误
  return { type: mappedType, message: ERROR_MESSAGES[mappedType] };
}

/**
 * 验证聊天请求参数
 */
function validateChatRequest(body) {
  const errors = [];

  if (!body.messages) {
    errors.push('缺少messages参数');
  } else if (!Array.isArray(body.messages)) {
    errors.push('messages必须为数组');
  } else if (body.messages.length === 0) {
    errors.push('messages不能为空数组');
  } else {
    // 检查每条消息的格式（支持多模态消息）
    body.messages.forEach((msg, index) => {
      if (!msg.role) {
        errors.push(`第${index + 1}条消息缺少role参数`);
      } else if (!['user', 'assistant', 'system'].includes(msg.role)) {
        errors.push(`第${index + 1}条消息role无效: ${msg.role}`);
      }

      // 支持多模态内容（OpenAI格式）：content 可以是字符串或数组
      if (!msg.content) {
        // content 为空可能是多模态消息，但attachments时需要有content
        if (typeof msg.content !== 'string' && !Array.isArray(msg.content)) {
          errors.push(`第${index + 1}条消息缺少content参数`);
        }
      } else if (typeof msg.content === 'string') {
        if (msg.content.length > 100000) {
          errors.push(`第${index + 1}条消息内容过长(最大100000字符)`);
        }
      } else if (Array.isArray(msg.content)) {
        // 多模态数组格式：[{ type: 'text', text: '...' }, { type: 'image_url', image_url: { url: '...' } }]
        msg.content.forEach((item, i) => {
          if (!['text', 'image_url'].includes(item.type)) {
            errors.push(`第${index + 1}条消息第${i + 1}个内容块类型无效: ${item.type}`);
          }
          if (item.type === 'image_url' && item.image_url?.url) {
            // base64图片URL可能很长，只检查格式
            if (!item.image_url.url.startsWith('data:') && !item.image_url.url.startsWith('http')) {
              errors.push(`第${index + 1}条消息第${i + 1}个图片URL格式无效`);
            }
          }
        });
      }
    });
  }

  if (body.model && typeof body.model !== 'string') {
    errors.push('model必须为字符串');
  }

  if (body.temperature !== undefined) {
    if (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 2) {
      errors.push('temperature必须在0-2之间');
    }
  }

  if (body.max_tokens !== undefined) {
    if (typeof body.max_tokens !== 'number' || body.max_tokens < 1 || body.max_tokens > 100000) {
      errors.push('max_tokens必须在1-100000之间');
    }
  }

  return errors;
}

/**
 * 检测流类型 - 兼容浏览器 ReadableStream 和 Node.js stream
 */
function detectStreamType(stream) {
  if (!stream) return null;
  if (typeof stream.getReader === 'function') return 'browser';
  if (typeof stream.pipe === 'function' && typeof stream.on === 'function') return 'node';
  return null;
}

/**
 * B4 TOOL-1: 注入工具声明到 system prompt
 * @param {Array} messages - 原始消息列表
 * @returns {Array} augmentedMessages - 注入工具声明后的消息列表（不可变）
 */
function injectToolDeclarations(messages) {
  const result = messages.map(m => ({ ...m }));
  if (result.length > 0 && result[0].role === 'system') {
    result[0] = { ...result[0], content: result[0].content + TOOL_SYSPROMPT };
  } else {
    result.unshift({ role: 'system', content: TOOL_SYSPROMPT });
  }
  return result;
}

/**
 * B5 RAG-1: 注入知识库上下文
 * @param {Array} messages - 已注入工具声明的消息列表
 * @param {string} userQuery - 用户问题
 * @param {Object} deps - 依赖注入
 * @param {Object} deps.intentClassifier - IntentClassifier 实例
 * @param {Object} deps.ragService - RAGService 实例
 * @returns {Promise<Array>} 注入 KB 上下文后的消息列表（不可变）
 */
async function injectRagContext(messages, userQuery, { intentClassifier, ragService }) {
  if (!userQuery || typeof userQuery !== 'string') return messages;
  let intent;
  try {
    intent = await intentClassifier.classify(userQuery);
  } catch {
    // 分类器故障降级：不做 RAG 注入
    return messages;
  }
  // agent IntentClassifier 返回 intent 字段 (knowledge/tool_use/chat/task)
  // 当为 knowledge 或低置信度 chat 时也尝试注入（chat 也可能需要知识支撑）
  const isKnowledge = intent.intent === 'knowledge'
    || (intent.intent === 'chat' && intent.confidence < 0.5);
  if (!isKnowledge) return messages;
  let kbs;
  try {
    kbs = ragService.listKnowledgeBases();
  } catch {
    return messages;
  }
  for (const kb of kbs) {
    try {
      const ctx = await Promise.race([
        ragService.getContextForConversation(kb.id, userQuery, { topK: 3 }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('KB timeout')), 2000))
      ]);
      if (ctx && ctx.context) {
        const newMessages = messages.slice();
        newMessages.splice(1, 0, {
          role: 'system',
          content: `[知识库: ${kb.name}]\n${ctx.context}`
        });
        return newMessages;
      }
    } catch (kbErr) {
      // 跳过该 KB
    }
  }
  return messages;
}

// SSE流式输出服务
class SSEService {
  /**
   * 处理聊天请求 - 实际调用 MiniMax API
   */
  static async handleChat(req, res) {
    const { messages, model = 'MiniMax-M2.7', stream = true, temperature, max_tokens } = req.body;

    // 输入验证
    const validationErrors = validateChatRequest(req.body);
    if (validationErrors.length > 0) {
      res.writeHead(400, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      });
      res.write(`data: ${JSON.stringify({
        type: 'error',
        errorType: ErrorType.VALIDATION,
        message: validationErrors.join('; '),
        details: validationErrors
      })}\n\n`);
      res.end();
      return;
    }

    // 设置SSE响应头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    // 发送连接成功消息
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    // B4 TOOL-1: 注入工具声明到 system prompt
    let augmentedMessages = injectToolDeclarations(messages);

    // B5 RAG-1: 意图检测 + 知识库检索
    const lastUserMsg = messages.filter(m => m.role === 'user').pop();
    if (lastUserMsg && typeof lastUserMsg.content === 'string') {
      try {
        augmentedMessages = await injectRagContext(
          augmentedMessages,
          lastUserMsg.content,
          {
            intentClassifier: getIntentClassifier(),
            ragService: getRagService()
          }
        );
      } catch (e) {
        logger.warn('RAG injection skipped', { err: e.message });
      }
    }

    try {
      // 调用 MiniMax API
      const result = await miniMaxRouter.execute({
        messages: augmentedMessages,
        model,
        stream: true,
        options: {
          temperature: temperature || 0.7,
          max_tokens: max_tokens || 8192
        }
      });

      // 首先检查是否是降级响应（熔断器触发）- 必须在 success 检查之前
      if (result && result.fallback) {
        logger.error('SSE Chat: Circuit breaker fallback', {
          error: result.error,
          circuitBreaker: result.circuitBreaker,
          degraded: result.degraded
        });
        res.write(`data: ${JSON.stringify({
          type: 'error',
          errorType: ErrorType.SERVER,
          message: result.error || 'MiniMax API 暂时不可用，请稍后重试'
        })}\n\n`);
        res.end();
        return;
      }

      if (!result.success) {
        const errorInfo = classifyError(new Error(result.error));
        res.write(`data: ${JSON.stringify({
          type: 'error',
          errorType: errorInfo.type,
          message: errorInfo.message,
          requestId: result.requestId
        })}\n\n`);
        res.end();
        return;
      }

      // Debug: 检查 result 结构
      logger.debug('SSE Chat: result structure', {
        resultKeys: result ? Object.keys(result) : [],
        hasFallback: !!result?.fallback,
        hasResult: !!result?.result,
        resultType: typeof result?.result,
        resultConstructor: result?.result?.constructor?.name,
        success: result?.success
      });

      // 获取流式响应
      const responseStream = result.result;

      // 检查响应流是否有效
      if (!responseStream || typeof responseStream !== 'object') {
        // 详细日志
        const resultType = result && typeof result;
        const resultKeys = result && typeof result === 'object' ? Object.keys(result) : [];
        logger.error('SSE Chat: Invalid response stream', {
          resultSuccess: result?.success,
          resultType: resultType,
          resultKeys: resultKeys,
          hasResult: !!result?.result,
          resultResultType: typeof result?.result,
          resultResultValue: result?.result,
          hasError: !!result?.error,
          error: result?.error
        });
        res.write(`data: ${JSON.stringify({
          type: 'error',
          errorType: ErrorType.SERVER,
          message: '服务内部错误：响应流无效'
        })}\n\n`);
        res.end();
        return;
      }

      // 检测流类型
      const streamType = detectStreamType(responseStream);
      logger.debug('SSE Chat: stream detection', {
        responseStreamType: typeof responseStream,
        responseStreamConstructor: responseStream?.constructor?.name,
        hasGetReader: typeof responseStream?.getReader === 'function',
        hasPipe: typeof responseStream?.pipe === 'function',
        hasOn: typeof responseStream?.on === 'function',
        streamType: streamType,
        keys: responseStream ? Object.keys(responseStream).slice(0, 10) : []
      });

      if (!streamType) {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          errorType: ErrorType.SERVER,
          message: '服务内部错误：无效的响应流'
        })}\n\n`);
        res.end();
        return;
      }

      // 根据流类型选择处理方式
      if (streamType === 'browser') {
        // 浏览器 ReadableStream
        await SSEService._handleBrowserStream(responseStream, res);
      } else {
        // Node.js stream
        await SSEService._handleNodeStream(responseStream, res);
      }

    } catch (error) {
      logger.error('SSE Chat Error', { error: error.message, stack: error.stack });
      const errorInfo = classifyError(error);
      const requestId = req.body?.requestId || 'unknown';
      res.write(`data: ${JSON.stringify({
        type: 'error',
        errorType: errorInfo.type,
        message: errorInfo.message,
        requestId
      })}\n\n`);
    }

    res.end();
  }

  /**
   * 处理浏览器 ReadableStream
   */
  static async _handleBrowserStream(stream, res) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          res.write(`data: ${JSON.stringify({ type: 'done', content: '' })}\n\n`);
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        await SSEService._processBuffer(buffer, res, (processed, remaining) => {
          buffer = remaining;
        });
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 处理 Node.js stream
   */
  static async _handleNodeStream(stream, res) {
    return new Promise((resolve, reject) => {
      let buffer = '';

      stream.on('data', async (chunk) => {
        // 明确指定UTF-8编码，避免系统默认编码问题
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
        buffer += text;
        await SSEService._processBuffer(buffer, res, (processed, remaining) => {
          buffer = remaining;
        });
      });

      stream.on('end', () => {
        if (buffer.trim()) {
          res.write(`data: ${JSON.stringify({ type: 'done', content: '' })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ type: 'done', content: '' })}\n\n`);
        }
        resolve();
      });

      stream.on('error', (err) => {
        logger.error('Node stream error', { error: err.message, stack: err.stack });
        res.write(`data: ${JSON.stringify({
          type: 'error',
          errorType: ErrorType.SERVER,
          message: '流处理错误: ' + err.message
        })}\n\n`);
        resolve();
      });
    });
  }

  /**
   * 处理缓冲区数据 - 正确处理中文内容
   */
  static async _processBuffer(buffer, res, callback) {
    const lines = buffer.split('\n');
    const remaining = lines.pop() || '';
    callback(null, remaining);

    for (const line of lines) {
      if (line.trim()) {
        try {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              res.write(`data: ${JSON.stringify({ type: 'done', content: '' })}\n\n`);
            } else {
              try {
                const jsonData = JSON.parse(data);
                if (jsonData.type === 'content_block_delta') {
                  if (jsonData.delta?.type === 'text_delta') {
                    res.write(`data: ${JSON.stringify({ type: 'chunk', content: jsonData.delta.text })}\n\n`);
                  } else if (jsonData.delta?.type === 'thinking_delta') {
                    res.write(`data: ${JSON.stringify({ type: 'thinking', content: jsonData.delta.thinking })}\n\n`);
                  }
                } else if (jsonData.type === 'message_stop') {
                  res.write(`data: ${JSON.stringify({ type: 'done', content: '' })}\n\n`);
                } else if (jsonData.type === 'error') {
                  res.write(`data: ${JSON.stringify({ type: 'error', message: jsonData.error || 'Unknown error' })}\n\n`);
                } else {
                  // 透传其他类型的数据
                  res.write(`data: ${data}\n\n`);
                }
              } catch {
                // JSON 解析失败时，如果包含 delta.text 字段，尝试提取
                if (data.includes('"delta"') && data.includes('"text_delta"')) {
                  try {
                    const jsonData = JSON.parse(`{${data.split('{').slice(1).join('{').split('}').slice(0, -1).join('}')}}`);
                    if (jsonData.delta?.type === 'text_delta') {
                      res.write(`data: ${JSON.stringify({ type: 'chunk', content: jsonData.delta.text })}\n\n`);
                      continue;
                    }
                  } catch {
                    // 提取失败，忽略
                  }
                }
                // 原始数据当作普通 chunk 处理
                res.write(`data: ${JSON.stringify({ type: 'chunk', content: data })}\n\n`);
              }
            }
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
  }

  /**
   * 停止生成
   */
  static handleStop(req, res) {
    res.json({ success: true, message: 'Generation stopped' });
  }
}

module.exports = SSEService;
module.exports.injectToolDeclarations = injectToolDeclarations;
module.exports.injectRagContext = injectRagContext;
module.exports.TOOL_SYSPROMPT = TOOL_SYSPROMPT;
