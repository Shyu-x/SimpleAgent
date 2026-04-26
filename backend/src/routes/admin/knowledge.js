/**
 * 知识库管理 API
 * 提供文档管理、索引管理、配置管理
 *
 * @date 2026-04-01
 *
 * @swagger
 * tags:
 *   - name: admin
 *     description: 管理后台接口
 *   - name: knowledge
 *     description: 知识库文档管理
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const RAGService = require('../../services/ragService');

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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.txt', '.md', '.json', '.pdf', '.doc', '.docx', '.html', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型'));
    }
  }
});

/**
 * @swagger
 * /api/admin/knowledge/docs:
 *   get:
 *     tags: [knowledge]
 *     summary: 获取文档列表
 *     description: 获取所有文档或指定知识库的文档列表
 *     parameters:
 *       - in: query
 *         name: kbId
 *         schema:
 *           type: string
 *         description: 知识库ID（可选）
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *         description: 每页数量
 *     responses:
 *       200:
 *         description: 文档列表
 *       404:
 *         description: 知识库不存在
 *   post:
 *     tags: [knowledge]
 *     summary: 上传文档
 *     description: 上传文档到知识库，支持文件上传或文本内容
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               kbId:
 *                 type: string
 *                 description: 知识库ID
 *               kbName:
 *                 type: string
 *                 description: 知识库名称（不存在时创建）
 *               title:
 *                 type: string
 *                 description: 文档标题
 *               content:
 *                 type: string
 *                 description: 文档内容（与file二选一）
 *               type:
 *                 type: string
 *                 description: 文档类型
 *               metadata:
 *                 type: object
 *                 description: 元数据
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: 上传的文件
 *     responses:
 *       200:
 *         description: 上传成功
 *       400:
 *         description: 参数错误
 *   delete:
 *     tags: [knowledge]
 *     summary: 删除文档
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 文档ID
 *       - in: query
 *         name: kbId
 *         required: true
 *         schema:
 *           type: string
 *         description: 知识库ID
 *     responses:
 *       200:
 *         description: 删除成功
 *       404:
 *         description: 文档不存在
 */
router.get('/docs', (req, res) => {
  try {
    const { kbId, page = 1, pageSize = 20 } = req.query;
    const knowledgeBases = ragService.listKnowledgeBases();

    let docs = [];
    if (kbId) {
      // 指定知识库的文档
      const kb = ragService.knowledgeBases.get(kbId);
      if (!kb) {
        return res.status(404).json({ success: false, error: '知识库不存在' });
      }
      docs = kb.documents.map(doc => ({
        id: doc.id,
        title: doc.title,
        type: doc.type,
        kbId: kb.id,
        kbName: kb.name,
        chunks: doc.chunks.length,
        metadata: doc.metadata,
        createdAt: doc.createdAt
      }));
    } else {
      // 所有文档
      for (const [id, kb] of ragService.knowledgeBases) {
        for (const doc of kb.documents) {
          docs.push({
            id: doc.id,
            title: doc.title,
            type: doc.type,
            kbId: id,
            kbName: kb.name,
            chunks: doc.chunks.length,
            metadata: doc.metadata,
            createdAt: doc.createdAt
          });
        }
      }
    }

    // 分页
    const start = (parseInt(page) - 1) * parseInt(pageSize);
    const end = start + parseInt(pageSize);
    const paged = docs.slice(start, end);

    res.json({
      success: true,
      data: {
        documents: paged.map(doc => ({ ...doc, name: doc.title })),
        total: docs.length,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(docs.length / parseInt(pageSize))
      }
    });
  } catch (error) {
    console.error('List docs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/admin/knowledge/search:
 *   get:
 *     tags: [knowledge]
 *     summary: 搜索文档
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: 搜索关键词
 *       - in: query
 *         name: kbId
 *         schema:
 *           type: string
 *         description: 知识库ID（可选）
 *       - in: query
 *         name: topK
 *         schema:
 *           type: integer
 *           default: 10
 *         description: 返回结果数量
 *     responses:
 *       200:
 *         description: 搜索结果
 */
router.get('/search', async (req, res) => {
  try {
    const { q, kbId, topK = 10 } = req.query;

    if (!q) {
      return res.status(400).json({ success: false, error: '缺少查询参数 q' });
    }

    // 确定搜索范围
    const kbsToSearch = kbId
      ? [{ id: kbId, name: ragService.knowledgeBases.get(kbId)?.name }]
      : ragService.listKnowledgeBases();

    const allResults = [];

    for (const kb of kbsToSearch) {
      if (!kbId && !ragService.knowledgeBases.get(kb.id)) continue;
      try {
        const results = await ragService.retrieve(kb.id, q, { topK: parseInt(topK) });
        for (const r of results) {
          allResults.push({ ...r, kbId: kb.id, kbName: kb.name });
        }
      } catch {
        // 忽略单个知识库搜索失败
      }
    }

    // 合并后按相似度排序
    allResults.sort((a, b) => b.similarity - a.similarity);
    const merged = allResults.slice(0, parseInt(topK));

    res.json({
      success: true,
      data: {
        query: q,
        results: merged,
        count: merged.length
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/admin/knowledge/stats:
 *   get:
 *     tags: [knowledge]
 *     summary: 获取知识库统计信息
 *     responses:
 *       200:
 *         description: 统计信息
 */
router.get('/stats', (req, res) => {
  try {
    const stats = ragService.getStats();
    const knowledgeBases = ragService.listKnowledgeBases();

    res.json({
      success: true,
      data: {
        ...stats,
        knowledgeBases: knowledgeBases.map(kb => ({
          id: kb.id,
          name: kb.name,
          description: kb.description,
          documentCount: kb.documentCount,
          totalChunks: kb.totalChunks,
          createdAt: kb.createdAt,
          updatedAt: kb.updatedAt
        }))
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/admin/knowledge/docs:
 *   post:
 *     tags: [knowledge]
 *     summary: 上传文档
 *     description: 上传文档到知识库，支持文件上传或文本内容
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               kbId:
 *                 type: string
 *                 description: 知识库ID
 *               kbName:
 *                 type: string
 *                 description: 知识库名称（不存在时创建）
 *               title:
 *                 type: string
 *                 description: 文档标题
 *               content:
 *                 type: string
 *                 description: 文档内容（与file二选一）
 *               type:
 *                 type: string
 *                 description: 文档类型
 *               metadata:
 *                 type: object
 *                 description: 元数据
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: 上传的文件
 *     responses:
 *       200:
 *         description: 上传成功
 *       400:
 *         description: 参数错误
 */
router.post('/docs', upload.single('file'), async (req, res) => {
  try {
    const { kbId, kbName, title, content, type, metadata } = req.body;

    // 确定目标知识库
    let targetKbId = kbId;
    if (!targetKbId) {
      // 尝试使用指定名称的知识库，或创建默认库
      const kbs = ragService.listKnowledgeBases();
      let defaultKb = kbs.find(kb => kb.name === (kbName || 'default'));
      if (!defaultKb) {
        const created = await ragService.createKnowledgeBase(kbName || 'default', '自动创建的知识库');
        targetKbId = created.id;
      } else {
        targetKbId = defaultKb.id;
      }
    }

    // 文件上传模式
    if (req.file) {
      const parsed = await ragService.parseDocument(req.file.path);
      const result = await ragService.addDocument(targetKbId, {
        title: title || path.basename(req.file.originalname, path.extname(req.file.originalname)),
        content: parsed.content,
        type: parsed.type,
        metadata: { originalFilename: req.file.originalname, ...parsed.metadata }
      });
      fs.unlinkSync(req.file.path); // 清理临时文件
      return res.json({
        success: true,
        data: {
          documentId: result.docId,
          chunks: result.chunks,
          kbId: targetKbId
        }
      });
    }

    // 文本内容模式
    if (!content) {
      return res.status(400).json({ success: false, error: '缺少文件或内容' });
    }

    const result = await ragService.addDocument(targetKbId, {
      title: title || 'Untitled',
      content,
      type: type || 'text',
      metadata: metadata ? (typeof metadata === 'string' ? JSON.parse(metadata) : metadata) : {}
    });

    res.json({
      success: true,
      data: {
        documentId: result.docId,
        chunks: result.chunks,
        kbId: targetKbId
      }
    });
  } catch (error) {
    console.error('Upload doc error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/admin/knowledge/docs/{id}:
 *   delete:
 *     tags: [knowledge]
 *     summary: 删除文档
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 文档ID
 *       - in: query
 *         name: kbId
 *         required: true
 *         schema:
 *           type: string
 *         description: 知识库ID
 *     responses:
 *       200:
 *         description: 删除成功
 *       404:
 *         description: 文档不存在
 */
router.delete('/docs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { kbId } = req.query;

    if (!kbId) {
      return res.status(400).json({ success: false, error: '缺少 kbId 参数' });
    }

    const kb = ragService.knowledgeBases.get(kbId);
    if (!kb) {
      return res.status(404).json({ success: false, error: '知识库不存在' });
    }

    const docIndex = kb.documents.findIndex(doc => doc.id === id);
    if (docIndex === -1) {
      return res.status(404).json({ success: false, error: '文档不存在' });
    }

    const [removed] = kb.documents.splice(docIndex, 1);
    kb.updatedAt = Date.now();
    await ragService.saveKnowledgeBase(kb);

    res.json({
      success: true,
      data: { documentId: id, title: removed.title }
    });
  } catch (error) {
    console.error('Delete doc error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/admin/knowledge/reindex:
 *   post:
 *     tags: [knowledge]
 *     summary: 重建索引
 *     description: 重新生成所有文档的嵌入向量
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               kbId:
 *                 type: string
 *                 description: 知识库ID（可选，不传则全量重建）
 *     responses:
 *       200:
 *         description: 重建成功
 */
router.post('/reindex', async (req, res) => {
  try {
    const { kbId } = req.body;

    if (kbId) {
      // 指定知识库
      const kb = ragService.knowledgeBases.get(kbId);
      if (!kb) {
        return res.status(404).json({ success: false, error: '知识库不存在' });
      }
      // 重新保存，触发嵌入重新生成
      await ragService.saveKnowledgeBase(kb);
      const totalChunks = kb.documents.reduce((sum, doc) => sum + doc.chunks.length, 0);
      res.json({
        success: true,
        data: { kbId, documents: kb.documents.length, chunks: totalChunks }
      });
    } else {
      // 全量重建
      const kbs = ragService.listKnowledgeBases();
      let totalDocs = 0;
      let totalChunks = 0;
      for (const kbMeta of kbs) {
        const kb = ragService.knowledgeBases.get(kbMeta.id);
        if (kb) {
          await ragService.saveKnowledgeBase(kb);
          totalDocs += kb.documents.length;
          totalChunks += kbMeta.totalChunks;
        }
      }
      res.json({
        success: true,
        data: { knowledgeBases: kbs.length, documents: totalDocs, chunks: totalChunks }
      });
    }
  } catch (error) {
    console.error('Reindex error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
