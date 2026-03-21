/**
 * 路由器模块入口
 */

const { MiniMaxRouter, router: defaultRouter, MINIMAX_MODELS } = require('./modelRouter');
const { TaskClassifier, INTENT_TYPES, CONFIDENCE_THRESHOLDS } = require('./taskClassifier');

module.exports = {
  ModelRouter: MiniMaxRouter, // 别名兼容
  MiniMaxRouter,
  router: defaultRouter,
  TaskClassifier,
  MINIMAX_MODELS,
  INTENT_TYPES,
  CONFIDENCE_THRESHOLDS
};