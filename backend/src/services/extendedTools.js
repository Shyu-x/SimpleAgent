/**
 * 扩展工具集
 * 论文搜索、网页爬虫、天气查询等
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Arxiv论文搜索工具
 */
class ArxivTool {
  constructor(options = {}) {
    this.name = 'arxiv_search';
    this.description = '搜索ArXiv论文';
    this.baseUrl = 'http://export.arxiv.org/api/query';
  }

  getSchema() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          maxResults: { type: 'number', description: '最大结果数', default: 5 }
        },
        required: ['query']
      }
    };
  }

  async execute(args) {
    const { query, maxResults = 5 } = args;

    try {
      const searchQuery = `all:${query.replace(/ /g, '+')}`;
      const url = `${this.baseUrl}?search_query=${searchQuery}&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;

      const response = await this._httpGet(url);

      // 解析XML响应
      const papers = this._parseArxivResponse(response);

      return {
        success: true,
        count: papers.length,
        papers: papers.map(p => ({
          title: p.title,
          authors: p.authors,
          summary: p.summary.substring(0, 200) + '...',
          published: p.published,
          pdfUrl: p.pdfUrl,
          id: p.id
        }))
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async _httpGet(urlStr) {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const protocol = url.protocol === 'https:' ? https : http;

      const req = protocol.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  _parseArxivResponse(xml) {
    const papers = [];
    const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];

    for (const entry of entries) {
      const title = this._extractTag(entry, 'title');
      const summary = this._extractTag(entry, 'summary');
      const published = this._extractTag(entry, 'published');
      const id = this._extractTag(entry, 'id');

      const authorMatches = entry.match(/<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/g) || [];
      const authors = authorMatches.map(m => this._extractTag(m, 'name'));

      const pdfLink = entry.match(/<link title="pdf" href="(.*?)"/);
      const pdfUrl = pdfLink ? pdfLink[1] : '';

      papers.push({ title, summary, published, id, authors, pdfUrl });
    }

    return papers;
  }

  _extractTag(xml, tag) {
    const match = xml.match(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
    return match ? match[1].trim().replace(/\\n/g, ' ') : '';
  }
}

/**
 * 网页爬虫工具
 */
class WebCrawlTool {
  constructor(options = {}) {
    this.name = 'web_crawl';
    this.description = '爬取网页内容';
    this.maxDepth = options.maxDepth || 2;
    this.maxPages = options.maxPages || 10;
  }

  getSchema() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '目标URL' },
          selector: { type: 'string', description: 'CSS选择器（可选）' }
        },
        required: ['url']
      }
    };
  }

  async execute(args) {
    const { url, selector } = args;

    try {
      const visited = new Set();
      const results = [];

      await this._crawl(url, selector, visited, results, 0);

      return {
        success: true,
        pagesCrawled: results.length,
        results
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async _crawl(url, selector, visited, results, depth) {
    if (depth > this.maxDepth || results.length >= this.maxPages) return;
    if (visited.has(url)) return;

    visited.add(url);

    try {
      const html = await this._fetchHtml(url);
      const content = selector ? this._extractBySelector(html, selector) : this._extractMainContent(html);

      results.push({
        url,
        title: this._extractTitle(html),
        content: content.substring(0, 2000)
      });

      // 提取链接继续爬取
      if (depth < this.maxDepth) {
        const links = this._extractLinks(html, url);
        for (const link of links.slice(0, 5)) {
          await this._crawl(link, selector, visited, results, depth + 1);
        }
      }
    } catch (error) {
      console.error(`Failed to crawl ${url}:`, error.message);
    }
  }

  async _fetchHtml(urlStr) {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const protocol = url.protocol === 'https:' ? https : http;

      const req = protocol.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });

      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  _extractTitle(html) {
    const match = html.match(/<title>([^<]+)<\/title>/i);
    return match ? match[1].trim() : '';
  }

  _extractMainContent(html) {
    // 移除脚本和样式
    let content = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');

    // 提取主要文本内容
    const textMatch = content.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
      content.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
      content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

    if (textMatch) {
      return this._htmlToText(textMatch[1]);
    }

    return this._htmlToText(content);
  }

  _extractBySelector(html, selector) {
    // 简化实现：使用正则匹配
    const match = html.match(new RegExp(`<[^>]+${selector}[^>]*>([\\s\\S]*?)</[^>]+>`, 'i'));
    return match ? this._htmlToText(match[1]) : '';
  }

  _extractLinks(html, baseUrl) {
    const links = [];
    const url = new URL(baseUrl);

    const matches = html.match(/href=["']([^"']+)["']/g) || [];
    for (const match of matches) {
      const href = match.replace(/href=["']/, '').replace(/["']$/, '');
      try {
        const fullUrl = new URL(href, baseUrl).href;
        if (fullUrl.startsWith(url.origin) && !links.includes(fullUrl)) {
          links.push(fullUrl);
        }
      } catch (e) {
        // 忽略无效URL
      }
    }

    return links;
  }

  _htmlToText(html) {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

/**
 * 天气查询工具
 */
class WeatherTool {
  constructor(options = {}) {
    this.name = 'get_weather';
    this.description = '查询天气信息';
    this.apiKey = options.apiKey || process.env.WEATHER_API_KEY;
  }

  getSchema() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名称' }
        },
        required: ['city']
      }
    };
  }

  async execute(args) {
    const { city } = args;

    try {
      // 模拟天气数据（实际应该调用天气API）
      const weatherData = this._getMockWeather(city);

      return {
        success: true,
        city,
        ...weatherData
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  _getMockWeather(city) {
    const conditions = ['晴', '多云', '阴', '小雨', '大雨', '雪'];
    const randomCondition = conditions[Math.floor(Math.random() * conditions.length)];

    return {
      condition: randomCondition,
      temperature: Math.floor(Math.random() * 30) + 5,
      humidity: Math.floor(Math.random() * 40) + 40,
      wind: `${Math.floor(Math.random() * 10) + 1}级`,
      aqi: Math.floor(Math.random() * 100) + 20,
      forecast: [
        { day: '今天', condition: randomCondition, high: 25, low: 18 },
        { day: '明天', condition: conditions[Math.floor(Math.random() * conditions.length)], high: 26, low: 19 },
        { day: '后天', condition: conditions[Math.floor(Math.random() * conditions.length)], high: 24, low: 17 }
      ],
      updateTime: new Date().toISOString()
    };
  }
}

/**
 * 图像生成提示词工具
 */
class ImagePromptTool {
  constructor(options = {}) {
    this.name = 'image_prompt';
    this.description = '生成图像提示词';
  }

  getSchema() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: '图像描述' },
          style: { type: 'string', description: '风格（可选）', enum: ['realistic', 'anime', 'digital-art', '3d-render', 'oil-painting'] }
        },
        required: ['description']
      }
    };
  }

  async execute(args) {
    const { description, style = 'realistic' } = args;

    // 生成优化的提示词
    const prompts = this._generatePrompts(description, style);

    return {
      success: true,
      original: description,
      prompts: {
        positive: prompts.positive,
        negative: prompts.negative,
        style
      },
      suggestions: [
        '添加更多细节描述',
        '指定光照条件',
        '考虑构图元素'
      ]
    };
  }

  _generatePrompts(description, style) {
    const stylePrompts = {
      'realistic': 'photorealistic, 8k, high detail, professional photography',
      'anime': 'anime style, manga, vibrant colors, clean lines',
      'digital-art': 'digital painting, concept art, illustrative',
      '3d-render': '3d render, cgi, unreal engine, octane render',
      'oil-painting': 'oil painting style, brushstrokes visible, classic art'
    };

    const negativePrompts = 'blur, low quality, distorted, deformed, ugly, bad anatomy';

    return {
      positive: `${description}, ${stylePrompts[style] || stylePrompts['realistic']}`,
      negative: negativePrompts
    };
  }
}

/**
 * 简历优化工具
 */
class ResumeOptimizerTool {
  constructor(options = {}) {
    this.name = 'resume_optimizer';
    this.description = '优化简历内容';
  }

  getSchema() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '简历内容' },
          target: { type: 'string', description: '目标职位（可选）' }
        },
        required: ['content']
      }
    };
  }

  async execute(args) {
    const { content, target } = args;

    // 分析并优化简历
    const analysis = this._analyzeResume(content, target);

    return {
      success: true,
      original: content.substring(0, 500),
      analysis,
      suggestions: this._generateSuggestions(analysis),
      optimized: this._optimizeContent(content, analysis)
    };
  }

  _analyzeResume(content, target) {
    const wordCount = content.split(/\s+/).length;
    const hasContact = /电话|邮箱|手机|email|phone/i.test(content);
    const hasExperience = /工作|经验|经历|experience/i.test(content);
    const hasEducation = /学历|教育|学校|education/i.test(content);

    return {
      wordCount,
      hasContact,
      hasExperience,
      hasEducation,
      target,
      score: (hasContact ? 20 : 0) + (hasExperience ? 40 : 0) + (hasEducation ? 40 : 0)
    };
  }

  _generateSuggestions(analysis) {
    const suggestions = [];

    if (!analysis.hasContact) {
      suggestions.push('建议添加联系方式（电话、邮箱）');
    }
    if (!analysis.hasExperience) {
      suggestions.push('建议详细描述工作经历');
    }
    if (!analysis.hasEducation) {
      suggestions.push('建议添加教育背景');
    }
    if (analysis.wordCount < 100) {
      suggestions.push('内容过少，建议补充更多细节');
    }

    return suggestions;
  }

  _optimizeContent(content, analysis) {
    // 简化实现：返回优化建议
    return content
      .replace(/star/i, '⭐')
      .replace(/job/i, '【职位】');
  }
}

/**
 * 邮件发送工具（模拟）
 */
class EmailTool {
  constructor(options = {}) {
    this.name = 'send_email';
    this.description = '发送电子邮件';
    this.smtpConfig = options.smtpConfig || null;
  }

  getSchema() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: '收件人邮箱' },
          subject: { type: 'string', description: '邮件主题' },
          body: { type: 'string', description: '邮件内容' },
          cc: { type: 'string', description: '抄送（可选）' }
        },
        required: ['to', 'subject', 'body']
      }
    };
  }

  async execute(args) {
    const { to, subject, body, cc } = args;

    // 验证邮箱格式
    if (!this._validateEmail(to)) {
      return { success: false, error: 'Invalid email address' };
    }

    // 模拟发送（实际应该配置SMTP）
    return {
      success: true,
      message: 'Email queued for sending',
      details: {
        to,
        subject,
        cc: cc || null,
        sentAt: new Date().toISOString()
      },
      note: 'Configure SMTP to actually send emails'
    };
  }

  _validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}

/**
 * 文档转换工具（模拟）
 */
class DocumentConverterTool {
  constructor(options = {}) {
    this.name = 'document_converter';
    this.description = '转换文档格式';
    this.supportedFormats = ['pdf', 'docx', 'md', 'txt', 'html'];
  }

  getSchema() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '文档内容' },
          from: { type: 'string', description: '源格式', enum: this.supportedFormats },
          to: { type: 'string', description: '目标格式', enum: this.supportedFormats }
        },
        required: ['content', 'from', 'to']
      }
    };
  }

  async execute(args) {
    const { content, from, to } = args;

    if (!this.supportedFormats.includes(from) || !this.supportedFormats.includes(to)) {
      return { success: false, error: 'Unsupported format' };
    }

    // 模拟转换
    return {
      success: true,
      converted: true,
      originalFormat: from,
      targetFormat: to,
      convertedContent: content,
      note: 'Document conversion simulated'
    };
  }
}

/**
 * 扩展工具注册表
 */
class ExtendedToolRegistry {
  constructor() {
    this.tools = new Map();
    this._registerDefaultTools();
  }

  _registerDefaultTools() {
    this.register(new ArxivTool());
    this.register(new WebCrawlTool());
    this.register(new WeatherTool());
    this.register(new ImagePromptTool());
    this.register(new ResumeOptimizerTool());
    this.register(new EmailTool());
    this.register(new DocumentConverterTool());
  }

  register(tool) {
    this.tools.set(tool.name, tool);
  }

  unregister(name) {
    return this.tools.delete(name);
  }

  get(name) {
    return this.tools.get(name);
  }

  list() {
    return Array.from(this.tools.values()).map(t => t.getSchema());
  }

  async execute(name, args) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return await tool.execute(args);
  }
}

module.exports = {
  ArxivTool,
  WebCrawlTool,
  WeatherTool,
  ImagePromptTool,
  ResumeOptimizerTool,
  EmailTool,
  DocumentConverterTool,
  ExtendedToolRegistry
};
