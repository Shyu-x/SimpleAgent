/**
 * 向量存储服务
 * 使用 pgvector 进行向量相似度检索
 */
const { prisma } = require('./database');
const { createLogger } = require('../infra/logger/AgentLogger');
const logger = createLogger('pgVectorStore');

// 向量维度配置
const EMBEDDING_DIMENSIONS = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
};

// 默认向量维度
const DEFAULT_EMBEDDING_DIMENSION = 1536;

/**
 * 初始化向量存储
 */
async function initializeVectorStore() {
  try {
    // 启用 pgvector 扩展
    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector;`;
    logger.info('pgvector 扩展已启用');

    // 创建向量索引 (如果不存在)
    try {
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
        ON knowledge_chunks
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100);
      `;
      logger.info('向量索引已创建');
    } catch (e) {
      logger.warn(`向量索引创建失败: ${e.message}`);
    }

    return true;
  } catch (error) {
    logger.error(`向量存储初始化失败: ${error.message}`);
    return false;
  }
}

/**
 * 将向量转换为 PostgreSQL 数组格式
 */
function vectorToPgArray(vector) {
  return `[${vector.join(',')}]`;
}

/**
 * 从 PostgreSQL 数组格式转换为向量
 */
function pgArrayToVector(pgArray) {
  if (!pgArray) return null;
  // 移除方括号并分割
  const str = pgArray.replace(/^\[|\]$/g, '');
  return str.split(',').map(Number);
}

/**
 * 存储知识块 (带向量)
 */
async function storeChunk(knowledgeBaseId, content, embedding, metadata = {}) {
  try {
    const result = await prisma.$queryRaw`
      INSERT INTO knowledge_chunks (id, "knowledgeBaseId", content, embedding, metadata, "chunkIndex")
      VALUES (
        gen_random_uuid()::text,
        ${knowledgeBaseId},
        ${content},
        ${vectorToPgArray(embedding)}::vector,
        ${JSON.stringify(metadata)}::jsonb,
        (SELECT COALESCE(MAX("chunkIndex"), -1) + 1 FROM knowledge_chunks WHERE "knowledgeBaseId" = ${knowledgeBaseId})
      )
      RETURNING id, content, "chunkIndex", metadata;
    `;
    return result[0];
  } catch (error) {
    logger.error('存储知识块失败:', { error: error.message, stack: error.stack });
    throw error;
  }
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
 * 使用余弦相似度
 */
async function similaritySearch(knowledgeBaseId, queryEmbedding, topK = 5) {
  try {
    const results = await prisma.$queryRaw`
      SELECT id, content, metadata,
        1 - (embedding <=> ${vectorToPgArray(queryEmbedding)}::vector) AS similarity
      FROM knowledge_chunks
      WHERE "knowledgeBaseId" = ${knowledgeBaseId}
      ORDER BY embedding <=> ${vectorToPgArray(queryEmbedding)}::vector
      LIMIT ${topK};
    `;

    return results.map(row => ({
      id: row.id,
      content: row.content,
      metadata: row.metadata,
      similarity: parseFloat(row.similarity),
    }));
  } catch (error) {
    logger.error('向量搜索失败:', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * 混合搜索 (向量 + 关键词)
 */
async function hybridSearch(knowledgeBaseId, queryEmbedding, keywordQuery, topK = 5) {
  try {
    // 先进行向量搜索
    const vectorResults = await similaritySearch(knowledgeBaseId, queryEmbedding, topK * 2);

    // 如果有关键词，再进行关键词过滤
    if (keywordQuery && keywordQuery.trim()) {
      const keywords = keywordQuery.toLowerCase().split(/\s+/);
      const filtered = vectorResults.filter(item => {
        const content = item.content.toLowerCase();
        return keywords.some(kw => content.includes(kw));
      });

      // 如果过滤后结果不足，使用原始向量结果
      if (filtered.length >= topK) {
        return filtered.slice(0, topK);
      }

      // 合并结果并去重
      const seen = new Set(filtered.map(r => r.id));
      const remaining = vectorResults.filter(r => !seen.has(r.id));
      return [...filtered, ...remaining].slice(0, topK);
    }

    return vectorResults.slice(0, topK);
  } catch (error) {
    logger.error('混合搜索失败:', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * 删除知识库的所有向量
 */
async function deleteKnowledgeBaseChunks(knowledgeBaseId) {
  try {
    const result = await prisma.$executeRaw`
      DELETE FROM knowledge_chunks WHERE "knowledgeBaseId" = ${knowledgeBaseId};
    `;
    return result;
  } catch (error) {
    logger.error('删除知识块失败:', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * 删除特定知识块
 */
async function deleteChunk(chunkId) {
  try {
    await prisma.$executeRaw`
      DELETE FROM knowledge_chunks WHERE id = ${chunkId};
    `;
    return true;
  } catch (error) {
    logger.error('删除知识块失败:', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * 获取知识库统计信息
 */
async function getKnowledgeBaseStats(knowledgeBaseId) {
  try {
    const countResult = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM knowledge_chunks WHERE "knowledgeBaseId" = ${knowledgeBaseId};
    `;

    return {
      chunkCount: parseInt(countResult[0].count, 10),
    };
  } catch (error) {
    logger.error('获取统计信息失败:', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * 更新知识块
 */
async function updateChunk(chunkId, content, embedding, metadata = {}) {
  try {
    await prisma.$executeRaw`
      UPDATE knowledge_chunks
      SET content = ${content},
          embedding = ${vectorToPgArray(embedding)}::vector,
          metadata = ${JSON.stringify(metadata)}::jsonb
      WHERE id = ${chunkId};
    `;
    return true;
  } catch (error) {
    logger.error('更新知识块失败:', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * 关闭连接
 */
async function closeVectorStore() {
  await prisma.$disconnect();
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
  EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_DIMENSION,
};
