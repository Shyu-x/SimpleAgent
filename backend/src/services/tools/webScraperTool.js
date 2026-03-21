/**
 * 网页抓取工具
 * 安全地抓取网页内容并提取信息
 */

const https = require('https');
const http = require('http');

class WebScraperTool {
  constructor(options = {}) {
    this.name = 'web_scraper';
    this.description = '抓取网页内容并提取文本信息';
    this.category = 'web';
    this.timeout = options.timeout || 10000;
    this.maxSize = options.maxSize || 1024 * 1024; // 1MB
    this.userAgent = options.userAgent || 'Mozilla/5.0 (compatible; AgentBot/1.0)';
    this.followRedirects = options.followRedirects !== false;
    this.maxRedirects = options.maxRedirects || 5;
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
          description: '要抓取的网页URL'
        },
        selector: {
          type: 'string',
          description: 'CSS选择器，用于提取特定元素（可选）'
        },
        extract: {
          type: 'string',
          enum: ['text', 'html', 'links', 'images', 'metadata'],
          description: '提取类型'
        },
        timeout: {
          type: 'number',
          description: '超时时间(ms)'
        }
      },
      required: ['url']
    };
  }

  /**
   * 执行抓取
   */
  async execute(params) {
    const { url, selector, extract = 'text', timeout = this.timeout } = params;

    // 验证URL
    if (!this.isValidUrl(url)) {
      return {
        success: false,
        error: '无效的URL格式'
      };
    }

    try {
      const startTime = Date.now();
      const content = await this.fetchUrl(url, timeout);
      const duration = Date.now() - startTime;

      // 提取内容
      let result;
      switch (extract) {
        case 'html':
          result = this.extractHtml(content, selector);
          break;
        case 'links':
          result = this.extractLinks(content, url);
          break;
        case 'images':
          result = this.extractImages(content, url);
          break;
        case 'metadata':
          result = this.extractMetadata(content);
          break;
        case 'text':
        default:
          result = this.extractText(content, selector);
      }

      return {
        success: true,
        url,
        extract,
        data: result,
        duration,
        size: content.length
      };

    } catch (error) {
      return {
        success: false,
        url,
        error: error.message
      };
    }
  }

  /**
   * 验证URL
   */
  isValidUrl(url) {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  /**
   * 获取URL内容
   */
  fetchUrl(url, timeout) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const client = parsed.protocol === 'https:' ? https : http;

      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        },
        timeout
      };

      const req = client.request(options, (res) => {
        // 处理重定向
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (this.followRedirects && this.maxRedirects > 0) {
            const redirectUrl = new URL(res.headers.location, url).href;
            resolve(this.fetchUrl(redirectUrl, timeout));
            return;
          }
          reject(new Error(`重定向到: ${res.headers.location}`));
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP错误: ${res.statusCode}`));
          return;
        }

        let data = '';
        let size = 0;

        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > this.maxSize) {
            req.destroy();
            reject(new Error('响应过大'));
            return;
          }
          data += chunk;
        });

        res.on('end', () => {
          resolve(data);
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('请求超时'));
      });

      req.end();
    });
  }

  /**
   * 提取文本
   */
  extractText(html, selector) {
    // 移除脚本和样式
    let text = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    if (selector) {
      // 简单的选择器匹配
      const pattern = new RegExp(`<[^>]*class=["'][^"']*${selector}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]*>`, 'gi');
      const matches = text.match(pattern) || [];
      text = matches.join('\n');
    }

    // 提取文本
    text = text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();

    return text.substring(0, 10000); // 限制文本长度
  }

  /**
   * 提取HTML
   */
  extractHtml(html, selector) {
    if (!selector) {
      return html.substring(0, 10000);
    }

    // 简单选择器匹配
    const pattern = new RegExp(`(<[^>]*class=["'][^"']*${selector}[^"']*["'][^>]*>[\\s\\S]*?<\\/[^>]*>)`, 'gi');
    const matches = html.match(pattern) || [];
    return matches.join('\n').substring(0, 10000);
  }

  /**
   * 提取链接
   */
  extractLinks(html, baseUrl) {
    const links = [];
    const linkPattern = /<a[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
    let match;

    while ((match = linkPattern.exec(html)) !== null) {
      let href = match[1];
      const text = match[2].trim();

      // 转换相对URL为绝对URL
      try {
        if (href.startsWith('/')) {
          const base = new URL(baseUrl);
          href = `${base.protocol}//${base.host}${href}`;
        } else if (!href.startsWith('http')) {
          href = new URL(href, baseUrl).href;
        }
      } catch {
        continue;
      }

      // 过滤无效链接
      if (href.startsWith('javascript:') || href.startsWith('#')) {
        continue;
      }

      links.push({ href, text });
    }

    return links.slice(0, 100); // 限制链接数量
  }

  /**
   * 提取图片
   */
  extractImages(html, baseUrl) {
    const images = [];
    const imgPattern = /<img[^>]*src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi;
    let match;

    while ((match = imgPattern.exec(html)) !== null) {
      let src = match[1];
      const alt = match[2] || '';

      try {
        if (src.startsWith('/')) {
          const base = new URL(baseUrl);
          src = `${base.protocol}//${base.host}${src}`;
        } else if (!src.startsWith('http')) {
          src = new URL(src, baseUrl).href;
        }
      } catch {
        continue;
      }

      images.push({ src, alt });
    }

    return images.slice(0, 50);
  }

  /**
   * 提取元数据
   */
  extractMetadata(html) {
    const metadata = {
      title: '',
      description: '',
      keywords: [],
      og: {}
    };

    // 提取标题
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    if (titleMatch) {
      metadata.title = titleMatch[1].trim();
    }

    // 提取描述
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
    if (descMatch) {
      metadata.description = descMatch[1].trim();
    }

    // 提取关键词
    const keywordsMatch = html.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']*)["']/i);
    if (keywordsMatch) {
      metadata.keywords = keywordsMatch[1].split(',').map(k => k.trim());
    }

    // 提取 Open Graph 标签
    const ogMatches = html.matchAll(/<meta[^>]*property=["']og:([^"']+)["'][^>]*content=["']([^"']*)["']/gi);
    for (const match of ogMatches) {
      metadata.og[match[1]] = match[2];
    }

    return metadata;
  }
}

module.exports = WebScraperTool;