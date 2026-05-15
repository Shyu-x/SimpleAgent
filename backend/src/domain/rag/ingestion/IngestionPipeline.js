/**
 * IngestionPipeline - 文档入库流水线
 *
 * 设计模式：模板方法模式
 * - 定义文档摄取的标准流程骨架
 * - 支持节点插拔、并行执行、条件跳过
 * - 全链路追踪与可观测性
 *
 * 标准流程：
 * 1. Parse (解析) -> 2. Chunk (分块) -> 3. Embed (向量化) -> 4. Index (索引)
 *
 * @example
 * const pipeline = new IngestionPipeline({ logger });
 * pipeline.use(new ParseNode());
 * pipeline.use(new SemanticChunkNode());
 * pipeline.use(new EmbeddingNode({ batchSize: 32 }));
 * pipeline.use(new IndexNode());
 *
 * const context = await pipeline.run({ document: rawText });
 */

const { NodeExecutionError } = require('./IngestionNode');

class IngestionPipeline {
  constructor(options = {}) {
    this.nodes = [];
    this.options = {
      traceEnabled: true,
      parallelNodes: new Map(), // nodeName -> [parallelNodeNames]
      skipNodes: new Set(),
      ...options,
    };
    this.logger = options.logger || console;
  }

  /**
   * 注册节点（支持多个同类型节点并行）
   * @param {IngestionNode} node
   * @param {Object} config - { parallel?: boolean, condition?: Function }
   */
  use(node, config = {}) {
    if (config.parallel) {
      // 并行节点组
      const groupName = config.group || node.name;
      if (!this.options.parallelNodes.has(groupName)) {
        this.options.parallelNodes.set(groupName, []);
      }
      this.options.parallelNodes.get(groupName).push(node);
    } else {
      this.nodes.push({ node, condition: config.condition });
    }
    return this;
  }

  /**
   * 跳过指定节点
   * @param {string} nodeName
   */
  skip(nodeName) {
    this.options.skipNodes.add(nodeName);
    return this;
  }

  /**
   * 执行流水线（模板方法）
   * @param {Object} initialContext - 初始上下文
   * @returns {Promise<Object>} 最终上下文
   */
  async run(initialContext) {
    const traceId = this._generateTraceId();
    const context = {
      ...initialContext,
      traceId,
      startTime: Date.now(),
      nodeResults: {},
      errors: [],
    };

    this.logger.info('[Pipeline] 流水线启动', {
      traceId,
      nodeCount: this.nodes.length,
      initialSize: this._estimateSize(context),
    });

    try {
      // 按顺序执行节点（支持并行组）
      for (let i = 0; i < this.nodes.length; i++) {
        const { node, condition } = this.nodes[i];

        // 条件跳过
        if (condition && !condition(context)) {
          this.logger.info(`[Pipeline] 跳过节点: ${node.name} (条件不满足)`);
          continue;
        }

        // 手动跳过的节点
        if (this.options.skipNodes.has(node.name)) {
          this.logger.info(`[Pipeline] 跳过节点: ${node.name} (手动跳过)`);
          continue;
        }

        // 执行节点
        const result = await node.execute(context);
        context.nodeResults[node.name] = result;

        // 合并节点输出到上下文
        Object.assign(context, result);

        // 检查是否需要停止流水线
        if (this._shouldStop(context)) {
          this.logger.info('[Pipeline] 流水线提前终止', {
            traceId,
            stopReason: context.stopReason,
            lastNode: node.name,
          });
          break;
        }
      }

      // 处理并行节点组
      await this._runParallelGroups(context);

      // 后处理
      context.endTime = Date.now();
      context.duration = context.endTime - context.startTime;

      this.logger.info('[Pipeline] 流水线完成', {
        traceId,
        duration: context.duration,
        outputSize: this._estimateSize(context),
        executedNodes: Object.keys(context.nodeResults),
      });

      return context;
    } catch (error) {
      context.endTime = Date.now();
      context.duration = context.endTime - context.startTime;
      context.errors.push(error);

      this.logger.error('[Pipeline] 流水线异常', {
        traceId,
        duration: context.duration,
        error: error.message,
        stack: error.stack,
      });

      throw error;
    }
  }

  /**
   * 执行并行节点组
   * @param {Object} context
   */
  async _runParallelGroups(context) {
    for (const [groupName, nodes] of this.options.parallelNodes) {
      if (this.options.skipNodes.has(groupName)) continue;

      this.logger.info(`[Pipeline] 开始并行执行: ${groupName}`, {
        traceId: context.traceId,
        parallelCount: nodes.length,
      });

      const startTime = Date.now();

      // 并行执行
      const results = await Promise.allSettled(
        nodes.map((node) => node.execute(context))
      );

      // 收集结果
      const successes = [];
      const failures = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successes.push({ node: nodes[index].name, result: result.value });
          Object.assign(context, result.value);
        } else {
          failures.push({ node: nodes[index].name, error: result.reason });
        }
      });

      context.nodeResults[groupName] = { successes, failures };

      this.logger.info(`[Pipeline] 并行组完成: ${groupName}`, {
        traceId: context.traceId,
        duration: Date.now() - startTime,
        successCount: successes.length,
        failureCount: failures.length,
      });

      // 并行组失败不中断主流程（可配置）
      if (failures.length > 0 && this.options.failOnParallelError) {
        throw AppError.internalError(`并行组 ${groupName} 执行失败`);
      }
    }
  }

  /**
   * 判断是否提前停止（模板方法 - 可覆盖）
   * @param {Object} context
   * @returns {boolean}
   */
  _shouldStop(context) {
    return context.stop === true;
  }

  /**
   * 生成追踪ID
   * @returns {string}
   */
  _generateTraceId() {
    return `pipeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 估算数据大小
   * @param {any} data
   * @returns {number}
   */
  _estimateSize(data) {
    if (!data) return 0;
    try {
      return JSON.stringify(data).length;
    } catch {
      return 0;
    }
  }

  /**
   * 获取流水线统计信息
   * @param {Object} context
   * @returns {Object}
   */
  getStats(context) {
    return {
      traceId: context.traceId,
      duration: context.duration,
      nodeCount: this.nodes.length,
      executedNodes: Object.keys(context.nodeResults),
      errors: context.errors.length,
      errorDetails: context.errors.map((e) => ({
        message: e.message,
        nodeName: e.nodeName,
      })),
    };
  }
}

module.exports = IngestionPipeline;
