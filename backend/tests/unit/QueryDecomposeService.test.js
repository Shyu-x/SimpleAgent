/**
 * QueryDecomposeService 单元测试
 *
 * 测试内容：
 * 1. 复杂度分析
 * 2. 执行计划确定
 * 3. 子问题提取
 * 4. 依赖关系分析
 */
const assert = require('assert');

function test(name, fn) {
  try {
    fn();
    console.log('  \x1b[32m✓\x1b[0m ' + name);
  } catch (e) {
    console.log('  \x1b[31m✗\x1b[0m ' + name);
    console.log('    ' + e.message);
    process.exitCode = 1;
  }
}

function describe(name, fn) {
  console.log('\n' + name + ':');
  fn();
}

const { QueryDecomposeService } = require('../../src/services/agent/QueryDecomposeService');

describe('QueryDecomposeService 构造函数', () => {
  test('默认配置应该正确', () => {
    const service = new QueryDecomposeService();
    assert.strictEqual(service.maxSubQueries, 10);
    assert.strictEqual(service.enableDependencyAnalysis, true);
  });

  test('自定义配置应该正确应用', () => {
    const service = new QueryDecomposeService({
      maxSubQueries: 5,
      enableDependencyAnalysis: false
    });
    assert.strictEqual(service.maxSubQueries, 5);
    assert.strictEqual(service.enableDependencyAnalysis, false);
  });

  test('应该包含默认关键词列表', () => {
    const service = new QueryDecomposeService();
    assert.ok(service.parallelKeywords.length > 0);
    assert.ok(service.serialKeywords.length > 0);
    assert.ok(service.depIndicatorKeywords.length > 0);
  });
});

describe('QueryDecomposeService decompose 基本功能', () => {
  test('应该返回完整的分解结果', async () => {
    const service = new QueryDecomposeService();
    const result = await service.decompose('什么是人工智能');
    assert.ok(result.subQueries);
    assert.ok(result.plan);
    assert.ok(result.complexity);
    assert.strictEqual(result.originalQuery, '什么是人工智能');
  });

  test('简单查询应该返回单个子查询', async () => {
    const service = new QueryDecomposeService();
    const result = await service.decompose('什么是机器学习');
    assert.ok(result.subQueries.length >= 1);
    assert.ok(['simple', 'moderate', 'complex'].includes(result.complexity.level));
  });
});

describe('QueryDecomposeService analyzeComplexity', () => {
  test('应该识别单问题', () => {
    const service = new QueryDecomposeService();
    const complexity = service.analyzeComplexity('什么是机器学习');
    assert.strictEqual(complexity.questionCount, 1);
    assert.ok(['simple', 'moderate', 'complex'].includes(complexity.level));
  });

  test('应该识别多问题', () => {
    const service = new QueryDecomposeService();
    const complexity = service.analyzeComplexity('什么是机器学习？深度学习是什么？');
    assert.strictEqual(complexity.questionCount, 2);
    assert.ok(complexity.score >= 2);
  });

  test('应该识别比较类查询', () => {
    const service = new QueryDecomposeService();
    const complexity = service.analyzeComplexity('比较机器学习和深度学习的区别');
    assert.strictEqual(complexity.hasComparison, true);
    assert.ok(complexity.score >= 2);
  });

  test('应该识别多步骤查询', () => {
    const service = new QueryDecomposeService();
    const complexity = service.analyzeComplexity('首先分析问题，然后提出解决方案，最后总结');
    assert.strictEqual(complexity.hasMultipleSteps, true);
    assert.ok(complexity.score >= 2);
  });

  test('应该识别并行关键词', () => {
    const service = new QueryDecomposeService();
    const complexity = service.analyzeComplexity('机器学习和深度学习有什么关系');
    assert.strictEqual(complexity.hasParallelParts, true);
  });

  test('应该识别条件类查询', () => {
    const service = new QueryDecomposeService();
    const complexity = service.analyzeComplexity('如果机器学习失败了，应该怎么办');
    assert.strictEqual(complexity.hasConditional, true);
    assert.ok(complexity.score >= 1);
  });

  test('复杂度得分应该正确计算', () => {
    const service = new QueryDecomposeService();
    const complexity = service.analyzeComplexity('机器学习和深度学习有什么区别？');
    assert.ok(complexity.score >= 5);
    assert.strictEqual(complexity.level, 'complex');
  });
});

describe('QueryDecomposeService determinePlan', () => {
  test('有串行关键词应该返回 serial', () => {
    const service = new QueryDecomposeService();
    const plan = service.determinePlan('首先分析数据，然后处理数据，最后输出结果', { level: 'complex' });
    assert.strictEqual(plan, 'serial');
  });

  test('有对比且有并行关键词应该返回 parallel', () => {
    const service = new QueryDecomposeService();
    const plan = service.determinePlan('比较机器学习和深度学习', {
      hasComparison: true,
      hasParallelParts: true,
      level: 'moderate'
    });
    assert.strictEqual(plan, 'parallel');
  });

  test('多问题无依赖应该返回 parallel', () => {
    const service = new QueryDecomposeService();
    const plan = service.determinePlan('机器学习是什么？深度学习是什么？', {
      questionCount: 2,
      hasMultipleSteps: false,
      level: 'moderate'
    });
    assert.strictEqual(plan, 'parallel');
  });

  test('简单查询默认返回 parallel', () => {
    const service = new QueryDecomposeService();
    const plan = service.determinePlan('什么是机器学习', { level: 'simple' });
    assert.strictEqual(plan, 'parallel');
  });
});

describe('QueryDecomposeService extractSubQueries', () => {
  test('应该按句子拆分', () => {
    const service = new QueryDecomposeService();
    const subQueries = service.extractSubQueries('什么是机器学习。深度学习是什么？', 'parallel', {});
    assert.ok(subQueries.length >= 2);
  });

  test('应该过滤填充词', () => {
    const service = new QueryDecomposeService();
    const subQueries = service.extractSubQueries('好的，请问机器学习是什么', 'parallel', {});
    const contents = subQueries.map(sq => sq.query);
    assert.ok(!contents.some(c => c === '好的'));
  });

  test('应该创建正确的子查询结构', () => {
    const service = new QueryDecomposeService();
    const subQueries = service.extractSubQueries('机器学习是什么', 'parallel', {});
    assert.ok(subQueries.length > 0);
    assert.ok(subQueries[0].id);
    assert.ok(subQueries[0].query);
    assert.ok(Array.isArray(subQueries[0].dependencies));
    assert.strictEqual(typeof subQueries[0].parallel, 'boolean');
  });

  test('应该限制子查询数量', () => {
    const service = new QueryDecomposeService({ maxSubQueries: 3 });
    const subQueries = service.extractSubQueries('机器学习是什么？深度学习是什么？神经网络是什么？机器学习和深度学习的区别？', 'parallel', {});
    assert.ok(subQueries.length <= 3);
  });
});

describe('QueryDecomposeService classifySubQuery', () => {
  test('应该识别搜索类型', () => {
    const service = new QueryDecomposeService();
    const type = service.classifySubQuery('搜索机器学习相关信息');
    assert.strictEqual(type, 'search');
  });

  test('应该识别比较类型', () => {
    const service = new QueryDecomposeService();
    const type = service.classifySubQuery('比较机器学习和深度学习');
    assert.strictEqual(type, 'comparison');
  });

  test('应该识别总结类型', () => {
    const service = new QueryDecomposeService();
    const type = service.classifySubQuery('总结机器学习的主要特点');
    assert.strictEqual(type, 'summary');
  });

  test('应该识别分析类型', () => {
    const service = new QueryDecomposeService();
    const type = service.classifySubQuery('分析机器学习的应用场景');
    assert.strictEqual(type, 'analysis');
  });

  test('应该识别生成类型', () => {
    const service = new QueryDecomposeService();
    const type = service.classifySubQuery('生成一份机器学习报告');
    assert.strictEqual(type, 'generation');
  });

  test('默认应该返回 general', () => {
    const service = new QueryDecomposeService();
    const type = service.classifySubQuery('随便问一下');
    assert.strictEqual(type, 'general');
  });
});

describe('QueryDecomposeService splitBySentences', () => {
  test('应该按句号拆分', () => {
    const service = new QueryDecomposeService();
    const sentences = service.splitBySentences('第一句。第二句。第三句');
    assert.strictEqual(sentences.length, 3);
  });

  test('应该按问号拆分', () => {
    const service = new QueryDecomposeService();
    const sentences = service.splitBySentences('第一问？第二问？');
    assert.strictEqual(sentences.length, 2);
  });

  test('应该过滤空字符串', () => {
    const service = new QueryDecomposeService();
    const sentences = service.splitBySentences('第一句。第二句。');
    assert.ok(sentences.every(s => s.length > 0));
  });
});

describe('QueryDecomposeService splitByConnectors', () => {
  test('应该按串行关键词拆分', () => {
    const service = new QueryDecomposeService();
    const parts = service.splitByConnectors('首先分析数据然后处理数据最后输出结果');
    assert.ok(parts.length > 1);
  });

  test('应该按并行关键词拆分', () => {
    const service = new QueryDecomposeService();
    const parts = service.splitByConnectors('机器学习和深度学习和神经网络');
    assert.ok(parts.length >= 2);
  });

  test('没有连接词应该返回原字符串', () => {
    const service = new QueryDecomposeService();
    const parts = service.splitByConnectors('没有连接词的字符串');
    assert.strictEqual(parts.length, 1);
  });
});

describe('QueryDecomposeService analyzeDependencies', () => {
  test('应该检测指代关系', () => {
    const service = new QueryDecomposeService();
    const subQueries = [
      { id: 'sq_1', query: '机器学习是什么', dependencies: [], parallel: true },
      { id: 'sq_2', query: '它有什么应用', dependencies: [], parallel: true }
    ];

    service.analyzeDependencies(subQueries);
    assert.ok(subQueries[1].dependencies.length > 0);
  });

  test('应该检测依赖关键词', () => {
    const service = new QueryDecomposeService();
    const subQueries = [
      { id: 'sq_1', query: '分析数据', dependencies: [], parallel: true },
      { id: 'sq_2', query: '根据分析结果总结', dependencies: [], parallel: true }
    ];

    service.analyzeDependencies(subQueries);
    assert.ok(subQueries[1].dependencies.length > 0);
  });

  test('有依赖的查询应该改为串行', () => {
    const service = new QueryDecomposeService();
    const subQueries = [
      { id: 'sq_1', query: '机器学习是什么', dependencies: [], parallel: true },
      { id: 'sq_2', query: '它的应用有哪些', dependencies: [], parallel: true }
    ];

    service.analyzeDependencies(subQueries);
    if (subQueries[1].dependencies.length > 0) {
      assert.strictEqual(subQueries[1].parallel, false);
    }
  });

  test('总结类型应该依赖搜索/比较类型', () => {
    const service = new QueryDecomposeService();
    const subQueries = [
      { id: 'sq_1', query: '搜索机器学习', type: 'search', dependencies: [], parallel: true },
      { id: 'sq_2', query: '总结机器学习', type: 'summary', dependencies: [], parallel: true }
    ];

    service.analyzeDependencies(subQueries);
    assert.ok(subQueries[1].dependencies.includes('sq_1'));
  });
});

describe('QueryDecomposeService hasReference', () => {
  test('应该识别人称代词', () => {
    const service = new QueryDecomposeService();
    const hasRef = service.hasReference('它是什么', '机器学习');
    assert.strictEqual(hasRef, true);
  });

  test('应该识别指示代词', () => {
    const service = new QueryDecomposeService();
    const hasRef = service.hasReference('这个技术', '机器学习');
    assert.strictEqual(hasRef, true);
  });

  test('应该识别名词重叠', () => {
    const service = new QueryDecomposeService();
    const hasRef = service.hasReference('机器学习的应用', '机器学习');
    assert.strictEqual(hasRef, true);
  });
});

describe('QueryDecomposeService describePlan', () => {
  test('应该生成可读的的计划描述', async () => {
    const service = new QueryDecomposeService();
    const result = await service.decompose('机器学习和深度学习有什么区别');
    const description = service.describePlan(result);
    assert.ok(description.includes('执行计划'));
    assert.ok(description.includes('复杂度'));
    assert.ok(description.includes('子问题数量'));
  });
});

describe('QueryDecomposeService mergeSubQueries', () => {
  test('应该合并相邻的子查询', () => {
    const service = new QueryDecomposeService();
    const subQueries = [
      { id: 'sq_1', query: '第一句', dependencies: [], parallel: true },
      { id: 'sq_2', query: '第二句', dependencies: [], parallel: true },
      { id: 'sq_3', query: '第三句', dependencies: [], parallel: true },
      { id: 'sq_4', query: '第四句', dependencies: [], parallel: true }
    ];

    const merged = service.mergeSubQueries(subQueries);
    assert.ok(merged.length < subQueries.length);
  });

  test('奇数个子查询时最后一个应该保留', () => {
    const service = new QueryDecomposeService();
    const subQueries = [
      { id: 'sq_1', query: '第一句', dependencies: [], parallel: true },
      { id: 'sq_2', query: '第二句', dependencies: [], parallel: true },
      { id: 'sq_3', query: '第三句', dependencies: [], parallel: true }
    ];

    const merged = service.mergeSubQueries(subQueries);
    assert.strictEqual(merged.length, 2);
  });
});

console.log('\n');
