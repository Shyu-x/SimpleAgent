/**
 * 后处理器抽象基类
 * 所有后处理器需继承此类并实现 process 方法
 */
class PostProcessor {
  constructor(options = {}) {
    this.options = options;
    this.name = this.constructor.name;
  }

  /**
   * 处理搜索结果
   * @param {Array} results - 搜索结果列表
   * @param {Object} context - 上下文信息（查询、用户信息等）
   * @returns {Promise<Array>} 处理后的结果
   */
  async process(results, context) {
    throw new Error(`[${this.name}] 子类必须实现 process 方法`);
  }

  /**
   * 检查是否应该执行此处理器
   * @param {Object} context - 上下文信息
   * @returns {boolean}
   */
  shouldProcess(context) {
    return true;
  }

  /**
   * 获取处理器优先级（数字越小越先执行）
   * @returns {number}
   */
  getPriority() {
    return this.options.priority || 100;
  }
}

module.exports = PostProcessor;
