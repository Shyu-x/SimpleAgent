/**
 * 文档摄取Pipeline
 * 支持多种文档格式的解析、分块、向量化
 */

const fs = require('fs');
const path = require('path');
const AppError = require('../../common/errors/AppError');

class DocumentPipeline {
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || 500;
    this.chunkOverlap = options.chunkOverlap || 50;
    this.parsers = new Map();
    this.chunkers = new Map();

    // 注册默认解析器
    this.registerDefaultParsers();
    this.registerDefaultChunkers();
  }

  // 注册默认解析器
  registerDefaultParsers() {
    this.parsers.set('pdf', this.parsePDF.bind(this));
    this.parsers.set('md', this.parseMarkdown.bind(this));
    this.parsers.set('markdown', this.parseMarkdown.bind(this));
    this.parsers.set('txt', this.parseText.bind(this));
    this.parsers.set('html', this.parseHTML.bind(this));
    this.parsers.set('htm', this.parseHTML.bind(this));
  }

  // 注册默认分块器
  registerDefaultChunkers() {
    this.chunkers.set('fixed', this.chunkByFixedSize.bind(this));
    this.chunkers.set('sentence', this.chunkBySentence.bind(this));
    this.chunkers.set('paragraph', this.chunkByParagraph.bind(this));
  }

  // 处理文档
  async process(filePath, options = {}) {
    const ext = path.extname(filePath).toLowerCase().slice(1);
    const parser = this.parsers.get(ext);

    if (!parser) {
      throw AppError.validationError('file type', `Unsupported file type: ${ext}`);
    }

    // 1. 解析文档
    const content = await parser(filePath);

    // 2. 分块
    const chunkerType = options.chunker || 'paragraph';
    const chunker = this.chunkers.get(chunkerType);
    const chunks = chunker(content, {
      size: options.chunkSize || this.chunkSize,
      overlap: options.chunkOverlap || this.chunkOverlap
    });

    // 3. 添加元数据
    return chunks.map((chunk, index) => ({
      id: `${path.basename(filePath, ext)}_${index}`,
      content: chunk,
      metadata: {
        source: path.basename(filePath),
        type: ext,
        index,
        totalChunks: chunks.length
      }
    }));
  }

  // 解析PDF (需要pdf-parse)
  async parsePDF(filePath) {
    try {
      const pdfParse = require('pdf-parse');
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text;
    } catch (error) {
      console.error('PDF解析失败:', error.message);
      throw AppError.internalError(`PDF解析失败: ${error.message}`);
    }
  }

  // 解析Markdown
  async parseMarkdown(filePath) {
    return fs.readFileSync(filePath, 'utf-8');
  }

  // 解析纯文本
  async parseText(filePath) {
    return fs.readFileSync(filePath, 'utf-8');
  }

  // 解析HTML
  async parseHTML(filePath) {
    const html = fs.readFileSync(filePath, 'utf-8');
    // 简单实现，实际需要cheerio或jsdom
    return html.replace(/<[^>]+>/g, '');
  }

  // 固定大小分块
  chunkByFixedSize(content, { size, overlap }) {
    const chunks = [];
    let start = 0;

    while (start < content.length) {
      const end = Math.min(start + size, content.length);
      chunks.push(content.slice(start, end));
      start += size - overlap;
    }

    return chunks;
  }

  // 按句子分块
  chunkBySentence(content, { size, overlap }) {
    const sentences = content.split(/[。！？\.\!\?]+/);
    const chunks = [];
    let current = '';

    for (const sentence of sentences) {
      if ((current + sentence).length > size && current.length > 0) {
        chunks.push(current.trim());
        current = sentence;
      } else {
        current += sentence;
      }
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    return chunks;
  }

  // 按段落分块
  chunkByParagraph(content, { size, overlap }) {
    const paragraphs = content.split(/\n\s*\n/);
    const chunks = [];
    let current = '';

    for (const paragraph of paragraphs) {
      if ((current + paragraph).length > size && current.length > 0) {
        chunks.push(current.trim());
        current = paragraph;
      } else {
        current += '\n' + paragraph;
      }
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    return chunks;
  }

  // 注册自定义解析器
  registerParser(ext, parser) {
    this.parsers.set(ext, parser);
  }

  // 注册自定义分块器
  registerChunker(name, chunker) {
    this.chunkers.set(name, chunker);
  }
}

module.exports = { DocumentPipeline };
