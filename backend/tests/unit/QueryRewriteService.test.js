/**
 * QueryRewriteService 单元测试
 *
 * 测试内容：
 * 1. 缩写展开
 * 2. 口语规范化
 * 3. 共指消解
 * 4. 上下文补全
 */
const assert = require('assert');



const { QueryRewriteService } = require('../../src/services/agent/QueryRewriteService');

describe('QueryRewriteService 构造函数', () => {
  test('默认配置应该正确', () => {
    const service = new QueryRewriteService();
    assert.strictEqual(service.contextWindow, 10);
    assert.strictEqual(service.maxRewriteIterations, 3);
    assert.strictEqual(service.enableContextCompletion, true);
    assert.strictEqual(service.enableAbbreviationExpansion, true);
    assert.strictEqual(service.enableColloquialNormalization, true);
    assert.strictEqual(service.enableCoreferenceResolution, true);
  });

  test('自定义配置应该正确应用', () => {
    const service = new QueryRewriteService({
      contextWindow: 5,
      maxRewriteIterations: 5,
      enableContextCompletion: false
    });
    assert.strictEqual(service.contextWindow, 5);
    assert.strictEqual(service.maxRewriteIterations, 5);
    assert.strictEqual(service.enableContextCompletion, false);
  });

  test('应该包含默认缩写词典', () => {
    const service = new QueryRewriteService();
    assert.ok(service.abbreviationDict);
    assert.ok(service.abbreviationDict['LLM']);
    assert.strictEqual(service.abbreviationDict['LLM'], 'Large Language Model');
  });

  test('应该包含默认口语模式', () => {
    const service = new QueryRewriteService();
    assert.ok(service.colloquialPatterns.length > 0);
  });

  test('应该包含默认共指模式', () => {
    const service = new QueryRewriteService();
    assert.ok(service.coreferencePatterns);
    assert.ok(service.coreferencePatterns['它']);
    assert.ok(service.coreferencePatterns['这个']);
  });
});

describe('QueryRewriteService rewrite 完整流程', () => {
  test('空查询应该返回空结果', async () => {
    const service = new QueryRewriteService();
    const result = await service.rewrite('');
    assert.strictEqual(result.rewritten, '');
    assert.strictEqual(result.hasChanges, false);
  });

  test('应该返回变更记录', async () => {
    const service = new QueryRewriteService();
    const result = await service.rewrite('LLM是什么');
    assert.ok(Array.isArray(result.changes));
    assert.strictEqual(typeof result.hasChanges, 'boolean');
  });
});

describe('QueryRewriteService 缩写展开', () => {
  test('应该展开 LLM', async () => {
    const service = new QueryRewriteService();
    const result = await service.rewrite('LLM是什么意思');
    assert.ok(result.rewritten.includes('Large Language Model'));
  });

  test('应该展开 API', async () => {
    const service = new QueryRewriteService();
    const result = await service.rewrite('API是什么');
    assert.ok(result.rewritten.includes('Application Programming Interface'));
  });

  test('应该展开多个缩写', async () => {
    const service = new QueryRewriteService();
    const result = await service.rewrite('LLM和NLP都是AI的子领域');
    assert.ok(result.rewritten.includes('Large Language Model'));
    assert.ok(result.rewritten.includes('Natural Language Processing'));
  });

  test('大小写不敏感匹配', async () => {
    const service = new QueryRewriteService();
    const result = await service.rewrite('llm是什么意思');
    assert.ok(result.rewritten.includes('Large Language Model'));
  });
});

describe('QueryRewriteService 口语规范化', () => {
  test('应该规范化价格查询', async () => {
    const service = new QueryRewriteService();
    const result = await service.rewrite('这个东西多少钱');
    assert.ok(result.rewritten.includes('价格'));
  });

  test('应该规范化质量查询', async () => {
    const service = new QueryRewriteService();
    const result = await service.rewrite('这个好不好用');
    assert.ok(result.rewritten.includes('质量'));
  });

  test('应该规范化使用方法查询', async () => {
    const service = new QueryRewriteService();
    const result = await service.rewrite('这个东西咋用');
    assert.ok(result.rewritten.includes('使用方法'));
  });

  test('应该规范化原因查询', async () => {
    const service = new QueryRewriteService();
    const result = await service.rewrite('为什么它不工作');
    assert.ok(result.rewritten.includes('原因'));
  });
});

describe('QueryRewriteService 共指消解', () => {
  test('应该消解代词它', async () => {
    const service = new QueryRewriteService();
    const messages = [
      { role: 'user', content: '我想了解机器学习' },
      { role: 'assistant', content: '机器学习是人工智能的一个分支' },
      { role: 'user', content: '它有什么应用' }
    ];

    const result = await service.rewrite('它有什么应用', { messages });
    assert.ok(result.changes.some(c => c.type === 'coreference_resolution'));
  });

  test('没有历史消息时不应该消解', async () => {
    const service = new QueryRewriteService();
    const result = await service.rewrite('它是什么', { messages: [] });
    const hasCorefChange = result.changes.some(c => c.type === 'coreference_resolution');
    assert.strictEqual(hasCorefChange, false);
  });
});

describe('QueryRewriteService 禁用特定功能', () => {
  test('禁用缩写展开时应该跳过', async () => {
    const service = new QueryRewriteService({ enableAbbreviationExpansion: false });
    const result = await service.rewrite('LLM是什么意思');
    const hasAbbrevChange = result.changes.some(c => c.type === 'abbreviation_expansion');
    assert.strictEqual(hasAbbrevChange, false);
  });

  test('禁用口语规范化时应该跳过', async () => {
    const service = new QueryRewriteService({ enableColloquialNormalization: false });
    const result = await service.rewrite('多少钱');
    const hasColloquialChange = result.changes.some(c => c.type === 'colloquial_normalization');
    assert.strictEqual(hasColloquialChange, false);
  });

  test('禁用共指消解时应该跳过', async () => {
    const service = new QueryRewriteService({ enableCoreferenceResolution: false });
    const result = await service.rewrite('它是什么', { messages: [{ role: 'user', content: '机器学习' }] });
    const hasCorefChange = result.changes.some(c => c.type === 'coreference_resolution');
    assert.strictEqual(hasCorefChange, false);
  });

  test('禁用上下文补全时应该跳过', async () => {
    const service = new QueryRewriteService({ enableContextCompletion: false });
    const result = await service.rewrite('它是什么', { messages: [{ role: 'user', content: '机器学习' }] });
    const hasContextChange = result.changes.some(c => c.type === 'context_completion');
    assert.strictEqual(hasContextChange, false);
  });
});

describe('QueryRewriteService addAbbreviation', () => {
  test('应该添加自定义缩写', () => {
    const service = new QueryRewriteService();
    service.addAbbreviation('ABC', 'Artificial Blockchain Computing');
    assert.strictEqual(service.abbreviationDict['ABC'], 'Artificial Blockchain Computing');
  });
});

describe('QueryRewriteService addColloquialPattern', () => {
  test('应该添加自定义口语模式 - 正则表达式', () => {
    const service = new QueryRewriteService();
    service.addColloquialPattern(/这个东西贼棒/, '这个产品质量很好', 'custom');
    const result = service._normalizeColloquial('这个东西贼棒');
    assert.strictEqual(result.normalized, '这个产品质量很好');
  });

  test('应该添加自定义口语模式 - 字符串', () => {
    const service = new QueryRewriteService();
    service.addColloquialPattern('太贵了', '价格不合理', 'custom');
    const result = service._normalizeColloquial('太贵了');
    assert.strictEqual(result.normalized, '价格不合理');
  });
});

describe('QueryRewriteService getStats', () => {
  test('应该返回统计信息', () => {
    const service = new QueryRewriteService();
    const stats = service.getStats();
    assert.ok(stats.abbreviationCount > 0);
    assert.ok(stats.colloquialPatternCount > 0);
    assert.ok(stats.coreferencePatternCount > 0);
  });
});

