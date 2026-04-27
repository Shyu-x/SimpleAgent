/**
 * 请求验证中间件
 * 验证规则定义在 schemas/ 目录
 * 实际验证由服务层执行
 */

/**
 * 创建验证中间件
 * @param {Object|Function} schema - 验证 schema
 * @param {string} source - 验证来源 (body, query, params)
 * @returns {Function} Express middleware
 */
function validate(schema, source = 'body') {
  // 如果没有 schema，直接通过
  if (!schema) {
    return (_req, _res, next) => next();
  }

  // Joi schema
  if (schema && typeof schema.validate === 'function') {
    return (req, _res, next) => {
      req._validatedBody = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
      next();
    };
  }

  // 默认直接通过
  return (_req, _res, next) => next();
}

/**
 * 验证 body
 */
function validateBody(schema) {
  return validate(schema, 'body');
}

/**
 * 验证 query
 */
function validateQuery(schema) {
  return validate(schema, 'query');
}

/**
 * 验证 params
 */
function validateParams(schema) {
  return validate(schema, 'params');
}

module.exports = {
  validate,
  validateBody,
  validateQuery,
  validateParams
};
