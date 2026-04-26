/**
 * 限流基础设施 - 统一导出
 */

const QueueRateLimiter = require('./QueueRateLimiter');
const RateLimiterFactory = require('./RateLimiterFactory');

module.exports = {
  QueueRateLimiter,
  RateLimiterFactory,
};
