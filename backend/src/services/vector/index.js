/**
 * 向量服务模块
 *
 * 支持 Qdrant 向量数据库后端
 *
 * @module services/vector
 */

// Qdrant 向量存储和路由（使用 REST API，无需额外依赖）
const QdrantVectorStore = require('./QdrantVectorStore');
const { QdrantRouter, getQdrantRouter, resetQdrantRouter } = require('./QdrantRouter');

module.exports = {
  // Qdrant 向量存储
  QdrantVectorStore,

  // Qdrant 路由（包含 embedding + storage）
  QdrantRouter,
  getQdrantRouter,
  resetQdrantRouter,
};
