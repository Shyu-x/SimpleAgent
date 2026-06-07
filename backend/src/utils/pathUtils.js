/**
 * 路径标准化工具函数
 * @description 将动态路径参数（UUID、数字ID）替换为占位符，用于指标聚合
 */

// 预编译的正则表达式（无i标志，UUID通常是标准格式）
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const NUMERIC_ID_REGEX = /\/\d+/g;

/**
 * 标准化路径（去除动态参数）
 * @param {string} path - 请求路径
 * @returns {string} 标准化后的路径
 */
function normalizePath(path) {
  if (!path) return 'unknown';
  // 重置正则状态，避免跨调用污染
  UUID_REGEX.lastIndex = 0;
  NUMERIC_ID_REGEX.lastIndex = 0;
  let normalized = path.replace(UUID_REGEX, ':id');
  normalized = normalized.replace(NUMERIC_ID_REGEX, '/:id');
  return normalized;
}

module.exports = {
  normalizePath,
  UUID_REGEX,
  NUMERIC_ID_REGEX,
};