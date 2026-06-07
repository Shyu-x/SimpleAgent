/**
 * 模拟向量存储 (当 pgvector 不可用时使用)
 * 使用余弦相似度进行内存向量搜索
 */
// mockVectorStore 不需要数据库连接，使用内存存储

const { createLogger } = require('../infra/logger/AgentLogger');

const logger = createLogger('mockVectorStore');

// 内存向量存储
const vectorStore = new Map();

/**
 * 计算余弦相似度
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 初始化模拟向量存储
 */
async function initializeVectorStore() {
  logger.warn('使用模拟向量存储 (内存模式)');
  return true;
}

/**
 * 存储知识块
 */
async function storeChunk(knowledgeBaseId, content, embedding, metadata = {}) {
  const chunk = {
    id: generateId(),
    knowledgeBaseId,
    content,
    embedding,
    metadata,
    createdAt: new Date(),
  };

  const key = `kb:${knowledgeBaseId}`;
  if (!vectorStore.has(key)) {
    vectorStore.set(key, []);
  }

  const chunks = vectorStore.get(key);
  chunk.chunkIndex = chunks.length;
  chunks.push(chunk);

  return chunk;
}

/**
 * 批量存储知识块
 */
async function storeChunks(knowledgeBaseId, chunks) {
  const results = [];
  for (const chunk of chunks) {
    const result = await storeChunk(
      knowledgeBaseId,
      chunk.content,
      chunk.embedding,
      chunk.metadata || {}
    );
    results.push(result);
  }
  return results;
}

/**
 * 向量相似度搜索
 */
async function similaritySearch(knowledgeBaseId, queryEmbedding, topK = 5) {
  const key = `kb:${knowledgeBaseId}`;
  const chunks = vectorStore.get(key) || [];

  // 计算每个块的相似度
  const scored = chunks.map(chunk => ({
    ...chunk,
    similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  // 排序并返回 topK
  scored.sort((a, b) => b.similarity - a.similarity);

  return scored.slice(0, topK).map(({ embedding, ...rest }) => rest);
}

/**
 * 混合搜索
 */
async function hybridSearch(knowledgeBaseId, queryEmbedding, keywordQuery, topK = 5) {
  const vectorResults = await similaritySearch(knowledgeBaseId, queryEmbedding, topK * 2);

  if (keywordQuery && keywordQuery.trim()) {
    const keywords = keywordQuery.toLowerCase().split(/\s+/);
    const filtered = vectorResults.filter(item => {
      const content = item.content.toLowerCase();
      return keywords.some(kw => content.includes(kw));
    });

    if (filtered.length >= topK) {
      return filtered.slice(0, topK);
    }

    const seen = new Set(filtered.map(r => r.id));
    const remaining = vectorResults.filter(r => !seen.has(r.id));
    return [...filtered, ...remaining].slice(0, topK);
  }

  return vectorResults.slice(0, topK);
}

/**
 * 删除知识库的所有向量
 */
async function deleteKnowledgeBaseChunks(knowledgeBaseId) {
  const key = `kb:${knowledgeBaseId}`;
  vectorStore.delete(key);
  return true;
}

/**
 * 删除特定知识块
 */
async function deleteChunk(chunkId) {
  for (const [key, chunks] of vectorStore) {
    const index = chunks.findIndex(c => c.id === chunkId);
    if (index !== -1) {
      chunks.splice(index, 1);
      return true;
    }
  }
  return false;
}

/**
 * 获取知识库统计信息
 */
async function getKnowledgeBaseStats(knowledgeBaseId) {
  const key = `kb:${knowledgeBaseId}`;
  const chunks = vectorStore.get(key) || [];
  return { chunkCount: chunks.length };
}

/**
 * 更新知识块
 */
async function updateChunk(chunkId, content, embedding, metadata = {}) {
  for (const [key, chunks] of vectorStore) {
    const chunk = chunks.find(c => c.id === chunkId);
    if (chunk) {
      chunk.content = content;
      chunk.embedding = embedding;
      chunk.metadata = metadata;
      return true;
    }
  }
  return false;
}

/**
 * 关闭连接
 */
async function closeVectorStore() {
  vectorStore.clear();
}

/**
 * 生成随机ID
 */
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

module.exports = {
  initializeVectorStore,
  storeChunk,
  storeChunks,
  similaritySearch,
  hybridSearch,
  deleteKnowledgeBaseChunks,
  deleteChunk,
  getKnowledgeBaseStats,
  updateChunk,
  closeVectorStore,
};
