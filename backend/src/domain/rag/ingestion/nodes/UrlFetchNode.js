/**
 * UrlFetchNode - URL抓取节点
 *
 * 职责：
 * - 验证和抓取网页内容
 * - 提取正文内容（去除广告、导航、脚本等）
 * - 处理相对路径的图片/链接
 * - 提取元数据（标题、作者、日期等）
 *
 * 支持网页类型：
 * - 新闻文章
 * - 博客文章
 * - 技术文档
 * - 论坛帖子
 * - 问答网站
 */

const { IngestionNode } = require('../IngestionNode');

// 标签权重配置（用于正文提取）
const TAG_WEIGHTS = {
  article: 100,
  main: 90,
  section: 50,
  div: 10,
  p: 30,
  span: 5,
  a: 0,
  script: -1000,
  style: -1000,
  nav: -50,
  header: -50,
  footer: -50,
  aside: -50,
  form: -100,
  iframe: -100,
};

// 需要移除的标签及其内容
const REMOVE_TAGS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'object',
  'embed',
  'svg',
  'canvas',
  'video',
  'audio',
  'source',
  'track',
  'area',
  'map',
];

// 可选保留的标签
const CONTENT_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'td', 'th', 'blockquote', 'pre', 'code', 'article', 'section'];

class UrlFetchNode extends IngestionNode {
  constructor(options = {}) {
    super('UrlFetchNode', options);
    this.options = {
      timeout: options.timeout || 30000,
      userAgent: options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      maxContentLength: options.maxContentLength || 10 * 1024 * 1024, // 10MB
      followRedirects: options.followRedirects !== false,
      respectRobotsTxt: options.respectRobotsTxt !== false,
      ...options,
    };
    this.cheerio = null;
  }

  /**
   * 前置检查
   * @param {Object} context
   */
  async _preCheck(context) {
    // 检查URL字段
    if (!context.url && !context.rawContent) {
      throw new ValidationError(this.name, '缺少 url 或 rawContent 字段');
    }
  }

  /**
   * 核心抓取逻辑
   * @param {Object} context
   * @returns {Promise<Object>}
   */
  async _process(context) {
    // 动态加载 cheerio
    if (!this.cheerio) {
      this.cheerio = require('cheerio');
    }

    let html;
    let finalUrl = context.url;

    // 判断是URL抓取还是直接HTML处理
    if (context.url) {
      // 1. 验证URL格式
      const urlObj = this._validateUrl(context.url);
      finalUrl = urlObj.href;

      // 2. 抓取网页
      html = await this._fetchUrl(finalUrl);
    } else {
      // 直接处理HTML内容
      html = context.rawContent;
      finalUrl = context.url || 'inline-html';
    }

    // 3. 提取正文内容
    const extracted = await this.extractContent(html, finalUrl);

    // 4. 处理相对路径
    const contentWithAbsoluteUrls = this._convertRelativeToAbsolute(
      extracted.content,
      finalUrl
    );

    return {
      rawContent: contentWithAbsoluteUrls,
      contentType: 'text/html',
      source: finalUrl,
      fetchMetadata: {
        url: finalUrl,
        title: extracted.title,
        author: extracted.author,
        publishDate: extracted.publishDate,
        description: extracted.description,
        imageCount: extracted.images.length,
        linkCount: extracted.links.length,
        contentLength: contentWithAbsoluteUrls.length,
        extractedAt: new Date().toISOString(),
      },
      images: extracted.images,
      links: extracted.links,
    };
  }

  /**
   * 验证URL格式
   * @param {string} url
   * @returns {URL}
   */
  _validateUrl(url) {
    try {
      // 支持相对路径
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        throw new Error('URL必须以 http:// 或 https:// 开头');
      }
      const urlObj = new URL(url);

      // 只支持HTTP/HTTPS协议
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new Error('只支持 HTTP/HTTPS 协议');
      }

      return urlObj;
    } catch (error) {
      throw new ValidationError(this.name, `URL格式无效: ${error.message}`);
    }
  }

  /**
   * 抓取网页内容
   * @param {string} url
   * @returns {Promise<string>}
   */
  async _fetchUrl(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': this.options.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        signal: controller.signal,
        redirect: this.options.followRedirects ? 'follow' : 'manual',
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
      }

      // 检查内容长度
      const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
      if (contentLength > this.options.maxContentLength) {
        throw new Error(`内容过长: ${contentLength} bytes`);
      }

      const html = await response.text();

      if (html.length > this.options.maxContentLength) {
        throw new Error(`内容过长: ${html.length} characters`);
      }

      return html;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`请求超时: ${this.options.timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * 提取网页正文内容
   * @param {string} html
   * @param {string} baseUrl
   * @returns {Promise<Object>}
   */
  async extractContent(html, baseUrl) {
    const $ = this.cheerio.load(html, {
      xml: false,
      decodeEntities: true,
    });

    // 1. 移除不需要的标签
    this._removeUnwantedTags($);

    // 2. 提取元数据
    const title = this._extractTitle($);
    const author = this._extractAuthor($);
    const publishDate = this._extractPublishDate($);
    const description = this._extractDescription($);

    // 3. 提取图片和链接
    const images = this._extractImages($, baseUrl);
    const links = this._extractLinks($, baseUrl);

    // 4. 提取正文（核心算法）
    const content = this._extractMainContent($);

    return {
      title,
      author,
      publishDate,
      description,
      images,
      links,
      content,
    };
  }

  /**
   * 移除不需要的标签
   * @param {cheerio.Root} $
   */
  _removeUnwantedTags($) {
    // 移除脚本和样式
    $(REMOVE_TAGS.join(',')).remove();

    // 移除隐藏元素
    $('[style*="display: none"]').remove();
    $('[style*="display:none"]').remove();
    $('[hidden]').remove();

    // 移除空标签
    $('div:empty').remove();
    $('span:empty').remove();
    $('p:empty').remove();
  }

  /**
   * 提取标题
   * @param {cheerio.Root} $
   * @returns {string}
   */
  _extractTitle($) {
    // 优先从 og:title 获取
    const ogTitle = $('meta[property="og:title"]').attr('content');
    if (ogTitle) return ogTitle.trim();

    // 然后从 title 标签获取
    const title = $('title').text();
    if (title) return title.trim();

    // 最后从 h1 获取
    const h1 = $('h1').first().text();
    if (h1) return h1.trim();

    return '';
  }

  /**
   * 提取作者
   * @param {cheerio.Root} $
   * @returns {string}
   */
  _extractAuthor($) {
    // 尝试多种 author 元标签
    const authorSelectors = [
      'meta[name="author"]',
      'meta[property="article:author"]',
      'meta[name="Author"]',
    ];

    for (const selector of authorSelectors) {
      const author = $(selector).attr('content');
      if (author) return author.trim();
    }

    // 尝试从常见作者类名/ID 提取
    const authorSelectors2 = [
      '.author',
      '#author',
      '.byline',
      '[rel="author"]',
      '.post-author',
    ];

    for (const selector of authorSelectors2) {
      const author = $(selector).first().text();
      if (author) return author.trim().substring(0, 100);
    }

    return '';
  }

  /**
   * 提取发布日期
   * @param {cheerio.Root} $
   * @returns {string}
   */
  _extractPublishDate($) {
    const dateSelectors = [
      'meta[property="article:published_time"]',
      'meta[name="publishdate"]',
      'meta[name="date"]',
      'meta[name="DC.date.issued"]',
      'time[datetime]',
    ];

    for (const selector of dateSelectors) {
      const date = $(selector).attr('content') || $(selector).attr('datetime');
      if (date) return date.trim();
    }

    // 尝试从常见日期类名提取
    const dateClassSelectors = [
      '.date',
      '.publish-date',
      '.post-date',
      '.entry-date',
    ];

    for (const selector of dateClassSelectors) {
      const date = $(selector).first().text();
      if (date) return date.trim().substring(0, 50);
    }

    return '';
  }

  /**
   * 提取描述
   * @param {cheerio.Root} $
   * @returns {string}
   */
  _extractDescription($) {
    const descSelectors = [
      'meta[property="og:description"]',
      'meta[name="description"]',
      'meta[name="Description"]',
    ];

    for (const selector of descSelectors) {
      const desc = $(selector).attr('content');
      if (desc) return desc.trim();
    }

    return '';
  }

  /**
   * 提取图片列表
   * @param {cheerio.Root} $
   * @param {string} baseUrl
   * @returns {Array}
   */
  _extractImages($, baseUrl) {
    const images = [];
    const baseUrlObj = new URL(baseUrl);

    $('img').each((i, el) => {
      const src = $(el).attr('src');
      const alt = $(el).attr('alt') || '';
      const title = $(el).attr('title') || '';

      if (src) {
        try {
          const absoluteUrl = new URL(src, baseUrlObj).href;
          images.push({
            url: absoluteUrl,
            alt,
            title,
          });
        } catch {
          // 忽略无效URL
        }
      }
    });

    return images;
  }

  /**
   * 提取链接列表
   * @param {cheerio.Root} $
   * @param {string} baseUrl
   * @returns {Array}
   */
  _extractLinks($, baseUrl) {
    const links = [];
    const baseUrlObj = new URL(baseUrl);

    $('a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim().substring(0, 100);

      if (href) {
        try {
          const absoluteUrl = new URL(href, baseUrlObj).href;
          links.push({
            url: absoluteUrl,
            text,
          });
        } catch {
          // 忽略无效URL
        }
      }
    });

    return links;
  }

  /**
   * 提取正文内容（核心算法）
   * @param {cheerio.Root} $
   * @returns {string}
   */
  _extractMainContent($) {
    // 方法1: 使用 Readability 风格的算法

    // 1. 尝试找 article 标签
    const article = $('article').first();
    if (article.length && article.text().length > 200) {
      return this._cleanText(article);
    }

    // 2. 尝试找 main 标签
    const main = $('main').first();
    if (main.length && main.text().length > 200) {
      return this._cleanText(main);
    }

    // 3. 尝试找内容区域（通过 class/id 匹配常见模式）
    const contentSelectors = [
      '#content',
      '.content',
      '#main-content',
      '.main-content',
      '#post-content',
      '.post-content',
      '#article-content',
      '.article-content',
      '.entry-content',
      '.post-body',
      '.article-body',
    ];

    for (const selector of contentSelectors) {
      const content = $(selector).first();
      if (content.length && content.text().length > 200) {
        return this._cleanText(content);
      }
    }

    // 4. 尝试找最大的文本块
    let maxLength = 0;
    let bestContent = '';

    $('div, section, article').each((i, el) => {
      const text = $(el).text();
      if (text.length > maxLength) {
        // 计算文本密度
        const textDensity = this._calculateTextDensity($(el));
        if (textDensity > 0.1) {
          maxLength = text.length;
          bestContent = $(el).text();
        }
      }
    });

    if (bestContent && maxLength > 200) {
      return this._cleanText(bestContent);
    }

    // 5. 回退到 body
    const body = $('body').text();
    if (body && body.length > 200) {
      return this._cleanText(body);
    }

    // 6. 最终回退：返回全部文本
    return this._cleanText($('html').text());
  }

  /**
   * 计算文本密度（文本长度 / HTML长度）
   * @param {cheerio.Cheerio} element
   * @returns {number}
   */
  _calculateTextDensity(element) {
    const html = element.html() || '';
    const text = element.text() || '';

    if (html.length === 0) return 0;

    // 移除所有标签后的纯文本
    const textOnly = text.trim();
    return textOnly.length / html.length;
  }

  /**
   * 清理文本内容
   * @param {string|cheerio.Cheerio} content
   * @returns {string}
   */
  _cleanText(content) {
    let text = typeof content === 'string' ? content : content.text();

    // HTML实体解码
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/&hellip;/g, '...')
      .replace(/&bull;/g, '•')
      .replace(/&middot;/g, '·');

    // 移除多余空白
    text = text
      .replace(/\s+/g, ' ')           // 合并多个空格
      .replace(/\n\s*\n/g, '\n\n')   // 合并多个换行
      .replace(/\r\n/g, '\n')        // Windows换行符
      .trim();

    return text;
  }

  /**
   * 将相对路径转换为绝对路径
   * @param {string} content
   * @param {string} baseUrl
   * @returns {string}
   */
  _convertRelativeToAbsolute(content, baseUrl) {
    try {
      const baseUrlObj = new URL(baseUrl);

      // 转换图片 src
      content = content.replace(
        /src=["'](?!http|data:)([^"']+)["']/gi,
        (match, src) => {
          try {
            const absoluteUrl = new URL(src, baseUrlObj).href;
            return `src="${absoluteUrl}"`;
          } catch {
            return match;
          }
        }
      );

      // 转换链接 href
      content = content.replace(
        /href=["'](?!http|mailto:|tel:)([^"']+)["']/gi,
        (match, href) => {
          try {
            const absoluteUrl = new URL(href, baseUrlObj).href;
            return `href="${absoluteUrl}"`;
          } catch {
            return match;
          }
        }
      );

      return content;
    } catch {
      return content;
    }
  }

  /**
   * 后置验证
   * @param {Object} result
   * @param {Object} context
   */
  async _postValidate(result, context) {
    if (!result.rawContent || result.rawContent.length === 0) {
      throw new Error('抓取后内容为空');
    }
    if (result.rawContent.length < 100) {
      throw new Error('抓取后内容过短，可能抓取失败');
    }
    if (result.fetchMetadata && !result.fetchMetadata.title) {
      this.logger.warn(`[${this.name}] 无法提取标题`);
    }
  }
}

module.exports = UrlFetchNode;
