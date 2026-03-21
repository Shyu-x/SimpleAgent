/**
 * 检索服务导出
 *
 * 企业级RAG检索架构：
 * - SearchChannel: 检索通道接口（策略模式）
 * - SearchCoordinator: 多通道协调器（并行/串行/权重合并/去重）
 * - 通道实现: KeywordSearchChannel, SemanticSearchChannel (后续扩展)
 */

const { SearchChannel, SearchResult } = require('./SearchChannel');
const SearchCoordinator = require('./SearchCoordinator');
const KeywordSearchChannel = require('./channels/KeywordSearchChannel');

module.exports = {
  // 核心接口
  SearchChannel,
  SearchResult,

  // 协调器
  SearchCoordinator,

  // 默认通道
  KeywordSearchChannel
};
