/**
 * 文档入库流水线完整单元测试
 */

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
  }
}

function assertTrue(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${name}: ${error.message}`);
    failed++;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========== Mock Classes ==========

class IngestionNode {
  constructor(config = {}) {
    this.name = config.name || 'base_node';
    this.enabled = config.enabled !== false;
    this.executed = false;
    this.executionCount = 0;
    this.shouldSkipFn = config.shouldSkip || (() => false);
  }

  async execute(context) {
    if (this.shouldSkipFn(context)) {
      return { skipped: true };
    }
    this.executed = true;
    this.executionCount++;
    return { [this.name]: 'executed', nodeName: this.name };
  }

  shouldSkip(context) {
    return this.shouldSkipFn(context);
  }
}

class ParseNode extends IngestionNode {
  constructor(config = {}) {
    super({ name: 'ParseNode', ...config });
    this.parseMethod = config.parseMethod || 'default';
  }

  async execute(context) {
    if (this.shouldSkip(context)) {
      return { skipped: true };
    }
    this.executed = true;
    this.executionCount++;
    return {
      parsed: true,
      content: context.rawContent || 'parsed content',
      nodeName: this.name
    };
  }
}

class ChunkNode extends IngestionNode {
  constructor(config = {}) {
    super({ name: 'ChunkNode', ...config });
    this.chunkSize = config.chunkSize || 100;
  }

  async execute(context) {
    if (this.shouldSkip(context)) {
      return { skipped: true };
    }
    this.executed = true;
    this.executionCount++;

    const content = context.parsed?.content || context.content || '';
    const chunks = [];

    // 简单分块
    for (let i = 0; i < content.length; i += this.chunkSize) {
      chunks.push({
        text: content.slice(i, i + this.chunkSize),
        index: Math.floor(i / this.chunkSize)
      });
    }

    return {
      chunks,
      chunkCount: chunks.length,
      nodeName: this.name
    };
  }
}

class EmbeddingNode extends IngestionNode {
  constructor(config = {}) {
    super({ name: 'EmbeddingNode', ...config });
    this.batchSize = config.batchSize || 10;
  }

  async execute(context) {
    if (this.shouldSkip(context)) {
      return { skipped: true };
    }
    this.executed = true;
    this.executionCount++;

    const chunks = context.chunks || [];
    const embeddings = chunks.map((chunk, i) => ({
      chunkIndex: i,
      embedding: new Array(128).fill(0).map(() => Math.random()),
      dimension: 128
    }));

    return {
      embeddings,
      embeddingCount: embeddings.length,
      nodeName: this.name
    };
  }
}

class IndexNode extends IngestionNode {
  constructor(config = {}) {
    super({ name: 'IndexNode', ...config });
    this.indexName = config.indexName || 'default';
  }

  async execute(context) {
    if (this.shouldSkip(context)) {
      return { skipped: true };
    }
    this.executed = true;
    this.executionCount++;

    const embeddings = context.embeddings || [];
    return {
      indexed: true,
      indexedCount: embeddings.length,
      indexName: this.indexName,
      nodeName: this.name
    };
  }
}

// ========== IngestionPipeline ==========

class IngestionPipeline {
  constructor(config = {}) {
    this.name = config.name || 'default_pipeline';
    this.nodes = [];
    this.parallelGroups = new Map();
    this.executionLog = [];
  }

  addNode(node) {
    this.nodes.push(node);
    return this;
  }

  addParallelGroup(groupId, nodes) {
    this.parallelGroups.set(groupId, nodes);
    this.nodes.push(...nodes);
    return this;
  }

  async run(initialContext) {
    const context = { ...initialContext, traceId: Date.now() };
    this.executionLog = [];

    for (const node of this.nodes) {
      if (this.parallelGroups.size > 0) {
        // 检查是否属于并行组
        let inParallelGroup = false;
        for (const [groupId, groupNodes] of this.parallelGroups) {
          if (groupNodes.includes(node)) {
            inParallelGroup = true;
            break;
          }
        }
        if (inParallelGroup) continue;
      }

      const startTime = Date.now();

      try {
        const result = await node.execute(context);
        context.nodeResults = context.nodeResults || {};
        context.nodeResults[node.name] = result;
        Object.assign(context, result);

        this.executionLog.push({
          node: node.name,
          status: 'success',
          duration: Date.now() - startTime,
          result
        });
      } catch (error) {
        this.executionLog.push({
          node: node.name,
          status: 'error',
          duration: Date.now() - startTime,
          error: error.message
        });
        throw error;
      }
    }

    return context;
  }

  getLog() {
    return this.executionLog;
  }
}

// ========== Tests ==========

async function runTests() {
  console.log('\n========================================');
  console.log('IngestionPipeline 完整测试');
  console.log('========================================\n');

  // ========== 1. 构造函数测试 ==========
  console.log('【1. 构造函数测试】');

  runTest('默认配置应正确', () => {
    const pipeline = new IngestionPipeline();

    assertTrue(pipeline.nodes instanceof Array, '应有 nodes 数组');
    assertEqual(pipeline.name, 'default_pipeline', '默认名称应正确');
    assertTrue(Array.isArray(pipeline.executionLog), '应有 executionLog');
  });

  runTest('自定义名称应生效', () => {
    const pipeline = new IngestionPipeline({ name: 'custom_pipeline' });

    assertEqual(pipeline.name, 'custom_pipeline', '自定义名称应生效');
  });

  // ========== 2. 节点添加测试 ==========
  console.log('\n【2. 节点添加测试】');

  runTest('添加节点应正确存储', () => {
    const pipeline = new IngestionPipeline();
    const node = new IngestionNode({ name: 'test_node' });

    pipeline.addNode(node);

    assertEqual(pipeline.nodes.length, 1, '应有 1 个节点');
    assertEqual(pipeline.nodes[0].name, 'test_node', '节点名称应正确');
  });

  runTest('添加多个节点应正确存储', () => {
    const pipeline = new IngestionPipeline();
    pipeline.addNode(new IngestionNode({ name: 'node1' }));
    pipeline.addNode(new IngestionNode({ name: 'node2' }));
    pipeline.addNode(new IngestionNode({ name: 'node3' }));

    assertEqual(pipeline.nodes.length, 3, '应有 3 个节点');
  });

  // ========== 3. 流水线执行测试 ==========
  console.log('\n【3. 流水线执行测试】');

  runTest('完整流水线应按顺序执行', async () => {
    const pipeline = new IngestionPipeline();
    pipeline.addNode(new ParseNode());
    pipeline.addNode(new ChunkNode({ chunkSize: 50 }));
    pipeline.addNode(new EmbeddingNode());
    pipeline.addNode(new IndexNode());

    const context = { rawContent: 'A'.repeat(200) };
    const result = await pipeline.run(context);

    assertTrue(result.parsed, '应完成解析');
    assertTrue(Array.isArray(result.chunks), '应生成分块');
    assertTrue(result.chunkCount > 0, '应有分块');
    assertTrue(Array.isArray(result.embeddings), '应生成嵌入');
    assertTrue(result.indexed, '应完成索引');
  });

  runTest('节点应按顺序执行', async () => {
    const pipeline = new IngestionPipeline();
    const order = [];

    pipeline.addNode({
      name: 'node1',
      async execute(ctx) {
        order.push('node1');
        return {};
      }
    });
    pipeline.addNode({
      name: 'node2',
      async execute(ctx) {
        order.push('node2');
        return {};
      }
    });
    pipeline.addNode({
      name: 'node3',
      async execute(ctx) {
        order.push('node3');
        return {};
      }
    });

    await pipeline.run({});

    assertEqual(order.join(','), 'node1,node2,node3', '节点应按顺序执行');
  });

  // ========== 4. 节点跳过测试 ==========
  console.log('\n【4. 节点跳过测试】');

  runTest('shouldSkip 返回 true 应跳过节点', async () => {
    const pipeline = new IngestionPipeline();
    let skipped = false;

    pipeline.addNode(new ChunkNode({
      shouldSkip: () => true
    }));

    const result = await pipeline.run({ content: 'test content' });

    assertTrue(result.skipped, '应返回 skipped');
  });

  runTest('跳过节点不应增加执行计数', async () => {
    const pipeline = new IngestionPipeline();
    const node = new ChunkNode({
      shouldSkip: () => true
    });

    pipeline.addNode(node);
    await pipeline.run({ content: 'test' });

    assertEqual(node.executionCount, 0, '跳过节点的执行计数应为 0');
  });

  // ========== 5. 上下文传递测试 ==========
  console.log('\n【5. 上下文传递测试】');

  runTest('前节点输出应传递给后节点', async () => {
    const pipeline = new IngestionPipeline();

    pipeline.addNode({
      name: 'source',
      async execute(ctx) {
        return { sourceData: 'from_source', nodeName: 'source' };
      }
    });
    pipeline.addNode({
      name: 'target',
      async execute(ctx) {
        // 验证接收到 sourceData
        if (!ctx.sourceData) {
          throw new Error('未接收到 sourceData');
        }
        return { targetData: 'processed', nodeName: 'target' };
      }
    });

    const result = await pipeline.run({});

    assertTrue(result.sourceData === 'from_source', '应有 sourceData');
    assertTrue(result.targetData === 'processed', '应有 targetData');
  });

  // ========== 6. 错误处理测试 ==========
  console.log('\n【6. 错误处理测试】');

  runTest('节点失败应抛出错误', async () => {
    const pipeline = new IngestionPipeline();

    pipeline.addNode({
      name: 'failing_node',
      async execute(ctx) {
        throw new Error('Injected error');
      }
    });

    let errorThrown = false;
    let errorMessage = '';

    try {
      await pipeline.run({});
    } catch (e) {
      errorThrown = true;
      errorMessage = e.message;
    }

    assertTrue(errorThrown, '应抛出错误');
    assertEqual(errorMessage, 'Injected error', '错误消息应正确');
  });

  runTest('执行日志应记录失败', async () => {
    const pipeline = new IngestionPipeline();

    pipeline.addNode({
      name: 'failing_node',
      async execute(ctx) {
        throw new Error('Test error');
      }
    });

    try {
      await pipeline.run({});
    } catch (e) {
      // 忽略
    }

    const log = pipeline.getLog();
    assertEqual(log.length, 1, '日志应有 1 条');
    assertEqual(log[0].status, 'error', '状态应为 error');
  });

  // ========== 7. 分块逻辑测试 ==========
  console.log('\n【7. 分块逻辑测试】');

  runTest('应根据 chunkSize 正确分块', async () => {
    const pipeline = new IngestionPipeline();
    pipeline.addNode(new ChunkNode({ chunkSize: 50 }));

    const result = await pipeline.run({ content: 'A'.repeat(200) });

    assertEqual(result.chunkCount, 4, '200 字符应分成 4 块(50 每块)');
    assertEqual(result.chunks[0].text.length, 50, '每块 50 字符');
  });

  runTest('内容过短应只分一块', async () => {
    const pipeline = new IngestionPipeline();
    pipeline.addNode(new ChunkNode({ chunkSize: 100 }));

    const result = await pipeline.run({ content: 'short' });

    assertEqual(result.chunkCount, 1, '短内容应只分一块');
  });

  // ========== 8. 向量化测试 ==========
  console.log('\n【8. 向量化测试】');

  runTest('应正确生成嵌入向量', async () => {
    const pipeline = new IngestionPipeline();
    pipeline.addNode(new ChunkNode({ chunkSize: 50 }));
    pipeline.addNode(new EmbeddingNode());

    const result = await pipeline.run({ content: 'A'.repeat(150) });

    assertEqual(result.embeddingCount, 3, '应有 3 个嵌入');
    assertEqual(result.embeddings[0].dimension, 128, '嵌入维度应为 128');
    assertTrue(Array.isArray(result.embeddings[0].embedding), '嵌入应为数组');
  });

  // ========== 9. 索引测试 ==========
  console.log('\n【9. 索引测试】');

  runTest('索引节点应记录索引名称', async () => {
    const pipeline = new IngestionPipeline();
    pipeline.addNode(new ChunkNode());
    pipeline.addNode(new EmbeddingNode());
    pipeline.addNode(new IndexNode({ indexName: 'my_index' }));

    const result = await pipeline.run({ content: 'test content' });

    assertEqual(result.indexName, 'my_index', '索引名称应正确');
    assertTrue(result.indexed, '应标记为已索引');
    assertEqual(result.indexedCount, result.embeddingCount, '索引数量应匹配');
  });

  // ========== 10. 性能测试 ==========
  console.log('\n【10. 性能测试】');

  runTest('流水线执行延迟应合理', async () => {
    const pipeline = new IngestionPipeline();
    pipeline.addNode(new ParseNode());
    pipeline.addNode(new ChunkNode({ chunkSize: 50 }));
    pipeline.addNode(new EmbeddingNode());
    pipeline.addNode(new IndexNode());

    const startTime = Date.now();
    await pipeline.run({ rawContent: 'A'.repeat(500) });
    const duration = Date.now() - startTime;

    console.log(`    500 字符处理耗时: ${duration}ms`);

    // 执行应该很快（纯内存操作）
    assertTrue(duration < 1000, '执行延迟应 < 1s');
  });

  // ========== 汇总 ==========
  console.log('\n========================================');
  console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
  console.log('========================================\n');

  return { passed, failed };
}

// 运行
runTests()
  .then(({ passed, failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('测试执行失败:', err);
    process.exit(1);
  });
