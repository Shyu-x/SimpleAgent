/**
 * 字符串工具函数
 */

/**
 * 移除字符串两端的引号
 * @param {string} str - 输入字符串
 * @returns {string} 移除引号后的字符串
 */
function stripQuotes(str) {
  return str.replace(/"/g, '');
}

/**
 * 安全的 JSON 解析，失败返回 null
 * @param {string} str - JSON 字符串
 * @returns {Object|null}
 */
function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * 截断字符串到指定长度
 * @param {string} str - 输入字符串
 * @param {number} maxLength - 最大长度
 * @returns {string}
 */
function truncate(str, maxLength) {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

module.exports = {
  stripQuotes,
  safeJsonParse,
  truncate,
};