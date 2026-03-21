/**
 * URL 缩短工具
 * 将长 URL 转换为短链接
 */

class UrlShortenerTool {
  constructor(options = {}) {
    this.name = 'url_shortener';
    this.description = 'URL缩短 - 将长URL转换为短链接';
    this.category = 'utility';
    this.timeout = options.timeout || 10000;
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '要缩短的长URL'
        },
        service: {
          type: 'string',
          enum: ['tinyurl', 'isgd', 'clcku'],
          default: 'tinyurl',
          description: 'URL缩短服务'
        }
      },
      required: ['url']
    };
  }

  async execute(params) {
    const { url, service = 'tinyurl' } = params;

    if (!url || url.trim().length === 0) {
      return { success: false, error: 'URL不能为空' };
    }

    // 简单URL验证
    try {
      new URL(url);
    } catch {
      return { success: false, error: '无效的URL格式' };
    }

    try {
      let shortUrl;

      switch (service) {
        case 'tinyurl':
          shortUrl = await this.shortenWithTinyurl(url);
          break;
        case 'isgd':
          shortUrl = await this.shortenWithIsgd(url);
          break;
        case 'clcku':
          shortUrl = await this.shortenWithClcku(url);
          break;
        default:
          shortUrl = await this.shortenWithTinyurl(url);
      }

      return {
        success: true,
        originalUrl: url,
        shortUrl,
        service
      };
    } catch (error) {
      return {
        success: false,
        error: `URL缩短失败: ${error.message}`
      };
    }
  }

  async shortenWithTinyurl(url) {
    const response = await fetch(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(this.timeout) }
    );

    if (!response.ok) throw new Error('TinyURL API error');
    return await response.text();
  }

  async shortenWithIsgd(url) {
    const response = await fetch(
      `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(this.timeout) }
    );

    if (!response.ok) throw new Error('is.gd API error');
    return await response.text();
  }

  async shortenWithClcku(url) {
    // 过滤协议，只保留 host 和 path
    const parsed = new URL(url);
    const shortUrl = `https://clck.ru/--?url=${encodeURIComponent(url)}`;

    const response = await fetch(shortUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) throw new Error('clck.ru API error');
    return await response.text();
  }
}

module.exports = UrlShortenerTool;
