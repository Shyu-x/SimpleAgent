const express = require('express');
const router = express.Router();
const RAGService = require('../services/ragService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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

module.exports = router;