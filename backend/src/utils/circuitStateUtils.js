/**
 * 熔断器状态常量
 */

// 熔断器状态映射表
const CIRCUIT_STATE_MAP = {
  closed: 0,
  open: 1,
  half_open: 2,
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
  const entries = Object.entries(CIRCUIT_STATE_MAP);
  for (const [name, val] of entries) {
    if (val === value) return name;
  }
  return 'closed';
}

module.exports = {
  CIRCUIT_STATE_MAP,
  getStateValue,
  getStateName,
};