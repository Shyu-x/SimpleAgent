/**
 * 熔断器状态枚举
 * @description 定义熔断器的三种状态
 */
const CircuitState = {
  CLOSED: 'CLOSED',     // 关闭状态：正常请求通过，失败计数中
  OPEN: 'OPEN',         // 打开状态：所有请求直接失败，快速返回
  HALF_OPEN: 'HALF_OPEN' // 半开状态：允许一个探测请求，失败则回到 OPEN
};

module.exports = { CircuitState };
