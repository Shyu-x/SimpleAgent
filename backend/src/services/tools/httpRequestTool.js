/**
 * HTTP 请求工具
 * 安全发送 HTTP 请求
 */

class HttpRequestTool {
  constructor(options = {}) {
    this.name = 'http_request';
    this.description = '发送 HTTP 请求获取网络资源';
    this.category = 'internet';
    this.timeout = options.timeout || 30000;
    this.maxResponseSize = options.maxResponseSize || 1024 * 1024; // 1MB
    this.allowedDomains = options.allowedDomains || null; // 白名单模式
    this.blockedDomains = options.blockedDomains || [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '192.168.',
      '10.',
      '172.16.',
      'internal.',
      '.local'
    ];
  }

  /**
   * 参数模式
   */
  get parameters() {
    return {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '请求 URL'
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'],
          description: 'HTTP 方法'
        },
        headers: {
          type: 'object',
          description: '请求头'
        },
        body: {
          type: 'string',
          description: '请求体'
        },
        options: {
          type: 'object',
          properties: {
            timeout: { type: 'number', description: '超时时间(ms)' },
            followRedirects: { type: 'boolean', description: '是否跟随重定向' },
            responseType: { type: 'string', enum: ['json', 'text', 'binary'], description: '响应类型' }
          }
        }
      },
      required: ['url']
    };
  }

  /**
   * 安全检查 URL
   */
  isUrlSafe(url) {
    try {
      const parsed = new URL(url);

      // 检查协议
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { safe: false, reason: `不支持的协议: ${parsed.protocol}` };
      }

      // 检查黑名单域名
      const hostname = parsed.hostname.toLowerCase();
      for (const blocked of this.blockedDomains) {
        if (hostname === blocked || hostname.endsWith('.' + blocked) || hostname.startsWith(blocked)) {
          return { safe: false, reason: `禁止访问的域名: ${hostname}` };
        }
      }

      // 白名单检查
      if (this.allowedDomains && this.allowedDomains.length > 0) {
        const isAllowed = this.allowedDomains.some(allowed =>
          hostname === allowed || hostname.endsWith('.' + allowed)
        );
        if (!isAllowed) {
          return { safe: false, reason: `域名不在白名单中: ${hostname}` };
        }
      }

      return { safe: true };
    } catch (error) {
      return { safe: false, reason: `无效的 URL: ${error.message}` };
    }
  }

  /**
   * 执行 HTTP 请求
   */
  async execute(params) {
    const {
      url,
      method = 'GET',
      headers = {},
      body,
      options = {}
    } = params;

    // URL 安全检查
    const safetyCheck = this.isUrlSafe(url);
    if (!safetyCheck.safe) {
      return {
        success: false,
        error: safetyCheck.reason,
        url
      };
    }

    const timeout = options.timeout || this.timeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const fetchOptions = {
        method,
        headers: this.sanitizeHeaders(headers),
        signal: controller.signal,
        redirect: options.followRedirects !== false ? 'follow' : 'manual'
      };

      // 添加请求体
      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      const startTime = Date.now();
      const response = await fetch(url, fetchOptions);
      const duration = Date.now() - startTime;

      clearTimeout(timeoutId);

      // 读取响应
      const responseResult = await this.readResponse(response, options.responseType);

      return {
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: this.headersToObject(response.headers),
        url: response.url,
        duration,
        ...responseResult
      };

    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        return {
          success: false,
          error: `请求超时 (${timeout}ms)`,
          timeout: true,
          url
        };
      }

      return {
        success: false,
        error: error.message,
        url
      };
    }
  }

  /**
   * 清理请求头
   */
  sanitizeHeaders(headers) {
    const sanitized = {};
    const blockedHeaders = ['host', 'cookie', 'authorization', 'proxy-authorization'];

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (!blockedHeaders.includes(lowerKey)) {
        sanitized[key] = value;
      }
    }

    // 添加 User-Agent
    if (!sanitized['User-Agent'] && !sanitized['user-agent']) {
      sanitized['User-Agent'] = 'AI-Agent-HTTP-Tool/1.0';
    }

    return sanitized;
  }

  /**
   * 读取响应内容
   */
  async readResponse(response, responseType) {
    try {
      const contentLength = parseInt(response.headers.get('content-length') || '0');

      if (contentLength > this.maxResponseSize) {
        return {
          data: null,
          error: `响应过大: ${contentLength} bytes`
        };
      }

      switch (responseType) {
        case 'json':
          try {
            const json = await response.json();
            return { data: json, type: 'json' };
          } catch {
            const text = await response.text();
            return { data: text, type: 'text', parseError: 'Invalid JSON' };
          }

        case 'binary':
          const buffer = await response.arrayBuffer();
          if (buffer.byteLength > this.maxResponseSize) {
            return { data: null, error: `响应过大: ${buffer.byteLength} bytes` };
          }
          return {
            data: `[Binary data: ${buffer.byteLength} bytes]`,
            type: 'binary',
            size: buffer.byteLength
          };

        default:
          const text = await response.text();
          return {
            data: text.substring(0, this.maxResponseSize),
            type: 'text',
            size: text.length
          };
      }
    } catch (error) {
      return {
        data: null,
        error: `读取响应失败: ${error.message}`
      };
    }
  }

  /**
   * Headers 转对象
   */
  headersToObject(headers) {
    const obj = {};
    headers.forEach((value, key) => {
      obj[key] = value;
    });
    return obj;
  }
}

module.exports = HttpRequestTool;