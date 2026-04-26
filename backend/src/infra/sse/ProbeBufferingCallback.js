/**
 * 首包探测缓冲回调
 * @description 用于流式响应中探测首包，确保接收到完整数据后再处理
 *
 * 问题背景：
 * 在 SSE 流式响应中，如果模型服务在首包返回后立即断开连接，
 * 可能导致接收到不完整的 JSON 数据，从而解析失败。
 *
 * 解决方案：
 * 1. 缓冲所有接收到的数据
 * 2. 检测是否是有效的完整数据（JSON 解析成功）
 * 3. 只有在收到完整数据后才触发回调
 * 4. 提供超时控制，避免无限等待
 *
 * @author AI Chat 玩具团队
 * @date 2026-03-21
 */

const { TimeoutError } = require('../../infra/circuitBreaker/CircuitBreaker');

/**
 * 探测状态枚举
 */
const ProbeState = {
  BUFFERING: 'BUFFERING',   // 正在缓冲
  VALID: 'VALID',           // 数据有效完整
  INVALID: 'INVALID',       // 数据无效
  TIMEOUT: 'TIMEOUT',       // 超时
  ABORTED: 'ABORTED'        // 被中止
};

/**
 * 首包探测结果
 */
class ProbeResult {
  /**
   * @param {Object} options
   * @param {string} options.state - 探测状态
   * @param {string} [options.data] - 解析后的数据
   * @param {string} [options.rawData] - 原始数据
   * @param {number} options.firstByteLatency - 首字节延迟（毫秒）
   * @param {number} options.completeLatency - 数据完成延迟（毫秒）
   * @param {number} options.totalBytes - 总字节数
   * @param {string} [options.error] - 错误信息
   */
  constructor(options) {
    this.state = options.state;
    this.data = options.data || null;
    this.rawData = options.rawData || '';
    this.firstByteLatency = options.firstByteLatency;
    this.completeLatency = options.completeLatency;
    this.totalBytes = options.totalBytes;
    this.error = options.error || null;
    this.timestamp = Date.now();
  }

  /**
   * 是否为有效结果
   */
  get isValid() {
    return this.state === ProbeState.VALID;
  }

  /**
   * 是否已超时
   */
  get isTimeout() {
    return this.state === ProbeState.TIMEOUT;
  }

  /**
   * 获取结果摘要
   */
  toSummary() {
    return {
      state: this.state,
      isValid: this.isValid,
      firstByteLatency: this.firstByteLatency,
      completeLatency: this.completeLatency,
      totalBytes: this.totalBytes,
      error: this.error
    };
  }
}

class ProbeBufferingCallback {
  /**
   * 创建首包探测缓冲回调
   * @param {Object} options - 配置选项
   * @param {Function} options.onFirstByte - 首字节到达回调 (latency) => void
   * @param {Function} options.onComplete - 数据完成回调 (result: ProbeResult) => void
   * @param {Function} [options.onChunk] - 每个数据块到达回调 (chunk, buffer) => void
   * @param {Function} [options.parser] - 数据解析函数，默认 JSON.parse
   * @param {number} [options.firstByteTimeout=3000] - 首字节超时时间（毫秒）
   * @param {number} [options.totalTimeout=30000] - 总超时时间（毫秒）
   * @param {number} [options.maxBufferSize=10*1024*1024] - 最大缓冲大小（10MB）
   * @param {boolean} [options.enableValidation=true] - 是否启用数据验证
   */
  constructor(options = {}) {
    // 回调函数
    this.onFirstByte = options.onFirstByte || (() => {});
    this.onComplete = options.onComplete || (() => {});
    this.onChunk = options.onChunk || (() => {});

    // 解析器
    this.parser = options.parser || JSON.parse;

    // 超时配置
    this.firstByteTimeout = options.firstByteTimeout ?? 3000;
    this.totalTimeout = options.totalTimeout ?? 30000;
    this.maxBufferSize = options.maxBufferSize ?? 10 * 1024 * 1024;

    // 验证配置
    this.enableValidation = options.enableValidation ?? true;

    // 内部状态
    this._state = ProbeState.BUFFERING;
    this._buffer = '';
    this._chunks = [];
    this._startTime = null;
    this._firstByteTime = null;
    this._totalBytes = 0;

    // 定时器
    this._firstByteTimer = null;
    this._totalTimeoutTimer = null;

    // 是否已触发完成
    this._completed = false;

    // 验证状态
    this._validationAttempts = 0;
    this._lastValidIndex = 0;
  }

  // ==================== 状态访问 ====================

  /**
   * 获取当前状态
   */
  get state() {
    return this._state;
  }

  /**
   * 获取缓冲数据
   */
  get buffer() {
    return this._buffer;
  }

  /**
   * 是否正在缓冲
   */
  get isBuffering() {
    return this._state === ProbeState.BUFFERING;
  }

  /**
   * 是否已完成
   */
  get isCompleted() {
    return this._completed;
  }

  // ==================== 核心方法 ====================

  /**
   * 处理接收到的数据块
   * @param {string|Buffer} chunk - 数据块
   * @returns {void}
   *
   * @example
   * const callback = new ProbeBufferingCallback({
   *   onFirstByte: (latency) => console.log(`首字节延迟: ${latency}ms`),
   *   onComplete: (result) => console.log('数据完整:', result.data)
   * });
   *
   * // 模拟 SSE 数据
   * callback.handleChunk('{"choices":[{"delta":{"content":"');
   * callback.handleChunk('Hello"}}]}"\n\n');
   */
  handleChunk(chunk) {
    if (this._completed) {
      return;
    }

    // 记录开始时间
    if (this._startTime === null) {
      this._startTime = Date.now();
      this._startTimers();
    }

    // 记录首字节时间
    if (this._firstByteTime === null) {
      this._firstByteTime = Date.now();
      this._clearFirstByteTimer();
      this.onFirstByte(this._getFirstByteLatency());
    }

    // 转换 chunk 为字符串
    const chunkStr = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    this._totalBytes += Buffer.byteLength(chunkStr, 'utf8');

    // 检查缓冲大小限制
    if (this._totalBytes > this.maxBufferSize) {
      this._fail(ProbeState.INVALID, 'Buffer size exceeded maximum limit');
      return;
    }

    // 添加到缓冲
    this._buffer += chunkStr;
    this._chunks.push(chunkStr);

    // 触发 chunk 回调
    this.onChunk(chunkStr, this._buffer);

    // 尝试解析数据
    this._tryParse();

    // 检查是否应该继续等待
    if (this._shouldWait()) {
      return;
    }

    // 检查是否超时
    if (this._isTimeout()) {
      this._fail(ProbeState.TIMEOUT, 'Total timeout exceeded');
      return;
    }
  }

  /**
   * 中止探测
   * @param {string} [reason] - 中止原因
   */
  abort(reason = 'manual') {
    if (this._completed) {
      return;
    }

    this._state = ProbeState.ABORTED;
    this._completed = true;
    this._clearTimers();

    const result = new ProbeResult({
      state: ProbeState.ABORTED,
      rawData: this._buffer,
      firstByteLatency: this._getFirstByteLatency(),
      completeLatency: this._getCompleteLatency(),
      totalBytes: this._totalBytes,
      error: reason
    });

    this.onComplete(result);
  }

  /**
   * 强制完成（无论数据是否有效）
   * @returns {ProbeResult}
   */
  forceComplete() {
    if (this._completed) {
      return;
    }

    this._completed = true;
    this._clearTimers();

    let state = ProbeState.VALID;
    let data = null;
    let error = null;

    // 尝试解析
    if (this.enableValidation) {
      try {
        data = this.parser(this._buffer);
      } catch (err) {
        state = ProbeState.INVALID;
        error = err.message;
      }
    } else {
      data = this._buffer;
    }

    // 如果验证禁用但数据为空，标记为无效
    if (!this.enableValidation && !this._buffer.trim()) {
      state = ProbeState.INVALID;
      error = 'Empty buffer';
    }

    this._state = state;

    const result = new ProbeResult({
      state,
      data,
      rawData: this._buffer,
      firstByteLatency: this._getFirstByteLatency(),
      completeLatency: this._getCompleteLatency(),
      totalBytes: this._totalBytes,
      error
    });

    this.onComplete(result);
    return result;
  }

  /**
   * 重置状态
   */
  reset() {
    this._clearTimers();
    this._state = ProbeState.BUFFERING;
    this._buffer = '';
    this._chunks = [];
    this._startTime = null;
    this._firstByteTime = null;
    this._totalBytes = 0;
    this._completed = false;
    this._validationAttempts = 0;
    this._lastValidIndex = 0;
  }

  // ==================== SSE 专用方法 ====================

  /**
   * 创建适用于 SSE 的回调包装器
   * @param {Object} options - ProbeBufferingCallback 选项
   * @returns {Object} 包含 handleSSE 和 probeCallback 的对象
   *
   * @example
   * const { handleSSE, probeCallback, probeResult } = ProbeBufferingCallback.createSWSCallback({
   *   onFirstByte: (latency) => metrics.record('sse_first_byte', latency),
   *   onComplete: (result) => processResult(result)
   * });
   *
   * // 在 SSE 事件处理器中使用
   * eventSource.onmessage = (event) => {
   *   handleSSE(event.data);
   * };
   */
  static createSSECallback(options = {}) {
    const probeCallback = new ProbeBufferingCallback(options);

    const handleSSE = (data) => {
      probeCallback.handleChunk(data);
    };

    return {
      handleSSE,
      probeCallback,
      get result() {
        return probeCallback.isCompleted ? probeCallback.forceComplete() : null;
      }
    };
  }

  // ==================== 私有方法 ====================

  /**
   * 尝试解析缓冲数据
   * @private
   */
  _tryParse() {
    if (!this.enableValidation) {
      return;
    }

    this._validationAttempts++;

    // 尝试找到有效的 JSON 边界
    // 常见格式：{"key": "value"}\n\n 或 data: {"key": "value"}\n\n
    const validPatterns = [
      /^\s*\{[\s\S]*\}\s*$/,                    // 完整对象 {...}
      /^\s*\[[\s\S]*\]\s*$/,                   // 完整数组 [...]
      /^\s*\{[\s\S]*\}[\s\n\r]*$/,             // 对象 + 换行
      /^\s*\[[\s\S]*\}[\s\n\r]*$/,             // 数组 + 换行
    ];

    for (const pattern of validPatterns) {
      if (pattern.test(this._buffer)) {
        try {
          const data = this.parser(this._buffer);
          this._success(data);
          return;
        } catch (err) {
          // JSON 解析失败，继续等待
          break;
        }
      }
    }

    // 检查是否包含明确的结束标记
    const endMarkers = ['\n\n', '\r\n\r\n', '}\n', '}]\n'];
    for (const marker of endMarkers) {
      const markerIndex = this._buffer.lastIndexOf(marker);
      if (markerIndex !== -1) {
        const potentialData = this._buffer.substring(0, markerIndex + marker.length);
        try {
          const data = this.parser(potentialData);
          this._success(data);
          return;
        } catch {
          // 不是完整 JSON
        }
      }
    }
  }

  /**
   * 检查是否应该继续等待
   * @private
   */
  _shouldWait() {
    // 如果已经解析成功，不需要等待
    if (this._state === ProbeState.VALID) {
      return false;
    }

    // 如果数据为空，需要等待
    if (!this._buffer.trim()) {
      return true;
    }

    // 检查是否有部分 JSON 结构（可能需要更多数据）
    const hasOpenBrace = this._buffer.includes('{');
    const hasCloseBrace = this._buffer.includes('}');
    const hasOpenBracket = this._buffer.includes('[');
    const hasCloseBracket = this._buffer.includes(']');

    // 如果有开括号但没有对应的闭括号，需要等待
    if (hasOpenBrace && !hasCloseBrace) return true;
    if (hasOpenBracket && !hasCloseBracket) return true;

    // 检查引号平衡
    if (this._hasUnbalancedQuotes()) {
      return true;
    }

    return false;
  }

  /**
   * 检查引号是否平衡
   * @private
   */
  _hasUnbalancedQuotes() {
    let inString = false;
    let escaped = false;

    for (let i = 0; i < this._buffer.length; i++) {
      const char = this._buffer[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"' && !escaped) {
        inString = !inString;
      }
    }

    return inString;
  }

  /**
   * 检查是否超时
   * @private
   */
  _isTimeout() {
    if (this._startTime === null) {
      return false;
    }
    return Date.now() - this._startTime >= this.totalTimeout;
  }

  /**
   * 成功完成
   * @private
   */
  _success(data) {
    if (this._completed) {
      return;
    }

    this._state = ProbeState.VALID;
    this._completed = true;
    this._clearTimers();

    const result = new ProbeResult({
      state: ProbeState.VALID,
      data,
      rawData: this._buffer,
      firstByteLatency: this._getFirstByteLatency(),
      completeLatency: this._getCompleteLatency(),
      totalBytes: this._totalBytes
    });

    this.onComplete(result);
  }

  /**
   * 失败
   * @private
   */
  _fail(state, error) {
    if (this._completed) {
      return;
    }

    this._state = state;
    this._completed = true;
    this._clearTimers();

    const result = new ProbeResult({
      state,
      rawData: this._buffer,
      firstByteLatency: this._getFirstByteLatency(),
      completeLatency: this._getCompleteLatency(),
      totalBytes: this._totalBytes,
      error
    });

    this.onComplete(result);
  }

  /**
   * 获取首字节延迟
   * @private
   */
  _getFirstByteLatency() {
    if (this._firstByteTime === null) {
      return null;
    }
    return Date.now() - this._firstByteTime;
  }

  /**
   * 获取完成延迟
   * @private
   */
  _getCompleteLatency() {
    if (this._startTime === null) {
      return null;
    }
    return Date.now() - this._startTime;
  }

  /**
   * 启动定时器
   * @private
   */
  _startTimers() {
    // 首字节超时
    this._firstByteTimer = setTimeout(() => {
      if (this._firstByteTime === null && !this._completed) {
        this._fail(ProbeState.TIMEOUT, 'First byte timeout - no data received');
      }
    }, this.firstByteTimeout);

    // 总超时
    this._totalTimeoutTimer = setTimeout(() => {
      if (!this._completed) {
        this._fail(ProbeState.TIMEOUT, 'Total timeout exceeded');
      }
    }, this.totalTimeout);
  }

  /**
   * 清除首字节定时器
   * @private
   */
  _clearFirstByteTimer() {
    if (this._firstByteTimer) {
      clearTimeout(this._firstByteTimer);
      this._firstByteTimer = null;
    }
  }

  /**
   * 清除所有定时器
   * @private
   */
  _clearTimers() {
    this._clearFirstByteTimer();
    if (this._totalTimeoutTimer) {
      clearTimeout(this._totalTimeoutTimer);
      this._totalTimeoutTimer = null;
    }
  }
}

/**
 * 创建带首包探测的流式包装器
 * @param {Object} options - ProbeBufferingCallback 选项
 * @returns {Function} 包装后的流式回调函数
 *
 * @example
 * const streamingCallback = createProbeStreamingCallback({
 *   onFirstByte: (latency) => console.log('首字节延迟:', latency),
 *   onComplete: (result) => {
 *     if (result.isValid) {
 *       processData(result.data);
 *     } else {
 *       handleError(result.error);
 *     }
 *   }
 * });
 *
 * // 使用
 * for await (const chunk of stream) {
 *   streamingCallback(chunk);
 * }
 */
function createProbeStreamingCallback(options = {}) {
  const probeCallback = new ProbeBufferingCallback(options);

  return (chunk) => {
    probeCallback.handleChunk(chunk);
  };
}

/**
 * SSE 首包探测状态
 */
const SSEProbeState = {
  WAITING: 'WAITING',     // 等待首个完整事件
  READY: 'READY',         // 已收到完整事件，可以开始发送
  ERROR: 'ERROR'          // 发生错误
};

/**
 * SSE 首包探测结果
 */
class SSEProbeResult {
  constructor(options) {
    this.state = options.state;
    this.events = options.events || [];
    this.firstEventLatency = options.firstEventLatency || null;
    this.totalBytes = options.totalBytes || 0;
    this.error = options.error || null;
  }

  get isReady() {
    return this.state === SSEProbeState.READY;
  }

  get isWaiting() {
    return this.state === SSEProbeState.WAITING;
  }
}

/**
 * 创建 SSE 首包探测回调
 * 用于检测 SSE 流是否已发送首个完整事件（以 \n\n 或 \r\n\r\n 结尾）
 * 只有收到完整首个事件后才开始向客户端发送数据
 *
 * @param {Object} options - 配置选项
 * @param {Function} options.onFirstEvent - 首个完整事件到达回调 (result: SSEProbeResult) => void
 * @param {Function} options.onError - 错误回调 (error) => void
 * @param {Function} options.onData - 数据回调 (eventName, eventData) => void - 每个完整事件触发
 * @param {number} [options.firstEventTimeout=5000] - 首个事件超时时间（毫秒）
 * @param {number} [options.maxRetries=3] - 最大重试次数
 * @returns {Object} 包含 handleSSE, probeResult, reset, abort 的对象
 *
 * @example
 * const sseProbe = createSSEFirstChunkProbe({
 *   onFirstEvent: (result) => {
 *     console.log('首个完整事件到达，延迟:', result.firstEventLatency, 'ms');
 *   },
 *   onData: (eventName, data) => {
 *     // 处理每个完整事件
 *     if (eventName === 'data') {
 *       // 发送数据到客户端
 *     }
 *   }
 * });
 *
 * // 在 SSE 事件处理器中使用
 * eventSource.onmessage = (event) => {
 *   sseProbe.handleSSE(event.data);
 * };
 */
function createSSEFirstChunkProbe(options = {}) {
  const {
    onFirstEvent = () => {},
    onError = () => {},
    onData = () => {},
    firstEventTimeout = 5000,
    maxRetries = 3
  } = options;

  // 内部状态
  let state = SSEProbeState.WAITING;
  let buffer = '';
  let events = [];
  let startTime = null;
  let firstEventTime = null;
  let totalBytes = 0;
  let timeoutTimer = null;
  let retryCount = 0;

  /**
   * 检测 SSE 事件是否完整
   * SSE 事件以空行结束（\n\n 或 \r\n\r\n）
   */
  function isCompleteEvent(data) {
    return data.includes('\n\n') || data.includes('\r\n\r\n');
  }

  /**
   * 解析 SSE 事件数据
   * 支持两种格式：
   * 1. data: value\n\n
   * 2. event: name\ndata: value\n\n
   */
  function parseSSEEvent(data) {
    const lines = data.split(/\r?\n/);
    let eventName = 'message';
    let eventData = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        eventData.push(line.slice(5).trim());
      }
    }

    return {
      name: eventName,
      data: eventData.join('\n'),
      raw: data
    };
  }

  /**
   * 处理接收到的数据块
   */
  function handleSSE(chunk) {
    if (state === SSEProbeState.ERROR) {
      return;
    }

    // 记录开始时间
    if (startTime === null) {
      startTime = Date.now();
      // 启动超时定时器
      timeoutTimer = setTimeout(() => {
        if (state === SSEProbeState.WAITING) {
          state = SSEProbeState.ERROR;
          const error = new Error(`SSE 首包探测超时: ${firstEventTimeout}ms 内未收到完整事件`);
          onError(error);
        }
      }, firstEventTimeout);
    }

    // 累加数据
    const chunkStr = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    totalBytes += Buffer.byteLength(chunkStr, 'utf8');
    buffer += chunkStr;

    // 检查是否收到完整的 SSE 事件
    if (isCompleteEvent(buffer)) {
      // 分割多个事件
      const rawEvents = buffer.split(/\n\n/).filter(e => e.trim());
      const completeEvents = [];

      for (const rawEvent of rawEvents) {
        if (rawEvent.includes('\r\n')) {
          const parts = rawEvent.split(/\r\n\r\n/);
          completeEvents.push(...parts.filter(e => e.trim()));
        } else {
          completeEvents.push(rawEvent);
        }
      }

      // 处理每个完整事件
      for (const eventData of completeEvents) {
        if (eventData.trim()) {
          const parsed = parseSSEEvent(eventData);
          events.push(parsed);
          onData(parsed.name, parsed.data);
        }
      }

      // 如果是首个完整事件，记录时间并切换状态
      if (state === SSEProbeState.WAITING) {
        firstEventTime = Date.now();
        state = SSEProbeState.READY;

        const result = new SSEProbeResult({
          state: SSEProbeState.READY,
          events: [...events],
          firstEventLatency: firstEventTime - startTime,
          totalBytes
        });

        // 清除超时定时器
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }

        onFirstEvent(result);
      }

      // 清空缓冲区（保留未处理完的数据）
      const lastNewlineIndex = buffer.lastIndexOf('\n\n');
      if (lastNewlineIndex !== -1) {
        buffer = buffer.slice(lastNewlineIndex + 2);
      } else {
        const lastCRLFIndex = buffer.lastIndexOf('\r\n\r\n');
        if (lastCRLFIndex !== -1) {
          buffer = buffer.slice(lastCRLFIndex + 4);
        } else {
          buffer = '';
        }
      }
    }
  }

  /**
   * 获取当前探测结果
   */
  function getProbeResult() {
    return new SSEProbeResult({
      state,
      events: [...events],
      firstEventLatency: firstEventTime ? (firstEventTime - startTime) : null,
      totalBytes
    });
  }

  /**
   * 获取当前状态
   */
  function getState() {
    return state;
  }

  /**
   * 获取是否就绪
   */
  function isReady() {
    return state === SSEProbeState.READY;
  }

  /**
   * 重置状态
   */
  function reset() {
    state = SSEProbeState.WAITING;
    buffer = '';
    events = [];
    startTime = null;
    firstEventTime = null;
    totalBytes = 0;
    retryCount = 0;

    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
  }

  /**
   * 中止探测
   */
  function abort() {
    state = SSEProbeState.ERROR;
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
  }

  return {
    handleSSE,
    getProbeResult,
    getState,
    isReady,
    reset,
    abort,
    // 暴露状态枚举供外部检查
    SSEProbeState
  };
}

/**
 * 创建带首包探测的 SSE 流式处理器
 * 适用于模型切换场景，确保收到完整首包后再发送给客户端
 *
 * @param {Object} options - createSSEFirstChunkProbe 选项
 * @param {Function} options.emit - 发送数据到客户端的函数 (data) => void
 * @returns {Object} 包含 handleSSE, probe, reset, abort 的对象
 *
 * @example
 * const sseHandler = createProbeSSEHandler({
 *   emit: (data) => {
 *     res.write(data);
 *   },
 *   onFirstEvent: (result) => {
 *     console.log('首包探测成功，延迟:', result.firstEventLatency);
 *     metrics.record('sse_first_event_latency', result.firstEventLatency);
 *   },
 *   onError: (error) => {
 *     console.error('首包探测失败:', error);
 *   }
 * });
 *
 * // 在 SSE 事件处理器中使用
 * eventSource.onmessage = (event) => {
 *   sseHandler.handleSSE(event.data);
 * };
 */
function createProbeSSEHandler(options = {}) {
  const {
    emit = () => {},
    onFirstEvent = () => {},
    onError = () => {},
    firstEventTimeout = 5000
  } = options;

  // 创建首包探测器
  const probe = createSSEFirstChunkProbe({
    onFirstEvent: (result) => {
      // 探测成功后，开始发送缓冲的数据
      onFirstEvent(result);
    },
    onError: (error) => {
      onError(error);
    },
    onData: (eventName, data) => {
      // 每个完整事件直接发送
      if (eventName === 'data' && data) {
        emit(`data: ${data}\n\n`);
      } else if (eventName === '[DONE]') {
        emit('data: [DONE]\n\n');
      } else if (eventName === 'error') {
        emit(`event: error\ndata: ${data}\n\n`);
      }
    },
    firstEventTimeout
  });

  return {
    handleSSE: probe.handleSSE,
    probe,
    reset: probe.reset,
    abort: probe.abort,
    isReady: probe.isReady,
    getState: probe.getState
  };
}

module.exports = {
  ProbeBufferingCallback,
  ProbeResult,
  ProbeState,
  createProbeStreamingCallback,
  createSSEFirstChunkProbe,
  createProbeSSEHandler,
  SSEProbeState,
  SSEProbeResult
};
