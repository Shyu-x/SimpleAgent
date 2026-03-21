/**
 * 熔断器示例 - 展示如何使用opposum实现模型熔断
 *
 * 熔断器原理：
 * - CLOSED(正常)：请求正常通过，失败率低
 * - OPEN(熔断)：快速拒绝请求，保护下游服务
 * - HALF_OPEN(半开)：尝试放行少量请求测试服务是否恢复
 */

const CircuitBreaker = require('opossum');

// 模拟的API调用函数
async function callAPI(params) {
  // 模拟随机失败
  if (Math.random() > 0.7) {
    throw new Error('API请求失败');
  }
  return { success: true, data: '响应数据' };
}

// 配置熔断器选项
const options = {
  timeout: 3000,           // 请求超时时间(ms)
  errorThresholdPercentage: 50,  // 错误率阈值(50%触发熔断)
  resetTimeout: 5000,     // 熔断后尝试恢复的时间(ms)
  volumeThreshold: 5,     // 最小请求数(达到后才计算错误率)
};

// 创建熔断器
const breaker = new CircuitBreaker(callAPI, options);

// 事件监听
breaker.on('open', () => console.log('熔断器: OPEN - 熔断已触发'));
breaker.on('close', () => console.log('熔断器: CLOSED - 服务恢复'));
breaker.on('halfOpen', () => console.log('熔断器: HALF_OPEN - 尝试恢复'));

// 使用示例
async function main() {
  for (let i = 0; i < 20; i++) {
    try {
      const result = await breaker.fire({ test: 'data' });
      console.log(`请求${i + 1}成功:`, result);
    } catch (error) {
      console.log(`请求${i + 1}失败:`, error.message);
    }
    await new Promise(r => setTimeout(r, 500));
  }
}

// main();

module.exports = { CircuitBreaker };
