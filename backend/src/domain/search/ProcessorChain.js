/**
 * 处理器链 - 责任链模式编排多个后处理器
 * 支持按优先级排序、同步/异步执行、处理器跳过与短路
 */
class ProcessorChain {
  constructor() {
    this.processors = [];
  }

  /**
   * 添加处理器
   * @param {PostProcessor} processor
   * @returns {ProcessorChain}
   */
  addProcessor(processor) {
    this.processors.push(processor);
    return this;
  }

  /**
   * 批量添加处理器
   * @param {PostProcessor[]} processors
   * @returns {ProcessorChain}
   */
  addProcessors(processors) {
    processors.forEach(p => this.addProcessor(p));
    return this;
  }

  /**
   * 按优先级排序（数字越小越靠前）
   * @returns {ProcessorChain}
   */
  sortByPriority() {
    this.processors.sort((a, b) => a.getPriority() - b.getPriority());
    return this;
  }

  /**
   * 执行处理器链
   * @param {Array} results - 初始搜索结果
   * @param {Object} context - 上下文（查询、用户、LLM 客户端等）
   * @returns {Promise<Array>} 最终处理后的结果
   */
  async execute(results, context) {
    let currentResults = Array.isArray(results) ? results : [];

    // 按优先级排序
    const sorted = [...this.processors].sort((a, b) => a.getPriority() - b.getPriority());

    for (const processor of sorted) {
      if (!processor.shouldProcess(context)) {
        console.log(`[ProcessorChain] 跳过处理器: ${processor.name} (shouldProcess = false)`);
        continue;
      }

      const ctxWithResults = { ...context, results: currentResults };

      try {
        console.log(`[ProcessorChain] 执行处理器: ${processor.name}`);
        currentResults = await processor.process(currentResults, ctxWithResults);
      } catch (err) {
        console.error(`[ProcessorChain] 处理器 ${processor.name} 出错:`, err.message);
        // 单个处理器失败不影响后续处理器，继续执行
      }
    }

    return currentResults;
  }

  /**
   * 获取当前处理器列表
   * @returns {PostProcessor[]}
   */
  getProcessors() {
    return [...this.processors];
  }

  /**
   * 清空处理器
   * @returns {ProcessorChain}
   */
  clear() {
    this.processors = [];
    return this;
  }

  /**
   * 根据名称移除处理器
   * @param {string} name
   * @returns {ProcessorChain}
   */
  removeByName(name) {
    this.processors = this.processors.filter(p => p.name !== name);
    return this;
  }

  /**
   * 打印处理器链信息
   */
  describe() {
    const sorted = [...this.processors].sort((a, b) => a.getPriority() - b.getPriority());
    console.log('[ProcessorChain] 处理器链配置:');
    sorted.forEach((p, i) => {
      console.log(`  ${i + 1}. [${p.name}] priority=${p.getPriority()} options=${JSON.stringify(p.options)}`);
    });
  }
}

module.exports = ProcessorChain;
