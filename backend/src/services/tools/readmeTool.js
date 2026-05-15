/**
 * 文档阅读工具
 * 用于阅读 README、技术文档、API文档等
 * 支持 URL 和本地文件
 */

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');
const AppError = require('../../common/errors/AppError');
const createLogger = require('../../common/logger');
const logger = createLogger('ReadmeTool');

class ReadmeTool {
  constructor(options = {}) {
    this.name = 'read_doc';
    this.description = '阅读文档 - README、技术文档、API文档等，支持 URL 和本地文件';
    this.category = 'internet';
    this.timeout = options.timeout || 30000;
    this.maxLength = options.maxLength || 50000; // 最大读取长度
    this.allowedExtensions = ['.md', '.txt', '.html', '.json', '.yml', '.yaml', '.rst'];
  }

  /**
   * 参数模式
   */
  get parameters() {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['read_url', 'read_file', 'readme', 'api_docs', 'summarize'],
          description: '操作类型'
        },
        url: {
          type: 'string',
          description: '文档 URL (read_url 时使用)'
        },
        path: {
          type: 'string',
          description: '本地文件路径 (read_file 时使用)'
        },
        repo: {
          type: 'string',
          description: 'GitHub 仓库 (readme, api_docs 时使用，格式: owner/repo)'
        },
        branch: {
          type: 'string',
          description: '分支 (默认 main)'
        },
        options: {
          type: 'object',
          properties: {
            maxLength: { type: 'number' },
            includeTree: { type: 'boolean' },
            language: { type: 'string' }
          }
        }
      },
      required: ['action']
    };
  }

  /**
   * 执行操作
   */
  async execute(params) {
    const { action, url, path: filePath, repo, branch = 'main', options = {} } = params;

    try {
      switch (action) {
        case 'read_url':
          return await this.readUrl(url, options);
        case 'read_file':
          return await this.readLocalFile(filePath, options);
        case 'readme':
          return await this.getRepoReadme(repo, branch, options);
        case 'api_docs':
          return await this.getApiDocs(repo, options);
        case 'summarize':
          return await this.summarize(url, options);
        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (error) {
      logger.error(`执行失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 读取 URL 内容
   */
  async readUrl(url, options = {}) {
    if (!url) {
      return { success: false, error: 'URL 不能为空' };
    }

    const maxLength = options.maxLength || this.maxLength;

    try {
      const content = await this.fetchUrl(url);
      const truncated = content.length > maxLength;
      const displayContent = content.slice(0, maxLength);

      return {
        success: true,
        url,
        content: displayContent,
        truncated,
        fullLength: content.length,
        readLength: displayContent.length,
        format: this.detectFormat(url, content)
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 读取本地文件
   */
  async readLocalFile(filePath, options = {}) {
    if (!filePath) {
      return { success: false, error: '文件路径不能为空' };
    }

    const maxLength = options.maxLength || this.maxLength;
    const ext = path.extname(filePath).toLowerCase();

    if (!this.allowedExtensions.includes(ext)) {
      return { success: false, error: `不支持的文件类型: ${ext}` };
    }

    try {
      const fullPath = path.resolve(filePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      const truncated = content.length > maxLength;
      const displayContent = content.slice(0, maxLength);

      return {
        success: true,
        path: fullPath,
        content: displayContent,
        truncated,
        fullLength: content.length,
        readLength: displayContent.length,
        format: ext.replace('.', '')
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取仓库 README
   */
  async getRepoReadme(repo, branch, options = {}) {
    if (!repo) {
      return { success: false, error: '仓库不能为空' };
    }

    // 常见的 README 文件名
    const readmeNames = ['README.md', 'README.md', 'README.txt', 'README.rst', 'README'];

    for (const name of readmeNames) {
      const url = `https://raw.githubusercontent.com/${repo}/${branch}/${name}`;
      try {
        const content = await this.fetchUrl(url);
        return {
          success: true,
          repo,
          branch,
          file: name,
          content,
          url,
          format: 'md'
        };
      } catch (e) {
        // 尝试下一个文件名
      }
    }

    return { success: false, error: `未找到 README 文件: ${repo}` };
  }

  /**
   * 获取 API 文档
   */
  async getApiDocs(repo, options = {}) {
    if (!repo) {
      return { success: false, error: '仓库不能为空' };
    }

    const language = options.language || this.detectLanguage(repo);

    // 根据语言选择常见的 API 文档路径
    const apiDocPaths = {
      javascript: ['API.md', 'api.md', 'docs/api.md', 'API.md', 'reference.md'],
      python: ['API.md', 'api.md', 'docs/api.md', 'reference.md', 'README.md'],
      typescript: ['API.md', 'api.md', 'docs/api.md', 'reference.md', 'README.md'],
      go: ['API.md', 'api.md', 'reference.md', 'README.md'],
      rust: ['API.md', 'api.md', 'src/api.md', 'README.md']
    };

    const paths = apiDocPaths[language] || ['README.md'];

    for (const docPath of paths) {
      const url = `https://raw.githubusercontent.com/${repo}/main/${docPath}`;
      try {
        const content = await this.fetchUrl(url);
        return {
          success: true,
          repo,
          branch: 'main',
          file: docPath,
          content,
          url,
          format: 'md'
        };
      } catch (e) {
        // 尝试下一个路径
      }
    }

    return { success: false, error: `未找到 API 文档: ${repo}` };
  }

  /**
   * 总结文档 (简化实现)
   */
  async summarize(url, options = {}) {
    if (!url) {
      return { success: false, error: 'URL 不能为空' };
    }

    try {
      const result = await this.readUrl(url, { maxLength: 10000 });
      if (!result.success) {
        return result;
      }

      // 简单的总结：提取标题和前几段
      const lines = result.content.split('\n').filter(l => l.trim());
      const title = lines.find(l => l.startsWith('#')) || lines[0] || '';
      const paragraphs = lines.filter(l => l.length > 50).slice(0, 3);

      return {
        success: true,
        url,
        summary: {
          title: title.replace(/^#+\s*/, ''),
          keyPoints: paragraphs,
          totalLength: result.fullLength,
          truncated: result.truncated
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取仓库文件树
   */
  async getRepoTree(repo, options = {}) {
    if (!repo) {
      return { success: false, error: '仓库不能为空' };
    }

    const branch = options.branch || 'main';

    try {
      const url = `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'MiniMax-Agent' }
      });

      if (!response.ok) {
        throw AppError.internalError(`GitHub API 错误: ${response.status}`);
      }

      const data = await response.json();
      const tree = data.tree || [];

      // 只返回文件
      const files = tree
        .filter(item => item.type === 'blob')
        .map(item => item.path)
        .filter(p => p.match(/\.(md|txt|json|yml|yaml|js|ts|py|go|rs|html|css)$/i));

      return {
        success: true,
        repo,
        branch,
        totalFiles: files.length,
        files: files.slice(0, 100) // 限制返回数量
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取远程 URL 内容
   */
  fetchUrl(url) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const timeout = setTimeout(() => {
        reject(new Error('请求超时'));
      }, this.timeout);

      const req = protocol.get(url, { headers: { 'User-Agent': 'MiniMax-Agent' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // 处理重定向
          timeout.refresh();
          this.fetchUrl(res.headers.location).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode !== 200) {
          clearTimeout(timeout);
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          clearTimeout(timeout);
          resolve(Buffer.concat(chunks).toString('utf-8'));
        });
        res.on('error', err => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      req.on('error', err => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * 检测文档格式
   */
  detectFormat(url, content) {
    if (url.endsWith('.md') || url.includes('readme')) return 'markdown';
    if (url.endsWith('.json')) return 'json';
    if (url.endsWith('.html')) return 'html';
    if (url.endsWith('.txt')) return 'text';
    if (content.startsWith('{') || content.startsWith('[')) return 'json';
    if (content.startsWith('#') || content.includes('## ')) return 'markdown';
    return 'text';
  }

  /**
   * 检测仓库语言
   */
  detectLanguage(repo) {
    const extMap = {
      '.js': 'javascript', '.jsx': 'javascript',
      '.ts': 'typescript', '.tsx': 'typescript',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.rb': 'ruby',
      '.php': 'php'
    };

    // 这个方法需要在实际使用时查询 GitHub
    return 'javascript'; // 默认值
  }
}

module.exports = ReadmeTool;
