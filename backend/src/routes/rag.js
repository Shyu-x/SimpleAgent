/**
 * RAG 知识库管理 API - Thin wrapper委托ragService处理
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createLogger } = require('../infra/logger/AgentLogger');
const logger = createLogger('rag');
const RAGService = require('../services/ragService');

let ragServiceInstance = null;
let ragServiceInitialized = false;
const getRAGService = () => {
  if (!ragServiceInstance) {
    ragServiceInstance = new RAGService({ storagePath: process.env.RAG_STORAGE_PATH || './data/rag', chunkSize: 500, overlap: 50, topK: 5 });
  }
  return ragServiceInstance;
};

// 初始化并加载所有知识库（仅执行一次）
const initializeRAGService = async () => {
  if (ragServiceInitialized) return;
  const rag = getRAGService();
  await rag.loadAllKnowledgeBases();
  ragServiceInitialized = true;
};

// 启动时初始化
initializeRAGService().catch(err => console.error('RAG初始化失败:', err));

const storage = multer.diskStorage({
  destination: (req, file, cb) => { const uploadDir = './data/rag/uploads'; if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true }); cb(null, uploadDir); },
  filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (['.txt', '.md', '.json', '.pdf', '.doc', '.docx', '.html', '.csv'].includes(ext)) cb(null, true); else cb(new Error('不支持的文件类型'));
}});

router.post('/kb', async (req, res) => {
  try { const { name, description } = req.body; if (!name) return res.status(400).json({ error: { message: '知识库名称不能为空', type: 'validation_error' } });
    res.json({ success: true, knowledgeBase: await getRAGService().createKnowledgeBase(name, description) }); }
  catch (error) { logger.error('Create KB error:', { error: error.message }); res.status(500).json({ error: { message: error.message, type: 'server_error' } }); }
});

router.get('/kb', (req, res) => { try { res.json({ success: true, knowledgeBases: getRAGService().listKnowledgeBases() }); } catch (error) { logger.error('List KBs error:', { error: error.message }); res.status(500).json({ error: { message: error.message, type: 'server_error' } }); } });

router.get('/kb/:kbId', (req, res) => {
  try {
    const kb = getRAGService().knowledgeBases.get(req.params.kbId);
    if (!kb) return res.status(404).json({ error: { message: '知识库不存在', type: 'not_found' } });
    res.json({ success: true, knowledgeBase: { id: kb.id, name: kb.name, description: kb.description, documentCount: kb.documents.length, totalChunks: kb.documents.reduce((sum, doc) => sum + doc.chunks.length, 0), createdAt: kb.createdAt, updatedAt: kb.updatedAt, documents: kb.documents.map(doc => ({ id: doc.id, title: doc.title, type: doc.type, chunks: doc.chunks.length, createdAt: doc.createdAt })) } });
  } catch (error) { logger.error('Get KB error:', { error: error.message }); res.status(500).json({ error: { message: error.message, type: 'server_error' } }); }
});

router.delete('/kb/:kbId', async (req, res) => { try { await getRAGService().deleteKnowledgeBase(req.params.kbId); res.json({ success: true, message: '知识库已删除' }); } catch (error) { logger.error('Delete KB error:', { error: error.message }); res.status(500).json({ error: { message: error.message, type: 'server_error' } }); } });

router.post('/kb/:kbId/documents', async (req, res) => {
  try { const { kbId } = req.params; const { title, content, type, metadata } = req.body; if (!content) return res.status(400).json({ error: { message: '文档内容不能为空', type: 'validation_error' } });
    const result = await getRAGService().addDocument(kbId, { title: title || 'Untitled', content, type: type || 'text', metadata }); res.json({ success: true, documentId: result.docId, chunks: result.chunks }); }
  catch (error) { logger.error('Add document error:', { error: error.message }); res.status(500).json({ error: { message: error.message, type: 'server_error' } }); }
});

router.post('/kb/:kbId/upload', upload.single('file'), async (req, res) => {
  try { const { kbId } = req.params; const file = req.file; if (!file) return res.status(400).json({ error: { message: '请选择要上传的文件', type: 'validation_error' } });
    const parsed = await getRAGService().parseDocument(file.path); const result = await getRAGService().addDocument(kbId, { title: path.basename(file.originalname, path.extname(file.originalname)), content: parsed.content, type: parsed.type, metadata: { originalFilename: file.originalname, ...parsed.metadata } });
    fs.unlinkSync(file.path); res.json({ success: true, documentId: result.docId, chunks: result.chunks, title: path.basename(file.originalname) }); }
  catch (error) { logger.error('Upload document error:', { error: error.message }); res.status(500).json({ error: { message: error.message, type: 'server_error' } }); }
});

router.post('/kb/:kbId/retrieve', async (req, res) => {
  try { const { kbId } = req.params; const { query, topK, similarityThreshold } = req.body; if (!query) return res.status(400).json({ error: { message: '查询内容不能为空', type: 'validation_error' } });
    const results = await getRAGService().retrieve(kbId, query, { topK: topK || 5, similarityThreshold: similarityThreshold || 0.3 }); res.json({ success: true, query, results: results.results || results, count: (results.results || results).length }); }
  catch (error) { logger.error('Retrieve error:', { error: error.message }); res.status(500).json({ error: { message: error.message, type: 'server_error' } }); }
});

router.post('/kb/:kbId/context', async (req, res) => {
  try { const { kbId } = req.params; const { query, topK, similarityThreshold } = req.body; if (!query) return res.status(400).json({ error: { message: '查询内容不能为空', type: 'validation_error' } });
    const context = await getRAGService().getContextForConversation(kbId, query, { topK: topK || 5, similarityThreshold: similarityThreshold || 0.3 }); res.json({ success: true, query, hasContext: !!context, context: context ? context.context : null, sources: context ? context.sources : [], count: context ? context.count : 0 }); }
  catch (error) { logger.error('Get context error:', { error: error.message }); res.status(500).json({ error: { message: error.message, type: 'server_error' } }); }
});

router.post('/search', async (req, res) => {
  try { const { query, topK = 5, similarityThreshold = 0.3 } = req.body; if (!query) return res.status(400).json({ error: { message: '查询内容不能为空', type: 'validation_error' } });
    const allResults = []; const kbs = getRAGService().listKnowledgeBases();
    const searchResults = await Promise.all(kbs.map(async (kb) => { try { const results = await getRAGService().retrieve(kb.id, query, { topK, similarityThreshold }); return { kbId: kb.id, kbName: kb.name, results: results.results || results }; } catch (err) { return { kbId: kb.id, kbName: kb.name, results: [], error: err.message }; } }));
    for (const sr of searchResults) { if (sr.results && sr.results.length > 0) allResults.push(...sr.results.map(r => ({ ...r, kbId: sr.kbId, kbName: sr.kbName }))); }
    allResults.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
    res.json({ success: true, query, results: allResults.slice(0, topK * kbs.length), count: allResults.length, knowledgeBaseCount: kbs.length, searchedKBs: searchResults.map(sr => ({ id: sr.kbId, name: sr.kbName, resultCount: sr.results?.length || 0 })) }); }
  catch (error) { logger.error('Global search error:', { error: error.message }); res.status(500).json({ error: { message: error.message, type: 'server_error' } }); }
});

router.get('/stats', (req, res) => { try { res.json({ success: true, stats: getRAGService().getStats() }); } catch (error) { logger.error('Get stats error:', { error: error.message }); res.status(500).json({ error: { message: error.message, type: 'server_error' } }); } });

router.post('/fetch', async (req, res) => { try { const { url } = req.body; if (!url) return res.status(400).json({ error: { message: 'URL不能为空', type: 'validation_error' } }); res.json({ success: true, ...await getRAGService().fetchUrl(url) }); } catch (error) { logger.error('Fetch URL error:', { error: error.message }); res.status(500).json({ success: false, error: { message: error.message || '抓取失败', type: 'fetch_error' } }); } });

router.post('/kb/:kbId/fetch', async (req, res) => { try { const { kbId } = req.params; const { url, title } = req.body; if (!url) return res.status(400).json({ error: { message: 'URL不能为空', type: 'validation_error' } }); const result = await getRAGService().fetchUrlToKB(kbId, url, title); res.json({ success: true, documentId: result.docId, chunks: result.chunks, title: title || url }); } catch (error) { logger.error('Fetch to KB error:', { error: error.message }); res.status(500).json({ success: false, error: { message: error.message || '抓取并添加失败', type: 'server_error' } }); } });

module.exports = router;
