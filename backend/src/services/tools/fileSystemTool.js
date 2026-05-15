/**
 * 文件系统工具
 * 支持文件读写、列表、删除等操作
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const AppError = require('../../common/errors/AppError');

class FileSystemTool {
  constructor(options = {}) {
    this.name = 'file_operations';
    this.description = '执行文件操作：读取、写入、列出、删除文件';
    this.category = 'filesystem';
    this.basePath = options.basePath || process.cwd();
    this.allowedExtensions = options.allowedExtensions || ['.txt', '.json', '.js', '.md', '.html', '.css'];
    this.maxFileSize = options.maxFileSize || 1024 * 1024; // 1MB
  }

  /**
   * 参数模式
   */
  get parameters() {
    return {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['read', 'write', 'delete', 'list', 'exists', 'mkdir'],
          description: '操作类型'
        },
        path: {
          type: 'string',
          description: '文件路径'
        },
        content: {
          type: 'string',
          description: '写入内容（write操作需要）'
        },
        options: {
          type: 'object',
          description: '额外选项'
        }
      },
      required: ['operation', 'path']
    };
  }

  /**
   * 安全路径检查
   */
  safePath(filePath) {
    const resolved = path.resolve(this.basePath, filePath);
    if (!resolved.startsWith(this.basePath)) {
      throw AppError.internalError('路径访问被拒绝：不允许访问基础目录外的文件');
    }
    return resolved;
  }

  /**
   * 执行文件操作
   */
  async execute(params) {
    const { operation, path: filePath, content, options = {} } = params;

    try {
      const safePath = this.safePath(filePath);

      switch (operation) {
        case 'read':
          return await this.readFile(safePath, options);
        case 'write':
          return await this.writeFile(safePath, content, options);
        case 'delete':
          return await this.deleteFile(safePath);
        case 'list':
          return await this.listDirectory(safePath, options);
        case 'exists':
          return await this.checkExists(safePath);
        case 'mkdir':
          return await this.makeDirectory(safePath);
        default:
          return { success: false, error: `未知操作: ${operation}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        operation
      };
    }
  }

  /**
   * 读取文件
   */
  async readFile(filePath, options = {}) {
    // 检查扩展名
    const ext = path.extname(filePath);
    if (!this.allowedExtensions.includes(ext) && ext !== '') {
      return { success: false, error: `不支持的文件类型: ${ext}` };
    }

    // 检查文件大小
    const stats = await fs.stat(filePath);
    if (stats.size > this.maxFileSize) {
      return { success: false, error: `文件过大: ${stats.size} bytes` };
    }

    const encoding = options.encoding || 'utf-8';
    const content = await fs.readFile(filePath, encoding);

    return {
      success: true,
      data: content,
      path: filePath,
      size: stats.size,
      modified: stats.mtime
    };
  }

  /**
   * 写入文件
   */
  async writeFile(filePath, content, options = {}) {
    // 确保目录存在
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    const writeOptions = options.encoding || 'utf-8';
    await fs.writeFile(filePath, content, writeOptions);

    const stats = await fs.stat(filePath);
    return {
      success: true,
      message: '文件写入成功',
      path: filePath,
      size: stats.size
    };
  }

  /**
   * 删除文件
   */
  async deleteFile(filePath) {
    const stats = await fs.stat(filePath);

    if (stats.isDirectory()) {
      await fs.rm(filePath, { recursive: true });
    } else {
      await fs.unlink(filePath);
    }

    return {
      success: true,
      message: '删除成功',
      path: filePath
    };
  }

  /**
   * 列出目录
   */
  async listDirectory(dirPath, options = {}) {
    const showHidden = options.hidden || false;
    const recursive = options.recursive || false;

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let results = entries
      .filter(entry => showHidden || !entry.name.startsWith('.'))
      .map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        path: path.join(dirPath, entry.name)
      }));

    // 排序：目录在前，文件在后
    results.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'directory' ? -1 : 1;
    });

    return {
      success: true,
      data: results,
      path: dirPath,
      count: results.length
    };
  }

  /**
   * 检查文件是否存在
   */
  async checkExists(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return {
        success: true,
        exists: true,
        type: stats.isDirectory() ? 'directory' : 'file',
        path: filePath
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { success: true, exists: false, path: filePath };
      }
      throw error;
    }
  }

  /**
   * 创建目录
   */
  async makeDirectory(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
    return {
      success: true,
      message: '目录创建成功',
      path: dirPath
    };
  }
}

module.exports = FileSystemTool;
