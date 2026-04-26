/**
 * Domain RAG 领域服务 - 统一导出
 *
 * 使用示例：
 * ```javascript
 * const {
 *   // 问题处理服务
 *   QueryRewriteService,
 *   REWRITE_TYPES,
 *   QueryDecomposeService,
 *   DECOMPOSE_TYPES,
 *
 *   // 意图引导
 *   IntentGuidanceService,
 *   GUIDANCE_LEVELS,
 *   GUIDANCE_THRESHOLDS,
 *
 *   // 文档摄取
 *   IngestionPipeline,
 *   ParseNode,
 *   ChunkNode,
 *   EmbeddingNode,
 *   IndexNode,
 * } = require('./domain/rag');
 *
 * // 问题重写示例
 * const rewriteService = new QueryRewriteService({ modelClient });
 * const rewritten = await rewriteService.rewrite('它的优势是什么', {
 *   messages: [{ role: 'user', content: '我想了解React...' }]
 * });
 *
 * // 问题拆分示例
 * const decomposeService = new QueryDecomposeService({ modelClient });
 * const subs = await decomposeService.decompose('比较React和Vue的优劣势');
 *
 * // 合并结果示例
 * const merged = await decomposeService.mergeResults(subQuestionsWithAnswers, originalQuery);
 *
 * // 意图澄清引导示例
 * const guidanceService = new IntentGuidanceService({ confidenceThreshold: 0.5 });
 * if (guidanceService.needsGuidance(intentResult)) {
 *   const guidance = guidanceService.generateGuidanceQuestion(intentResult);
 *   // 返回引导问题给用户
 * }
 * ```
 */

// 问题处理服务
const QueryRewriteService = require('./QueryRewriteService');
const {
  QueryRewriteService: QueryRewrite,
  REWRITE_TYPES,
  CONFIDENCE_THRESHOLDS: REWRITE_CONFIDENCE,
} = require('./QueryRewriteService');

const QueryDecomposeService = require('./QueryDecomposeService');
const {
  QueryDecomposeService: QueryDecompose,
  DECOMPOSE_TYPES,
} = require('./QueryDecomposeService');

// 文档摄取（re-export）
const ingestion = require('./ingestion');

// 意图分类器
const {
  TreeIntentClassifier,
  IntentClassifier,
  INTENT_LEVELS,
  DOMAIN_TYPES,
  CATEGORY_TYPES,
  CONFIDENCE_LEVELS,
  CLARIFICATION_THRESHOLDS,
  DEFAULT_INTENT_TREE
} = require('./IntentClassifier');

// 意图澄清引导服务
const {
  IntentGuidanceService,
  GUIDANCE_LEVELS,
  GUIDANCE_THRESHOLDS
} = require('./IntentGuidanceService');

// 重排序器
const {
  Reranker,
  RERANK_STRATEGIES,
  RERANK_METADATA,
  BaseRerankStrategy,
  CrossEncoderRerankStrategy,
  BM25RerankStrategy,
  SemanticRerankStrategy,
  DiversityRerankStrategy
} = require('./Reranker');

// 引用组装器
const {
  CitationAssembler,
  CitationExtractor,
  CitationFormatter,
  CitationLinker,
  createCitation,
  CITATION_TYPES,
  CITATION_FORMATS,
  CITATION_SOURCE
} = require('./CitationAssembler');

module.exports = {
  // 问题处理服务
  QueryRewriteService,
  QueryRewrite,
  REWRITE_TYPES,
  REWRITE_CONFIDENCE,

  QueryDecomposeService,
  QueryDecompose,
  DECOMPOSE_TYPES,

  // 文档摄取
  ...ingestion,

  // 意图分类
  TreeIntentClassifier,
  IntentClassifier,
  INTENT_LEVELS,
  DOMAIN_TYPES,
  CATEGORY_TYPES,
  CONFIDENCE_LEVELS,
  CLARIFICATION_THRESHOLDS,
  DEFAULT_INTENT_TREE,

  // 意图澄清引导
  IntentGuidanceService,
  GUIDANCE_LEVELS,
  GUIDANCE_THRESHOLDS,

  // 重排序
  Reranker,
  RERANK_STRATEGIES,
  RERANK_METADATA,
  BaseRerankStrategy,
  CrossEncoderRerankStrategy,
  BM25RerankStrategy,
  SemanticRerankStrategy,
  DiversityRerankStrategy,

  // 引用组装
  CitationAssembler,
  CitationExtractor,
  CitationFormatter,
  CitationLinker,
  createCitation,
  CITATION_TYPES,
  CITATION_FORMATS,
  CITATION_SOURCE
};
