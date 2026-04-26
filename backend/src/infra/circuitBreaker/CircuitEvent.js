/**
 * 熔断器事件枚举
 * @description 定义熔断器状态转换时触发的事件类型
 */
const CircuitEvent = {
  CLOSE: 'circuit:close',           // 熔断器关闭
  OPEN: 'circuit:open',             // 熔断器打开
  HALF_OPEN: 'circuit:half_open',   // 熔断器进入半开
  SUCCESS: 'circuit:success',        // 请求成功
  FAILURE: 'circuit:failure',       // 请求失败
  PROBE_SUCCESS: 'circuit:probe_success', // 探测请求成功
  PROBE_FAILURE: 'circuit:probe_failure'  // 探测请求失败
};

module.exports = { CircuitEvent };
