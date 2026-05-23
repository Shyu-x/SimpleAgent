/**
 * IntentClassifier 单元测试
 *
 * 测试内容：
 * 1. 意图分类（关键词模式）
 * 2. 特殊模式匹配
 * 3. 置信度处理
 * 4. 澄清机制
 */
const assert = require('assert');



const { IntentClassifier, INTENT_TYPES, CONFIDENCE_THRESHOLDS, TOOL_SUB_TYPES, TASK_SUB_TYPES } = require('../../src/services/agent/IntentClassifier');

describe('IntentClassifier 构造函数', () => {
  test('默认配置应该正确', () => {
    const classifier = new IntentClassifier({ enableLLM: false });
    assert.strictEqual(classifier.defaultModel, 'MiniMax-M2.7-highspeed');
    assert.strictEqual(classifier.confidenceThreshold, CONFIDENCE_THRESHOLDS.MEDIUM);
    assert.strictEqual(classifier.enableLLM, false);
    assert.strictEqual(classifier.enableKeywordFallback, true);
  });

  test('自定义配置应该正确应用', () => {
    const classifier = new IntentClassifier({
      defaultModel: 'test-model',
      confidenceThreshold: 0.6,
      enableLLM: false,
      enableKeywordFallback: true
    });
    assert.strictEqual(classifier.defaultModel, 'test-model');
    assert.strictEqual(classifier.confidenceThreshold, 0.6);
  });
});

describe('IntentClassifier 常量导出', () => {
  test('应该导出 INTENT_TYPES', () => {
    assert.strictEqual(INTENT_TYPES.KNOWLEDGE, 'knowledge');
    assert.strictEqual(INTENT_TYPES.TOOL_USE, 'tool_use');
    assert.strictEqual(INTENT_TYPES.CHAT, 'chat');
    assert.strictEqual(INTENT_TYPES.TASK, 'task');
  });

  test('应该导出 CONFIDENCE_THRESHOLDS', () => {
    assert.strictEqual(CONFIDENCE_THRESHOLDS.HIGH, 0.8);
    assert.strictEqual(CONFIDENCE_THRESHOLDS.MEDIUM, 0.5);
    assert.strictEqual(CONFIDENCE_THRESHOLDS.LOW, 0.3);
  });

  test('应该导出 TOOL_SUB_TYPES', () => {
    assert.strictEqual(TOOL_SUB_TYPES.WEB_SEARCH, 'web_search');
    assert.strictEqual(TOOL_SUB_TYPES.CALCULATOR, 'calculator');
    assert.strictEqual(TOOL_SUB_TYPES.IMAGE_GENERATION, 'image_generation');
  });

  test('应该导出 TASK_SUB_TYPES', () => {
    assert.strictEqual(TASK_SUB_TYPES.ANALYSIS, 'analysis');
    assert.strictEqual(TASK_SUB_TYPES.SUMMARY, 'summary');
    assert.strictEqual(TASK_SUB_TYPES.WRITING, 'writing');
  });
});

describe('IntentClassifier classify 关键词匹配', () => {
  test('应该识别知识问答意图', async () => {
    const classifier = new IntentClassifier({ enableLLM: false });
    const result = await classifier.classify('什么是机器学习');
    assert.strictEqual(result.intent, 'knowledge');
    assert.ok(result.confidence > 0.3);
  });

  test('应该识别工具使用意图 - 搜索', async () => {
    const classifier = new IntentClassifier({ enableLLM: false });
    const result = await classifier.classify('帮我搜索一下人工智能');
    assert.strictEqual(result.intent, 'tool_use');
    assert.strictEqual(result.subIntent, TOOL_SUB_TYPES.WEB_SEARCH);
  });

  test('应该识别工具使用意图 - 图像生成', async () => {
    const classifier = new IntentClassifier({ enableLLM: false });
    const result = await classifier.classify('帮我画一幅风景画');
    assert.strictEqual(result.intent, 'tool_use');
    assert.strictEqual(result.subIntent, TOOL_SUB_TYPES.IMAGE_GENERATION);
  });

  test('应该识别任务执行意图 - 分析', async () => {
    const classifier = new IntentClassifier({ enableLLM: false });
    const result = await classifier.classify('分析一下这个数据');
    assert.strictEqual(result.intent, 'task');
    assert.strictEqual(result.subIntent, TASK_SUB_TYPES.ANALYSIS);
  });

  test('应该识别任务执行意图 - 总结', async () => {
    const classifier = new IntentClassifier({ enableLLM: false });
    const result = await classifier.classify('帮我总结这篇文章');
    assert.strictEqual(result.intent, 'task');
    assert.strictEqual(result.subIntent, TASK_SUB_TYPES.SUMMARY);
  });

  test('应该识别闲聊意图', async () => {
    const classifier = new IntentClassifier({ enableLLM: false });
    const result = await classifier.classify('你好啊');
    assert.strictEqual(result.intent, 'chat');
    assert.ok(result.confidence > 0);
  });

  test('空查询应该返回闲聊', async () => {
    const classifier = new IntentClassifier({ enableLLM: false });
    const result = await classifier.classify('');
    assert.strictEqual(result.intent, 'chat');
  });

  test('仅包含空白字符的查询应该返回闲聊', async () => {
    const classifier = new IntentClassifier({ enableLLM: false });
    const result = await classifier.classify('   ');
    assert.strictEqual(result.intent, 'chat');
  });
});

describe('IntentClassifier 特殊模式匹配', () => {
  test('帮*搜索* 模式应该识别为搜索', async () => {
    const classifier = new IntentClassifier({ enableLLM: false });
    const result = await classifier.classify('帮我在网上搜索这个问题');
    assert.strictEqual(result.intent, 'tool_use');
    assert.strictEqual(result.subIntent, TOOL_SUB_TYPES.WEB_SEARCH);
    assert.strictEqual(result.source, 'special_pattern');
  });

  test('帮*画* 模式应该识别为图像生成', async () => {
    const classifier = new IntentClassifier({ enableLLM: false });
    const result = await classifier.classify('帮我画一只猫');
    assert.strictEqual(result.intent, 'tool_use');
    assert.strictEqual(result.subIntent, TOOL_SUB_TYPES.IMAGE_GENERATION);
  });

  test('搜索 开头应该识别为搜索', async () => {
    const classifier = new IntentClassifier({ enableLLM: false });
    const result = await classifier.classify('搜索 人工智能');
    assert.strictEqual(result.intent, 'tool_use');
    assert.strictEqual(result.subIntent, TOOL_SUB_TYPES.WEB_SEARCH);
  });

  test('什么是 开头应该识别为知识问答', async () => {
    const classifier = new IntentClassifier({ enableLLM: false });
    const result = await classifier.classify('什么是区块链');
    assert.strictEqual(result.intent, 'knowledge');
    assert.ok(result.confidence >= 0.6);
  });

  test('hello/hi 开头应该识别为闲聊', async () => {
    const classifier = new IntentClassifier({ enableLLM: false });
    const result = await classifier.classify('Hello, how are you?');
    assert.strictEqual(result.intent, 'chat');
  });
});

describe('IntentClassifier getStats', () => {
  test('应该返回统计信息', async () => {
    const classifier = new IntentClassifier({ enableLLM: false });
    await classifier.classify('你好');
    await classifier.classify('什么是AI');
    await classifier.classify('搜索一下');
    const stats = classifier.getStats();
    assert.ok(stats.totalClassifications >= 3);
    assert.ok(stats.keywordFallbacks >= 0);
  });
});

describe('IntentClassifier resetStats', () => {
  test('应该重置统计', async () => {
    const classifier = new IntentClassifier({ enableLLM: false });
    await classifier.classify('你好');
    const statsBefore = classifier.getStats();
    assert.ok(statsBefore.totalClassifications > 0);
    classifier.resetStats();
    const statsAfter = classifier.getStats();
    assert.strictEqual(statsAfter.totalClassifications, 0);
  });
});

describe('IntentClassifier setAvailableTools', () => {
  test('应该设置可用工具列表', () => {
    const classifier = new IntentClassifier({ enableLLM: false });
    const tools = [
      { name: 'web_search', description: '搜索网页' },
      { name: 'calculator', description: '计算器' }
    ];
    const result = classifier.setAvailableTools(tools);
    assert.strictEqual(classifier.availableTools.length, 2);
    assert.strictEqual(result, classifier);
  });
});

describe('IntentClassifier 多语言支持', () => {
  test('应该支持中文关键词', async () => {
    const classifier = new IntentClassifier({ enableLLM: false });
    const testCases = [
      { query: '搜索一下', expected: 'tool_use' },
      { query: '什么是', expected: 'knowledge' },
      { query: '如何学习', expected: 'knowledge' },
      { query: '帮我画', expected: 'tool_use' },
      { query: '计算一下', expected: 'tool_use' },
      { query: '分析一下', expected: 'task' },
      { query: '总结一下', expected: 'task' }
    ];

    for (const tc of testCases) {
      const result = await classifier.classify(tc.query);
      assert.strictEqual(result.intent, tc.expected, `Query: ${tc.query}, Expected: ${tc.expected}, Got: ${result.intent}`);
    }
  });

  test('应该支持英文关键词', async () => {
    const classifier = new IntentClassifier({ enableLLM: false });
    const result = await classifier.classify('search for information');
    assert.strictEqual(result.intent, 'tool_use');
  });
});

describe('IntentClassifier 边界条件', () => {
  test('超长查询应该正常处理', async () => {
    const classifier = new IntentClassifier({ enableLLM: false });
    const longQuery = '搜索'.repeat(1000);
    const result = await classifier.classify(longQuery);
    assert.ok(result.intent);
    assert.ok(result.confidence >= 0);
  });

  test('特殊字符查询应该正常处理', async () => {
    const classifier = new IntentClassifier({ enableLLM: false });
    const result = await classifier.classify('!@#$%^&*()');
    assert.ok(result.intent);
  });

  test('纯数字查询应该正常处理', async () => {
    const classifier = new IntentClassifier({ enableLLM: false });
    const result = await classifier.classify('1234567890');
    assert.ok(result.intent);
  });
});

