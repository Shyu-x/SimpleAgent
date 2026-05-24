/**
 * 熔断器状态常量
 */

// 熔断器状态映射表
const CIRCUIT_STATE_MAP = {
  closed: 0,
  open: 1,
  half_open: 2,
};

// 反向映射用于 O(1) 查找
const STATE_VALUE_MAP = {
  0: 'closed',
  1: 'open',
  2: 'half_open',
};

/**
 * 获取熔断器状态的数值
 * @param {string} state - 状态字符串 (closed/open/half_open)
 * @returns {number} 状态数值
 */
function getStateValue(state) {
  return CIRCUIT_STATE_MAP[state] ?? 0;
}

/**
 * 获取状态数值对应的状态名
 * @param {number} value - 状态数值
 * @returns {string} 状态名
 */
function getStateName(value) {
  return STATE_VALUE_MAP[value] ?? 'closed';
}

module.exports = {
  CIRCUIT_STATE_MAP,
  getStateValue,
  getStateName,
};