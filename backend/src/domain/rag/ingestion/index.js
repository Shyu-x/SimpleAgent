/**
 * 文档入库Pipeline - 统一导出
 *
 * 使用示例：
 * ```javascript
 * const {
 *   IngestionPipeline,
 *   IngestionNode,
 *   ParseNode,
 *   ChunkNode,
 *   EmbeddingNode,
 *   IndexNode,
 * } = require('./domain/rag/ingestion');
 *
 * // 创建pipeline
 * const pipeline = new IngestionPipeline({ logger });
 *
 * pipeline
 *   .use(new ParseNode())
 *   .use(new ChunkNode({ strategy: 'semantic' }))
 *   .use(new EmbeddingNode({ batchSize: 32 }))
 *   .use(new IndexNode({ indexType: 'memory' }));
 *
 * // 执行
 * const result = await pipeline.run({
 *   rawContent: documentText,
 *   contentType: 'text/plain',
 *   source: 'document-001',
 * });
 *
 * console.log('索引元数据:', result.indexMetadata);
 * ```
 */

const IngestionPipeline = require('./IngestionPipeline');
const IngestionNode = require('./IngestionNode');
const ParseNode = require('./nodes/ParseNode');
const ChunkNode = require('./nodes/ChunkNode');
const EmbeddingNode = require('./nodes/EmbeddingNode');
const IndexNode = require('./nodes/IndexNode');

module.exports = {
  // 核心
  IngestionPipeline,

  // 基类
  IngestionNode,
  IngestionNode: IngestionNode.IngestionNode,
  NodeExecutionError: IngestionNode.NodeExecutionError,
  ValidationError: IngestionNode.ValidationError,

  // 节点
  ParseNode,
  ChunkNode,
  EmbeddingNode,
  IndexNode,
};
