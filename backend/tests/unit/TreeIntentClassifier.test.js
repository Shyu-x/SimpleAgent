/**
 * TreeIntentClassifier 单元测试
 *
 * 测试内容：
 * 1. 树形三级分类（领域 -> 类目 -> 话题）
 * 2. 分层置信度计算
 * 3. 低置信度澄清机制
 * 4. LLM分类后备
 * 5. 关键词匹配
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

const {
  TreeIntentClassifier,
  IntentClassifier,
  INTENT_LEVELS,
  DOMAIN_TYPES,
  CATEGORY_TYPES,
  CONFIDENCE_LEVELS,
  CLARIFICATION_THRESHOLDS,
  DEFAULT_INTENT_TREE
} = require('../../src/domain/rag/IntentClassifier');

describe('TreeIntentClassifier 构造函数', () => {
  test('默认配置应该正确', () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    assert.strictEqual(classifier.defaultModel, 'MiniMax-M2.7-highspeed');
    assert.strictEqual(classifier.confidenceThreshold, 0.5);
    assert.strictEqual(classifier.enableLLM, false);
    assert.strictEqual(classifier.enableKeywordFallback, true);
  });

  test('自定义配置应该正确应用', () => {
    const classifier = new TreeIntentClassifier({
      defaultModel: 'test-model',
      confidenceThreshold: 0.6,
      enableLLM: false,
      domainThreshold: 0.5
    });
    assert.strictEqual(classifier.defaultModel, 'test-model');
    assert.strictEqual(classifier.confidenceThreshold, 0.6);
    assert.strictEqual(classifier.thresholds.domain, 0.5);
  });

  test('应该支持自定义意图树', () => {
    const customTree = {
      id: 'root',
      name: '自定义根',
      level: 0,
      children: [
        {
          id: 'custom_domain',
          name: '自定义领域',
          level: 1,
          keywords: ['测试'],
          children: []
        }
      ]
    };
    const classifier = new TreeIntentClassifier({ intentTree: customTree });
    const structure = classifier.getIntentTreeStructure();
    assert.strictEqual(structure.children[0].id, 'custom_domain');
  });
});

describe('TreeIntentClassifier 常量导出', () => {
  test('应该导出 INTENT_LEVELS', () => {
    assert.strictEqual(INTENT_LEVELS.DOMAIN, 1);
    assert.strictEqual(INTENT_LEVELS.CATEGORY, 2);
    assert.strictEqual(INTENT_LEVELS.TOPIC, 3);
  });

  test('应该导出 DOMAIN_TYPES', () => {
    assert.strictEqual(DOMAIN_TYPES.TECHNOLOGY_CONSULT, 'technology_consult');
    assert.strictEqual(DOMAIN_TYPES.CODE_DEVELOPMENT, 'code_development');
    assert.strictEqual(DOMAIN_TYPES.DATA_ANALYSIS, 'data_analysis');
    assert.strictEqual(DOMAIN_TYPES.DAILY_COMMUNICATION, 'daily_communication');
    assert.strictEqual(DOMAIN_TYPES.CREATIVE_GENERATION, 'creative_generation');
    assert.strictEqual(DOMAIN_TYPES.TOOL_OPERATION, 'tool_operation');
  });

  test('应该导出 CATEGORY_TYPES', () => {
    assert.strictEqual(CATEGORY_TYPES.PROGRAMMING_LANGUAGE, 'programming_language');
    assert.strictEqual(CATEGORY_TYPES.WEB_SEARCH, 'web_search');
    assert.strictEqual(CATEGORY_TYPES.CASUAL_CHAT, 'casual_chat');
  });

  test('应该导出 CONFIDENCE_LEVELS', () => {
    assert.strictEqual(CONFIDENCE_LEVELS.HIGH.min, 0.8);
    assert.strictEqual(CONFIDENCE_LEVELS.MEDIUM.min, 0.5);
    assert.strictEqual(CONFIDENCE_LEVELS.LOW.min, 0.3);
  });

  test('应该导出 CLARIFICATION_THRESHOLDS', () => {
    assert.strictEqual(CLARIFICATION_THRESHOLDS.DOMAIN_MIN, 0.3);
    assert.strictEqual(CLARIFICATION_THRESHOLDS.CATEGORY_MIN, 0.25);
    assert.strictEqual(CLARIFICATION_THRESHOLDS.TOPIC_MIN, 0.2);
  });
});

describe('TreeIntentClassifier classify 树形分类', () => {
  test('应该识别技术咨询领域', async () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    const result = await classifier.classify('什么是机器学习');
    assert.strictEqual(result.domain, DOMAIN_TYPES.TECHNOLOGY_CONSULT);
    assert.ok(result.confidence > 0.25);
    assert.ok(result.domainConfidence > 0);
  });

  test('应该识别代码开发领域', async () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    const result = await classifier.classify('帮我写一个排序算法');
    assert.strictEqual(result.domain, DOMAIN_TYPES.CODE_DEVELOPMENT);
  });

  test('应该识别工具操作领域 - 搜索', async () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    const result = await classifier.classify('帮我搜索一下人工智能');
    assert.strictEqual(result.domain, DOMAIN_TYPES.TOOL_OPERATION);
    assert.strictEqual(result.category, CATEGORY_TYPES.WEB_SEARCH);
  });

  test('应该识别工具操作领域 - 图像生成', async () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    const result = await classifier.classify('帮我画一只猫');
    assert.strictEqual(result.domain, DOMAIN_TYPES.TOOL_OPERATION);
    assert.strictEqual(result.category, CATEGORY_TYPES.IMAGE_GENERATION);
  });

  test('应该识别数据分析领域', async () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    const result = await classifier.classify('分析一下这个数据');
    assert.strictEqual(result.domain, DOMAIN_TYPES.DATA_ANALYSIS);
  });

  test('应该识别日常交流领域', async () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    const result = await classifier.classify('你好啊');
    assert.strictEqual(result.domain, DOMAIN_TYPES.DAILY_COMMUNICATION);
  });

  test('应该返回分层置信度', async () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    const result = await classifier.classify('什么是Python');
    assert.ok(typeof result.domainConfidence === 'number');
    assert.ok(typeof result.categoryConfidence === 'number');
    assert.ok(typeof result.topicConfidence === 'number');
  });

  test('应该返回树路径信息', async () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    const result = await classifier.classify('什么是Python');
    assert.ok(result.treePath);
    assert.ok(result.treePath.domain);
  });
});

describe('TreeIntentClassifier 分类结果结构', () => {
  test('应该包含兼容字段 intent', async () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    const result = await classifier.classify('什么是机器学习');
    assert.ok('intent' in result);
    assert.strictEqual(result.intent, result.domain);
  });

  test('应该包含 source 字段', async () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    const result = await classifier.classify('你好');
    assert.ok('source' in result);
  });

  test('应该包含 reasoning 字段', async () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    const result = await classifier.classify('什么是机器学习');
    assert.ok('reasoning' in result);
    assert.ok(result.reasoning.length > 0);
  });

  test('应该包含 timestamp 字段', async () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    const result = await classifier.classify('你好');
    assert.ok('timestamp' in result);
    assert.strictEqual(typeof result.timestamp, 'number');
  });
});

describe('TreeIntentClassifier 空查询处理', () => {
  test('空查询应该返回日常交流', async () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    const result = await classifier.classify('');
    assert.strictEqual(result.domain, DOMAIN_TYPES.DAILY_COMMUNICATION);
  });

  test('仅空白字符查询应该返回日常交流', async () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    const result = await classifier.classify('   ');
    assert.strictEqual(result.domain, DOMAIN_TYPES.DAILY_COMMUNICATION);
  });
});

describe('TreeIntentClassifier 低置信度澄清', () => {
  test('低置信度结果应该包含澄清问题', async () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    const result = await classifier.classify('abc123xyz');  // 模糊查询
    // 低置信度时应该返回澄清
    if (result.confidence < CONFIDENCE_LEVELS.HIGH.min) {
      assert.ok(result.needsClarification === true);
      assert.ok(result.clarification);
      assert.ok(result.clarification.length > 0);
    }
  });

  test('高置信度结果不应有澄清问题', async () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    const result = await classifier.classify('什么是Python编程语言');
    if (result.confidence >= CONFIDENCE_LEVELS.HIGH.min) {
      assert.ok(!result.clarification || result.confidence < CONFIDENCE_LEVELS.HIGH.min);
    }
  });
});

describe('TreeIntentClassifier getStats', () => {
  test('应该返回统计信息', async () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    await classifier.classify('你好');
    await classifier.classify('什么是AI');
    await classifier.classify('搜索一下');
    const stats = classifier.getStats();
    assert.ok(stats.totalClassifications >= 3);
    assert.ok(stats.treeMatches >= 0);
    assert.ok(stats.averageLatencyMs >= 0);
  });
});

describe('TreeIntentClassifier resetStats', () => {
  test('应该重置统计', async () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    await classifier.classify('你好');
    const statsBefore = classifier.getStats();
    assert.ok(statsBefore.totalClassifications > 0);
    classifier.resetStats();
    const statsAfter = classifier.getStats();
    assert.strictEqual(statsAfter.totalClassifications, 0);
  });
});

describe('TreeIntentClassifier setModelClient', () => {
  test('应该设置模型客户端', () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    const mockClient = { chat: async () => ({ content: '{}' }) };
    const result = classifier.setModelClient(mockClient);
    assert.strictEqual(classifier.modelClient, mockClient);
    assert.strictEqual(result, classifier);  // 应该返回this
  });
});

describe('TreeIntentClassifier getIntentTreeStructure', () => {
  test('应该返回树结构信息', () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    const structure = classifier.getIntentTreeStructure();
    assert.strictEqual(structure.id, 'root');
    assert.ok(structure.childrenCount > 0);
    assert.ok(structure.children.length > 0);
  });
});

describe('TreeIntentClassifier 多语言支持', () => {
  test('应该支持中文关键词', async () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    const testCases = [
      { query: '搜索一下', expectedDomain: DOMAIN_TYPES.TOOL_OPERATION },
      { query: '什么是', expectedDomain: DOMAIN_TYPES.TECHNOLOGY_CONSULT },
      { query: '如何学习', expectedDomain: DOMAIN_TYPES.TECHNOLOGY_CONSULT },
      { query: '帮我画', expectedDomain: DOMAIN_TYPES.TOOL_OPERATION },
      { query: '计算一下', expectedDomain: DOMAIN_TYPES.TOOL_OPERATION },
      { query: '分析一下', expectedDomain: DOMAIN_TYPES.DATA_ANALYSIS },
      { query: '总结一下', expectedDomain: DOMAIN_TYPES.CODE_DEVELOPMENT }
    ];

    for (const tc of testCases) {
      const result = await classifier.classify(tc.query);
      assert.strictEqual(result.domain, tc.expectedDomain,
        `Query: ${tc.query}, Expected: ${tc.expectedDomain}, Got: ${result.domain}`);
    }
  });

  test('应该支持英文关键词', async () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    const result = await classifier.classify('search for information');
    assert.strictEqual(result.domain, DOMAIN_TYPES.TOOL_OPERATION);
  });
});

describe('TreeIntentClassifier 边界条件', () => {
  test('超长查询应该正常处理', async () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    const longQuery = '搜索'.repeat(1000);
    const result = await classifier.classify(longQuery);
    assert.ok(result.domain);
    assert.ok(result.confidence >= 0);
  });

  test('特殊字符查询应该正常处理', async () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    const result = await classifier.classify('!@#$%^&*()');
    assert.ok(result.domain);
    assert.ok(result.confidence >= 0);
  });

  test('纯数字查询应该正常处理', async () => {
    const classifier = new TreeIntentClassifier({ enableLLM: false });
    const result = await classifier.classify('1234567890');
    assert.ok(result.domain);
  });
});

describe('TreeIntentClassifier 兼容性别名', () => {
  test('IntentClassifier 应该等于 TreeIntentClassifier', () => {
    assert.strictEqual(IntentClassifier, TreeIntentClassifier);
  });
});

console.log('\n');
