const express = require('express');
const router = express.Router();
const RAGService = require('../services/ragService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 导入新的节点
const IngestionPipeline = require('../domain/rag/ingestion/IngestionPipeline');
const UrlFetchNode = require('../domain/rag/ingestion/nodes/UrlFetchNode');
const EnhanceNode = require('../domain/rag/ingestion/nodes/EnhanceNode');

/**
 * @swagger
 * tags:
 *   - name: rag
 *     description: RAG知识库检索系统
 */

// 创建RAG服务实例
const ragService = new RAGService({
  storagePath: process.env.RAG_STORAGE_PATH || './data/rag',
  chunkSize: 500,
  overlap: 50,
  topK: 5
});

// 配置multer用于文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './data/rag/uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      '.txt', '.md', '.json',
      '.pdf', '.doc', '.docx',
      '.html', '.csv'
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型'));
    }
  }
});

/**
 * 创建知识库
 */
router.post('/kb', async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({
        error: { message: '知识库名称不能为空', type: 'validation_error' }
      });
    }

    const kb = await ragService.createKnowledgeBase(name, description);

    res.json({
      success: true,
      knowledgeBase: kb
    });
  } catch (error) {
    console.error('Create KB error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * 列出所有知识库
 */
router.get('/kb', (req, res) => {
  try {
    const knowledgeBases = ragService.listKnowledgeBases();

    res.json({
      success: true,
      knowledgeBases
    });
  } catch (error) {
    console.error('List KBs error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * 获取知识库详情
 */
router.get('/kb/:kbId', (req, res) => {
  try {
    const { kbId } = req.params;
    const kb = ragService.knowledgeBases.get(kbId);

    if (!kb) {
      return res.status(404).json({
        error: { message: '知识库不存在', type: 'not_found' }
      });
    }

    res.json({
      success: true,
      knowledgeBase: {
        id: kb.id,
        name: kb.name,
        description: kb.description,
        documentCount: kb.documents.length,
        totalChunks: kb.documents.reduce((sum, doc) => sum + doc.chunks.length, 0),
        createdAt: kb.createdAt,
        updatedAt: kb.updatedAt,
        documents: kb.documents.map(doc => ({
          id: doc.id,
          title: doc.title,
          type: doc.type,
          chunks: doc.chunks.length,
          createdAt: doc.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('Get KB error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * 删除知识库
 */
router.delete('/kb/:kbId', async (req, res) => {
  try {
    const { kbId } = req.params;

    // 检查知识库是否存在
    const kb = ragService.knowledgeBases.get(kbId);
    if (!kb) {
      return res.status(404).json({
        error: { message: '知识库不存在', type: 'not_found' }
      });
    }

    await ragService.deleteKnowledgeBase(kbId);

    res.json({
      success: true,
      message: '知识库已删除'
    });
  } catch (error) {
    console.error('Delete KB error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * 添加文档到知识库
 */
router.post('/kb/:kbId/documents', async (req, res) => {
  try {
    const { kbId } = req.params;
    const { title, content, type, metadata } = req.body;

    if (!content) {
      return res.status(400).json({
        error: { message: '文档内容不能为空', type: 'validation_error' }
      });
    }

    const result = await ragService.addDocument(kbId, {
      title: title || 'Untitled',
      content,
      type: type || 'text',
      metadata
    });

    res.json({
      success: true,
      documentId: result.docId,
      chunks: result.chunks
    });
  } catch (error) {
    console.error('Add document error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * 上传文件到知识库
 */
router.post('/kb/:kbId/upload', upload.single('file'), async (req, res) => {
  try {
    const { kbId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        error: { message: '请选择要上传的文件', type: 'validation_error' }
      });
    }

    // 解析文档
    const parsed = await ragService.parseDocument(file.path);

    // 添加到知识库
    const result = await ragService.addDocument(kbId, {
      title: path.basename(file.originalname, path.extname(file.originalname)),
      content: parsed.content,
      type: parsed.type,
      metadata: {
        originalFilename: file.originalname,
        ...parsed.metadata
      }
    });

    // 清理上传的临时文件
    fs.unlinkSync(file.path);

    res.json({
      success: true,
      documentId: result.docId,
      chunks: result.chunks,
      title: path.basename(file.originalname)
    });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * 检索知识
 */
router.post('/kb/:kbId/retrieve', async (req, res) => {
  try {
    const { kbId } = req.params;
    const { query, topK, similarityThreshold } = req.body;

    // 检查知识库是否存在
    const kb = ragService.knowledgeBases.get(kbId);
    if (!kb) {
      return res.status(404).json({
        error: { message: '知识库不存在', type: 'not_found' }
      });
    }

    if (!query) {
      return res.status(400).json({
        error: { message: '查询内容不能为空', type: 'validation_error' }
      });
    }

    const results = await ragService.retrieve(kbId, query, {
      topK: topK || 5,
      similarityThreshold: similarityThreshold || 0.3
    });

    res.json({
      success: true,
      query,
      results,
      count: results.length
    });
  } catch (error) {
    console.error('Retrieve error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * 获取对话上下文
 */
router.post('/kb/:kbId/context', async (req, res) => {
  try {
    const { kbId } = req.params;
    const { query, topK, similarityThreshold } = req.body;

    // 检查知识库是否存在
    const kb = ragService.knowledgeBases.get(kbId);
    if (!kb) {
      return res.status(404).json({
        error: { message: '知识库不存在', type: 'not_found' }
      });
    }

    if (!query) {
      return res.status(400).json({
        error: { message: '查询内容不能为空', type: 'validation_error' }
      });
    }

    const context = await ragService.getContextForConversation(kbId, query, {
      topK: topK || 5,
      similarityThreshold: similarityThreshold || 0.3
    });

    res.json({
      success: true,
      query,
      hasContext: !!context,
      context: context ? context.context : null,
      sources: context ? context.sources : [],
      count: context ? context.count : 0
    });
  } catch (error) {
    console.error('Get context error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * 全局搜索 - 搜索所有知识库
 * POST /api/rag/search
 */
router.post('/search', async (req, res) => {
  try {
    const { query, topK = 5, similarityThreshold = 0.3 } = req.body;

    if (!query) {
      return res.status(400).json({
        error: { message: '查询内容不能为空', type: 'validation_error' }
      });
    }

    const allResults = [];
    const knowledgeBases = ragService.listKnowledgeBases();

    // 并行搜索所有知识库
    const searchPromises = knowledgeBases.map(async (kb) => {
      try {
        const results = await ragService.retrieve(kb.id, query, {
          topK,
          similarityThreshold
        });
        return { kbId: kb.id, kbName: kb.name, results };
      } catch (error) {
        console.error(`Search KB ${kb.id} error:`, error.message);
        return { kbId: kb.id, kbName: kb.name, results: [], error: error.message };
      }
    });

    const searchResults = await Promise.all(searchPromises);

    // 合并所有结果
    for (const sr of searchResults) {
      if (sr.results && sr.results.length > 0) {
        allResults.push(...sr.results.map(r => ({
          ...r,
          kbId: sr.kbId,
          kbName: sr.kbName
        })));
      }
    }

    // 按相似度排序
    allResults.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

    res.json({
      success: true,
      query,
      results: allResults.slice(0, topK * knowledgeBases.length),
      count: allResults.length,
      knowledgeBaseCount: knowledgeBases.length,
      searchedKBs: searchResults.map(sr => ({ id: sr.kbId, name: sr.kbName, resultCount: sr.results?.length || 0 }))
    });
  } catch (error) {
    console.error('Global search error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * 获取RAG统计信息
 */
router.get('/stats', (req, res) => {
  try {
    const stats = ragService.getStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      error: { message: error.message, type: 'server_error' }
    });
  }
});

/**
 * 抓取网页内容
 * POST /api/rag/fetch
 *
 * Body: { url: "https://..." }
 * 返回: { success: true, content: "...", metadata: {...} }
 */
router.post('/fetch', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        error: { message: 'URL不能为空', type: 'validation_error' }
      });
    }

    // 创建流水线：UrlFetch -> Enhance
    const pipeline = new IngestionPipeline({ logger: console });

    pipeline.use(new UrlFetchNode({
      timeout: 30000,
      maxContentLength: 10 * 1024 * 1024, // 10MB
    }));

    pipeline.use(new EnhanceNode({
      autoDetectType: true,
      extractEntities: true,
    }));

    // 执行流水线
    const context = await pipeline.run({ url });

    // 检查是否有错误
    if (context.errors && context.errors.length > 0) {
      const error = context.errors[0];
      return res.status(500).json({
        success: false,
        error: {
          message: error.message || '抓取失败',
          type: 'fetch_error',
          details: context.errors.map(e => e.message)
        }
      });
    }

    res.json({
      success: true,
      content: context.enhancedContent,
      metadata: {
        ...context.fetchMetadata,
        ...context.enhancedMetadata,
      },
      images: context.images || [],
      links: context.links || [],
      traceId: context.traceId,
      duration: context.duration,
    });
  } catch (error) {
    console.error('Fetch URL error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message || '抓取失败',
        type: 'fetch_error'
      }
    });
  }
});

/**
 * 抓取网页并直接添加到知识库
 * POST /api/rag/kb/:kbId/fetch
 *
 * Body: { url: "https://...", title?: "自定义标题" }
 */
router.post('/kb/:kbId/fetch', async (req, res) => {
  try {
    const { kbId } = req.params;
    const { url, title } = req.body;

    if (!url) {
      return res.status(400).json({
        error: { message: 'URL不能为空', type: 'validation_error' }
      });
    }

    // 检查知识库是否存在
    const kb = ragService.knowledgeBases.get(kbId);
    if (!kb) {
      return res.status(404).json({
        error: { message: '知识库不存在', type: 'not_found' }
      });
    }

    // 创建完整流水线：UrlFetch -> Enhance -> Chunk -> Embed
    const pipeline = new IngestionPipeline({ logger: console });

    pipeline.use(new UrlFetchNode({
      timeout: 30000,
      maxContentLength: 10 * 1024 * 1024,
    }));

    pipeline.use(new EnhanceNode({
      autoDetectType: true,
      extractEntities: true,
    }));

    // 执行流水线
    const context = await pipeline.run({ url });

    if (context.errors && context.errors.length > 0) {
      return res.status(500).json({
        success: false,
        error: {
          message: context.errors[0].message || '抓取失败',
          type: 'fetch_error'
        }
      });
    }

    // 添加到知识库
    const docTitle = title || context.enhancedMetadata?.title || new URL(url).hostname;

    const result = await ragService.addDocument(kbId, {
      title: docTitle,
      content: context.enhancedContent,
      type: context.contentType || 'article',
      metadata: {
        url: url,
        ...context.fetchMetadata,
        ...context.enhancedMetadata,
      }
    });

    res.json({
      success: true,
      documentId: result.docId,
      chunks: result.chunks,
      title: docTitle,
      metadata: context.enhancedMetadata,
      traceId: context.traceId,
    });
  } catch (error) {
    console.error('Fetch to KB error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message || '抓取并添加失败',
        type: 'server_error'
      }
    });
  }
});

module.exports = router;